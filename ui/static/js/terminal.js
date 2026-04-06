// node: 'merged_ui/src/static/js/terminal.js'
export function initTerminal() {
    // Copy All terminal content
    document.getElementById('terminal_copy').addEventListener('click', () => {
        copyText(document.getElementById('terminal').innerText);
    });

    // Copy Last — copies last response block (last < { ... } entry)
    document.getElementById('terminal_copy_last').addEventListener('click', () => {
        const lines = document.getElementById('terminal').innerText.split('\n');
        // Find last response block starting with '<'
        let lastBlock = [];
        let inBlock = false;
        for (const line of lines) {
            if (line.startsWith('< ') || line.startsWith('< {')) {
                inBlock = true;
                lastBlock = [line];
            } else if (inBlock) {
                if (line.trim() === '' && lastBlock.length > 0) break;
                lastBlock.push(line);
            }
        }
        copyText(lastBlock.join('\n') || lines[lines.length - 1]);
    });

    document.getElementById('terminal_clear').addEventListener('click', () => {
        document.getElementById('terminal').innerHTML = '';
    });
}

function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
}

function log(type, message) {
    const terminal = document.getElementById('terminal');
    const line = document.createElement('div');
    line.className = `log-${type}`;
    line.textContent = `${type.toUpperCase()}: ${message}`;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}
