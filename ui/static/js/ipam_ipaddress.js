// node: 'merged_ui/src/static/js/ipam_ipaddress.js'
import { apiCall } from './api.js';
import { getIP, validateOctet, log, logJSON, formatHexmap, ipInRange } from './ipam_utils.js';

// ── State ─────────────────────────────────────────────────────────────────────
// Tracks which range is the current allocation target
// type: 'parent' | 'subrange'
// ip/cidr: the range to allocate from
// domain/isPrivate: passed from Finder via setIPParent()
let targetState = { type:'parent', ip:'', cidr:'', domain:'default', isPrivate:false };

// ── Helpers ───────────────────────────────────────────────────────────────────
function strVal(id) { return document.getElementById(id).value.trim(); }

// ── Init ──────────────────────────────────────────────────────────────────────
// Called once on DOMContentLoaded — attaches all event listeners
export function initIPAddress() {

    // Switch target between Parent Range and Subrange
    document.querySelectorAll('input[name="ip_target"]').forEach(r =>
        r.addEventListener('change', updateTarget)
    );

    // Toggle manual IP octets visibility when Auto/Manual radio changes
    document.querySelectorAll('input[name="ip_mode"]').forEach(r =>
        r.addEventListener('change', updateIPMode)
    );

    // Validate each IP octet as user types (highlight red if invalid)
    ['o1','o2','o3','o4'].forEach(id => {
        const inp = document.getElementById(`ip_${id}`);
        inp.addEventListener('input', () => inp.classList.toggle('invalid', !validateOctet(inp.value)));
    });

    // Re-enable Allocate button when any form field changes
    // (button is disabled after successful allocation to prevent double-submit)
    ['ip_owner','ip_desc','ip_o1','ip_o2','ip_o3','ip_o4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            document.getElementById('ip_allocate').disabled = false;
        });
    });
    document.querySelectorAll('input[name="ip_mode"], input[name="ip_target"]').forEach(r =>
        r.addEventListener('change', () => {
            document.getElementById('ip_allocate').disabled = false;
        })
    );

    document.getElementById('ip_allocate').addEventListener('click', onAllocate);
    document.getElementById('ip_release').addEventListener('click', onReleaseIP);
    document.getElementById('ip_find').addEventListener('click', onFind);
    document.getElementById('ip_clear').addEventListener('click', onClear);
    document.getElementById('ip_clear_result').addEventListener('click', () => {
        document.getElementById('ip_allocated').textContent = '';
    });
}

// ── Target ────────────────────────────────────────────────────────────────────
// Switch allocation target between Parent Range and Subrange
// When switching to Parent, restore parent ip/cidr from display
function updateTarget() {
    const type = document.querySelector('input[name="ip_target"]:checked').value;
    targetState.type = type;
    if (type === 'parent') {
        // Clear subrange display, restore parent as active target
        document.getElementById('ip_subrange_display').textContent = '';
        const parentText = document.getElementById('ip_parent_display').textContent;
        const match = parentText.match(/^([\d.]+)\/(\d+)/);
        if (match) {
            targetState.ip   = match[1];
            targetState.cidr = match[2];
            document.getElementById('ip_cidr_display').textContent = match[2];
        }
    }
}

// ── IP Mode ───────────────────────────────────────────────────────────────────
// Show/hide manual IP octets row based on Auto/Manual radio selection
function updateIPMode() {
    const isManual = document.querySelector('input[name="ip_mode"]:checked').value === 'manual';
    
    ['o1','o2','o3','o4'].forEach(id => {
        const inp = document.getElementById(`ip_${id}`);
        inp.disabled = !isManual;
        if (!isManual) inp.value = '';
    });
    // Find button only makes sense in manual mode
    
}

