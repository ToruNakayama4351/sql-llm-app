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

        // プロンプトの構築（参考SQLパターンを最優先 + 全項目明示）
        const prompt = `
【重要】以下の参考SQLパターンに厳密に従って、SQLクエリを生成してください。

【参考SQLパターン（必ず従うこと）】
${optimizedReferenceSQLs || 'なし'}

【適用するデータ情報】
- テナントID: ${tenantId || 'なし'}
- フォーマットID: ${formatId || 'なし'}
- フォーマット名: ${optimizedJsonData?.format?.name || 'なし'}

【Box項目（${optimizedJsonData?.format?.boxes?.length || 0}個）- 全て含めること】
${optimizedJsonData?.format?.boxes?.map((box, index) => `${index + 1}. ${box.name} (${box.dataType})`).join('\n') || 'なし'}

【Table項目（${Object.keys(optimizedJsonData?.format?.tables || {}).length}個）- 全カラム含めること】
${Object.values(optimizedJsonData?.format?.tables || {}).map((table, tableIndex) => 
    `テーブル${tableIndex + 1}: ${table.name}
${table.columns?.map((col, colIndex) => `  ${colIndex + 1}. ${col.name} (${col.dataType})`).join('\n') || '  なし'}`
).join('\n') || 'なし'}

【追加指示】
${additionalInstructions || 'なし'}

【生成ルール（絶対厳守）】
1. 参考SQLとまったく同じ構造を使用する
2. 上記の全てのBox項目（${optimizedJsonData?.format?.boxes?.length || 0}個）について個別のCTEを作成する
3. 上記の全てのTableカラム（全カラム）について個別のCTEを作成する
4. 一つも省略してはいけない - 全項目を必ず含める
5. box.name = '項目名' の形式でフィルタリングする（field_idは使わない）
6. table.column_name = 'カラム名' の形式で各カラムを個別処理する
7. 最終SELECTでは全てのCTEをJOINする
8. テナントIDとフォーマットIDのみ新しい値に置き換える

【重要な注意事項】
- 省略記号（...）や「省略」という表現は一切使用しない
- 全ての項目を完全に記述する
- SQLの途中で切れないよう、完全なSQLクエリを生成する
- レスポンスサイズを気にせず、完全なSQLを出力する
- 「複数のメッセージに分けて」「前半部分」「続く」などの対話的表現は禁止
- 説明文は一切不要、SQLクエリのみを出力する
- 1つの完全なSQLクエリとして出力する

上記の全てのBox項目（${optimizedJsonData?.format?.boxes?.length || 0}個）と全てのTableカラムを含む、参考SQLパターンに従った完全なSQLクエリのみを出力してください。`;

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
                max_tokens: 8192, // Claude 3.5 Sonnetの最大値
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
