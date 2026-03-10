let state = {
    messages: [],
    tasks: [],
    settings: {
        apiKey: '',
        interval: 60,
        userName: 'você',
        userRole: 'free',
        userPhone: '',
        userEmail: '',
        quietStart: 8,
        quietEnd: 22
    },
    checkInTimer: null,
    isTyping: false,
    todayKey: new Date().toISOString().slice(0, 10),
    sessionId: localStorage.getItem('nexo_session_v2') || Date.now().toString()
};
const STORAGE_KEY = 'nexo_app_settings'; // New key to force reset
const SESSION_KEY = 'nexo_session_v2';

let notifGranted = false;
let notifId = 1;

// ============ INITIALIZATION ============
function init() {
    loadSettings();

    // Reset se os dados estiverem corrompidos ou faltando campos básicos
    if (!state.settings.userPhone) {
        state.settings.userRole = 'free';
        state.settings.userName = 'você';
        persistSettings();
    }

    // App abre sempre direto, modal de login é opcional
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.style.display = 'none';
    
    updateUserBadge();
    updateAuthButton();

    // Carrega chat do dia
    const hadChat = loadChatToday();
    if (typeof renderMessages === 'function') renderMessages();

    // Carregar tarefas e histórico
    if (typeof loadTasksFromDB === 'function') loadTasksFromDB().then(() => { renderTasks(); updateStats(); });
    if (typeof fetchHistoryFromDB === 'function') {
        fetchHistoryFromDB().then(sessions => {
            if (typeof renderHistory === 'function') renderHistory(sessions);
        });
    }

    if (!hadChat || state.messages.length === 0) {
        const name = state.settings.userName || 'você';
        setTimeout(() => {
            addMessage('assistant', `Oi ${name}! 👋 Eu sou o **Nexo**, seu parceiro de foco. Me conta: o que você tá fazendo agora?`);
        }, 600);
    }

    checkMidnightReset();
    checkNotificationPermissions().then(() => {
        createNotificationChannel().then(() => scheduleCheckIn());
    });
    if (typeof updateNotifStatus === 'function') updateNotifStatus();

    const vEl = document.getElementById('app-version-display');
    if (vEl) vEl.textContent = APP_VERSION;
}

// ============ STORAGE (LOCAL) ============
function loadSettings() {
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        if (s) {
            const parsed = JSON.parse(s);
            state.settings = { ...state.settings, ...parsed };
        }
        
        const apiInput = document.getElementById('apiKey');
        const intervalInput = document.getElementById('interval');
        const nameInput = document.getElementById('userName');
        const qStartInput = document.getElementById('quietStart');
        const qEndInput = document.getElementById('quietEnd');

        if (apiInput) apiInput.value = state.settings.apiKey || '';
        if (intervalInput) intervalInput.value = state.settings.interval || 60;
        if (nameInput) nameInput.value = state.settings.userName || '';
        if (qStartInput) qStartInput.value = state.settings.quietStart ?? 8;
        if (qEndInput) qEndInput.value = state.settings.quietEnd ?? 22;

        // Regra: Esconder campo de API Key se for FREE
        const apiRow = document.getElementById('apiKey')?.closest('.settings-row');
        if (apiRow) {
            apiRow.style.display = (state.settings.userRole === 'paid' || state.settings.userRole === 'admin') ? 'flex' : 'none';
        }
    } catch (e) { }
}

function updateAuthButton() {
    const btn = document.getElementById('auth-btn-sidebar');
    const footer = document.getElementById('sidebar-footer-text');
    if (state.settings.userPhone) {
        if (btn) btn.innerHTML = '<span>👤</span> Perfil / Sair';
        if (footer) footer.textContent = `Logado como: ${state.settings.userName}`;
    } else {
        if (btn) btn.innerHTML = '<span>🔑</span> Entrar / Cadastrar';
        if (footer) footer.textContent = 'Modo Convidado';
    }
}

function openAuthModal() {
    const modal = document.getElementById('login-screen');
    if (modal) modal.style.display = 'flex';
}

function closeAuthModal() {
    const modal = document.getElementById('login-screen');
    if (modal) modal.style.display = 'none';
}

function handleAuthClick() {
    if (state.settings.userPhone) {
        if (confirm('Deseja sair da sua conta?')) {
            handleLogout();
        }
    } else {
        openAuthModal();
    }
}

function persistSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    } catch (e) { }
}

function startNewChat() {
    state.sessionId = Date.now().toString();
    localStorage.setItem(SESSION_KEY, state.sessionId);
    state.messages = [];
    saveChatToday();
    renderMessages();
    const name = state.settings.userName || 'você';
    addMessage('assistant', `Chat novo iniciado! 🚀 Como posso te ajudar agora, ${name}?`);
    
    if (typeof fetchHistoryFromDB === 'function') {
        fetchHistoryFromDB().then(sessions => renderHistory(sessions));
    }
}

function updateUserBadge() {
    const badge = document.getElementById('user-role-badge');
    const role = state.settings.userRole || 'free';
    if (badge) {
        badge.className = `badge-role role-${role}`;
        badge.textContent = role;
    }
}

function handleAuth() {
    const nameInput = document.getElementById('reg-name');
    const emailInput = document.getElementById('reg-email');
    const phoneInput = document.getElementById('reg-phone');

    const name = nameInput ? nameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!name || !email || !phone) {
        showToast('Preencha os campos de cadastro!');
        return;
    }

    state.settings.userName = name;
    state.settings.userEmail = email;
    state.settings.userPhone = phone;
    
    // Regra: por padrão qualquer cadastro é FREE
    // Vira PAID ou ADMIN apenas se o número for específico (simulando banco de dados)
    if (phone === '11999999999') state.settings.userRole = 'admin';
    else if (phone === '11888888888') state.settings.userRole = 'paid';
    else state.settings.userRole = 'free';

    persistSettings();
    closeAuthModal();
    showToast(`Bem-vindo, ${name}!`);
    updateUserBadge();
    updateAuthButton();
    
    if (typeof fetchHistoryFromDB === 'function') {
        fetchHistoryFromDB().then(sessions => renderHistory(sessions));
    }
}

function handleLogout() {
    state.settings.userPhone = '';
    state.settings.userEmail = '';
    state.settings.userRole = 'free';
    state.settings.userName = 'você';
    persistSettings();
    updateUserBadge();
    updateAuthButton();
    showToast('Você saiu.');
}

function continueAsGuest() {
    closeAuthModal();
    showToast('Modo Convidado ativado (Limite: 1 tarefa).');
    updateUserBadge();
    updateAuthButton();
}

function saveChatToday() {
    try {
        const key = 'nexo_chat_' + state.todayKey;
        localStorage.setItem(key, JSON.stringify(state.messages));
    } catch (e) { }
}

function loadChatToday() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        state.todayKey = today;
        const key = 'nexo_chat_' + today;
        const saved = localStorage.getItem(key);
        if (saved) {
            state.messages = JSON.parse(saved);
            return true;
        }
        return false;
    } catch (e) { return false; }
}

function checkMidnightReset() {
    setInterval(() => {
        const today = new Date().toISOString().slice(0, 10);
        if (today !== state.todayKey) {
            state.todayKey = today;
            state.messages = [];
            saveChatToday();
            renderMessages();
            const name = state.settings.userName || 'você';
            setTimeout(() => {
                addMessage('assistant', `Bom dia ${name}! ☀️ Novo dia, nova energia! O que você quer focar hoje?`);
            }, 500);
        }
    }, 60000);
}

// ============ MESSAGES LOGIC ============
function addMessage(role, content, save = true) {
    // Detectar Lembrete: [LEMBRETE: 10:30 - Beber água]
    if (role === 'assistant') {
        const match = content.match(/\[LEMBRETE:\s*(\d{1,2}:\d{2})\s*-\s*([^\]]+)\]/i);
        if (match) {
            const time = match[1];
            const text = match[2];
            if (typeof scheduleReminder === 'function') scheduleReminder(time, text);
            // Limpa a tag da exibição pro usuário ver um chat limpo
            content = content.replace(match[0], '').trim();
        }
    }

    const msg = { role, content, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    state.messages.push(msg);
    if (typeof renderMessages === 'function') renderMessages();
    if (save) {
        saveChatToday();
        if (role === 'user' && typeof saveMessageToDB === 'function') saveMessageToDB(role, content);
    }
    return msg;
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value?.trim();
    if (!text || state.isTyping) return;
    input.value = '';
    if (typeof autoResize === 'function') autoResize(input);
    addMessage('user', text);
    state.isTyping = true;
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;
    if (typeof showTyping === 'function') showTyping();
    const response = await callClaude(text);
    if (typeof hideTyping === 'function') hideTyping();
    state.isTyping = false;
    if (sendBtn) sendBtn.disabled = false;
    if (response) {
        addMessage('assistant', response);
        if (typeof sendNotification === 'function') sendNotification('Nexo', response.slice(0, 80) + '...');
    }
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof updateStats === 'function') updateStats();
}

