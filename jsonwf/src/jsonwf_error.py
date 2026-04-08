# node: 'jsonwf/src/jsonwf_error.py'
# fqnp: jsonwf/src/jsonwf_error.py
#!/usr/bin/env python3
"""
jsonwf_error.py — error strategy handler.
Per-function error strategies defined in ERROR_STRATEGIES dict.
Strategies: abort | warn_continue | retry(N) | rollback
"""

from datetime import datetime

# Per-function error strategies.
# Override per function name. Default is abort.
ERROR_STRATEGIES = {
    # network provisioning
    "find_device":           "abort",
    "alloc_range":           "abort",
    "alloc_ip":              "abort",
    "create_vrf":            "abort",
    "create_subinterface":   "abort",
    "assign_interface_vrf":  "abort",
    "assign_ip":             "abort",
    # notifications — warn and continue
    "notify_nms":            "warn_continue",
    "notify_ems":            "warn_continue",
    "push_to_router":        "warn_continue",
    "send_email":            "warn_continue",
    "post_webhook":          "warn_continue",
}

DEFAULT_STRATEGY = "abort"

# fqnp: jsonwf/src/jsonwf_error.py:handle
def handle(doc, fn_name, error_msg):
    """
    Apply error strategy for failed function.
    Logs error to doc["fn_errors"].
    Returns modified doc.
    """
    strategy = ERROR_STRATEGIES.get(fn_name, DEFAULT_STRATEGY)

    # log the error
    doc.setdefault("fn_errors", []).append({
        "fn":       fn_name,
        "error":    error_msg,
        "strategy": strategy,
        "at":       datetime.utcnow().isoformat()
    })

    if strategy == "abort":
        doc["fn"]     = []
        doc["status"] = "error"
        return doc

    if strategy == "warn_continue":
        # log and move on — fn_name already popped by engine
        doc["fn_completed"].append(fn_name + ":warn")
        return doc

    if strategy.startswith("retry"):
        n = int(strategy.split("(")[1].rstrip(")"))
        retries = doc.setdefault("_retries", {})
        retries[fn_name] = retries.get(fn_name, 0) + 1
        if retries[fn_name] < n:
            # re-insert at head for retry
            doc["fn"].insert(0, fn_name)
        else:
            doc["fn"]     = []
            doc["status"] = "error"
        return doc

    if strategy == "rollback":
        doc["fn"]     = []
        doc["status"] = "rolled_back"
        doc.setdefault("fn_rollback", list(doc.get("fn_completed", [])))
        return doc

    # unknown strategy — abort
    doc["fn"]     = []
    doc["status"] = "error"
    return doc
# fqnp: jsonwf/src/jsonwf_error.py:handle:end
