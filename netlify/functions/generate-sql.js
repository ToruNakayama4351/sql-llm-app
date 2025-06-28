const MAX_JSON_SIZE = 50000; // 50KB制限

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
    const { apiKey, prompt } = JSON.parse(event.body);

    // JSONサイズをチェックして簡略化
    let optimizedPrompt = prompt;
    if (prompt.length > MAX_JSON_SIZE) {
      console.log('Large JSON detected, optimizing...');
      
      // JSONデータの座標情報などを除去して簡略化
      optimizedPrompt = prompt.replace(/"x":\s*\d+\.?\d*,?\s*/g, '')
                            .replace(/"y":\s*\d+\.?\d*,?\s*/g, '')
                            .replace(/"w":\s*\d+\.?\d*,?\s*/g, '')
                            .replace(/"h":\s*\d+\.?\d*,?\s*/g, '')
                            .replace(/"pageNum":\s*\d+,?\s*/g, '')
                            .replace(/"isNew":\s*(true|false),?\s*/g, '')
                            .replace(/\s+/g, ' '); // 余分な空白を削除
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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: optimizedPrompt.length > MAX_JSON_SIZE ? 
            optimizedPrompt.substring(0, MAX_JSON_SIZE) + '\n\n[大きなJSONファイルのため一部省略。主要フィールドに基づいてSQLを生成してください]' : 
            optimizedPrompt
        }]
      })
    });

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
      body: JSON.stringify({ error: error.message })
    };
  }
};