function startNewChat() {
    state.sessionId = Date.now().toString();
    localStorage.setItem('nexo_session_id', state.sessionId);
    state.messages = [];
    saveChatToday();
    renderMessages();
    const name = state.settings.userName || 'você';
    addMessage('assistant', `Chat novo iniciado! 🚀 Como posso te ajudar agora, ${name}?`);
    
    // Atualiza o sidebar
    if (typeof fetchHistoryFromDB === 'function') {
        fetchHistoryFromDB().then(sessions => {
            if (typeof renderHistory === 'function') renderHistory(sessions);
        });
    }
}

// ============ TASKS LOGIC ============
async function addTask(text) {
    // Regra FREE: limite de 1 tarefa ativa
    const isPaid = state.settings.userRole === 'paid' || state.settings.userRole === 'admin';
    const activeTasks = state.tasks.filter(t => !t.done).length;
    
    if (!isPaid && activeTasks >= 1) {
        addMessage('assistant', '⚠️ Você já tem uma tarefa ativa. Como você está no plano **Free**, precisa concluir essa antes de adicionar outra. Se quiser foco total e tarefas ilimitadas, migre para o **Premium**!');
        return;
    }

    const tmpId = Date.now();
    const task = {
        id: tmpId,
        dbId: null,
        text,
        done: false,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    state.tasks.push(task);
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof updateStats === 'function') updateStats();
    const dbId = await saveTaskToDB(text);
    if (dbId) task.dbId = dbId;
}

async function toggleTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        task.done = !task.done;
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof updateStats === 'function') updateStats();
        if (task.dbId && typeof updateTaskInDB === 'function') await updateTaskInDB(task.dbId, task.done);
        if (task.done) addMessage('assistant', `Aí sim! ✅ Marcou "${task.text}" como feito. Boa demais!`);
    }
}

async function deleteTask(id) {
    const task = state.tasks.find(t => t.id === id);
    state.tasks = state.tasks.filter(t => t.id !== id);
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof updateStats === 'function') updateStats();
    if (task?.dbId && typeof deleteTaskFromDB === 'function') await deleteTaskFromDB(task.dbId);
}

// ============ SUMMARY LOGIC ============
async function generateSummary() {
    const btn = document.getElementById('summaryBtn');
    const box = document.getElementById('ai-summary');
    if (!btn || !box) return;

    btn.disabled = true;
    btn.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.done).length;
    const pending = state.tasks.filter(t => !t.done).map(t => t.text).join(', ');
    const prompt = `Faça um resumo motivador do meu dia até agora:
- ${total} tarefas registradas, ${done} concluídas
- Pendentes: ${pending || 'nenhuma'}
- Tive ${state.messages.filter(m => m.role === 'user').length} trocas contigo hoje
Seja breve, honesto e animador. Máximo 4-5 frases.`;
    const summary = await callClaude(prompt, 'Agora você está gerando um resumo do dia, seja motivador e breve.');
    btn.disabled = false;
    btn.innerHTML = '✨ Gerar resumo do dia com IA';
    if (summary) {
        box.style.display = 'block';
        box.textContent = summary;
    }
}

