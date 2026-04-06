// node: 'merged_ui/src/static/js/ipam_subrange.js'
import { apiCall } from './api.js';
import { getIP, validateOctet, formatHexmap, log, logJSON, ipInRange, isPrivateIP } from './ipam_utils.js';
import { setTargetForIP, setIPParent } from './ipam_ipaddress.js';

// ── State ─────────────────────────────────────────────────────────────────────
let parentState = { ip:'', cidr:'', splittable:'', domain:'default', isPrivate:false };

// ── Helpers ───────────────────────────────────────────────────────────────────
function intVal(id) { const v = parseInt(document.getElementById(id).value); return isNaN(v) ? null : v; }
function strVal(id) { return document.getElementById(id).value.trim(); }

function updateHexmap(elementId, bitmap, parentCidr, splittableCidr) {
    const el = document.getElementById(elementId);
    if (!el || !bitmap || !parentCidr || !splittableCidr) return;
    el.textContent = formatHexmap(bitmap, parentCidr, splittableCidr);
}

function getSearchIP() { return getIP('sr_ip'); }

// ── Init ──────────────────────────────────────────────────────────────────────
export function initSubrange() {
    // Search IP octet validation (respects wildcard)
    ['o1','o2','o3','o4'].forEach(id => {
        const inp = document.getElementById(`sr_ip_${id}`);
        if (inp) inp.addEventListener('input', () => {
            if (!document.getElementById('sr_wildcard').checked)
                inp.classList.toggle('invalid', !validateOctet(inp.value));
            else
                inp.classList.remove('invalid');
        });
    });
    
    document.getElementById('sr_wildcard')?.addEventListener('change', () => {
        ['o1','o2','o3','o4'].forEach(id =>
            document.getElementById(`sr_ip_${id}`)?.classList.remove('invalid')
        );
    });

    // Allocation IP octet validation (always validates)
    ['o1','o2','o3','o4'].forEach(id => {
        const inp = document.getElementById(`sr_ip_${id}`);
        if (inp) inp.addEventListener('input', () => inp.classList.toggle('invalid', !validateOctet(inp.value)));
    });

    // Toggle manual IP octets for allocation
    document.querySelectorAll('input[name="sr_ip_mode"]').forEach(r =>
        r.addEventListener('change', updateIPMode)
    );

    // Auto-fill Splittable_CIDR = min(cidr+8, 32) when CIDR typed
    document.getElementById('subrange_cidr')?.addEventListener('input', () => {
        const cidr = intVal('subrange_cidr');
        if (cidr !== null) document.getElementById('subrange_splittable').value = Math.min(cidr + 8, 32);
    });

    // Re-enable Allocate on any field change
    ['subrange_cidr','subrange_splittable','subrange_qty','subrange_owner','subrange_desc',
     'sr_ip_o1','sr_ip_o2','sr_ip_o3','sr_ip_o4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            document.getElementById('subrange_allocate').disabled = false;
        });
    });
    document.querySelectorAll('input[name="sr_ip_mode"]').forEach(r =>
        r.addEventListener('change', () => {
            document.getElementById('subrange_allocate').disabled = false;
        })
    );

    document.getElementById('subrange_find')?.addEventListener('click', onFind);
    document.getElementById('subrange_validate')?.addEventListener('click', onValidate);
    document.getElementById('subrange_allocate')?.addEventListener('click', onAllocate);
    document.getElementById('subrange_delete')?.addEventListener('click', onDeleteSubrange);
    document.getElementById('subrange_clear')?.addEventListener('click', onClear);
    document.getElementById('subrange_set_parent')?.addEventListener('click', onSetAsParent);
    document.getElementById('subrange_clear_result')?.addEventListener('click', () => {
        document.getElementById('subrange_result').textContent = '';
    });
}

// ── IP Mode ───────────────────────────────────────────────────────────────────
function updateIPMode() {
    const isManual = document.querySelector('input[name="sr_ip_mode"]:checked').value === 'manual';
    document.getElementById('subrange_manual_ip').style.display = isManual ? 'flex' : 'none';
    ['o1','o2','o3','o4'].forEach(id => {
        const inp = document.getElementById(`sr_ip_${id}`);
        inp.disabled = !isManual;
        if (!isManual) inp.value = '';
    });
}

