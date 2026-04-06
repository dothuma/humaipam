// node: 'merged_ui/src/static/js/subif.js'
import { apiCall } from './api.js';
import { strVal, intVal, setVal, setText, log, logJSON,
         enablePanel, disablePanel, lockInput, unlockInput } from './utils.js';

let state = { ne_name: '', if_name: '', subif_name: '', locked: false };

export function getSubifState() { return { ...state }; }
let _setAssignContext  = () => {};
let _clearAssign       = () => {};
let _onSubifLocked     = () => {};

export function setOnSubifLocked(fn) { _onSubifLocked = fn; }

export function setSubifDownstream(setCtxFn, clearFn) {
    _setAssignContext = setCtxFn;
    _clearAssign      = clearFn;
}

export function setSubifContext(ne_name, if_name) {
    state.ne_name = ne_name;
    state.if_name = if_name;
    setText('subif_ctx_device', ne_name);
    setText('subif_ctx_iface', if_name);
    enablePanel('panel_subif');
}

export function clearSubif() {
    state = { ne_name: '', if_name: '', subif_name: '', locked: false };
    setText('subif_ctx_device', '');
    setText('subif_ctx_iface', '');
    clearFields();
    unlock();
    disablePanel('panel_subif');
    _clearAssign();
}

export function initSubif() {
    document.getElementById('subif_find').addEventListener('click', onFind);
    document.getElementById('subif_create').addEventListener('click', onCreate);
    document.getElementById('subif_delete').addEventListener('click', onDelete);
    document.getElementById('subif_clear').addEventListener('click', onClear);
    document.getElementById('subif_name_clear').addEventListener('click', onClearSubif);
    document.getElementById('subif_name').addEventListener('input', () => {
        if (state.locked) unlock();
    });
    // auto-generate subif name when vlan changes
    document.getElementById('subif_vlan').addEventListener('input', () => {
        const vlan = intVal('subif_vlan');
        if (vlan && state.if_name && !state.locked) {
            setVal('subif_name', `${state.if_name}.${vlan}`);
        }
    });
}

function lock(subif_name) {
    state.subif_name = subif_name;
    state.locked     = true;
    lockInput('subif_name');
    enablePanel('panel_assign');
    _setAssignContext(state.ne_name, state.if_name, subif_name);
    _onSubifLocked();
}

function unlock() {
    state.subif_name = '';
    state.locked     = false;
    unlockInput('subif_name');
    disablePanel('panel_assign');
    _clearAssign();
}

async function onFind() {
    if (!state.ne_name || !state.if_name) { log('error', 'No interface context'); return; }
    const vlan = intVal('subif_vlan');
    const vrf  = strVal('subif_vrf');
    if (!vlan && !vrf) { log('error', 'MISSING_SEARCH_CRITERIA: fill VLAN or VRF'); return; }
    if (vlan && (vlan < 1 || vlan > 4095)) { log('error', 'VLAN_OUT_OF_RANGE: must be 1-4095'); return; }
    const args = { ne_name: state.ne_name, if_name: state.if_name };
    if (vlan) args.vlan     = vlan;
    if (vrf)  args.vrf_name = vrf;
    logJSON('>', { func: 'find_subinterface', args });
    const result = await apiCall('find_subinterface', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    const data = result.data;
    if (Array.isArray(data)) {
        if (data.length === 0) { log('info', 'No subinterfaces found — VLAN slot is free'); setText('subif_result', ''); return; }
        data.slice(0, 10).forEach(d => log('info', `${d.if_name}  vlan=${d.vlan || '-'}  vrf=${d.vrf_name || '-'}`));
        setText('subif_result', `${data.length} results`);
    } else {
        populateSubif(data);
        lock(data.if_name);
        log('success', `Subinterface found: ${data.if_name}`);
    }
}

async function onCreate() {
    if (!state.ne_name || !state.if_name) { log('error', 'No interface context'); return; }
    const vlan = intVal('subif_vlan');
    if (!vlan) { log('error', 'VLAN is required'); return; }
    if (vlan < 1 || vlan > 4095) { log('error', 'VLAN_OUT_OF_RANGE: must be 1-4095'); return; }

    // auto-generate name if empty
    let subif_name = strVal('subif_name');
    if (!subif_name) subif_name = `${state.if_name}.${vlan}`;

    const args = {
        ne_name:       state.ne_name,
        if_name:       subif_name,
        vlan,
        vrf_name:      strVal('subif_vrf') || null,
        description:   strVal('subif_desc') || null,
        encapsulation: 1
    };
    logJSON('>', { func: 'create_subinterface', args });
    const result = await apiCall('create_subinterface', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    populateSubif(result.data);
    lock(result.data.if_name);
    log('success', `Subinterface created: ${result.data.if_name}`);
}

async function onDelete() {
    if (!state.ne_name || !state.subif_name) { log('error', 'No subinterface selected'); return; }
    const args = { ne_name: state.ne_name, if_name: state.subif_name };
    logJSON('>', { func: 'delete_interface', args });
    const result = await apiCall('delete_interface', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    log('success', `Deleted: ${state.subif_name}`);
    onClear();
}

function populateSubif(d) {
    setVal('subif_name', d.if_name);
    if (d.vlan) setVal('subif_vlan', d.vlan);
    setVal('subif_vrf',  d.vrf_name    || '');
    setVal('subif_desc', d.description || '');
    const parts = [d.if_name, d.vlan ? `vlan=${d.vlan}` : null, d.vrf_name].filter(Boolean);
    setText('subif_result', parts.join('  '));
}

function onClearSubif() {
    setVal('subif_name', '');
    setText('subif_result', '');
    unlock();
    log('info', 'Subinterface cleared');
}

function clearFields() {
    ['subif_name', 'subif_vlan', 'subif_vrf', 'subif_desc'].forEach(id => setVal(id, ''));
    setText('subif_result', '');
}

function onClear() {
    clearFields();
    unlock();
    log('info', 'Subinterface section cleared');
}

