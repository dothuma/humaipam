# node: 'jsonwf/src/jsonwf_validator.py'
# fqnp: jsonwf/src/jsonwf_validator.py
#!/usr/bin/env python3
"""
jsonwf_validator.py — pre-flight validation before execution.
Checks mapper completeness and required doc fields.
Must pass before jsonwf_engine starts.
"""

# fqnp: jsonwf/src/jsonwf_validator.py:validate
def validate(doc, mapper):
    """
    Pre-flight check:
    1. All functions in fn[] must exist in mapper.
    2. Required fields must be present in doc.
    Raises Exception on failure — engine does not start.
    """
    # check mapper completeness
    missing = [fn for fn in doc.get("fn", []) if fn not in mapper]
    if missing:
        raise Exception(f"MAPPER_INCOMPLETE: {missing}")

    # check required doc fields
    for field in ["fn", "fn_completed"]:
        if field not in doc:
            raise Exception(f"DOC_MISSING_FIELD: {field}")

    return True
# fqnp: jsonwf/src/jsonwf_validator.py:validate:end