// ── Wildcard helpers ─────────────────────────────────────────────────────────
function getWildcardPattern() {
    return ['o1','o2','o3','o4'].map(id => {
        const v = document.getElementById(`sr_ip_${id}`).value.trim();
        return (v === '' || v === '*') ? '*' : v;
    }).join('.');
}

function matchPattern(ip, pattern) {
    const ipParts  = ip.split('.');
    const patParts = pattern.split('.');
    return patParts.every((p, i) => p === '*' || p === ipParts[i]);
}

// ── Find ──────────────────────────────────────────────────────────────────────
async function onFind() {
    const isWildcard = document.getElementById('sr_wildcard').checked;
    const cidr       = intVal("subrange_cidr");
    const domain     = parentState.domain || 'default';
    const isPriv     = parentState.isPrivate ? 1 : 0;

    if (isWildcard) {
        if (!parentState.ip) { log('error', 'No parent range set'); return; }
        const pattern = getWildcardPattern();
        const result  = await apiCall('ls_ranges', {
            domain, is_private: isPriv,
            parent_ip_int: ipToInt(parentState.ip),
            parent_cidr: parseInt(parentState.cidr)
        });
        if (result.status === 'ok') {
            const matches = result.data.filter(r => matchPattern(r.ip, pattern));
            if (!matches.length) { log('info', `No subranges match: ${pattern}`); return; }
            matches.forEach(r => log('info', `${r.ip}/${r.cidr}  owner=${r.owner}  used=${r.usage}`));
            const m = cidr ? matches.find(r => r.cidr === cidr) : (matches.length === 1 ? matches[0] : null);
            if (m) {
                const r2 = await apiCall('ls_range', { ip: m.ip, cidr: m.cidr, domain, is_private: isPriv });
                if (r2.status === 'ok') loadSubrange(r2.data, domain, parentState.isPrivate);
            }
        } else {
            log('error', result.error?.message || 'Unknown error');
        }
        return;
    }

    const ip = getSearchIP();
    if (!ip) { log('error', 'Invalid IP address'); return; }
    const isPrivate = isPrivateIP(ip);

    if (!cidr) {
        if (!parentState.ip) { log('error', 'No parent range set'); return; }
        const result = await apiCall('ls_ranges', {
            domain, is_private: isPriv,
            parent_ip_int: ipToInt(parentState.ip),
            parent_cidr: parseInt(parentState.cidr)
        });
        if (result.status === 'ok') {
            const ranges = result.data;
            if (!ranges.length) { log('info', 'No subranges found'); return; }
            ranges.forEach(r => log('info', `${r.ip}/${r.cidr}  owner=${r.owner}  used=${r.usage}`));
        } else {
            log('error', result.error?.message || 'Unknown error');
        }
        return;
    }

    const result = await apiCall('ls_range', { ip, cidr, domain, is_private: isPrivate ? 1 : 0 });
    logJSON('<', result);
    if (result.status === 'ok') {
        const d = result.data;
        if (!d.parent_ip_int) { log('error', `${ip}/${cidr} is a top-level range, not a subrange`); return; }
        if (parentState.ip && ipToInt(parentState.ip) !== d.parent_ip_int) {
            log('error', `${ip}/${cidr} is not a child of ${parentState.ip}/${parentState.cidr}`); return; }
        loadSubrange(d, domain, isPrivate);
    } else {
        log('error', result.error?.message || 'Subrange not found');
    }
}

function loadSubrange(d, domain, isPrivate) {
    updateHexmap('subrange_hexmap', d.bitmap, d.cidr, d.min_subrange_cidr);
    document.getElementById('subrange_result').textContent = `${d.ip}/${d.cidr} (min: /${d.min_subrange_cidr})`;
    document.getElementById('subrange_cidr').value = d.cidr;
    document.getElementById('subrange_splittable').value = d.min_subrange_cidr;
    log('info', `Subrange found: ${d.ip}/${d.cidr} (min: /${d.min_subrange_cidr})`);
    setTargetForIP('subrange', d.ip, d.cidr, d.min_subrange_cidr, domain, isPrivate);
}

