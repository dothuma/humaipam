// node: 'interface_mgr/src/static/js/utils.js'
// utils.js — shared helpers

export function strVal(id) {
    return document.getElementById(id)?.value.trim() ?? '';
}

export function intVal(id) {
    return parseInt(document.getElementById(id)?.value) || 0;
}

export function checked(id) {
    return document.getElementById(id)?.checked ?? false;
}

export function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}

export function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '';
}

export function log(type, message) {
    const terminal = document.getElementById('terminal');
    if (!terminal) return;
    const line = document.createElement('div');
    const classMap = {
        error:   'log-error',
        success: 'log-success',
        info:    'log-info',
        warning: 'log-warning',
    };
    line.className = classMap[type] || 'log-info';
    line.textContent = message;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

export function logJSON(direction, data) {
    const terminal = document.getElementById('terminal');
    if (!terminal) return;
    const line = document.createElement('div');
    line.className = direction === '>' ? 'log-request' : 'log-response';
    line.textContent = `${direction} ${JSON.stringify(data, null, 2)}`;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

export function enablePanel(id) {
    document.getElementById(id)?.classList.remove('disabled');
}

export function disablePanel(id) {
    document.getElementById(id)?.classList.add('disabled');
}

export function lockInput(id) {
    const el = document.getElementById(id);
    if (el) { el.readOnly = true; el.classList.add('locked'); }
}

export function unlockInput(id) {
    const el = document.getElementById(id);
    if (el) { el.readOnly = false; el.classList.remove('locked'); }
}

export function getRadioValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value ?? '';
}

export function setRadioValue(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
}

export function disableInputGroup(ids) {
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
}

export function enableInputGroup(ids) {
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });
}
