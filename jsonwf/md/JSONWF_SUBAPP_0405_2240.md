% fqnp: md/JSONWF_SUBAPP_0405_2240.md
# JSONWF_SUBAPP_0405_2240.md
# jsonwf — JSON Workflow Engine
# Constellation subapp — provisioning orchestration layer

---

## What jsonwf is

jsonwf is the simplest possible workflow engine.

A JSON document carries both the provisioning specification and the
execution state. A Python dispatch table maps function names to callables.
The engine iterates `fn[]`, calls each function, merges results into the
document, clears `fn[]` when done.

No middleware. No event bus. No schema registry. No vendor lock-in.
A dict and a loop.

---

## The document is the process

```json
{
  "process":    "provision_device",
  "start_time": "2604051200",
  "catalog_v":  1,
  "state": {
    "ne_name":  "cisco7559",
    "domain":   "_"
  },
  "fn": [
    {"find_device":    {"ne_name": "cisco7559"}},
    {"alloc_subrange": {"parent_ip": "10.0.0.0", "cidr": 28, "domain": "_"}},
    {"create_vrf":     {"vrf_name": "CUST_A", "vrf_customer": "acme", "rd": "65000:100"}},
    {"create_subif":   {"if_name": "eth0.100", "vlan": 100}},
    {"bind_vrf":       {"if_name": "eth0.100", "vrf_name": "CUST_A"}},
    {"alloc_ip":       {"range_ip": "10.0.0.0", "cidr": 28, "domain": "CUST_A"}},
    {"assign_ip":      {"ip_key": "CUST_A:10.0.0.1", "interface_key": "cisco7559:eth0.100"}}
  ]
}
```

After execution — `fn[]` is empty, `state{}` contains all results:

```json
{
  "process":    "provision_device",
  "start_time": "2604051200",
  "end_time":   "2604051201",
  "catalog_v":  1,
  "state": {
    "ne_name":       "cisco7559",
    "domain":        "_",
    "subrange":      "10.0.0.0/28",
    "vrf":           "CUST_A",
    "subinterface":  "eth0.100",
    "ip":            "10.0.0.1",
    "interface_key": "cisco7559:eth0.100",
    "status":        "provisioned"
  },
  "fn": []
}
```

The document IS the audit trail. Store it. Replay it. Resume it.

---

## Engine — core loop

```python
DISPATCH = {
    # IPAM functions
    'alloc_ip':           call(merged_ui_api, 'alloc_ip'),
    'alloc_subrange':     call(merged_ui_api, 'alloc_range'),
    'release_ip':         call(merged_ui_api, 'release_ip'),
    # Interface functions
    'find_device':        call(merged_ui_api, 'find_device'),
    'create_vrf':         call(merged_ui_api, 'create_vrf'),
    'create_subif':       call(merged_ui_api, 'create_subinterface'),
    'bind_vrf':           call(merged_ui_api, 'assign_interface_vrf'),
    'assign_ip':          call(merged_ui_api, 'assign_ip'),
    # External integrations
    'push_to_router':     call(netconf_adapter),
    'notify_nms':         call(nms_api),
    'update_ems':         call(ems_api),
}

def exec_workflow(doc: dict) -> dict:
    for step in doc['fn']:
        fn_name, args = next(iter(step.items()))
        if fn_name not in DISPATCH:
            return {**doc, 'error': f'unknown function: {fn_name}'}
        try:
            result = DISPATCH[fn_name](**args, state=doc['state'])
            doc['state'].update(result)
        except Exception as e:
            strategy = args.get('on_error', 'abort')
            if strategy == 'abort':
                return {**doc, 'fn': [], 'error': str(e)}
            # warn+continue — log and proceed
    doc['fn'] = []
    doc['end_time'] = now()
    return doc
```

---

## Catalog versioning

Each process document carries `catalog_v` — the version of the dispatch
table it was started with. Processes in flight continue with their catalog
version. New processes use the latest catalog.

```python
CATALOGS = {
    1: DISPATCH_V1,   # original 24 functions
    2: DISPATCH_V2,   # extended with netconf, nms
}

def get_dispatch(doc):
    return CATALOGS[doc.get('catalog_v', 1)]
```

**Why this matters:**
- Deploy new API functions without breaking running provisioning jobs
- A/B test new function implementations
- Emergency rollback — new processes use old catalog, in-flight unaffected
- Customer consistency — same catalog version for all processes of one order

---

## Service decomposition

Complex provisioning orders are decomposed before execution.
A `RecipeDecomposer` translates a high-level order into a jsonwf document.

```python
# High-level order from NMS/EMS
order = {
    "customer": "acme",
    "service":  "mpls_vpn",
    "sites":    ["cisco7559", "cisco7560"],
    "bandwidth": "1gbps"
}

# Decomposer produces execution plan
plan = decomposer.decompose(order, catalog_v=1)
# plan is a jsonwf document with fn[] populated

# Engine executes
result = exec_workflow(plan)
```

The decomposer reads service templates from the catalog.
Each service template maps to a `fn[]` sequence.
Parameters flow from the order into function arguments.

---

## Isomorphism with dothuma predicates

The jsonwf document and the dothuma predicate rule are the same thing
expressed in two notations:

| dothuma predicate | jsonwf document |
|---|---|
| `ops([op1, op2, ...])` | `fn[]` list |
| `op(subject, args([...]))` | `{"fn_name": {args}}` |
| `state{}` accumulation | `state{}` in document |
| `on_error(abort, reason(X))` | `on_error` field in step |
| `fn[]` empty | goal reached |
| `.fnf` contract | catalog function definition |

Prolog rules are used at design time — validate reachability, prove the
provisioning chain is correct before it runs.
jsonwf executes the same chain at runtime — no Prolog needed in production.

---

## Constellation position

```
NMS / EMS
    ↓  order JSON
service_catalog     ← templates, decomposition rules
    ↓  execution plan (jsonwf document)
jsonwf              ← workflow engine, dispatch table
    ↓  API calls
merged_ui           ← unified API (IPAM + Interface + VRF)
    ↓
MySQL
    ↓
network device      ← via netconf adapter (future)
```

Human is not in this chain. UI exists for observation and debugging only.

---

## Subapp structure

```
~/_humaipam_v5/jsonwf/
  src/
    engine.py           ← core exec_workflow loop
    dispatch.py         ← DISPATCH table, catalog versions
    decomposer.py       ← order → jsonwf document
    adapters/
      merged_ui.py      ← calls merged_ui /api/
      netconf.py        ← future — push to real router
      nms.py            ← future — notify NMS
  catalog/
    v1/
      dispatch_v1.py
      templates/        ← service templates (json)
    v2/                 ← future
  req/
  fn/
  md/
  index/
```

---

## What jsonwf solves

Traditional OSS/BSS provisioning:
- Bash scripts — fragile, no rollback, no audit
- Ansible/Terraform — complex state, learning curve, not M2M native
- Custom code — requires developers, vendor-specific, deployment cycle

jsonwf:
- JSON document = specification + state + audit trail
- Dict + loop = engine
- Any callable = integration point
- Catalog versioning = safe deployment
- Resume from `fn[]` = built-in fault tolerance
- No human in the loop by design

---

## Priority

HIGH — jsonwf is the automation delivery layer.
Without it, ipam_v5 is an API that humans call manually.
With it, ipam_v5 is a fully automated provisioning system.

---

## Session

0405 — design and architecture
Prototype exists: json_call.py, subif_functions.py, receipt_decomposition3.py
January 2026 work: catalog versioning, bakery domain prototype

---

*© 2026 Yaroslav Vlasov / HuMaDev*
*built with dothuma*