// ============ CHECK-IN LOGIC ============
async function scheduleCheckIn() {
    if (state.checkInTimer) clearInterval(state.checkInTimer);

    const intervalHours = state.settings.interval || 60;
    const intervalMs = intervalHours * 60 * 1000;
    const name = state.settings.userName || 'você';

    if (isNative() && notifGranted) {
        try {
            const { LocalNotifications } = window.Capacitor.Plugins;
            await LocalNotifications.cancel({
                notifications: Array.from({ length: 20 }, (_, i) => ({ id: 100 + i }))
            });

            const notifications = [];
            for (let i = 1; i <= 10; i++) {
                const at = new Date(Date.now() + intervalMs * i);
                const hour = at.getHours();
                const qStart = state.settings.quietStart ?? 8;
                const qEnd = state.settings.quietEnd ?? 22;
                if (hour < qStart || hour >= qEnd) continue;
                let body;
                if (hour < 12) body = `Oi ${name}! ☀️ Como tá a manhã?`;
                else if (hour < 18) body = `E aí ${name}! 🌤️ Como tão as coisas?`;
                else body = `Boa noite ${name}! 🌙 Como foi o dia?`;
                notifications.push({ 
                    title: 'Nexo 🧠', 
                    body, 
                    id: 100 + i, 
                    channelId: 'nexo_alerts',
                    schedule: { at } 
                });
            }

            if (notifications.length > 0) {
                await LocalNotifications.schedule({ notifications });
            }
        } catch (e) { console.warn('Erro ao agendar check-ins:', e); }
    }

    state.checkInTimer = setInterval(async () => {
        if (document.hidden) return;
        const hour = new Date().getHours();
        const qStart = state.settings.quietStart ?? 8;
        const qEnd = state.settings.quietEnd ?? 22;
        if (hour < qStart || hour >= qEnd) return;
        let checkIn;
        if (hour < 12) checkIn = `Oi ${name}! ☀️ Como tá a manhã? O que você tá fazendo agora?`;
        else if (hour < 18) checkIn = `E aí ${name}! 🌤️ Já é tarde, como tão as coisas?`;
        else checkIn = `Boa noite ${name}! 🌙 Como foi o dia? Terminou tudo que queria?`;
        addMessage('assistant', checkIn);
    }, intervalMs);
}

// ============ NOTIFICATIONS LOGIC ============
async function requestNotificationPermission() {
    try {
        if (isNative()) {
            const { LocalNotifications } = window.Capacitor.Plugins;
            const perm = await LocalNotifications.requestPermissions();
            notifGranted = perm.display === 'granted';
            if (notifGranted) {
                showToast('✅ Notificações ativadas!');
                await LocalNotifications.schedule({
                    notifications: [{ title: 'Nexo ativado! 🧠', body: 'Vou te mandar check-ins pra te manter focado.', id: notifId++, schedule: { at: new Date(Date.now() + 1000) } }]
                });
                scheduleCheckIn();
            } else { showToast('⚠️ Notificações bloqueadas'); }
        } else {
            if (!('Notification' in window)) { showToast('❌ Não suportado'); return; }
            const p = await Notification.requestPermission();
            notifGranted = p === 'granted';
            if (notifGranted) {
                showToast('✅ Notificações ativadas!');
                new Notification('Nexo ativado! 🧠', { body: 'Vou te mandar check-ins pra te manter focado.' });
            } else { showToast('⚠️ Notificações bloqueadas'); }
        }
    } catch (e) { showToast('⚠️ Erro ao ativar notificações'); console.warn(e); }
    updateNotifStatus();
}

async function sendNotification(title, body) {
    try {
        if (isNative() && notifGranted) {
            const { LocalNotifications } = window.Capacitor.Plugins;
            await LocalNotifications.schedule({
                notifications: [{ 
                    title, 
                    body, 
                    id: Math.floor(Math.random() * 100000), 
                    channelId: 'nexo_alerts',
                    schedule: { at: new Date(Date.now() + 500) } 
                }]
            });
        } else if (!isNative() && Notification.permission === 'granted' && document.hidden) {
            new Notification(title, { body });
        }
    } catch (e) { console.warn('Erro notif:', e); }
}

async function createNotificationChannel() {
    if (!isNative()) return;
    try {
        const { LocalNotifications } = window.Capacitor.Plugins;
        await LocalNotifications.createChannel({
            id: 'nexo_alerts',
            name: 'Alertas do Nexo',
            description: 'Notificações de foco e lembretes',
            importance: 5, // Max importance
            visibility: 1,
            sound: 'default',
            vibration: true
        });
    } catch (e) {}
}

async function checkNotificationPermissions() {
    if (isNative()) {
        try {
            const { LocalNotifications } = window.Capacitor.Plugins;
            const status = await LocalNotifications.checkPermissions();
            notifGranted = status.display === 'granted';
        } catch (e) {}
    } else {
        notifGranted = (typeof Notification !== 'undefined' && Notification.permission === 'granted');
    }
}

