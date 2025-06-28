const MAX_JSON_SIZE = 25000; // 25KB制限に縮小

// JSONデータを段階的に簡略化する関数
function optimizeJSONForSQL(jsonData) {
    if (!jsonData || typeof jsonData !== 'object') return jsonData;
    
    let result = JSON.parse(JSON.stringify(jsonData));
    let jsonString = JSON.stringify(result);
    
    console.log(`元のJSONサイズ: ${jsonString.length} 文字`);
    
    // Level 1: 座標情報と不要プロパティを削除
    if (jsonString.length > MAX_JSON_SIZE) {
        console.log('Level 1 簡略化開始');
        
        function removeUnnecessaryProps(obj) {
            const propsToRemove = ['x', 'y', 'w', 'h', 'pageNum', 'isNew', 'cells', 'boundingBox'];
            
            if (Array.isArray(obj)) {
                return obj.map(item => removeUnnecessaryProps(item));
            } else if (obj && typeof obj === 'object') {
                const cleaned = {};
                Object.keys(obj).forEach(key => {
                    if (!propsToRemove.includes(key)) {
                        cleaned[key] = removeUnnecessaryProps(obj[key]);
                    }
                });
                return cleaned;
            }
            return obj;
        }
        
        result = removeUnnecessaryProps(result);
        jsonString = JSON.stringify(result);
        console.log(`Level 1後: ${jsonString.length} 文字`);
    }
    
    // Level 2: テーブル構造を簡略化
    if (jsonString.length > MAX_JSON_SIZE && result.format?.tables) {
        console.log('Level 2 簡略化開始');
        
        const simplifiedTables = {};
        Object.keys(result.format.tables).forEach(tableName => {
            const table = result.format.tables[tableName];
            simplifiedTables[tableName] = {
                tableID: table.tableID,
                name: table.name,
                columnNames: table.columns?.map(col => col.name) || [],
                columnTypes: table.columns?.map(col => col.dataType) || [],
                totalColumns: table.columns?.length || 0
            };
        });
        
        result.format.tables = simplifiedTables;
        jsonString = JSON.stringify(result);
        console.log(`Level 2後: ${jsonString.length} 文字`);
    }
    
    // Level 3: 最小限の構造のみ保持
    if (jsonString.length > MAX_JSON_SIZE) {
        console.log('Level 3 簡略化開始');
        
        result = {
            version: result.version,
            format: {
                name: result.format?.name,
                formatID: result.format?.formatID,
                // フィールド名のみ抽出
                fieldNames: result.format?.boxes?.map(box => box.name) || [],
                // テーブル名とカラム名のみ
                tableStructure: Object.keys(result.format?.tables || {}).map(tableName => ({
                    tableName,
                    columns: result.format.tables[tableName]?.columnNames || []
                }))
            }
        };
        
        jsonString = JSON.stringify(result);
        console.log(`Level 3後: ${jsonString.length} 文字`);
    }
    
    return result;
}

// プロンプトを最適化する関数
function optimizePrompt(jsonData, tenantId, formatId, referenceSQLs, additionalInstructions) {
    const optimizedJSON = optimizeJSONForSQL(jsonData);
    
    return `
【重要】以下の情報からSQLクエリを生成してください。

【フォーマット情報】
- テナントID: ${tenantId || 'なし'}
- フォーマットID: ${formatId || 'なし'}

【データ構造】
${JSON.stringify(optimizedJSON, null, 1)}

${referenceSQLs ? `【参考SQLパターン】\n${referenceSQLs}\n` : ''}

${additionalInstructions ? `【追加要件】\n${additionalInstructions}\n` : ''}

【出力要求】
- 上記参考SQLの構造に従って、WITH句を使用したSQLを生成
- テナントIDとフォーマットIDを必ず含める
- 効率的で実用的なクエリを作成
- コメントは最小限に

SQLクエリのみを出力してください：
    `;
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const { apiKey, prompt, jsonData, tenantId, formatId, referenceSQLs, additionalInstructions } = JSON.parse(event.body);

        // プロンプトを最適化
        let optimizedPrompt;
        if (jsonData) {
            optimizedPrompt = optimizePrompt(jsonData, tenantId, formatId, referenceSQLs, additionalInstructions);
        } else {
            optimizedPrompt = prompt;
        }

        console.log(`最終プロンプトサイズ: ${optimizedPrompt.length} 文字`);

        // プロンプトが大きすぎる場合はさらに削減
        if (optimizedPrompt.length > MAX_JSON_SIZE) {
            optimizedPrompt = optimizedPrompt.substring(0, MAX_JSON_SIZE) + 
                '\n\n[大きなデータのため省略。主要構造に基づいてSQLを生成してください]';
        }

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
                    content: optimizedPrompt
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Claude API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: error.message,
                type: error.name 
            })
        };
    }
};
