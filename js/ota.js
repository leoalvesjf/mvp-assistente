// ============ OTA UPDATE LOGIC ============
async function checkForUpdate() {
    if (!isNative()) return;

    const lastCheck = parseInt(localStorage.getItem('nexo_last_update_check') || '0');
    const now = Date.now();
    if (now - lastCheck < 5 * 60 * 1000) return;
    localStorage.setItem('nexo_last_update_check', String(now));

    if (localStorage.getItem('nexo_just_updated')) {
        localStorage.removeItem('nexo_just_updated');
        showToast('App atualizado para v' + APP_VERSION + '!');
        return;
    }

    try {
        console.log('OTA_AUTO: checando versao...');
        const res = await fetch(VERSION_URL + '?t=' + now);
        const data = await res.json();
        console.log('OTA_AUTO: remota=' + data.version + ' local=' + APP_VERSION);
        if (data.version && data.version !== APP_VERSION) {
            await downloadAndApplyUpdate(data.version);
        }
    } catch (e) { console.warn('OTA_AUTO erro:', e.message); }
}

async function downloadAndApplyUpdate(newVersion) {
    try {
        const { CapacitorUpdater } = window.Capacitor.Plugins;
        console.log('OTA: iniciando download via Capgo v' + newVersion);
        showToast('Nova versao ' + newVersion + '! Baixando...');
        const bundle = await CapacitorUpdater.download({ url: UPDATE_URL, version: newVersion });
        console.log('OTA: download ok', JSON.stringify(bundle));
        await CapacitorUpdater.set(bundle);
    } catch (e) {
        console.error('OTA Capgo erro:', e.message);
        localStorage.setItem('nexo_just_updated', '1');
        window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
    }
}

async function manualCheckUpdate() {
    console.log('OTA_MANUAL: iniciando, APP_VERSION=' + APP_VERSION);
    const btn = document.getElementById('update-btn');
    const status = document.getElementById('update-status');
    if (!btn || !status) return;

    btn.textContent = 'Verificando...';
    btn.disabled = true;
    status.textContent = '';

    try {
        localStorage.removeItem('nexo_last_update_check');
        localStorage.removeItem('nexo_just_updated');

        console.log('OTA_MANUAL: buscando ' + VERSION_URL);
        const res = await fetch(VERSION_URL + '?t=' + Date.now());
        const data = await res.json();
        console.log('OTA_MANUAL: versao remota=' + data.version + ' local=' + APP_VERSION);

        if (data.version && data.version !== APP_VERSION) {
            console.log('OTA_MANUAL: atualizacao disponivel! v' + data.version);
            showUpdateOverlay('Baixando v' + data.version + '...');
            setUpdateProgress(20, 'Conectando ao servidor...');
            await new Promise(r => setTimeout(r, 400));

            try {
                const { CapacitorUpdater } = window.Capacitor.Plugins;
                setUpdateProgress(40, 'Baixando atualização...');
                console.log('OTA_MANUAL: download via Capgo');

                const bundle = await CapacitorUpdater.download({
                    url: UPDATE_URL,
                    version: data.version
                });
                console.log('OTA_MANUAL: download ok', bundle);

                setUpdateProgress(80, 'Instalando...');
                await new Promise(r => setTimeout(r, 500));
                setUpdateProgress(100, 'Concluído! Reiniciando...');
                await new Promise(r => setTimeout(r, 800));

                await CapacitorUpdater.set(bundle);
            } catch (capgoErr) {
                console.warn('OTA_MANUAL: Capgo falhou, usando fallback:', capgoErr.message);
                setUpdateProgress(100, 'Concluído! Reiniciando...');
                localStorage.setItem('nexo_just_updated', '1');
                await new Promise(r => setTimeout(r, 800));
                window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
            }
        } else {
            console.log('OTA_MANUAL: ja na versao mais recente');
            status.textContent = 'Você já está na versão mais recente!';
            status.style.color = 'var(--success)';
            btn.textContent = 'Verificar atualização';
            btn.disabled = false;
        }
    } catch (e) {
        console.error('OTA_MANUAL_ERRO: ' + e.message);
        const overlay = document.getElementById('update-overlay');
        if (overlay) overlay.style.display = 'none';
        status.textContent = 'Erro: ' + e.message;
        status.style.color = 'var(--danger)';
        btn.textContent = 'Verificar atualização';
        btn.disabled = false;
    }
}
