export default async function handler(req, res) {
    console.log('🚀 SQL生成バックエンド開始');
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
                // 最小限の簡略化のみ実行
                optimizedJsonData = {
                    version: jsonData.version,
                    format: {
                        name: jsonData.format?.name,
                        formatID: jsonData.format?.formatID,
                        versionID: jsonData.format?.versionID,
                        // 全Box項目を保持
                        boxes: jsonData.format?.boxes || [],
                        // 全Table項目を保持
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

        // プロンプトの構築（詳細な情報を含める）
        const prompt = `
以下の情報から、詳細で実用的なSQLクエリを生成してください。

【テナント・フォーマット情報】
- テナントID: ${tenantId || 'なし'}
- フォーマットID: ${formatId || 'なし'}

【フォーマット詳細】
フォーマット名: ${optimizedJsonData?.format?.name || 'なし'}

【Box項目一覧】（${optimizedJsonData?.format?.boxes?.length || 0}個）
${optimizedJsonData?.format?.boxes?.map(box => 
    `- ${box.name} (${box.dataType}) [fieldID: ${box.fieldID}]`
).join('\n') || 'なし'}

【Table構造】（${Object.keys(optimizedJsonData?.format?.tables || {}).length}個）
${Object.values(optimizedJsonData?.format?.tables || {}).map(table => 
    `テーブル: ${table.name} [tableID: ${table.tableID}]
カラム: ${table.columns?.map(col => `${col.name}(${col.dataType})`).join(', ') || 'なし'}`
).join('\n\n') || 'なし'}

【参考SQLパターン】
${optimizedReferenceSQLs || 'なし'}

【追加指示】
${additionalInstructions || 'なし'}

【生成要求】
上記の詳細な情報に基づいて、WITH句を使用した包括的なSQLクエリを生成してください。

重要なポイント:
1. 全てのBox項目とTable項目を活用する
2. 参考SQLの構造とパターンを参考にする  
3. テナントIDとフォーマットIDを正確に使用する
4. 実用的で効率的なクエリ構造にする
5. 適切なJOIN構造を使用する

SQLクエリのみを出力してください。
        `;

        console.log('=== Claude API呼び出し開始 ===');
        console.log('プロンプトサイズ:', prompt.length, '文字');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 6000, // トークン数を増加
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });

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
        console.log('レスポンストークン数:', data.usage?.output_tokens || '不明');
        
        return res.status(200).json(data);

    } catch (error) {
        console.error('=== SQL生成エラー ===');
        console.error('エラー名:', error.name);
        console.error('エラーメッセージ:', error.message);
        console.error('スタックトレース:', error.stack);
        
        return res.status(500).json({ 
            error: error.message,
            type: error.name,
            details: 'SQL生成中にエラーが発生しました'
        });
    }
}