// ── Allocate ──────────────────────────────────────────────────────────────────
// Allocate one IP address from target range (parent or subrange)
// Sends specific_ip if Manual mode selected
// After success: refreshes hexmap of target range
async function onAllocate() {
    if (!targetState.ip) { log('error', 'No target range. Set in Finder or Subrange first.'); return; }

    const args = {
        range_ip:   targetState.ip,
        range_cidr: parseInt(targetState.cidr),
        domain:     targetState.domain,
        is_private: targetState.isPrivate,
        owner:      strVal('ip_owner') || 'default'
    };

    const desc = strVal('ip_desc');
    if (desc) args.description = desc;

    // Manual mode: pass specific IP to allocate
    const isManual = document.querySelector('input[name="ip_mode"]:checked').value === 'manual';
    if (isManual) {
        const manualIP = getIP('ip');
        if (!ipInRange(manualIP, targetState.ip, parseInt(targetState.cidr))) {
            log('error', `IP ${manualIP} is outside target range ${targetState.ip}/${targetState.cidr}`);
            return;
        }
        args.specific_ip = manualIP;
    }

    logJSON('>', { func: 'alloc_ip', args });
    const result = await apiCall('alloc_ip', args);
    logJSON('<', result);

    if (result.status === 'ok') {
        document.getElementById('ip_allocated').textContent = result.data.ip;
        log('success', `Allocated IP: ${result.data.ip}`);
        // Disable to prevent accidental double allocation
        document.getElementById('ip_allocate').disabled = true;
        // Refresh hexmap of the target range to show the newly allocated bit
        refreshHexmap(targetState.ip, targetState.cidr, targetState.domain, targetState.isPrivate);
    } else {
        log('error', result.error?.message || 'Unknown error');
    }
}

// ── refreshHexmap ─────────────────────────────────────────────────────────────
// After IP allocation, re-fetch range and update subrange hexmap display
async function refreshHexmap(ip, cidr, domain, isPrivate) {
    const result = await apiCall('ls_range', {
        ip, cidr: parseInt(cidr), domain, is_private: isPrivate ? 1 : 0
    });
    if (result.status === 'ok') {
        const d = result.data;
        // Update subrange hexmap if we allocated from a subrange
        if (targetState.type === 'subrange') {
            const el = document.getElementById('subrange_hexmap');
            if (el) el.textContent = formatHexmap(d.bitmap, d.cidr, d.min_subrange_cidr);
        }
    }
}

// ── Clear ─────────────────────────────────────────────────────────────────────
// Reset all IP ADDRESS form fields, re-enable Allocate, reset target to Parent
function onClear() {
    ['ip_owner','ip_desc'].forEach(id => document.getElementById(id).value = '');
    ['o1','o2','o3','o4'].forEach(id => document.getElementById(`ip_${id}`).value = '');
    document.getElementById('ip_allocated').textContent = '';
    document.getElementById('ip_allocate').disabled = false;
    document.getElementById('ip_target_subrange').disabled = true;
    // Reset radios to defaults
    document.querySelectorAll('input[name="ip_target"]')[0].checked = true;
    document.querySelectorAll('input[name="ip_mode"]')[0].checked = true;
    log('info', 'IP section cleared');
}

// ── setTargetForIP (exported) ─────────────────────────────────────────────────
// Called by Subrange after successful allocation
// Sets subrange as active IP allocation target
// domain/isPrivate forwarded so alloc_ip call has correct context
export function setTargetForIP(type, ip, cidr, minCidr, domain, isPrivate) {
    targetState = {
        type,
        ip,
        cidr,
        domain:    domain    ?? targetState.domain,
        isPrivate: isPrivate ?? targetState.isPrivate
    };
    if (type === 'subrange') {
        document.getElementById('ip_target_subrange').disabled = false;
        document.getElementById('ip_target_subrange').checked = true;
        document.getElementById('ip_subrange_display').textContent = `${ip}/${cidr} (min: /${minCidr})`;
        document.getElementById('ip_cidr_display').textContent = cidr;
    }
}

// ── setIPParent (exported) ────────────────────────────────────────────────────
// Called by Finder/Subrange when parent range is set
// Updates domain/isPrivate context and shows parent in display
// If target is still 'parent', also updates active ip/cidr
export function setIPParent(ip, cidr, domain, isPrivate) {
    targetState.domain    = domain;
    targetState.isPrivate = isPrivate;
    document.getElementById('ip_parent_display').textContent = `${ip}/${cidr}`;
    if (targetState.type === 'parent') {
        targetState.ip   = ip;
        targetState.cidr = cidr;
        document.getElementById('ip_cidr_display').textContent = cidr;
    }
}

