// node: 'merged_ui/src/static/js/device.js'
import { apiCall } from './api.js';
import { strVal, setVal, setText, log, logJSON, checked,
         enablePanel, disablePanel, lockInput, unlockInput,
         getRadioValue, disableInputGroup, enableInputGroup } from './utils.js';

let state = { ne_name: '', locked: false };
let _setInterfaceContext = () => {};
let _clearInterface      = () => {};
let _setVRFContext        = () => {};
let _clearVRF            = () => {};

export function setDeviceDownstream(setCtxFn, clearFn, setVRFCtxFn, clearVRFFn) {
    _setInterfaceContext = setCtxFn;
    _clearInterface      = clearFn;
    _setVRFContext       = setVRFCtxFn  || (() => {});
    _clearVRF            = clearVRFFn   || (() => {});
}

export function initDevice() {
    document.getElementById('dev_find').addEventListener('click', onFind);
    document.getElementById('dev_create').addEventListener('click', onCreate);
    document.getElementById('dev_clear_all').addEventListener('click', onClearAll);
    document.getElementById('dev_ne_clear').addEventListener('click', onClearNE);
    document.getElementById('dev_location_clear').addEventListener('click', () => setVal('dev_location', ''));
    document.getElementById('dev_model_clear').addEventListener('click', () => setVal('dev_model', ''));
    document.getElementById('dev_ne_name').addEventListener('input', () => {
        if (state.locked) unlock();
    });
}

function lock(ne_name) {
    state.ne_name = ne_name;
    state.locked  = true;
    lockInput('dev_ne_name');
    disableInputGroup(['dev_location', 'dev_model']);
    document.querySelectorAll('input[name="dev_role"]').forEach(r => r.disabled = true);
    enablePanel('panel_vrf');
    enablePanel('panel_interface');
    _setVRFContext(ne_name);
    _setInterfaceContext(ne_name);
    updateStatusBar();
}

function unlock() {
    state.ne_name = '';
    state.locked  = false;
    unlockInput('dev_ne_name');
    enableInputGroup(['dev_location', 'dev_model']);
    document.querySelectorAll('input[name="dev_role"]').forEach(r => r.disabled = false);
    _clearVRF();
    _clearInterface();
    updateStatusBar();
}

function updateStatusBar() {
    const bar = document.getElementById('status_bar');
    if (!bar) return;
    bar.textContent = state.locked
        ? `Device: ${state.ne_name} — Interface → Subinterface → Assign`
        : 'Ready — Device → Interface → Subinterface → Assign';
}

async function onFind() {
    const ne_name   = strVal('dev_ne_name');
    const location  = strVal('dev_location');
    const model     = strVal('dev_model');
    const role_mask = parseInt(getRadioValue('dev_role')) || 0;
    const exact     = checked('dev_exact_name');

    if (!ne_name && !location && !model && !role_mask) {
        log('error', 'MISSING_SEARCH_CRITERIA: fill at least one field');
        return;
    }

    // pass values as-is — server wraps in LIKE when exact=false
    // if exact ne_name — search only by name, ignore other fields
    const args = { exact };
    if (ne_name && exact) {
        args.ne_name = ne_name;
    } else {
        if (ne_name)   args.ne_name      = ne_name;
        if (location)  args.location     = location;
        if (model)     args.device_model = model;
        if (role_mask) args.role_mask    = role_mask;
    }

    logJSON('>', { func: 'find_device', args });
    const result = await apiCall('find_device', args);
    logJSON('<', result);

    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }

    const data = result.data;
    if (Array.isArray(data)) {
        if (data.length === 0) { log('info', 'No devices found'); setText('dev_result', ''); return; }
        data.slice(0, 10).forEach(d =>
            log('info', `${d.ne_name}  ${d.alias || ''}  ${d.location || ''}  role=${d.role_mask}`)
        );
        if (data.length > 10) log('warning', `... ${data.length - 10} more`);
        setText('dev_result', `${data.length} results — refine search`);
    } else {
        populateDevice(data);
        lock(data.ne_name);
        log('success', `Device found: ${data.ne_name}`);
    }
}

async function onCreate() {
    const ne_name = strVal('dev_ne_name');
    if (!ne_name) { log('error', 'NE Name is required'); return; }
    const args = {
        ne_name,
        location:     strVal('dev_location'),
        device_model: strVal('dev_model'),
        role_mask:    parseInt(getRadioValue('dev_role')) || 0,
    };
    logJSON('>', { func: 'create_device', args });
    const result = await apiCall('create_device', args);
    logJSON('<', result);
    if (result.status === 'fail') { log('error', result.error?.message || 'error'); return; }
    populateDevice(result.data);
    lock(result.data.ne_name);
    log('success', `Device created: ${result.data.ne_name}`);
}

function populateDevice(d) {
    setVal('dev_ne_name', d.ne_name);
    setVal('dev_location', d.location || '');
    setVal('dev_model', d.device_model || '');
    const parts = [d.ne_name, d.alias, d.location, d.device_model].filter(Boolean);
    setText('dev_result', parts.join('  '));
}

function onClearNE() {
    setVal('dev_ne_name', '');
    setText('dev_result', '');
    unlock();
    log('info', 'NE cleared');
}

export function clearDevice() {
    ['dev_ne_name', 'dev_location', 'dev_model'].forEach(id => setVal(id, ''));
    setText('dev_result', '');
    const anyRadio = document.querySelector('input[name="dev_role"][value="0"]');
    if (anyRadio) anyRadio.checked = true;
    unlock();
}

function onClearAll() {
    clearDevice();
    log('info', 'All cleared');
}
