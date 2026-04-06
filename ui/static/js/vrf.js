// node: 'merged_ui/src/static/js/vrf.js'
import { apiCall } from './api.js';
import { strVal, setVal, setText, log, logJSON,
         enablePanel, disablePanel, lockInput, unlockInput } from './utils.js';

let state = { ne_name: '', vrf_name: '', vrf_customer: '', locked: false };
let _onVRFLocked   = () => {};
let _onVRFUnlocked = () => {};

export function setVRFDownstream(onLocked, onUnlocked) {
    _onVRFLocked   = onLocked;
    _onVRFUnlocked = onUnlocked;
}


let _getIfaceState  = () => ({ locked: false, ne_name: '', if_name: '' });
let _getSubifState  = () => ({ locked: false, ne_name: '', if_name: '' });

export function setVRFIfaceFns(getIfaceFn, getSubifFn) {
    _getIfaceState = getIfaceFn;
    _getSubifState = getSubifFn;
}

function getLockedInterface() {
    const subif = _getSubifState();
    if (subif.locked) return { ne_name: subif.ne_name, if_name: subif.subif_name, type: 'subif' };
    const iface = _getIfaceState();
    if (iface.locked) return { ne_name: iface.ne_name, if_name: iface.if_name, type: 'interface' };
    return null;
}

export function updateAssocButtons() {
    const assocBtn  = document.getElementById('vrf_associate');
    const dissocBtn = document.getElementById('vrf_dissociate');
    if (!assocBtn || !dissocBtn) return;
    const iface = getLockedInterface();
    assocBtn.disabled  = !(state.locked && iface);
    dissocBtn.disabled = !(state.locked && iface);
    if (iface) {
        setText('vrf_assoc_iface', iface.if_name);
    } else {
        setText('vrf_assoc_iface', '');
    }
}

