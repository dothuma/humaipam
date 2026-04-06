// node: 'merged_ui/src/static/js/merged_app.js'
// Network Manager — joint UI orchestrator
// Left: IPAM v5 — Right: Interface Manager

import { initFinder, setClearFunctions } from './ipam_finder.js';
import { initSubrange, clearSubrange, setParentForSubrange } from './ipam_subrange.js';
import { initIPAddress, clearIP, setIPParent } from './ipam_ipaddress.js';
import { initDevice, setDeviceDownstream, clearDevice } from './device.js';
import { initVRF, setVRFContext, clearVRF, setVRFFromInterface, getVRFState, setVRFDownstream, setVRFIfaceFns, updateAssocButtons } from './vrf.js';
import { initInterface, setInterfaceContext, clearInterface, setInterfaceDownstream, setInterfaceVRFFns, setOnInterfaceLocked, getInterfaceState } from './interface.js';
import { initSubif, setSubifContext, clearSubif, setSubifDownstream, getSubifState, setOnSubifLocked } from './subif.js';
import { initAssign, setAssignContext, clearAssign } from './assign.js';
import { initTerminal } from './terminal.js';

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
:root {
    --primary: #2563eb; --success: #16a34a; --warning: #ca8a04;
    --danger: #dc2626; --gray-50: #f9fafb; --gray-200: #e5e7eb;
    --gray-300: #d1d5db; --gray-700: #374151;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
       font-size: 14px; background: var(--gray-50); }
.main-container { width: 100%; padding: 20px; }
header { background: white; padding: 12px 20px; border-radius: 8px;
         margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
         display: flex; align-items: center; justify-content: space-between; }
header h1 { font-size: 20px; }
.status { color: var(--gray-700); font-size: 13px; }
.panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.panel-col { display: flex; flex-direction: column; gap: 12px; }
.panel-col h3 { font-size: 13px; font-weight: 600; color: var(--gray-700);
                text-transform: uppercase; letter-spacing: 0.05em;
                padding: 6px 0; border-bottom: 2px solid var(--gray-200); margin-bottom: 4px; }
.panel { background: white; border: 2px solid var(--gray-200);
         border-radius: 8px; padding: 16px 20px; }
.panel.disabled { opacity: 0.45; pointer-events: none; }
.panel h2 { font-size: 15px; font-weight: bold; margin-bottom: 12px;
            padding-bottom: 8px; border-bottom: 2px solid var(--gray-200); }