function ipToInt(ip) {
    return ip.split('.').reduce((acc, o) => (acc << 8) + parseInt(o), 0) >>> 0;
}

// ── Validate ──────────────────────────────────────────────────────────────────
function onValidate() {
    const ip   = getSearchIP();
    const cidr = intVal("subrange_cidr");
    if (!ip)   { log('error', 'Invalid IP address'); return; }
    if (!cidr) { log('error', 'CIDR required'); return; }

    const isPrivate = isPrivateIP(ip);
    if (parentState.ip && !ipInRange(ip, parentState.ip, parseInt(parentState.cidr))) {
        log('error', `IP ${ip} is outside parent ${parentState.ip}/${parentState.cidr}`);
        return;
    }
    log('info', `IP ${ip}/${cidr} is valid ${isPrivate ? 'private' : 'public'}`);
    if (parentState.ip) log('info', `Inside parent ${parentState.ip}/${parentState.cidr} ✓`);
}

// ── Allocate ──────────────────────────────────────────────────────────────────
async function onAllocate() {
    if (!parentState.ip) { log('error', 'No parent range — use Finder first'); return; }

    const cidr = intVal('subrange_cidr');
    if (!cidr) { log('error', 'CIDR required'); return; }

    const owner = strVal('subrange_owner');
    if (!owner) { log('error', 'Owner is REQUIRED'); return; }

    const args = {
        parent_ip:   parentState.ip,
        parent_cidr: parseInt(parentState.cidr),
        cidr,
        qty:         intVal('subrange_qty') || 1,
        domain:      parentState.domain,
        is_private:  parentState.isPrivate ? 1 : 0,
        owner
    };

    const splittable = intVal('subrange_splittable');
    if (splittable) args.min_subrange_cidr = splittable;

    const desc = strVal('subrange_desc');
    if (desc) args.description = desc;

    const ipMode = document.querySelector('input[name="sr_ip_mode"]:checked').value;
    if (ipMode === 'manual') {
        const manualIP = getIP('sr_ip');
        if (!manualIP) { log('error', 'Manual IP is invalid'); return; }
        if (!ipInRange(manualIP, parentState.ip, parseInt(parentState.cidr))) {
            log('error', `Subrange ${manualIP} is outside parent ${parentState.ip}/${parentState.cidr}`);
            return;
        }
        args.specific_ip_range = manualIP;
    }

    logJSON('>', { func: 'alloc_range', args });
    const result = await apiCall('alloc_range', args);
    logJSON('<', result);

    if (result.status === 'ok') {
        const first = Array.isArray(result.data) ? result.data[0] : result.data;
        const minCidr = first.min_subrange_cidr ?? 32;
        document.getElementById('subrange_result').textContent = `${first.ip}/${first.cidr} (min: /${minCidr})`;
        if (first.hexmap) {
            updateHexmap('subrange_hexmap', first.hexmap, parentState.cidr, parentState.splittable);
            updateHexmap('finder_hexmap',   first.hexmap, parentState.cidr, parentState.splittable);
        }
        document.getElementById('subrange_allocate').disabled = true;
        log('success', `Allocated: ${first.ip}/${first.cidr} (min: /${minCidr})`);
        setTargetForIP('subrange', first.ip, first.cidr, minCidr, parentState.domain, parentState.isPrivate);
    } else {
        log('error', result.error?.message || 'Unknown error');
    }
}