async function onAssociate() {
    if (!state.locked) { log('error', 'No VRF selected'); return; }
    const iface = getLockedInterface();
    if (!iface) { log('error', 'No interface or subinterface locked'); return; }
    const args = { ne_name: iface.ne_name, if_name: iface.if_name, vrf_name: state.vrf_name };
    logJSON('>', { func: 'assign_interface_vrf', args });
    const result = await apiCall('assign_interface_vrf', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    setText('vrf_assoc_result', `${iface.if_name} → ${state.vrf_name}`);
    // update VRF field in subif or interface panel
    const subif = _getSubifState();
    if (subif.locked) {
        const vrfEl = document.getElementById('subif_vrf');
        if (vrfEl) vrfEl.value = state.vrf_name;
    } else {
        const vrfEl = document.getElementById('iface_vrf');
        if (vrfEl) vrfEl.value = state.vrf_name;
    }
    log('success', `${iface.if_name} associated with VRF ${state.vrf_name}`);
}

async function onDissociate() {
    if (!state.locked) { log('error', 'No VRF selected'); return; }
    const iface = getLockedInterface();
    if (!iface) { log('error', 'No interface or subinterface locked'); return; }
    const args = { ne_name: iface.ne_name, if_name: iface.if_name };
    logJSON('>', { func: 'release_interface_vrf', args });
    const result = await apiCall('release_interface_vrf', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    setText('vrf_assoc_result', `${iface.if_name} released`);
    log('success', `${iface.if_name} released from VRF`);
}

export function initVRF() {
    document.getElementById('vrf_find').addEventListener('click', onFind);
    document.getElementById('vrf_associate').addEventListener('click', onAssociate);
    document.getElementById('vrf_dissociate').addEventListener('click', onDissociate);
    document.getElementById('vrf_create').addEventListener('click', onCreate);
    document.getElementById('vrf_update').addEventListener('click', onUpdate);
    document.getElementById('vrf_delete').addEventListener('click', onDelete);
    document.getElementById('vrf_clear').addEventListener('click', onClear);
    document.getElementById('vrf_name_input').addEventListener('input', () => {
        if (state.locked) unlock();
    });
}

export function setVRFContext(ne_name) {
    state.ne_name = ne_name;
    setText('vrf_ctx_device', ne_name);
    enablePanel('panel_vrf');
}

export function clearVRF() {
    state = { ne_name: '', vrf_name: '', vrf_customer: '', locked: false };
    setText('vrf_ctx_device', '');
    clearFields();
    disablePanel('panel_vrf');
}

export function setVRFFromInterface(vrf_name, vrf_customer) {
    if (!vrf_name) return;
    if (state.locked && state.vrf_name === vrf_name) return;
    state.vrf_name     = vrf_name;
    state.vrf_customer = vrf_customer || '';
    state.locked       = true;
    setVal('vrf_name_input',     vrf_name);
    setVal('vrf_customer_input', vrf_customer || '');
    lockInput('vrf_name_input');
    document.getElementById('vrf_update').disabled = false;
    document.getElementById('vrf_delete').disabled = false;
    setText('vrf_result', `${vrf_name}${vrf_customer ? ' / ' + vrf_customer : ''}`);
    _onVRFLocked(vrf_name, vrf_customer);
}

export function getVRFState() { return { ...state }; }

function lock(d) {
    state.vrf_name     = d.vrf_name;
    state.vrf_customer = d.vrf_customer || '';
    state.locked       = true;
    lockInput('vrf_name_input');
    document.getElementById('vrf_update').disabled = false;
    document.getElementById('vrf_delete').disabled = false;
    _onVRFLocked(d.vrf_name, d.vrf_customer);
}

function unlock() {
    state.vrf_name     = '';
    state.vrf_customer = '';
    state.locked       = false;
    unlockInput('vrf_name_input');
    document.getElementById('vrf_update').disabled = true;
    document.getElementById('vrf_delete').disabled = true;
    setText('vrf_result', '');
    _onVRFUnlocked();
}

async function onFind() {
    if (!state.ne_name) { log('error', 'No device context'); return; }
    const vrf_name     = strVal('vrf_name_input');
    const vrf_customer = strVal('vrf_customer_input');
    if (!vrf_name && !vrf_customer) { log('error', 'Fill VRF name or customer'); return; }
    const args = { ne_name: state.ne_name };
    if (vrf_name)     args.vrf_name     = vrf_name;
    if (vrf_customer) args.vrf_customer = vrf_customer;
    logJSON('>', { func: 'find_vrf', args });
    const result = await apiCall('find_vrf', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    const data = result.data;
    if (Array.isArray(data)) {
        data.forEach(v => log('info', `${v.vrf_name}  customer=${v.vrf_customer}  rd_rt=${v.rd_rt || '-'}`));
        setText('vrf_result', `${data.length} results`);
    } else {
        populateVRF(data);
        lock(data);
        log('success', `VRF found: ${data.vrf_name} / ${data.vrf_customer}`);
    }
}

async function onCreate() {
    if (!state.ne_name) { log('error', 'No device context'); return; }
    const vrf_name     = strVal('vrf_name_input');
    const vrf_customer = strVal('vrf_customer_input');
    if (!vrf_name)     { log('error', 'VRF name is required'); return; }
    if (!vrf_customer) { log('error', 'VRF customer is required'); return; }
    const args = {
        ne_name: state.ne_name,
        vrf_name, vrf_customer,
        rd:          strVal('vrf_rd_input') || null,
        rt:          strVal('vrf_rt_input') || null,
        description: strVal('vrf_desc_input') || null,
    };
    logJSON('>', { func: 'create_vrf', args });
    const result = await apiCall('create_vrf', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    populateVRF(result.data);
    lock(result.data);
    log('success', `VRF created: ${result.data.vrf_name}`);
}

async function onUpdate() {
    if (!state.locked) { log('error', 'No VRF selected'); return; }
    const args = {
        ne_name:      state.ne_name,
        vrf_name:     state.vrf_name,
        vrf_customer: strVal('vrf_customer_input') || null,
        rd:           strVal('vrf_rd_input')  || null,
        rt:           strVal('vrf_rt_input')  || null,
        description:  strVal('vrf_desc_input')     || null,
    };
    logJSON('>', { func: 'update_vrf', args });
    const result = await apiCall('update_vrf', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    populateVRF(result.data);
    log('success', `VRF updated: ${result.data.vrf_name}`);
}

async function onDelete() {
    if (!state.locked) { log('error', 'No VRF selected'); return; }
    const args = { ne_name: state.ne_name, vrf_name: state.vrf_name };
    logJSON('>', { func: 'delete_vrf', args });
    const result = await apiCall('delete_vrf', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    log('success', `VRF deleted: ${state.vrf_name}`);
    onClear();
}

function populateVRF(d) {
    setVal('vrf_name_input',     d.vrf_name     || '');
    setVal('vrf_customer_input', d.vrf_customer || '');
    setVal('vrf_rd_input',  d.rd || '');
    setVal('vrf_rt_input',  d.rt || '');
    setVal('vrf_desc_input',     d.description  || '');
    setText('vrf_result', `${d.vrf_name} / ${d.vrf_customer}`);
}

function clearFields() {
    ['vrf_name_input','vrf_customer_input','vrf_rd_input','vrf_rt_input','vrf_desc_input'].forEach(id => setVal(id, ''));
    setText('vrf_result', '');
}

function onClear() {
    clearFields();
    unlock();
    log('info', 'VRF cleared');
}

