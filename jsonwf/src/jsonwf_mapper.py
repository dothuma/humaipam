# node: 'jsonwf/src/jsonwf_mapper.py'
# fqnp: jsonwf/src/jsonwf_mapper.py
#!/usr/bin/env python3
"""
jsonwf_mapper.py — dispatch table and all domain functions.
Every function: takes doc dict, returns doc dict.
No parameters — all data comes from doc.
All domain functions live here or are imported here.
"""

import os
import requests

MERGED_UI = os.getenv("MERGED_UI_URL", "http://localhost:5002/api/")

# fqnp: jsonwf/src/jsonwf_mapper.py:api_call
def api_call(func, args):
    """Call merged_ui API. Raises on error."""
    r = requests.post(MERGED_UI, json={"func": func, "args": args}, timeout=10)
    data = r.json()
    if data["status"] != "ok":
        raise Exception(data["error"]["message"])
    return data["data"]
# fqnp: jsonwf/src/jsonwf_mapper.py:api_call:end

# ── IPAM functions ────────────────────────────────────────────────────────────

# fqnp: jsonwf/src/jsonwf_mapper.py:alloc_range
def alloc_range(doc):
    result = api_call("alloc_range", {
        "parent_ip":        doc["parent_ip"],
        "parent_cidr":      doc["parent_cidr"],
        "cidr":             doc["cidr"],
        "domain":           doc.get("domain", "_"),
        "is_private":       doc.get("is_private", 1),
        "owner":            doc.get("ne_name", "default"),
        "min_subrange_cidr": doc.get("min_subrange_cidr", 32),
        "qty":              doc.get("qty", 1),
    })
    doc["allocated_range"] = result
    doc["range_ip"]        = result.get("ip")
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:alloc_range:end

# fqnp: jsonwf/src/jsonwf_mapper.py:alloc_ip
def alloc_ip(doc):
    result = api_call("alloc_ip", {
        "range_ip":   doc["range_ip"],
        "range_cidr": doc["cidr"],
        "domain":     doc.get("domain", "_"),
        "is_private": doc.get("is_private", True),
        "owner":      doc.get("owner", "default"),
    })
    doc["allocated_ip"] = result
    doc["ip"]           = result.get("ip")
    doc["ip_key"]       = f"{doc.get('domain','_')}:{result.get('ip')}"
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:alloc_ip:end

# ── Interface Manager functions ───────────────────────────────────────────────

# fqnp: jsonwf/src/jsonwf_mapper.py:find_device
def find_device(doc):
    result = api_call("find_device", {
        "ne_name": doc["ne_name"],
        "exact":   True,
    })
    doc["device"] = result
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:find_device:end

# fqnp: jsonwf/src/jsonwf_mapper.py:create_device
def create_device(doc):
    result = api_call("create_device", {
        "ne_name":      doc["ne_name"],
        "location":     doc.get("location", ""),
        "device_model": doc.get("device_model", ""),
        "ip_address":   doc.get("device_ip"),
    })
    doc["device"] = result
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:create_device:end

# fqnp: jsonwf/src/jsonwf_mapper.py:create_vrf
def create_vrf(doc):
    result = api_call("create_vrf", {
        "ne_name":      doc["ne_name"],
        "vrf_name":     doc["vrf_name"],
        "vrf_customer": doc.get("vrf_customer", doc.get("customer", "")),
        "rd":           doc.get("rd"),
        "rt":           doc.get("rt"),
    })
    doc["vrf"] = result
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:create_vrf:end

# fqnp: jsonwf/src/jsonwf_mapper.py:create_subinterface
def create_subinterface(doc):
    result = api_call("create_subinterface", {
        "ne_name":       doc["ne_name"],
        "if_name":       doc["if_name"],
        "vlan":          doc["vlan"],
        "encapsulation": doc.get("encapsulation", 1),
        "description":   doc.get("description"),
    })
    doc["subinterface"]   = result
    doc["interface_key"]  = f"{doc['ne_name']}:{doc['if_name']}"
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:create_subinterface:end

# fqnp: jsonwf/src/jsonwf_mapper.py:assign_interface_vrf
def assign_interface_vrf(doc):
    result = api_call("assign_interface_vrf", {
        "ne_name":  doc["ne_name"],
        "if_name":  doc["if_name"],
        "vrf_name": doc["vrf_name"],
    })
    doc["interface_vrf"] = result
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:assign_interface_vrf:end

# fqnp: jsonwf/src/jsonwf_mapper.py:assign_ip
def assign_ip(doc):
    result = api_call("assign_ip", {
        "interface_key": doc["interface_key"],
        "ip_key":        doc["ip_key"],
        "ip_role":       doc.get("ip_role", 0),
    })
    doc["assignment"] = result
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:assign_ip:end

# ── Notification functions ────────────────────────────────────────────────────

def push_terminal(doc, fn_name, result):
    try:
        requests.post('http://localhost:5002/api/terminal', 
            json={'fn': fn_name, 'result': result}, timeout=1)
    except:
        pass
        
# fqnp: jsonwf/src/jsonwf_mapper.py:notify_log
def notify_log(doc):
    import json
    print(f"[jsonwf] done: {json.dumps({k:v for k,v in doc.items() if k not in ['fn','fn_completed','fn_errors']}, indent=2)}")
    doc["notified_log"] = True
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:notify_log:end

# fqnp: jsonwf/src/jsonwf_mapper.py:notify_nms
def notify_nms(doc):
    # stub — replace with real NMS API call
    nms_url = os.getenv("NMS_URL")
    if nms_url:
        requests.post(nms_url, json={"instance": doc.get("instance_id"), "status": "provisioned"}, timeout=5)
    doc["notified_nms"] = True
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:notify_nms:end

# ── Validation functions ──────────────────────────────────────────────────────

# fqnp: jsonwf/src/jsonwf_mapper.py:validate_required_fields
def validate_required_fields(doc):
    """Check that required fields exist before provisioning."""
    required = doc.get("_required_fields", [])
    missing  = [f for f in required if not doc.get(f)]
    if missing:
        raise Exception(f"MISSING_FIELDS: {missing}")
    return doc
# fqnp: jsonwf/src/jsonwf_mapper.py:validate_required_fields:end

# ── MAPPER — dispatch table ───────────────────────────────────────────────────
# All functions must be registered here before engine can use them.

MAPPER = {
    # validation
    "validate_required_fields": validate_required_fields,
    # ipam
    "alloc_range":              alloc_range,
    "alloc_ip":                 alloc_ip,
    # interface manager
    "find_device":              find_device,
    "create_device":            create_device,
    "create_vrf":               create_vrf,
    "create_subinterface":      create_subinterface,
    "assign_interface_vrf":     assign_interface_vrf,
    "assign_ip":                assign_ip,
    # notifications
    "notify_log":               notify_log,
    "notify_nms":               notify_nms,
}
