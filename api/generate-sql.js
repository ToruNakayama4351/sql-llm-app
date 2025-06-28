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

        // JSONデータサイズの確認と最適化
        let optimizedJsonData = jsonData;
        if (jsonData) {
            const originalSize = JSON.stringify(jsonData).length;
            console.log('元のJSONサイズ:', originalSize, '文字');
            
            // 大きすぎる場合は簡略化
            if (originalSize > 20000) {
                console.log('JSONデータを簡略化中...');
                optimizedJsonData = {
                    version: jsonData.version,
                    format: {
                        name: jsonData.format?.name,
                        formatID: jsonData.format?.formatID,
                        versionID: jsonData.format?.versionID,
                        // Box項目の簡略化
                        boxes: jsonData.format?.boxes?.map(box => ({
                            name: box.name,
                            dataType: box.dataType,
                            fieldID: box.fieldID
                        })) || [],
                        // Table項目の簡略化
                        tables: {}
                    }
                };
                
                // テーブル構造の簡略化
                if (jsonData.format?.tables) {
                    Object.keys(jsonData.format.tables).forEach(tableName => {
                        const table = jsonData.format.tables[tableName];
                        optimizedJsonData.format.tables[tableName] = {
                            name: table.name,
                            tableID: table.tableID,
                            columns: table.columns?.map(col => ({
                                name: col.name,
                                dataType: col.dataType,
                                columnID: col.columnID
                            })) || []
                        };
                    });
                }
                
                const optimizedSize = JSON.stringify(optimizedJsonData).length;
                console.log('簡略化後のJSONサイズ:', optimizedSize, '文字');
            }
        }

        // プロンプトの構築
        const prompt = `
以下の情報からSQLクエリを生成してください。

【テナント・フォーマット情報】
- テナントID: ${tenantId || 'なし'}
- フォーマットID: ${formatId || 'なし'}

【JSONデータ構造】
${optimizedJsonData ? JSON.stringify(optimizedJsonData, null, 2) : 'なし'}

【参考SQL】
${referenceSQLs || 'なし'}

【追加指示】
${additionalInstructions || 'なし'}

【要求】
上記情報に基づいて、WITH句を使用したSQLクエリを生成してください。
参考SQLの構造を参考にしながら、実用的で効率的なクエリを作成してください。
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
                max_tokens: 4000,
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
        console.log('レスポンスキー:', Object.keys(data));
        
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
