// Vercelのタイムアウト設定を延長
export const config = {
    maxDuration: 180, // 3分（180秒）に設定
};

export default async function handler(req, res) {
    console.log('🚀 SQL生成バックエンド開始（3分タイムアウト設定）');
    console.log('HTTPメソッド:', req.method);
    
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        console.log('✅ OPTIONSリクエスト処理');
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        console.log('❌ 無効なメソッド:', req.method);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        console.log('=== リクエスト解析開始 ===');
        const { apiKey, jsonData, tenantId, formatId, referenceSQLs, additionalInstructions } = req.body;

        console.log('受信データ確認:');
        console.log('- apiKey存在:', !!apiKey);
        console.log('- jsonData存在:', !!jsonData);
        console.log('- tenantId:', tenantId);
        console.log('- formatId:', formatId);
        console.log('- referenceSQLsサイズ:', referenceSQLs ? referenceSQLs.length : 0, '文字');
        console.log('- additionalInstructions:', additionalInstructions ? 'あり' : 'なし');

        if (!apiKey) {
            throw new Error('APIキーが提供されていません');
        }

        // JSONデータの情報を保持（軽量化レベルを大幅に緩和）
        let optimizedJsonData = jsonData;
        if (jsonData) {
            const originalSize = JSON.stringify(jsonData).length;
            console.log('受信JSONサイズ:', originalSize, '文字');
            
            // Box項目とTable項目の詳細を確認
            const boxCount = jsonData.format?.boxes?.length || 0;
            const tableCount = Object.keys(jsonData.format?.tables || {}).length;
            console.log('Box項目数:', boxCount);
            console.log('Table数:', tableCount);
            
            // 50KB以下の場合は簡略化せずにそのまま使用
            if (originalSize <= 50000) {
                console.log('✅ サイズが適切なため、簡略化をスキップ');
                optimizedJsonData = jsonData;
            } else {
                console.log('⚠️ 大きなJSONデータを軽度に簡略化');
                optimizedJsonData = {
                    version: jsonData.version,
                    format: {
                        name: jsonData.format?.name,
                        formatID: jsonData.format?.formatID,
                        versionID: jsonData.format?.versionID,
                        boxes: jsonData.format?.boxes || [],
                        tables: jsonData.format?.tables || {}
                    }
                };
                
                const optimizedSize = JSON.stringify(optimizedJsonData).length;
                console.log('軽度簡略化後のJSONサイズ:', optimizedSize, '文字');
            }
        }

        // 参考SQLサイズの確認
        let optimizedReferenceSQLs = referenceSQLs;
        if (referenceSQLs && referenceSQLs.length > 15000) {
            console.log('⚠️ 参考SQLサイズが大きいため一部制限');
            optimizedReferenceSQLs = referenceSQLs.substring(0, 15000) + '\n[参考SQLが多いため一部省略]';
        }

        // 効率的なプロンプト構築（トークン節約 + 完全性確保）
        const prompt = `
【参考SQLパターン（厳密に従う）】
${optimizedReferenceSQLs || 'なし'}

【適用データ】
テナントID: ${tenantId || 'なし'}
フォーマットID: ${formatId || 'なし'}

【Box項目（${optimizedJsonData?.format?.boxes?.length || 0}個）全て含める】
${optimizedJsonData?.format?.boxes?.map((box, i) => `${i+1}.${box.name}`).join('\n') || 'なし'}

【Table項目（各テーブルの全カラム）全て含める】
${Object.values(optimizedJsonData?.format?.tables || {}).map((table, i) => 
    `テーブル${i+1}: ${table.name}
${table.columns?.map((col, j) => `  ${j+1}.${col.name} (${col.dataType})`).join('\n') || ''}`
).join('\n') || 'なし'}

【生成ルール（絶対厳守）】
1. 参考SQLと同じ構造使用
2. 全Box項目（${optimizedJsonData?.format?.boxes?.length || 0}個）の個別CTE作成
3. 全Tableカラムの個別CTE作成
4. box.name='項目名'でフィルタ
5. table.column_name='カラム名'で個別処理
6. table_idは指定しない（tenant_idとformat_idのみ使用）
7. 全CTEをJOIN
8. 説明文禁止、SQLのみ出力
9. 省略禁止、完全なSQL生成

SQLクエリのみ出力:
        `;

        console.log('=== Claude API呼び出し開始（長時間処理対応）===');
        console.log('プロンプトサイズ:', prompt.length, '文字');

        // Claude APIのタイムアウトも延長（170秒）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.log('⚠️ Claude API タイムアウト（170秒）');
            controller.abort();
        }, 170000);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 8192,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log('Claude APIレスポンス:');
        console.log('- ステータス:', response.status);
        console.log('- OK:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Claude APIエラー:', errorText);
            throw new Error(`Claude API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('=== SQL生成成功 ===');
        console.log('出力トークン数:', data.usage?.output_tokens || '不明');
        
        return res.status(200).json(data);

    } catch (error) {
        console.error('=== SQL生成エラー ===');
        console.error('エラー名:', error.name);
        console.error('エラーメッセージ:', error.message);
        
        if (error.name === 'AbortError') {
            return res.status(408).json({ 
                error: 'SQL生成がタイムアウトしました。大きなデータの場合、処理に時間がかかる場合があります。',
                type: 'timeout_error'
            });
        }
        
        return res.status(500).json({ 
            error: error.message,
            type: error.name,
            details: 'SQL生成中にエラーが発生しました'
        });
    }
}
