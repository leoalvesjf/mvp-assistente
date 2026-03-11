export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_KEY;

  if (!anthropicKey || !sbUrl || !sbKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing environment variables' });
  }

  const { messages, system, userPhone } = req.body;

  if (!userPhone) return res.status(401).json({ error: 'Login obrigatório' });
  if (!messages || !system) return res.status(400).json({ error: 'Missing messages or system prompt' });

  try {
    // 1. Verificar Perfil do Usuário no Supabase
    const profileRes = await fetch(`${sbUrl}/rest/v1/profiles?phone=eq.${userPhone}&select=*`, {
      headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
    });
    const profiles = await profileRes.json();
    const userProfile = profiles?.[0] || { role: 'free' };

    // 2. Lógica de Limite para usuários FREE
    let finalSystem = system;
    if (userProfile.role === 'free') {
      const today = new Date().toISOString().slice(0, 10);
      const countRes = await fetch(`${sbUrl}/rest/v1/conversations?user_phone=eq.${userPhone}&created_at=gte.${today}T00:00:00&role=eq.user&select=id`, {
        method: 'GET',
        headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Prefer': 'count=exact' }
      });
      
      const countHeader = countRes.headers.get('content-range');
      const count = countHeader ? parseInt(countHeader.split('/')[1]) : 0;

      if (count >= 5) {
        return res.status(403).json({ 
          error: 'Limite diário atingido', 
          message: '⚠️ Você atingiu seu limite gratuito de 5 mensagens hoje. Assine o Nexo Premium para continuar!' 
        });
      }

      if (count === 4) {
        finalSystem += "\n\nAVISO IMPORTANTE: Esta é a última mensagem do usuário hoje (plano gratuito). Você DEVE informar ao usuário que esta é a última conversa do dia e sugerir gentilmente o upgrade para o plano Premium para conversas ilimitadas.";
      }
    }

    // 3. Chamada ao Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: finalSystem,
        messages
      })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('SaaS API error:', err);
    res.status(500).json({ error: err.message });
  }
}