// ── clearIP (exported) ────────────────────────────────────────────────────────
// Called by Finder "Clear All" — resets all state and fields
export function clearIP() {
    targetState = { type:'parent', ip:'', cidr:'', domain:'default', isPrivate:false };
    document.getElementById('ip_parent_display').textContent = '';
    document.getElementById('ip_subrange_display').textContent = '';
    document.getElementById('ip_cidr_display').textContent = '';
    onClear();
}

// ── Find IP ───────────────────────────────────────────────────────────────────
// Find allocated IP or list IPs in target range
// Wildcard: filter by pattern; with specific IP: show details
async function onFind() {
    const ip = getIP('ip');
    const isWildcard = document.getElementById('ip_wildcard').checked;
    const domain = targetState.domain || 'default';
    const isPriv = targetState.isPrivate ? 1 : 0;

    if (isWildcard) {
        // List all IPs in target range filtered by pattern
        const rangeIP  = targetState.ip;
        const rangeCIDR = targetState.cidr;
        if (!rangeIP) { log('error', 'No target range set'); return; }
        const pattern = ['o1','o2','o3','o4'].map(id => {
            const v = document.getElementById(`ip_${id}`).value.trim();
            return (v === '' || v === '*') ? '*' : v;
        }).join('.');
        const result = await apiCall('ls_addresses', {
            domain, is_private: isPriv,
            range_ip_int: ip2int(rangeIP),
            range_cidr: parseInt(rangeCIDR)
        });
        if (result.status === 'ok') {
            const matches = result.data.filter(a => matchIPPattern(a.ip, pattern));
            if (!matches.length) { log('info', `No IPs match: ${pattern}`); return; }
            matches.forEach(a => log('info', `${a.ip}  owner=${a.owner}`));
        } else {
            log('error', result.error?.message || 'Unknown error');
        }
        return;
    }

    if (!ip) { log('error', 'Invalid IP address'); return; }
    // Show IP info from addresses list
    const result = await apiCall('ls_addresses', { domain, is_private: isPriv });
    if (result.status === 'ok') {
        const found = result.data.find(a => a.ip === ip);
        if (!found) { log('error', `IP ${ip} not found`); return; }
        document.getElementById('ip_allocated').textContent = found.ip;
        log('info', `IP found: ${found.ip}  owner=${found.owner}`);
    } else {
        log('error', result.error?.message || 'Unknown error');
    }
}

function ip2int(ip) {
    return ip.split('.').reduce((acc, o) => (acc << 8) + parseInt(o), 0) >>> 0;
}
function matchIPPattern(ip, pattern) {
    return ip.split('.').every((o, i) => pattern.split('.')[i] === '*' || pattern.split('.')[i] === o);
}

// ── Release IP ────────────────────────────────────────────────────────────────
// Release the allocated IP shown in result field
async function onReleaseIP() {
    const ip = document.getElementById('ip_allocated').textContent.trim();
    if (!ip) { log('error', 'No allocated IP to release'); return; }
    const args = {
        ip,
        domain: targetState.domain,
        is_private: targetState.isPrivate ? 1 : 0
    };
    logJSON('>', { func: 'release_ip', args });
    const result = await apiCall('release_ip', args);
    logJSON('<', result);
    if (result.status === 'ok') {
        log('success', `Released IP: ${ip}`);
        document.getElementById('ip_allocated').textContent = '';
        document.getElementById('ip_allocate').disabled = false;
        // Refresh subrange hexmap if available
        if (result.data?.hexmap && targetState.type === 'subrange') {
            const el = document.getElementById('subrange_hexmap');
            if (el) el.textContent = result.data.hexmap;
        }
    } else {
        log('error', result.error?.message || 'Unknown error');
    }
}
