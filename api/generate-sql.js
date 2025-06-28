export default async function handler(req, res) {
    console.log('🚀 超シンプルテスト版が動作中！');
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
        console.log('📝 リクエストボディ:', req.body);
        
        return res.status(200).json({ 
            message: '🎉 テスト成功！バックエンドが正常に動作しています！',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('💥 エラー発生:', error);
        return res.status(500).json({ 
            error: 'テストエラー: ' + error.message
        });
    }
}
