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
        console.log('=== バックエンド開始 ===');
        console.log('HTTPメソッド:', event.httpMethod);
        console.log('ヘッダー:', event.headers);
        
        // リクエストボディの解析
        let body;
        try {
            body = JSON.parse(event.body);
            console.log('受信データキー:', Object.keys(body));
            console.log('apiKey存在:', !!body.apiKey);
            console.log('jsonData存在:', !!body.jsonData);
        } catch (parseError) {
            console.error('JSON解析エラー:', parseError);
            throw new Error('リクエストボディのJSON解析に失敗しました');
        }

        const { apiKey, jsonData, tenantId, formatId, referenceSQLs, additionalInstructions } = body;

        if (!apiKey) {
            throw new Error('APIキーが提供されていません');
        }

        console.log('=== データサイズ確認 ===');
        console.log('JSONデータサイズ:', jsonData ? JSON.stringify(jsonData).length : 0, '文字');
        console.log('参考SQLサイズ:', referenceSQLs ? referenceSQLs.length : 0, '文字');
        console.log('テナントID:', tenantId);
        console.log('フォーマットID:', formatId);

        // シンプルなプロンプトを構築
        const prompt = `
以下の情報からSQLクエリを生成してください。

【テナント情報】
- テナントID: ${tenantId || 'なし'}
- フォーマットID: ${formatId || 'なし'}

【JSONデータ構造】
${jsonData ? JSON.stringify(jsonData, null, 2).substring(0, 5000) : 'なし'}

【参考SQL】
${referenceSQLs ? referenceSQLs.substring(0, 5000) : 'なし'}

【追加指示】
${additionalInstructions || 'なし'}

【要求】
上記情報に基づいて、WITH句を使用したSQLクエリを生成してください。
SQLクエリのみを出力してください。
        `;

        console.log('=== プロンプト準備完了 ===');
        console.log('プロンプトサイズ:', prompt.length, '文字');

        // Claude API呼び出し
        console.log('=== Claude API呼び出し開始 ===');
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

        console.log('=== Claude APIレスポンス ===');
        console.log('ステータス:', response.status);
        console.log('OK:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Claude APIエラー:', errorText);
            throw new Error(`Claude API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('=== 成功レスポンス ===');
        console.log('レスポンスキー:', Object.keys(data));
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('=== 詳細エラー情報 ===');
        console.error('エラー名:', error.name);
        console.error('エラーメッセージ:', error.message);
        console.error('スタックトレース:', error.stack);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: error.message,
                type: error.name,
                details: 'バックエンドでエラーが発生しました。コンソールログを確認してください。'
            })
        };
    }
};
