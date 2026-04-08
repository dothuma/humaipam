# node: 'jsonwf/src/engine.py'
# fqnp: jsonwf/src/engine.py
#!/usr/bin/env python3
"""
jsonwf engine — core workflow execution loop
Iterates fn[], dispatches to catalog functions, merges results into state{}
"""

import json
from datetime import datetime
from jsonwf.src.dispatch import get_dispatch

def now():
    return datetime.utcnow().strftime('%y%m%d%H%M')

def exec_workflow(doc: dict) -> dict:
    """
    Execute jsonwf document.
    Iterates fn[], calls dispatch function, merges result into state{}.
    Clears fn[] on completion. Sets end_time and status.
    On error — sets error field, clears fn[], returns document.
    """
    dispatch = get_dispatch(doc)

    for step in doc.get('fn', []):
        fn_name, args = next(iter(step.items()))

        if fn_name not in dispatch:
            doc['fn']    = []
            doc['error'] = f'unknown function: {fn_name}'
            doc['status'] = 'error'
            return doc

        on_error = args.pop('on_error', 'abort')

        try:
            result = dispatch[fn_name](**args, state=doc.get('state', {}))
            if isinstance(result, dict):
                doc['state'].update(result)
            else:
                doc['state'][fn_name] = result
        except Exception as e:
            if on_error == 'abort':
                doc['fn']    = []
                doc['error'] = f'{fn_name}: {str(e)}'
                doc['status'] = 'error'
                return doc
            # warn+continue — log and proceed
            doc['state'].setdefault('warnings', []).append(f'{fn_name}: {str(e)}')

    doc['fn']      = []
    doc['end_time'] = now()
    doc['status']  = 'provisioned'
    return doc


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print('Usage: python engine.py <workflow.json>')
        sys.exit(1)
    with open(sys.argv[1]) as f:
        doc = json.load(f)
    result = exec_workflow(doc)
    print(json.dumps(result, indent=2))