// ── Set As Parent ─────────────────────────────────────────────────────────────
async function onSetAsParent() {
    const resultText = document.getElementById('subrange_result').textContent;
    if (!resultText) { log('error', 'No subrange result'); return; }
    const match = resultText.match(/^([\d.]+)\/(\d+)/);
    if (!match) { log('error', 'Invalid result format'); return; }
    const [, ip, cidr] = match;

    const parts = ip.split('.');
    ['o1','o2','o3','o4'].forEach((id, i) =>
        document.getElementById(`finder_ip_${id}`).value = parts[i]
    );
    document.getElementById('finder_cidr').value = cidr;
    document.getElementById('finder_private').checked = parentState.isPrivate;

    const result = await apiCall('ls_range', {
        ip, cidr: parseInt(cidr),
        domain: parentState.domain, is_private: parentState.isPrivate ? 1 : 0
    });

    if (result.status === 'ok') {
        const d = result.data;
        document.getElementById('finder_parent_display').textContent = `${ip}/${cidr} (min: /${d.min_subrange_cidr})`;
        updateHexmap('finder_hexmap', d.bitmap, cidr, d.min_subrange_cidr);
        setParentForSubrange(ip, parseInt(cidr), d.min_subrange_cidr, parentState.domain, parentState.isPrivate);
        onClear();
        log('success', `Set ${ip}/${cidr} as new parent`);
    } else {
        log('error', result.error?.message || 'Unknown error');
    }
}

// ── Delete Subrange ───────────────────────────────────────────────────────────
async function onDeleteSubrange() {
    const resultText = document.getElementById('subrange_result').textContent;
    if (!resultText) { log('error', 'No subrange result to delete'); return; }
    const match = resultText.match(/^([\d.]+)\/(\d+)/);
    if (!match) { log('error', 'Invalid result format'); return; }
    const [, ip, cidr] = match;
    const cascade = document.getElementById('subrange_cascade').checked ? 1 : 0;
    const args = {
        ip, cidr: parseInt(cidr),
        domain: parentState.domain,
        is_private: parentState.isPrivate ? 1 : 0,
        cascade
    };
    logJSON('>', { func: 'release_range', args });
    const result = await apiCall('release_range', args);
    logJSON('<', result);
    if (result.status === 'ok') {
        log('success', `Deleted subrange: ${ip}/${cidr}`);
        const r2 = await apiCall('ls_range', {
            ip: parentState.ip, cidr: parentState.cidr,
            domain: parentState.domain, is_private: parentState.isPrivate ? 1 : 0
        });
        if (r2.status === 'ok') {
            updateHexmap('subrange_hexmap', r2.data.bitmap, parentState.cidr, parentState.splittable);
            updateHexmap('finder_hexmap',   r2.data.bitmap, parentState.cidr, parentState.splittable);
        }
        document.getElementById('subrange_result').textContent = '';
        document.getElementById('subrange_allocate').disabled = false;
    } else {
        log('error', result.error?.message || 'Unknown error');
    }
}

// ── setParentForSubrange (exported) ───────────────────────────────────────────
export function setParentForSubrange(ip, cidr, splittable, domain, isPrivate) {
    parentState = { ip, cidr, splittable, domain, isPrivate };
    document.getElementById('subrange_parent_display').textContent =
        `${ip}/${cidr} (domain: ${domain}, min: /${splittable})`;
    setIPParent(ip, cidr, domain, isPrivate);
    log('info', `Subrange parent set: ${ip}/${cidr} (min: /${splittable})`);
}

// ── Clear ─────────────────────────────────────────────────────────────────────
function onClear() {
    ['subrange_cidr','subrange_splittable','subrange_owner','subrange_desc',
     'sr_ip_o1','sr_ip_o2','sr_ip_o3','sr_ip_o4',].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('subrange_qty').value = '1';
    document.getElementById('subrange_result').textContent = '';
    document.getElementById('subrange_allocate').disabled = false;
    ['o1','o2','o3','o4'].forEach(id =>
        document.getElementById(`sr_ip_${id}`).value = ''
    );
    document.querySelectorAll('input[name="sr_ip_mode"]')[0].checked = true;
    document.getElementById('subrange_manual_ip').style.display = 'none';
    log('info', 'Subrange cleared');
}

// ── clearSubrange (exported) ──────────────────────────────────────────────────
export function clearSubrange() {
    parentState = { ip:'', cidr:'', splittable:'', domain:'default', isPrivate:false };
    document.getElementById('subrange_parent_display').textContent = '';
    document.getElementById('subrange_hexmap').textContent = '';
    onClear();
}
