// node: 'merged_ui/src/static/js/ipam_utils.js'
export function validateOctet(value) {
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && num <= 255;
}

export function getIP(prefix) {
    const o1 = document.getElementById(`${prefix}_o1`)?.value;
    const o2 = document.getElementById(`${prefix}_o2`)?.value;
    const o3 = document.getElementById(`${prefix}_o3`)?.value;
    const o4 = document.getElementById(`${prefix}_o4`)?.value;
    if (!validateOctet(o1)||!validateOctet(o2)||!validateOctet(o3)||!validateOctet(o4)) return null;
    return `${o1}.${o2}.${o3}.${o4}`;
}

export function isPrivateIP(ip) {
    const [o1, o2] = ip.split('.').map(Number);
    if (o1 === 10) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;
    return false;
}

export function formatHexmap(hex, parentCidr, splittableCidr) {
    if (!hex || !parentCidr || !splittableCidr) return hex || '';
    const numBlocks = 1 << (parseInt(splittableCidr) - parseInt(parentCidr));
    const effectiveHexChars = Math.ceil(numBlocks / 4);
    hex = hex.substring(0, effectiveHexChars);
    let result = '';
    for (let i = 0; i < hex.length; i += 8) {
        if (i > 0) result += '.';
        result += hex.substring(i, i + 8);
    }
    return result;
}

export function log(type, message) {
    const terminal = document.getElementById('terminal');
    if (!terminal) return;
    const line = document.createElement('div');
    const classMap = { error:'log-error', success:'log-success', info:'log-info',
                       bitmap:'log-bitmap', warning:'log-warning' };
    line.className = classMap[type] || 'log-info';
    line.textContent = `${type.toUpperCase()}: ${message}`;
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

export function ip2int(ip) {
    return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
}

export function ipInRange(ip, rangeIp, cidr) {
    const ipInt    = ip2int(ip);
    const rangeInt = ip2int(rangeIp);
    const mask     = cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0;
    return (ipInt & mask) >>> 0 === (rangeInt & mask) >>> 0;
}
