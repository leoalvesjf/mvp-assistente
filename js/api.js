// Constantes já definidas em constants.js

async function sbFetch(path, options = {}) {
  const prefer = options.prefer || '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { 'Prefer': prefer } : {})
    },
    ...(options.body ? { body: options.body } : {})
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function loadTasksFromDB() {
  try {
    const tasks = await sbFetch('tasks?done=eq.false&order=created_at.asc');
    if (tasks?.length) {
      state.tasks = tasks.map(t => ({
        id: t.id,
        dbId: t.id,
        text: t.text,
        done: t.done,
        time: new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }));
    }
  } catch (e) {
    console.warn('Erro ao carregar tarefas:', e);
  }
}

async function fetchYesterdayContext() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);
    const msgs = await sbFetch(`conversations?created_at=gte.${dateStr}T00:00:00&order=created_at.desc&limit=15`);
    if (!msgs?.length) return 'Nenhuma conversa registrada ontem.';
    return msgs.reverse().map(m => `${m.role === 'user' ? 'Você' : 'Nexo'}: ${m.content}`).join('\n');
  } catch (e) { return ''; }
}

async function saveMessageToDB(role, content) {
  try {
    const userPhone = state.settings.userPhone || 'anon';
    const sessionId = state.sessionId || 'today';
    await sbFetch('conversations', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ role, content, user_phone: userPhone, session_id: sessionId })
    });
  } catch (e) { console.warn('Erro ao salvar msg:', e); }
}

async function saveTaskToDB(text) {
  try {
    const res = await sbFetch('tasks', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({ text, done: false })
    });
    return res?.[0]?.id;
  } catch (e) { console.warn('Erro ao salvar tarefa:', e); }
}

async function updateTaskInDB(dbId, done) {
  try {
    await sbFetch(`tasks?id=eq.${dbId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ done })
    });
  } catch (e) { console.warn('Erro ao atualizar tarefa:', e); }
}

async function deleteTaskFromDB(dbId) {
  try {
    await sbFetch(`tasks?id=eq.${dbId}`, { method: 'DELETE' });
  } catch (e) { console.warn('Erro ao deletar tarefa:', e); }
}

async function fetchHistoryFromDB() {
  try {
    const userPhone = state.settings.userPhone;
    if (!userPhone) return [];
    
    // Busca conversas do usuário, agrupadas por session_id
    const msgs = await sbFetch(`conversations?user_phone=eq.${userPhone}&order=created_at.desc&limit=100`);
    if (!msgs?.length) return [];
    
    const sessions = [];
    const seenSessions = new Set();
    
    msgs.forEach(m => {
      const sid = m.session_id || 'legacy';
      if (!seenSessions.has(sid) && m.role === 'user') {
        seenSessions.add(sid);
        sessions.push({
          id: sid,
          title: m.content.slice(0, 30) + (m.content.length > 30 ? '...' : ''),
          date: new Date(m.created_at).toLocaleDateString('pt-BR')
        });
      }
    });
    return sessions;
  } catch (e) { return []; }
}

async function loadMessagesFromDB(sessionId) {
  try {
    const msgs = await sbFetch(`conversations?session_id=eq.${sessionId}&order=created_at.asc`);
    return msgs || [];
  } catch (e) { return []; }
}

// ============ AI CALL (CLAUDE) ============
async function callClaude(userMessage, systemExtra = '', retries = 2) {
  // Regra de Negócio: Limite para usuários FREE/GUEST
  const isFree = !state.settings.userPhone || state.settings.userRole === 'free';
  if (isFree) {
     // Limite de 6 trocas de mensagens para usuários gratuitos por sessão
     const msgCount = state.messages.filter(m => m.role === 'user').length;
     if (msgCount >= 6) {
        return "⚠️ Você já atingiu seu limite gratuito de uso hoje. **Migre seu plano** para o Premium para ter conversas ilimitadas e usufruir de todas as funções do Nexo!";
     }
  }

  const apiKey = state.settings.apiKey;
  if (!apiKey) {
    showToast('⚠️ Configure sua API Key nas configurações!');
    return null;
  }

  const name = state.settings.userName || 'você';
  const pendingTasks = state.tasks.filter(t => !t.done).map(t => `- ${t.text}`).join('\n') || 'nenhuma';

  let extraContext = '';
  if (needsHistorySearch(userMessage)) {
    showToast('🔍 Buscando histórico...');
    extraContext += '\nContexto de ontem:\n' + await fetchYesterdayContext();
  }
  if (needsTaskSearch(userMessage)) {
    extraContext += await fetchAllTasks();
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const system = `Você é o Nexo, assistente pessoal e amigo do ${name}. Ajuda pessoas com TDAH a se organizar e focar.

Agora são ${timeStr} de ${dateStr}. Use isso para dar contexto (bom dia, boa tarde, etc) e planejar o dia.

Estilo: português casual, direto, amigo. Frases curtas. Sem formalidade.

LEMBRETES: Se o usuário pedir para ser avisado ou notificado em um horário específico, você DEVE incluir no final da resposta a tag: [LEMBRETE: HH:MM - Descrição curta]. Exemplo: "Beleza, vou te avisar! [LEMBRETE: 10:10 - Hora da reunião]".

Tarefas pendentes: ${pendingTasks}
${extraContext}
${systemExtra}

Se o usuário mencionar algo pra fazer, inclua ao final: [TAREFA: descrição curta]
Se travado ou mal, acolha e sugira uma ação pequena.
Máximo 3-4 frases.`;

  const messages = state.messages
    .filter(m => m.role !== 'system')
    .slice(-4)
    .map(m => ({ role: m.role, content: m.content.replace(/\[TAREFA:.*?\]/g, '').trim() }));

  messages.push({ role: 'user', content: userMessage });

  try {
    let data;
    if (isNative()) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, system, messages })
      });
      data = await response.json();
    } else {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, messages, apiKey })
      });
      data = await response.json();
    }

    if (data.error?.type === 'overloaded_error' && retries > 0) {
      showToast('⏳ Servidor ocupado, tentando novamente...');
      await new Promise(r => setTimeout(r, 2500));
      return callClaude(userMessage, systemExtra, retries - 1);
    }

    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const text = data.content?.map(b => b.text || '').join('');
    const taskMatch = text.match(/\[TAREFA:\s*(.+?)\]/);
    if (taskMatch) addTask(taskMatch[1].trim());
    return text.replace(/\[TAREFA:.*?\]/g, '').trim();
  } catch (err) {
    console.error('NEXO_ERROR', JSON.stringify({ msg: err.message, stack: err.stack }));
    return `Opa, deu um erro aqui 😅 — ${err.message}`;
  }
}
