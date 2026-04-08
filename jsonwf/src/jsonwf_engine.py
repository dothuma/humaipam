# node: 'jsonwf/src/jsonwf_engine.py'
# fqnp: jsonwf/src/jsonwf_engine.py
#!/usr/bin/env python3
"""
jsonwf_engine.py — JSON workflow executor.
Single entry point: execute(doc) → doc
Doc is the only context. No parameters. No external state.
fn[] is the execution queue. fn_completed[] is the audit trail.
"""

import json
import sys
from datetime import datetime

from jsonwf_validator import validate
from jsonwf_mapper    import MAPPER
from jsonwf_error     import handle

# fqnp: jsonwf/src/jsonwf_engine.py:execute
def execute(doc):
    """
    Execute jsonwf document.
    Iterates fn[], calls MAPPER, merges result into doc.
    Moves fn name to fn_completed[] on success.
    On error — calls handle() with error strategy.
    Returns doc when fn[] is empty.
    """
    # ensure required fields exist
    doc.setdefault("fn_completed", [])
    doc.setdefault("fn_errors",    [])
    doc.setdefault("status",       "running")

    # pre-flight validation
    validate(doc, MAPPER)

    # execution loop
    while doc["fn"]:
        fn_name = doc["fn"][0]

        try:
            fn  = MAPPER[fn_name]
            doc = fn(doc)

            # success — move to completed
            doc["fn"].pop(0)
            doc["fn_completed"].append(fn_name)

        except Exception as e:
            # pop before handle so retry can re-insert
            doc["fn"].pop(0)
            doc = handle(doc, fn_name, str(e))

            # if handle set status to error or rolled_back — stop
            if doc.get("status") in ("error", "rolled_back"):
                return doc

    # all done
    doc["status"]   = "done"
    doc["done_at"]  = datetime.utcnow().isoformat()
    return doc
# fqnp: jsonwf/src/jsonwf_engine.py:execute:end


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python3 jsonwf_engine.py workflow.json")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        doc = json.load(f)

    result = execute(doc)

    with open(sys.argv[1], "w") as f:
        json.dump(result, f, indent=2)

    print(f"status: {result['status']}")
    if result.get("fn_errors"):
        print(f"errors: {result['fn_errors']}")
