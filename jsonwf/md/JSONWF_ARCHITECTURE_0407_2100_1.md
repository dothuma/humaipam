  % fqnp: jsonwf/md/JSONWF_ARCHITECTURE_0407_2100.md
# JSONWF_ARCHITECTURE_0407_2100.md
# jsonwf — JSON Workflow Engine
# Detailed Architecture

---

## Core Concept

A single JSON document is the order, the workflow, the state, and the result simultaneously.
No separate state machine. No external database. No orchestration context.
The document evolves from order to completed instance by accumulation.

```json
{
  "spec_id": "chocolate-cake-v1",
  "sugar": "50g",
  "customer": "cust-456",
  "fn": ["validate_order", "assign_chef", "assign_oven", "create_instance", "notify_customer"],
  "fn_completed": []
}
```

After execution:

```json
{
  "spec_id": "chocolate-cake-v1",
  "sugar": "50g",
  "customer": "cust-456",
  "chef": "alice",
  "oven": "oven-3",
  "instance_id": "cake-67890",
  "notified": true,
  "fn": [],
  "fn_completed": ["validate_order", "assign_chef", "assign_oven", "create_instance", "notify_customer"]
}
```

`fn_completed[]` is the audit trail. `fn[]` is what remains. Both live in the document.

---

## Five Components

### 1. Service Catalog — JSON Templates

The catalog defines the workflow structure for each service type.
One JSON template per service. Defines default field values and the `fn[]` sequence.

```json
{
  "spec_id": "chocolate-cake-v1",
  "spec_version": "1.0",
  "defaults": {
    "sugar": "100g",
    "flour": "wheat",
    "oven_temp": "180C",
    "bake_time_min": 25
  },
  "constraints": {
    "sugar_max": "150g",
    "flour_options": ["wheat", "almond", "gluten-free"]
  },
  "fn": [
    "validate_order",
    "assign_chef",
    "assign_oven",
    "merge_characteristics",
    "create_instance",
    "notify_customer"
  ]
}
```

The catalog is immutable. It is the recipe. It never changes mid-execution.
Different versions coexist — `chocolate-cake-v1` and `chocolate-cake-v2` both valid simultaneously.
In-flight orders on v1 complete on v1. New orders use v2.

---

### 2. Order Interface — Document Population

Takes the catalog template and customer input. Produces the populated order document.

```python
def create_order(spec_id, spec_version, customer_input):
    # load catalog template
    template = catalog.load(spec_id, spec_version)

    # start with defaults
    doc = dict(template["defaults"])

    # apply customer deltas — only what customer specified
    doc.update(customer_input)

    # add order metadata
    doc["spec_id"]      = spec_id
    doc["spec_version"] = spec_version
    doc["order_id"]     = generate_uuid()
    doc["created_at"]   = now()
    doc["status"]       = "pending"

    # copy fn[] from catalog — execution queue
    doc["fn"]           = list(template["fn"])
    doc["fn_completed"] = []

    return doc
```

The order document inherits the workflow from the catalog.
Customer provides only the fields that differ from defaults — delta only.
The rest comes from the catalog.

---

### 3. jsonwf Executor — The Engine

Iterates `fn[]`, calls the mapper, merges results back into the document.
Moves completed function name from `fn[]` to `fn_completed[]`.
Stops when `fn[]` is empty.

```python
def execute(doc, mapper, error_handler):
    while doc["fn"]:
        fn_name = doc["fn"][0]

        if fn_name not in mapper:
            return error_handler.handle(doc, fn_name, "UNKNOWN_FUNCTION")

        try:
            fn = mapper[fn_name]
            doc = fn(doc)

            # move to completed
            doc["fn"].pop(0)
            doc["fn_completed"].append(fn_name)

        except Exception as e:
            return error_handler.handle(doc, fn_name, str(e))

    doc["status"] = "done"
    return doc
```

**Resume capability** — if execution stops mid-way (crash, error, manual pause),
`fn[]` still contains the remaining functions. Restart the executor with the
same document — it continues from where it stopped.

**Modifiable mid-execution** — any system or human can reach into the document
and add fields, change values, or inject new functions into `fn[]` before
the executor processes the next step.

---

### 4. Error Handler

Per-step error strategy. Configurable per function or globally.

```python
ERROR_STRATEGIES = {
    "validate_order":    "abort",
    "assign_chef":       "retry(3)",
    "assign_oven":       "retry(3)",
    "create_instance":   "abort",
    "notify_customer":   "warn_continue",
}

def handle(doc, fn_name, error_msg):
    strategy = ERROR_STRATEGIES.get(fn_name, "abort")

    doc.setdefault("fn_errors", []).append({
        "fn":    fn_name,
        "error": error_msg,
        "at":    now()
    })

    if strategy == "abort":
        doc["fn"]     = []
        doc["status"] = "error"
        return doc

    if strategy == "warn_continue":
        doc["fn"].pop(0)
        doc["fn_completed"].append(fn_name + ":warn")
        return doc

    if strategy.startswith("retry"):
        n = int(strategy.split("(")[1].rstrip(")"))
        retries = doc.get("_retries", {})
        retries[fn_name] = retries.get(fn_name, 0) + 1
        doc["_retries"] = retries
        if retries[fn_name] >= n:
            doc["fn"]     = []
            doc["status"] = "error"
        return doc

    if strategy == "rollback":
        doc = rollback(doc)
        doc["status"] = "rolled_back"
        return doc
```

