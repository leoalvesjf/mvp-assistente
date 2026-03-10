// ============ UI RENDERING ============
function renderMessages() {
    const container = document.getElementById('messages');
    if (!container) return;
    container.innerHTML = '';
    state.messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.role}`;
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        bubble.innerHTML = formatText(msg.content);
        const time = document.createElement('div');
        time.className = 'msg-time';
        time.textContent = msg.time || '';
        div.appendChild(bubble);
        div.appendChild(time);
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function formatText(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function showTyping() {
    const container = document.getElementById('messages');
    if (!container || document.getElementById('typing-indicator')) return;
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.id = 'typing-indicator';
    div.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

function renderTasks() {
    const container = document.getElementById('tasks-list');
    if (!container) return;
    if (state.tasks.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">📝</div>
        <p>Nenhuma tarefa ainda.<br>Conta pro Nexo o que você tá fazendo e ele registra automaticamente!</p>
      </div>`;
        return;
    }
    container.innerHTML = '';
    [...state.tasks].reverse().forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-card';
        div.innerHTML = `
      <button class="task-check ${task.done ? 'done' : ''}" onclick="toggleTask(${task.id})">
        ${task.done ? '✓' : ''}
      </button>
      <div class="task-content">
        <div class="task-text ${task.done ? 'done' : ''}">${task.text}</div>
        <div class="task-meta">
          <span class="task-time">${task.time}</span>
          <span class="task-badge ${task.done ? 'badge-done' : 'badge-pending'}">${task.done ? 'feito' : 'pendente'}</span>
        </div>
      </div>
      <button class="task-delete" onclick="deleteTask(${task.id})">🗑</button>
    `;
        container.appendChild(div);
    });
}

function updateStats() {
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.done).length;
    const msgs = state.messages.filter(m => m.role === 'user').length;
    const el1 = document.getElementById('stat-tasks');
    const el2 = document.getElementById('stat-done');
    const el3 = document.getElementById('stat-msgs');
    if (el1) el1.textContent = total;
    if (el2) el2.textContent = done;
    if (el3) el3.textContent = msgs;
}

// ============ UI NAVIGATION & HELPERS ============
function switchTab(tab) {
    ['chat', 'tasks', 'summary', 'settings'].forEach(t => {
        document.getElementById(`tab-${t}`)?.classList.toggle('active', t === tab);
        document.getElementById(`section-${t}`)?.classList.toggle('active', t === tab);
    });
    if (tab === 'summary') updateStats();
    if (tab === 'tasks') renderTasks();
    if (tab === 'settings') {
        const cv = document.getElementById('cfg-version');
        if (cv) cv.textContent = APP_VERSION;
    }
    const inputArea = document.querySelector('.chat-input-area');
    if (inputArea) inputArea.style.display = tab === 'chat' ? '' : 'none';
    closeSidebar();
}

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('open');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
}

function handleEnter(e) {
    if (e.key === 'Enter') {
        if (isNative()) return; // Mobile: default newline
        if (!e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }
}

function renderHistory(sessions) {
    const container = document.getElementById('history-list');
    if (!container) return;
    container.innerHTML = '';

    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<div style="padding:10px 16px;font-size:12px;color:var(--text-dim);opacity:0.6">Nenhuma conversa ainda.</div>';
        return;
    }

    sessions.forEach(s => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `<span>💬</span> ${s.title}`;
        div.title = s.date;
        div.onclick = () => loadPastSession(s.id);
        container.appendChild(div);
    });
}

async function loadPastSession(sid) {
    switchTab('chat');
    showToast('Carregando conversa...');
    const msgs = await loadMessagesFromDB(sid);
    if (msgs) {
        state.messages = msgs.map(m => ({
            role: m.role,
            content: m.content,
            time: new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }));
        renderMessages();
    }
}

function handleLogin() {
    const phoneInput = document.getElementById('login-phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    if (!phone) { showToast('Digite seu celular!'); return; }

    state.settings.userPhone = phone;
    // Exemplo de lógica de roles
    if (phone === '11999999999') state.settings.userRole = 'admin';
    else if (phone.length > 8) state.settings.userRole = 'paid';
    else state.settings.userRole = 'free';

    persistSettings();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'grid';

    const badge = document.getElementById('user-role-badge');
    if (badge) {
        badge.className = `badge-role role-${state.settings.userRole}`;
        badge.textContent = state.settings.userRole;
    }

    showToast(`Bem-vindo! Modo: ${state.settings.userRole.toUpperCase()}`);
    init(); // Reinicializa com os dados do usuário
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function showUpdateOverlay(msg) {
    const overlay = document.getElementById('update-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        document.getElementById('update-progress-text').textContent = msg;
    }
}

function setUpdateProgress(pct, msg) {
    const bar = document.getElementById('update-progress-bar');
    const text = document.getElementById('update-progress-text');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = msg;
}
