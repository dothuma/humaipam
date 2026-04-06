// node: 'merged_ui/src/static/js/ipam_finder.js'
import { apiCall } from './api.js';
import { getIP, isPrivateIP, validateOctet, formatHexmap, log, logJSON } from './ipam_utils.js';

// ── State ─────────────────────────────────────────────────────────────────────
let state = { parentIP:'', parentCIDR:'', parentDomain:'default', parentIsPrivate:false, parentSplittable:'' };

// ── Cross-module functions (injected by app.js via setClearFunctions) ─────────
// These avoid circular imports: finder does NOT import subrange or ipaddress
let _setParentForSubrange = () => {};
let _clearSubrange = () => {};
let _clearIP = () => {};

export function setClearFunctions(setParentFn, clearSubrangeFn, clearIPFn) {
    _setParentForSubrange = setParentFn;
    _clearSubrange = clearSubrangeFn;
    _clearIP = clearIPFn;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function intVal(id) { return parseInt(document.getElementById(id).value) || 0; }
function strVal(id) { return document.getElementById(id).value.trim(); }
function checked(id) { return document.getElementById(id).checked; }
function getDomain() { return checked('finder_domain_chk') ? strVal('finder_domain') : 'default'; }

// ── Init ──────────────────────────────────────────────────────────────────────
export function initFinder() {
    document.getElementById('finder_domain_chk').addEventListener('change', e => {
        document.getElementById('finder_domain').disabled = !e.target.checked;
    });
    document.getElementById('finder_owner_chk').addEventListener('change', e => {
        document.getElementById('finder_owner').disabled = !e.target.checked;
    });

    // Octet validation + auto-detect private (skip if wildcard)
    ['o1','o2','o3','o4'].forEach(id => {
        const inp = document.getElementById(`finder_ip_${id}`);
        inp.addEventListener('input', () => {
            if (!checked('finder_wildcard'))
                inp.classList.toggle('invalid', !validateOctet(inp.value));
            else
                inp.classList.remove('invalid');
            autoDetectPrivate();
        });
    });

    document.getElementById('finder_wildcard').addEventListener('change', e => {
        // Clear invalid highlights when wildcard toggled
        ['o1','o2','o3','o4'].forEach(id =>
            document.getElementById(`finder_ip_${id}`).classList.remove('invalid')
        );
    });

    // Auto-fill Splittable_CIDR = min(cidr+8, 32) when CIDR is typed
    document.getElementById('finder_cidr').addEventListener('input', () => {
        const cidr = parseInt(document.getElementById('finder_cidr').value);
        if (!isNaN(cidr)) {
            document.getElementById('finder_splittable').value = Math.min(cidr + 8, 32);
        }
    });

    document.getElementById('finder_find').addEventListener('click', onFind);
    document.getElementById('finder_validate').addEventListener('click', onValidate);
    document.getElementById('finder_create').addEventListener('click', onCreate);
    document.getElementById('finder_clear_all').addEventListener('click', onClearAll);
    document.getElementById('finder_delete').addEventListener('click', onDelete);
    document.getElementById('finder_clear_parent').addEventListener('click', onClearParent);
}

// ── Auto-detect private IP ────────────────────────────────────────────────────
function autoDetectPrivate() {
    const ip = getIP('finder_ip');
    if (ip) document.getElementById('finder_private').checked = isPrivateIP(ip);
}

// ── Find ──────────────────────────────────────────────────────────────────────
// Wildcard mode: list all ranges filtered by pattern (e.g. 10.*.*.*)
// Normal mode: find exact range by IP+CIDR
async function onFind() {
    const isWildcard = checked('finder_wildcard');

    if (isWildcard) {
        const pattern = getWildcardPattern('finder_ip');
        const domain  = getDomain();
        const isPriv  = checked('finder_private') ? 1 : 0;
        const args    = { domain, is_private: isPriv };
        logJSON('>', { func: 'ls_ranges', args });
        const result  = await apiCall('ls_ranges', args);
        if (result.status === 'ok') {
            const matches = result.data.filter(r => matchPattern(r.ip, pattern));
            if (!matches.length) { log('info', `No ranges match: ${pattern}`); return; }
            matches.forEach(r => log('info', `${r.ip}/${r.cidr}  owner=${r.owner}  used=${r.usage}`));
            // If exactly one match and CIDR given — load it
            const cidr = intVal('finder_cidr');
            if (matches.length === 1 || cidr) {
                const m = cidr ? matches.find(r => r.cidr === cidr) : matches[0];
                if (m) {
                    const r2 = await apiCall('ls_range', { ip: m.ip, cidr: m.cidr, domain, is_private: isPriv });
                    if (r2.status === 'ok') {
                        const d = r2.data;
                        displayParent(d.ip, d.cidr, d.min_subrange_cidr, d.bitmap, domain, isPriv);
                    }
                }
            }
        } else {
            log('error', result.error?.message || 'Unknown error');
        }
        return;
    }

    const ip = getIP('finder_ip');
    if (!ip) { log('error', 'Invalid IP address'); return; }
    const args = { ip, cidr: intVal('finder_cidr'), is_private: checked('finder_private') ? 1 : 0, domain: getDomain() };
    logJSON('>', { func: 'ls_range', args });
    const result = await apiCall('ls_range', args);
    logJSON('<', result);
    if (result.status === 'ok') {
        const d = result.data;
        displayParent(d.ip, d.cidr, d.min_subrange_cidr, d.bitmap, args.domain, args.is_private);
        log('info', `Range found: ${d.ip}/${d.cidr}`);
    } else {
        log('info', `Range not found: ${ip}/${args.cidr}`);
    }
}

// ── Wildcard helpers ──────────────────────────────────────────────────────────
// Get IP pattern from octets — empty or * octets become *
function getWildcardPattern(prefix) {
    return ['o1','o2','o3','o4'].map(id => {
        const v = document.getElementById(`${prefix}_${id}`).value.trim();
        return (v === '' || v === '*') ? '*' : v;
    }).join('.');
}

// Match IP against wildcard pattern (10.*.0.* etc)
function matchPattern(ip, pattern) {
    const ipParts  = ip.split('.');
    const patParts = pattern.split('.');
    return patParts.every((p, i) => p === '*' || p === ipParts[i]);
}

// ── Validate ──────────────────────────────────────────────────────────────────
function onValidate() {
    const ip = getIP('finder_ip');
    if (!ip) { log('error', 'Invalid IP address'); return; }
    const priv = isPrivateIP(ip);
    if (priv !== checked('finder_private')) { log('error', 'IP type mismatch!'); return; }
    log('info', `IP ${ip} is valid ${priv ? 'private' : 'public'}`);
    log('info', `CIDR /${intVal('finder_cidr')}`);
}

// ── Create ────────────────────────────────────────────────────────────────────
async function onCreate() {
    const ip = getIP('finder_ip');
    if (!ip) { log('error', 'Invalid IP address'); return; }

    const cidr = intVal('finder_cidr');
    const splittable = intVal('finder_splittable') || null;
    const isPrivate = checked('finder_private');
    const domain = getDomain();
    const owner = checked('finder_owner_chk') ? strVal('finder_owner') : 'default';

    const args = { ip_range: ip, ip_range_cidr: cidr, is_private: isPrivate ? 1 : 0, domain, owner };
    if (splittable) args.min_subrange_cidr = splittable;

    logJSON('>', { func: 'create_range', args });
    const result = await apiCall('create_range', args);
    logJSON('<', result);

    if (result.status === 'ok') {
        const d = result.data;
        displayParent(d.ip, d.cidr, d.min_subrange_cidr, d.bitmap, domain, isPrivate);
        log('success', `Created: ${d.ip}/${d.cidr}`);
        document.getElementById('finder_create').disabled = true;
    } else {
        log('error', result.error?.message || 'Unknown error');
    }
}

// ── displayParent ─────────────────────────────────────────────────────────────
// Update Finder result rows and propagate to Subrange section
function displayParent(ip, cidr, splittable, bitmap, domain, isPrivate) {
    state = { parentIP: ip, parentCIDR: cidr, parentSplittable: splittable, parentDomain: domain, parentIsPrivate: isPrivate };
    document.getElementById('finder_parent_display').textContent = `${ip}/${cidr} (min: /${splittable})`;
    document.getElementById('finder_hexmap').textContent = formatHexmap(bitmap, cidr, splittable);
    // Notify Subrange section (injected, no circular import)
    _setParentForSubrange(ip, cidr, splittable, domain, isPrivate);
}

// ── Clear All ─────────────────────────────────────────────────────────────────
function onClearAll() {
    ['o1','o2','o3','o4'].forEach(id => document.getElementById(`finder_ip_${id}`).value = '');
    ['finder_cidr','finder_splittable','finder_owner'].forEach(id =>
        document.getElementById(id).value = ''
    );
    document.getElementById('finder_domain').value = 'default';
    document.getElementById('finder_owner_chk').checked = false;
    document.getElementById('finder_domain_chk').checked = false;
    document.getElementById('finder_private').checked = false;
    document.getElementById('finder_parent_display').textContent = '';
    document.getElementById('finder_hexmap').textContent = '';
    document.getElementById('finder_create').disabled = false;
    _clearSubrange();
    _clearIP();
    log('info', 'All sections cleared');
}

// ── Clear Parent ──────────────────────────────────────────────────────────────
function onClearParent() {
    document.getElementById('finder_parent_display').textContent = '';
    document.getElementById('finder_hexmap').textContent = '';
    _clearSubrange();
}

export function getParentState() { return state; }

// ── Delete Range ──────────────────────────────────────────────────────────────
// Delete current parent range, cascade if checkbox checked
// Cascade required when hexmap is not empty
async function onDelete() {
    if (!state.parentIP) { log('error', 'No range selected'); return; }
    const cascade = document.getElementById('finder_cascade').checked ? 1 : 0;
    const args = {
        ip: state.parentIP, cidr: parseInt(state.parentCIDR),
        domain: state.parentDomain,
        is_private: state.parentIsPrivate ? 1 : 0,
        cascade
    };
    logJSON('>', { func: 'release_range', args });
    const result = await apiCall('release_range', args);
    logJSON('<', result);
    if (result.status === 'ok') {
        log('success', `Deleted: ${state.parentIP}/${state.parentCIDR}`);
        onClearAll();
    } else {
        log('error', result.error?.message || 'Unknown error');
    }
}
