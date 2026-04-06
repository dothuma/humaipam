// node: 'merged_ui/src/static/js/assign.js'
import { apiCall } from './api.js';
import { strVal, setText, setVal, log, logJSON,
         getRadioValue, enablePanel, disablePanel } from './utils.js';

let state = { ne_name: '', if_name: '', interface_key: '' };

export function setAssignContext(ne_name, if_name, subif_name) {
    state.ne_name       = ne_name;
    state.if_name       = subif_name || if_name;
    state.interface_key = `${ne_name}:${state.if_name}`;
    setText('assign_ctx_iface', state.interface_key);
    enablePanel('panel_assign');
}

export function clearAssign() {
    state = { ne_name: '', if_name: '', interface_key: '' };
    setText('assign_ctx_iface', '');
    setVal('assign_prefix', '');
    setText('assign_result', '');
    disablePanel('panel_assign');
}

export function initAssign() {
    document.getElementById('assign_btn').addEventListener('click', onAssign);
    document.getElementById('assign_release').addEventListener('click', onRelease);
    document.getElementById('assign_clear').addEventListener('click', onClear);
}

// ip_key = _:prefix  — domain always _ for now
// prefix comes from IPAM v5 when joined — manual entry for now
function buildIpKey() {
    const prefix = strVal('assign_prefix').trim();
    if (!prefix) { log('error', 'Prefix is required — e.g. 10.0.0.1/30'); return null; }
    return `_:${prefix}`;
}

async function onAssign() {
    if (!state.interface_key) { log('error', 'No interface context'); return; }
    const ip_key = buildIpKey();
    if (!ip_key) return;
    const ip_role = parseInt(getRadioValue('assign_role')) || 0;
    const args = { interface_key: state.interface_key, ip_key, ip_role };
    logJSON('>', { func: 'assign_ip', args });
    const result = await apiCall('assign_ip', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    const roleLabel = ['primary', 'secondary', 'vip'][ip_role] || 'primary';
    setText('assign_result', `${ip_key}  role=${roleLabel}`);
    log('success', `Assigned ${ip_key} → ${state.interface_key}`);
    document.getElementById('assign_btn').disabled = true;
}

async function onRelease() {
    if (!state.interface_key) { log('error', 'No interface context'); return; }
    const ip_key = buildIpKey();
    if (!ip_key) return;
    const args = { interface_key: state.interface_key, ip_key };
    logJSON('>', { func: 'release_ip_assign', args });
    const result = await apiCall('release_ip_assign', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    log('success', `Released ${ip_key} from ${state.interface_key}`);
    setText('assign_result', '');
    document.getElementById('assign_btn').disabled = false;
}

function onClear() {
    setVal('assign_prefix', '');
    setText('assign_result', '');
    document.getElementById('assign_btn').disabled = false;
    log('info', 'Assign section cleared');
}
