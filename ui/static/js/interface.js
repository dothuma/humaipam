// node: 'merged_ui/src/static/js/interface.js'
import { apiCall } from './api.js';
import { strVal, intVal, setVal, setText, log, logJSON, checked,
         enablePanel, disablePanel, lockInput, unlockInput,
         getRadioValue, setRadioValue } from './utils.js';

let state = { ne_name: '', if_name: '', vrf_name: '', locked: false };

export function getInterfaceState() { return { ...state }; }
let _setSubifContext = () => {};
let _clearSubif      = () => {};

export function setInterfaceDownstream(setCtxFn, clearFn) {
    _setSubifContext = setCtxFn;
    _clearSubif      = clearFn;
}


let _getVRFState         = () => ({ locked: false, vrf_name: '', ne_name: '', vrf_customer: '' });
let _setVRFFromInterface = () => {};
let _onInterfaceLocked   = () => {};

export function setOnInterfaceLocked(fn) { _onInterfaceLocked = fn; }

export function setInterfaceVRFFns(getVRFStateFn, setVRFFromInterfaceFn) {
    _getVRFState         = getVRFStateFn;
    _setVRFFromInterface = setVRFFromInterfaceFn;
}

function updateVRFButtons(vrf_name) {
    const vrf = _getVRFState();
    const assocBtn  = document.getElementById('iface_associate_vrf');
    const dissocBtn = document.getElementById('iface_dissociate_vrf');
    if (!assocBtn || !dissocBtn) return;
    assocBtn.disabled  = !(vrf.locked && !vrf_name);
    dissocBtn.disabled = !vrf_name;
}

export function setInterfaceContext(ne_name) {
    state.ne_name = ne_name;
    setText('iface_ctx_device', ne_name);
    enablePanel('panel_interface');
}

export function clearInterface() {
    state = { ne_name: '', if_name: '', locked: false };
    setText('iface_ctx_device', '');
    clearFields();
    unlock();
    disablePanel('panel_interface');
    _clearSubif();
}

export function initInterface() {
    document.getElementById('iface_find').addEventListener('click', onFind);
    document.getElementById('iface_create').addEventListener('click', onCreate);
    document.getElementById('iface_delete').addEventListener('click', onDelete);
    document.getElementById('iface_clear').addEventListener('click', onClear);
    document.getElementById('iface_if_clear').addEventListener('click', onClearIF);
    document.getElementById('iface_if_name').addEventListener('input', () => {
        if (state.locked) unlock();
    });
}

function lock(if_name, vrf_name) {
    state.if_name  = if_name;
    state.vrf_name = vrf_name || '';
    state.locked   = true;
    lockInput('iface_if_name');
    enablePanel('panel_subif');
    _setSubifContext(state.ne_name, if_name);
    updateVRFButtons(state.vrf_name);
    if (vrf_name) _setVRFFromInterface(vrf_name, null);
    _onInterfaceLocked();
}

function unlock() {
    state.if_name = '';
    state.locked  = false;
    unlockInput('iface_if_name');
    disablePanel('panel_subif');
    _clearSubif();
}

async function onFind() {
    const if_name  = strVal('iface_search_name');
    const vrf      = strVal('iface_search_vrf');
    const customer = strVal('iface_search_customer');
    const exact    = checked('iface_exact_name');

    if (!if_name && !vrf && !customer && !state.ne_name) {
        log('error', 'MISSING_SEARCH_CRITERIA: fill interface name, VRF, customer, or lock a device');
        return;
    }

    const args = { exact };
    if (state.ne_name) args.ne_name = state.ne_name;
    if (if_name)  args.if_name  = if_name;
    if (vrf)      args.vrf_name = vrf;
    if (customer) args.customer = customer;

    logJSON('>', { func: 'find_interface', args });
    const result = await apiCall('find_interface', args);
    logJSON('<', result);

    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }

    const data = result.data;

    if (Array.isArray(data)) {
        if (data.length === 0) {
            log('info', 'No interfaces found — slot may be free');
            setText('iface_result', '');
            return;
        }
        data.slice(0, 10).forEach(d =>
            log('info', `${d.if_name}  vrf=${d.vrf_name || '-'}  vlan=${d.vlan || '-'}  encap=${d.encapsulation}`)
        );
        if (data.length > 10) log('warning', `... ${data.length - 10} more`);
        setText('iface_result', `${data.length} results — refine search`);
    } else {
        populateInterface(data);
        lock(data.if_name, data.vrf_name);
        log('success', `Interface found: ${data.if_name}`);
    }
}

async function onCreate() {
    if (!state.ne_name) { log('error', 'No device context'); return; }
    const if_name = strVal('iface_if_name');
    if (!if_name) { log('error', 'If Name is required'); return; }

    const vlan = intVal('iface_vlan');
    if (vlan && (vlan < 1 || vlan > 4095)) {
        log('error', 'VLAN_OUT_OF_RANGE: must be 1-4095');
        return;
    }

    const args = {
        ne_name:       state.ne_name,
        if_name,
        encapsulation: parseInt(getRadioValue('iface_encap')) || 0,
        vrf_name:      strVal('iface_vrf') || null,
        description:   strVal('iface_desc') || null,
    };
    if (vlan) args.vlan = vlan;

    logJSON('>', { func: 'create_interface', args });
    const result = await apiCall('create_interface', args);
    logJSON('<', result);

    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    populateInterface(result.data);
    lock(result.data.if_name, result.data.vrf_name);
    log('success', `Interface created: ${result.data.if_name}`);
}

async function onDelete() {
    if (!state.ne_name || !state.if_name) { log('error', 'No interface selected'); return; }
    const args = { ne_name: state.ne_name, if_name: state.if_name };
    logJSON('>', { func: 'delete_interface', args });
    const result = await apiCall('delete_interface', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    log('success', `Deleted: ${state.if_name}`);
    onClear();
}

function populateInterface(d) {
    setVal('iface_if_name', d.if_name);
    setVal('iface_vrf',     d.vrf_name    || '');
    setVal('iface_desc',    d.description || '');
    if (d.vlan) setVal('iface_vlan', d.vlan);
    setRadioValue('iface_encap', d.encapsulation ?? 0);
    // clear search fields
    setVal('iface_search_name',     '');
    setVal('iface_search_vrf',      '');
    setVal('iface_search_customer', '');
    const parts = [d.if_name, d.vrf_name, d.vlan ? `vlan=${d.vlan}` : null].filter(Boolean);
    setText('iface_result', parts.join('  '));
}

function onClearIF() {
    setVal('iface_if_name', '');
    setText('iface_result', '');
    unlock();
    log('info', 'Interface cleared');
}

function clearFields() {
    ['iface_search_name', 'iface_search_vrf', 'iface_search_customer',
     'iface_if_name', 'iface_vrf', 'iface_desc', 'iface_vlan'].forEach(id => setVal(id, ''));
    setText('iface_result', '');
    setRadioValue('iface_encap', 0);
}

function onClear() {
    clearFields();
    unlock();
    log('info', 'Interface section cleared');
}