async function scheduleReminder(timeStr, text) {
    if (!isNative() || !notifGranted) return;
    try {
        const [hour, min] = timeStr.split(':').map(Number);
        const scheduledDate = new Date();
        scheduledDate.setHours(hour, min, 0, 0);
        
        // Se a hora ja passou hoje, agenda pra amanha
        if (scheduledDate < new Date()) {
            scheduledDate.setDate(scheduledDate.getDate() + 1);
        }

        const { LocalNotifications } = window.Capacitor.Plugins;
        await LocalNotifications.schedule({
            notifications: [{
                id: Math.floor(Math.random() * 100000),
                title: 'Lembrete do Nexo 🧠',
                body: text,
                channelId: 'nexo_alerts',
                schedule: { at: scheduledDate }
            }]
        });
        showToast(`⏰ Lembrete agendado para as ${timeStr}`);
    } catch (e) { console.warn('Erro ao agendar lembrete:', e); }
}

function updateNotifStatus() {
    const el = document.getElementById('notif-status');
    const btn = document.getElementById('notif-btn');
    const granted = isNative() ? notifGranted : (typeof Notification !== 'undefined' && Notification.permission === 'granted');

    if (!el) return;
    if (!('Notification' in window) && !isNative()) {
        el.textContent = 'Não suportado';
        if (btn) { btn.textContent = 'Ativar'; btn.style.opacity = '0.5'; }
        return;
    }
    if (granted) {
        el.textContent = '✅ Ativadas';
        if (btn) {
            btn.textContent = 'Desativar';
            btn.style.background = 'rgba(247,106,106,0.15)';
            btn.style.color = 'var(--danger)';
            btn.style.border = '1px solid var(--danger)';
        }
    } else if (!isNative() && Notification.permission === 'denied') {
        el.textContent = '❌ Bloqueadas';
        if (btn) { btn.textContent = 'Bloqueado'; btn.style.opacity = '0.5'; }
    } else {
        el.textContent = 'Clique para ativar';
        if (btn) {
            btn.textContent = 'Ativar';
            btn.style.background = '';
            btn.style.color = '';
            btn.style.border = '';
            btn.style.opacity = '';
        }
    }
}

async function toggleNotifications() {
    if (notifGranted || (!isNative() && typeof Notification !== 'undefined' && Notification.permission === 'granted')) {
        if (isNative()) {
            try {
                const { LocalNotifications } = window.Capacitor.Plugins;
                await LocalNotifications.cancel({
                    notifications: Array.from({ length: 20 }, (_, i) => ({ id: 100 + i }))
                });
            } catch (e) { }
        }
        notifGranted = false;
        showToast('🔕 Notificações desativadas');
        updateNotifStatus();
    } else {
        requestNotificationPermission();
    }
}

// ============ SETTINGS LOGIC ============
function saveSettings() {
    state.settings.apiKey = document.getElementById('apiKey').value.trim();
    state.settings.interval = parseInt(document.getElementById('interval').value);
    state.settings.userName = document.getElementById('userName').value.trim() || 'você';
    state.settings.quietStart = parseInt(document.getElementById('quietStart').value);
    state.settings.quietEnd = parseInt(document.getElementById('quietEnd').value);
    persistSettings();
    scheduleCheckIn();
    showToast('✅ Configurações salvas!');
}

// ============ INTENT DETECTION HELPERS ============
function needsHistorySearch(msg) {
    const keywords = ['lembra', 'lembro', 'semana passada', 'ontem', 'antes', 'falei', 'disse', 'comentei', 'histórico', 'conversa anterior', 'já falamos', 'outro dia'];
    return keywords.some(k => msg.toLowerCase().includes(k));
}

function needsTaskSearch(msg) {
    const keywords = ['tarefas', 'tarefa', 'o que tenho', 'pendente', 'lista', 'afazeres', 'terminar', 'completar'];
    return keywords.some(k => msg.toLowerCase().includes(k));
}

async function fetchAllTasks() {
    try {
        const tasks = await sbFetch('tasks?order=created_at.desc&limit=30');
        if (!tasks?.length) return '';
        const done = tasks.filter(t => t.done).map(t => `✅ ${t.text}`).join('\n');
        const pending = tasks.filter(t => !t.done).map(t => `⏳ ${t.text}`).join('\n');
        return `\nTarefas completas:\n${done || 'nenhuma'}\n\nTarefas pendentes:\n${pending || 'nenhuma'}`;
    } catch (e) { return ''; }
}

// ============ START APP ============
document.addEventListener('DOMContentLoaded', () => {
    init();
});