.form-row { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
.form-row > .lbl { min-width: 140px; font-weight: 500; flex-shrink: 0; font-size: 13px; }
hr.divider { border: none; border-top: 1px dashed var(--gray-300); margin: 10px 0; }
input[type="text"], input[type="number"] {
    padding: 5px 7px; border: 1px solid var(--gray-300);
    border-radius: 4px; font-size: 13px; }
input:focus { outline: none; border-color: var(--primary);
              box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
input:disabled { background: #f3f4f6; color: #9ca3af; cursor: not-allowed; }
input.w-sm { width: 72px; } input.w-md { width: 180px; } input.w-xl { flex: 1; }
input.locked { background: #eff6ff; border-color: var(--primary); color: #1e40af; font-weight: 500; }
input.octet { width: 42px !important; text-align: center; padding: 5px 3px !important; }
input.invalid { border-color: var(--danger) !important; background: #fff5f5 !important; }
.ip-octets { display: flex; align-items: center; gap: 3px; }
.ip-octets span { font-weight: bold; color: #555; font-size: 13px; }
.button-row { display: flex; gap: 8px; margin-top: 12px; padding-top: 12px;
              border-top: 1px solid var(--gray-200); flex-wrap: wrap; align-items: center; }
button { padding: 6px 14px; border: 1px solid var(--gray-300); border-radius: 4px;
         background: white; font-size: 13px; font-weight: 500; cursor: pointer;
         transition: background 0.15s; white-space: nowrap; }
button:hover:not(:disabled) { background: #f0f4ff; border-color: #aaa; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
button.primary { background: var(--primary); color: white; border-color: var(--primary); }
button.success { background: var(--success); color: white; border-color: var(--success); }
button.warning { background: var(--warning); color: white; border-color: var(--warning); }
button.danger  { background: var(--danger);  color: white; border-color: var(--danger); }
button.btn-sm  { padding: 3px 10px; font-size: 12px; }
.cascade-label { font-size: 12px; color: var(--gray-700); display: flex; align-items: center; gap: 4px; }
.result-row { display: flex; align-items: center; gap: 10px; padding: 7px 12px;
              background: var(--gray-50); border-radius: 4px; margin: 7px 0;
              border-left: 3px solid var(--primary); }
.result-label { font-weight: bold; min-width: 110px; flex-shrink: 0;
                color: var(--primary); font-size: 13px; }
.result-value { flex: 1; font-family: 'Courier New', monospace; font-size: 13px; }
.result-value.green { color: var(--success); font-weight: 600; }
.radio-group { display: flex; gap: 12px; flex-wrap: wrap; }
.radio-group label { display: flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer; }
.hexmap { font-family: 'Courier New', monospace; font-size: 12px; color: #4b5563; letter-spacing: 0.5px; }
.hint { color: #6b7280; font-size: 12px; }
.required { color: var(--danger); font-weight: bold; font-size: 12px; }
.terminal-section { grid-column: 1 / -1; }
.terminal-buttons { display: flex; gap: 8px; margin-bottom: 8px; }
#terminal { background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace;
            font-size: 12px; padding: 12px; border-radius: 6px; height: 300px;
            overflow-y: auto; line-height: 1.7; white-space: pre-wrap; word-break: break-all; }
#terminal .log-request  { color: #569cd6; }
#terminal .log-response { color: #4ec9b0; }
#terminal .log-error    { color: #f48771; font-weight: bold; }
#terminal .log-success  { color: #6a9955; font-weight: bold; }
#terminal .log-info     { color: #d4d4d4; }
#terminal .log-warning  { color: #dcdcaa; }
`;

// ── DOM helpers ───────────────────────────────────────────────────────────────
function el(tag, attrs={}, ...children) {
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
        if (k==='class') e.className=v;
        else if (k==='text') e.textContent=v;
        else e.setAttribute(k,v);
    }
    for (const c of children) {
        if (typeof c==='string') e.appendChild(document.createTextNode(c));
        else if (c) e.appendChild(c);
    }
    return e;
}
function inp(id, type, cls, attrs={}) { return el('input', {id, type:type||'text', class:cls||'', ...attrs}); }
function btn(id, text, cls) { const b=el('button',{id,class:cls||''}); b.textContent=text; return b; }
function formRow(label, ...content) {
    const row=el('div',{class:'form-row'});
    row.appendChild(el('span',{class:'lbl',text:label}));
    content.forEach(c=>row.appendChild(c));
    return row;
}
function resultRow(label, id, cls) {
    return el('div',{class:'result-row'},
        el('span',{class:'result-label',text:label}),
        el('span',{id,class:`result-value${cls?' '+cls:''}`})
    );
}
function radioGroup(name, options) {
    const g=el('div',{class:'radio-group'});
    options.forEach(([value,label])=>{
        const r=el('input',{type:'radio',name,value});
        const l=el('label'); l.appendChild(r); l.appendChild(document.createTextNode(' '+label));
        g.appendChild(l);
    });
    return g;
}
function divider() { return el('hr',{class:'divider'}); }
function hint(text) { return el('span',{class:'hint',text}); }
function panel(id, title, ...content) {
    const p=el('section',{class:'panel',id});
    p.appendChild(el('h2',{text:title}));
    content.forEach(c=>p.appendChild(c));
    return p;
}
function buttonRow(...buttons) {
    const row=el('div',{class:'button-row'});
    buttons.forEach(b=>row.appendChild(b));
    return row;
}
function ipOctets(prefix) {
    const d=el('div',{class:'ip-octets'});
    ['o1','o2','o3','o4'].forEach((o,i)=>{
        if(i>0) d.appendChild(el('span',{text:'.'}));
        d.appendChild(inp(`${prefix}_${o}`,'text','octet',{maxlength:'3'}));
    });
    return d;
}

// ── Build IPAM panel (left) ───────────────────────────────────────────────────
function buildIPAMPanel() {
    const col = el('div', {class:'panel-col'});
    col.appendChild(el('h3', {text:'IP PLANNER'}));

    // FINDER
    col.appendChild(panel('panel_finder', 'IP RANGE FINDER',
        formRow('', el('input',{type:'checkbox',id:'finder_domain_chk'}),
                el('span',{class:'lbl',text:'Domain:'}),
                inp('finder_domain','text','w-md',{value:'default',disabled:'true'})),
        formRow('', el('input',{type:'checkbox',id:'finder_owner_chk'}),
                el('span',{class:'lbl',text:'Owner:'}),
                inp('finder_owner','text','w-md',{disabled:'true'})),
        formRow('IP Range:', ipOctets('finder_ip'),
                el('label',{},...[el('input',{type:'checkbox',id:'finder_wildcard'}),document.createTextNode(' Wildcard')])),
        formRow('CIDR:', inp('finder_cidr','number','w-sm',{min:'0',max:'32'}),
                el('span',{class:'lbl',style:'min-width:130px;margin-left:10px',text:'Splittable_CIDR:'}),
                inp('finder_splittable','number','w-sm',{min:'0',max:'32'}),
                hint('(optional)')),
        formRow('', el('label',{},...[el('input',{type:'checkbox',id:'finder_private'}),
                document.createTextNode(' Private IP (10.x, 172.16-31.x, 192.168.x)')])),
        buttonRow(
            btn('finder_find','Find'), btn('finder_validate','Validate'),
            btn('finder_create','Create','primary'), btn('finder_delete','Delete Range','danger'),
            el('label',{class:'cascade-label'},...[el('input',{type:'checkbox',id:'finder_cascade'}),document.createTextNode(' Cascade')]),
            Object.assign(btn('finder_clear_all','Clear All','danger'),{style:'margin-left:auto'})
        ),
        (() => { const r=resultRow('Parent Range:','finder_parent_display','clr-blue');
                 r.appendChild(btn('finder_clear_parent','Clear','btn-sm')); return r; })(),
        (() => { const r=el('div',{class:'result-row'});
                 r.appendChild(el('span',{class:'result-label',text:'Hexmap:'}));
                 r.appendChild(el('span',{id:'finder_hexmap',class:'hexmap'})); return r; })()
    ));

    // SUBRANGE
    const srManual = el('div',{id:'subrange_manual_ip',style:'display:none',class:'form-row'});
    srManual.appendChild(el('span',{class:'lbl',text:'Manual IP:'}));
    srManual.appendChild(ipOctets('sr_ip'));

    col.appendChild(panel('panel_subrange', 'IP SUBRANGE',
        (() => { const r=resultRow('Parent:','subrange_parent_display','clr-blue'); return r; })(),
        (() => { const r=el('div',{class:'result-row'});
                 r.appendChild(el('span',{class:'result-label',text:'Hexmap:'}));
                 r.appendChild(el('span',{id:'subrange_hexmap',class:'hexmap'})); return r; })(),
        formRow('Allow Manual:',
            ...['auto','manual'].map(v => el('label',{},...[el('input',{type:'radio',name:'sr_ip_mode',value:v,...(v==='auto'?{checked:'true'}:{})}),document.createTextNode(' '+v[0].toUpperCase()+v.slice(1))]))),
        srManual,
        formRow('CIDR:', inp('subrange_cidr','number','w-sm',{min:'0',max:'32'}),
                el('span',{class:'lbl',style:'min-width:130px;margin-left:10px',text:'Splittable_CIDR:'}),
                inp('subrange_splittable','number','w-sm',{min:'0',max:'32'}),
                el('span',{class:'lbl',style:'min-width:40px;margin-left:10px',text:'Qty:'}),
                inp('subrange_qty','number','w-sm',{value:'1',min:'1',max:'8'})),
        formRow('Owner:', inp('subrange_owner','text','w-md'), el('span',{class:'required',text:'* REQUIRED'})),
        formRow('Description:', inp('subrange_desc','text','w-xl')),
        buttonRow(
            btn('subrange_find','Find'), btn('subrange_validate','Validate'),
            btn('subrange_allocate','Allocate','success'), btn('subrange_delete','Delete Subrange','danger'),
            el('label',{class:'cascade-label'},...[el('input',{type:'checkbox',id:'subrange_cascade'}),document.createTextNode(' Cascade')]),
            Object.assign(btn('subrange_clear','Clear','warning'),{style:'margin-left:auto'})
        ),
        (() => {
            const r=resultRow('Result:','subrange_result','clr-success');
            r.appendChild(btn('subrange_set_parent','Set As Parent ↑','primary btn-sm'));
            r.appendChild(btn('subrange_clear_result','Clear','btn-sm'));
            return r;
        })()
    ));

    // IP ADDRESS
    const ipTargetSubrange = inp('ip_target_subrange','radio','',{name:'ip_target',value:'subrange',disabled:'true'});
    col.appendChild(panel('panel_ip', 'IP ADDRESS',
        resultRow('Parent:','ip_parent_display','clr-blue'),
        resultRow('IP Subrange:','ip_subrange_display','clr-success'),
        resultRow('CIDR:','ip_cidr_display',''),
        formRow('IP Address:', ipOctets('ip'),
                el('label',{},...[el('input',{type:'checkbox',id:'ip_wildcard'}),document.createTextNode(' Wildcard')])),
        formRow('Target:',
            el('label',{},...[el('input',{type:'radio',name:'ip_target',value:'parent',checked:'true'}),document.createTextNode(' Parent Range')]),
            el('label',{},...[ipTargetSubrange,document.createTextNode(' Subrange')])),
        formRow('IP Mode:',
            el('label',{},...[el('input',{type:'radio',name:'ip_mode',value:'auto',checked:'true'}),document.createTextNode(' Auto (next free)')]),
            el('label',{},...[el('input',{type:'radio',name:'ip_mode',value:'manual'}),document.createTextNode(' Manual')])),
        formRow('Owner:', inp('ip_owner','text','w-md'), hint('(optional)')),
        formRow('Description:', inp('ip_desc','text','w-xl')),
        buttonRow(
            btn('ip_find','Find'), btn('ip_allocate','Allocate','success'),
            btn('ip_release','Release IP','danger'),
            Object.assign(btn('ip_clear','Clear All','warning'),{style:'margin-left:auto'})
        ),
        (() => {
            const r=resultRow('Allocated:','ip_allocated','clr-success');
            r.appendChild(btn('ip_clear_result','Clear','btn-sm'));
            return r;
        })()
    ));

    return col;
}

// ── Build Interface Manager panel (right) ─────────────────────────────────────
function buildIfacePanel() {
    const col = el('div', {class:'panel-col'});
    col.appendChild(el('h3', {text:'INTERFACE MANAGER'}));

    // DEVICE
    const devRole = radioGroup('dev_role', [
        ['0','any'],['1','core'],['2','distribution'],['4','access'],
        ['8','edge'],['16','router'],['32','firewall'],['64','cpe']
    ]);
    devRole.querySelector('input').checked = true;
    const devExact = el('label');
    devExact.appendChild(inp('dev_exact_name','checkbox'));
    devExact.appendChild(document.createTextNode(' Exact Name'));
    const devNErow = el('div',{class:'form-row'});
    devNErow.appendChild(el('span',{class:'lbl',text:'NE Name:'}));
    devNErow.appendChild(inp('dev_ne_name','text','w-md'));
    devNErow.appendChild(btn('dev_ne_clear','Clear','btn-sm'));

    col.appendChild(panel('panel_device', 'DEVICE',
        formRow('Location:', inp('dev_location','text','w-md'), btn('dev_location_clear','Clear','btn-sm'), devExact),
        formRow('Model:', inp('dev_model','text','w-md'), btn('dev_model_clear','Clear','btn-sm')),
        formRow('Role:', devRole),
        formRow('IP Address:', inp('dev_ip_address','text','w-md'), btn('dev_ip_clear','Clear','btn-sm')),
        divider(), devNErow,
        buttonRow(btn('dev_find','Find'), btn('dev_create','Create','primary'),
                  Object.assign(btn('dev_clear_all','Clear All','warning'),{style:'margin-left:auto'})),
        resultRow('Device:','dev_result')
    ));


    // VRF panel
    const vrfCtxRow = el('div',{class:'form-row'});
    vrfCtxRow.appendChild(el('span',{class:'lbl',text:'NE:'}));
    vrfCtxRow.appendChild(el('span',{id:'vrf_ctx_device',class:'result-value',style:'font-family:monospace;font-size:13px'}));
    const vrfNameRow = el('div',{class:'form-row'});
    vrfNameRow.appendChild(el('span',{class:'lbl',text:'VRF Name:'}));
    vrfNameRow.appendChild(inp('vrf_name_input','text','w-md'));
    const vrfCustRow = el('div',{class:'form-row'});
    vrfCustRow.appendChild(el('span',{class:'lbl',text:'VRF Customer:'}));
    vrfCustRow.appendChild(inp('vrf_customer_input','text','w-md'));
    const vrfRdRtRow = el('div',{class:'form-row'});
    vrfRdRtRow.appendChild(el('span',{class:'lbl',text:'RD:'}));
    vrfRdRtRow.appendChild(inp('vrf_rd_input','text','w-sm'));
    vrfRdRtRow.appendChild(el('span',{class:'lbl',text:'RT:',style:'min-width:40px;margin-left:8px'}));
    vrfRdRtRow.appendChild(inp('vrf_rt_input','text','w-md'));
    const vrfDescRow = el('div',{class:'form-row'});
    vrfDescRow.appendChild(el('span',{class:'lbl',text:'Description:'}));
    vrfDescRow.appendChild(inp('vrf_desc_input','text','w-xl'));
    const vrfUpdateBtn = Object.assign(btn('vrf_update','Update'),{disabled:true});
    const vrfDeleteBtn = Object.assign(btn('vrf_delete','Delete','danger'),{disabled:true});
    col.appendChild(panel('panel_vrf','VRF',
        vrfCtxRow, vrfNameRow, vrfCustRow, vrfRdRtRow, vrfDescRow,
        buttonRow(btn('vrf_find','Find'), btn('vrf_create','Create','primary'),
                  vrfUpdateBtn, vrfDeleteBtn,
                  Object.assign(btn('vrf_clear','Clear','warning'),{style:'margin-left:auto'})),
        resultRow('VRF:','vrf_result'), divider(),
        resultRow('Interface:','vrf_assoc_iface'),
        buttonRow(
            Object.assign(btn('vrf_associate','Associate','success'),{disabled:true}),
            Object.assign(btn('vrf_dissociate','Dissociate','danger'),{disabled:true})
        ),
        resultRow('Association:','vrf_assoc_result','green')
    ));

    // INTERFACE
    const ifExact = el('label');
    ifExact.appendChild(inp('iface_exact_name','checkbox'));
    ifExact.appendChild(document.createTextNode(' Exact Name'));
    const ifEncap = radioGroup('iface_encap',[['0','none'],['1','dot1q'],['2','qinq']]);
    ifEncap.querySelector('input').checked = true;
    const ifSearchNameRow = el('div',{class:'form-row'});
    ifSearchNameRow.appendChild(el('span',{class:'lbl',text:'Search Name:'}));
    ifSearchNameRow.appendChild(inp('iface_search_name','text','w-md'));
    ifSearchNameRow.appendChild(ifExact);
    const ifSearchCustRow = el('div',{class:'form-row'});
    ifSearchCustRow.appendChild(el('span',{class:'lbl',text:'Search Customer:'}));
    ifSearchCustRow.appendChild(inp('iface_search_customer','text','w-md'));
    const ifNameRow = el('div',{class:'form-row'});
    ifNameRow.appendChild(el('span',{class:'lbl',text:'If Name:'}));
    ifNameRow.appendChild(inp('iface_if_name','text','w-md'));
    ifNameRow.appendChild(btn('iface_if_clear','Clear','btn-sm'));
    const ifVrfRow = el('div',{class:'form-row'});
    ifVrfRow.appendChild(el('span',{class:'lbl',text:'VRF:'}));
    ifVrfRow.appendChild(inp('iface_vrf','text','w-md'));
    ifVrfRow.appendChild(btn('iface_vrf_clear','Clear','btn-sm'));
    const ifCustRow = el('div',{class:'form-row'});
    ifCustRow.appendChild(el('span',{class:'lbl',text:'Customer:'}));
    ifCustRow.appendChild(inp('iface_customer','text','w-md'));
    ifCustRow.appendChild(btn('iface_customer_clear','Clear','btn-sm'));
    const ifIpRow = el('div',{class:'form-row'});
    ifIpRow.appendChild(el('span',{class:'lbl',text:'IP:'}));
    ifIpRow.appendChild(inp('iface_ip','text','w-md'));
    ifIpRow.appendChild(el('span',{text:' / '}));
    ifIpRow.appendChild(inp('iface_mask','text','w-sm'));
    ifIpRow.appendChild(btn('iface_ip_clear','Clear','btn-sm'));

    col.appendChild(panel('panel_interface', 'INTERFACE',
        resultRow('Device:','iface_ctx_device'),
        ifSearchNameRow, ifSearchCustRow, divider(),
        ifNameRow, ifVrfRow, ifCustRow, ifIpRow, divider(),
        formRow('Encapsulation:', ifEncap),
        formRow('VLAN:', inp('iface_vlan','number','w-sm'), hint('(1-4095)')),
        formRow('Description:', inp('iface_description','text','w-xl')),
        buttonRow(btn('iface_find','Find'), btn('iface_create','Create','success'),
                  btn('iface_delete','Delete','danger'),
                  Object.assign(btn('iface_clear','Clear','warning'),{style:'margin-left:auto'})),
        resultRow('Interface:','iface_result','green')
    ));

    // SUBINTERFACE
    const subifNameRow = el('div',{class:'form-row'});
    subifNameRow.appendChild(el('span',{class:'lbl',text:'Subif Name:'}));
    subifNameRow.appendChild(inp('subif_name','text','w-md'));
    subifNameRow.appendChild(btn('subif_name_clear','Clear','btn-sm'));

    col.appendChild(panel('panel_subif', 'SUBINTERFACE',
        resultRow('Device:','subif_ctx_device'),
        resultRow('Interface:','subif_ctx_iface'),
        subifNameRow,
        formRow('VLAN:', inp('subif_vlan','number','w-sm'), hint('(1-4095)')),
        formRow('VRF:', inp('subif_vrf','text','w-md')),
        formRow('Description:', inp('subif_desc','text','w-xl')),
        buttonRow(btn('subif_find','Find'), btn('subif_create','Create','success'),
                  btn('subif_delete','Delete','danger'),
                  Object.assign(btn('subif_clear','Clear','warning'),{style:'margin-left:auto'})),
        resultRow('Subinterface:','subif_result','green')
    ));

    // ASSIGN
    const assignRole = radioGroup('assign_role',[['0','primary'],['1','secondary'],['2','vip']]);
    assignRole.querySelector('input').checked = true;
    col.appendChild(panel('panel_assign', 'ASSIGN IP',
        resultRow('Interface:','assign_ctx_iface'),
        formRow('Prefix:', inp('assign_prefix','text','w-md'), hint('ip/mask — from IPAM')),
        formRow('IP Role:', assignRole),
        buttonRow(btn('assign_btn','Assign','primary'), btn('assign_release','Release','danger'),
                  Object.assign(btn('assign_clear','Clear','warning'),{style:'margin-left:auto'})),
        resultRow('Assigned:','assign_result','green')
    ));

    return col;
}

// ── Build UI ──────────────────────────────────────────────────────────────────
function buildUI() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    document.title = 'Network Manager';

    const container = el('div', {class:'main-container'});
    container.appendChild(el('header', {},
        el('h1', {text:'Network Manager'}),
        el('div', {class:'status', id:'status_bar', text:'IPAM v5 + Interface Manager'})
    ));

    const panels = el('div', {class:'panels'});
    panels.appendChild(buildIPAMPanel());
    panels.appendChild(buildIfacePanel());

    // Terminal — full width
    const termSection = el('div', {class:'terminal-section'});
    termSection.appendChild(panel('panel_terminal', 'TERMINAL (JSON)',
        el('div', {class:'terminal-buttons'},
            btn('terminal_copy','Copy All'),
            btn('terminal_copy_last','Copy Last'),
            btn('terminal_clear','Clear','danger')
        ),
        el('div', {id:'terminal'})
    ));

    const main = el('div', {style:'display:flex;flex-direction:column;gap:12px'});
    main.appendChild(panels);
    main.appendChild(termSection);
    container.appendChild(main);
    document.body.appendChild(container);

    document.getElementById('panel_vrf').classList.add('disabled');
    document.getElementById('panel_interface').classList.remove('disabled');
    document.getElementById('panel_subif').classList.add('disabled');
    document.getElementById('panel_assign').classList.add('disabled');
}

// ── IPAM → Assign integration ─────────────────────────────────────────────────
// When IP allocated in IPAM — auto-fill Prefix field in Assign
function onIPAllocated(ip_str) {
    const prefixEl = document.getElementById('assign_prefix');
    if (prefixEl && ip_str) {
        prefixEl.value = ip_str;
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    buildUI();

    // IPAM v5 init
    initFinder();
    initSubrange();
    initIPAddress();
    setClearFunctions(setParentForSubrange, clearSubrange, clearIP);

    // Interface Manager init
    initDevice();
    initVRF();
    initInterface();
    initSubif();
    initAssign();
    initTerminal();

    // Interface Manager dependency injection
    setDeviceDownstream(setInterfaceContext, clearInterface, setVRFContext, clearVRF);
    setInterfaceDownstream(setSubifContext, clearSubif);
    setSubifDownstream(setAssignContext, clearAssign);

    // VRF wiring
    setInterfaceVRFFns(getVRFState, setVRFFromInterface);
    setVRFIfaceFns(getInterfaceState, getSubifState);
    setOnInterfaceLocked(updateAssocButtons);
    setOnSubifLocked(updateAssocButtons);
    setVRFDownstream(() => updateAssocButtons(), () => updateAssocButtons());

    // Hook IPAM allocation → fill Assign prefix
    const origAllocate = document.getElementById('ip_allocate');
    if (origAllocate) {
        origAllocate.addEventListener('click', () => {
            setTimeout(() => {
                const allocated = document.getElementById('ip_allocated')?.textContent;
                if (allocated) onIPAllocated(allocated);
            }, 500);
        });
    }

    console.log('Network Manager initialized');
});