**Error strategies:**
- `abort` — stop execution, set `status: error`, preserve `fn_completed[]` for audit
- `warn_continue` — log warning, continue to next function
- `retry(N)` — retry up to N times before aborting
- `rollback` — undo completed steps and abort

---

### 5. jsonfn_mapper — Dispatch Table

Maps function names in `fn[]` to Python callables.
Each function takes the document, reads what it needs, writes results back, returns the document.

```python
MAPPER = {
    # Validation
    "validate_order":       validate_order,

    # Resource assignment
    "assign_chef":          assign_chef,
    "assign_oven":          assign_oven,

    # IPAM operations
    "alloc_ip":             alloc_ip,
    "create_vrf":           create_vrf,
    "assign_interface":     assign_interface,

    # Instance creation
    "create_instance":      create_instance,
    "merge_characteristics": merge_characteristics,

    # Completion notifications — any channel
    "notify_customer":      notify_customer_email,
    "notify_nms":           notify_nms,
    "notify_ems":           notify_ems,
    "push_to_router":       push_netconf,
    "send_slack":           send_slack,
    "post_webhook":         post_webhook,
    "write_log":            write_log,
}
```

**The mapper is the integration bus.** Any callable can be registered.
Local function, API call, database write, notification — all look the same to the executor.

**Function contract:** takes `doc: dict`, returns `doc: dict`.
Function reads from doc, writes results back as new fields, returns modified doc.
No side effects outside the document. Stateless. Retryable.

```python
def assign_chef(doc):
    shift    = doc.get("order", {}).get("shift", "morning")
    priority = doc.get("priority", "normal")
    skill    = doc.get("spec_id", "")

    chef = scheduler.find_available(
        shift=shift,
        skill=skill,
        priority=priority
    )

    doc["chef"]     = chef.name
    doc["chef_id"]  = chef.id
    doc["chef_shift"] = {
        "station": chef.station,
        "skills":  chef.skills
    }
    return doc
```

---

## JSON is unlimited

The document has no schema constraint. Functions can write any structure.
Nested objects, arrays, references — whatever the next function needs.

```json
{
  "spec_id": "mpls-vpn-v1",
  "customer": "acme",
  "sites": ["site-ny", "site-sf"],
  "vrf": {
    "name": "ACME_VRF",
    "rd": "65000:100",
    "rt": "65000:100"
  },
  "interfaces": [
    {"ne": "router-ny", "if": "eth0.100", "vlan": 100, "ip": "10.0.0.1"},
    {"ne": "router-sf", "if": "eth0.200", "vlan": 200, "ip": "10.0.0.2"}
  ],
  "fn": ["validate", "alloc_vrfs", "alloc_ips", "push_configs", "notify_nms"],
  "fn_completed": []
}
```

---

## Completion — done is a function

Completion notification is just another step in `fn[]`.
No special case. No callback registration. No event subscription.

```json
{
  "fn": ["validate_order", "assign_chef", "create_instance", "notify_customer"]
}
```

`notify_customer` reads `doc["customer_email"]` and `doc["instance_id"]`, sends email.
Could equally be `notify_nms`, `send_slack`, `post_webhook` — or all three:

```json
{
  "fn": ["validate_order", "assign_chef", "create_instance",
         "notify_customer", "notify_nms", "post_webhook"]
}
```

---

## Catalog versioning

In-flight documents carry `spec_version` — they complete on the version they started with.
New orders use the latest catalog version.
No migration needed. No breaking changes to running workflows.

```python
def get_mapper(doc):
    version = doc.get("spec_version", "1")
    return MAPPERS.get(int(version), MAPPER_V1)
```

---

## Constellation position

```
service_catalog/     ← JSON templates, defaults, fn[] sequences
    ↓
order_interface      ← populate template with customer input
    ↓
jsonwf_executor      ← iterate fn[], call mapper, accumulate results
    ↓
jsonfn_mapper        ← dispatch table — any callable
    ↓
merged_ui API        ← IPAM + Interface + VRF (24 functions)
external APIs        ← NMS, EMS, router, email, webhook
```

---

## Summary

| concern | component | location |
|---|---|---|
| What to build | service catalog | `catalog/*.json` |
| Customer input | order interface | `order_interface.py` |
| Execution | jsonwf executor | `engine.py` |
| Failure handling | error handler | `error_handler.py` |
| Function registry | mapper | `mapper.py` |
| Notification | completion functions | in mapper |
| Audit trail | fn_completed[] | in document |
| Resume | fn[] state | in document |

One document. Five components. Zero external state.

---

*© 2026 Yaroslav Vlasov / HuMaDev*
*built with dothuma*
