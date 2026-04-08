# node: 'jsonwf/src/decomposer.py'
# fqnp: jsonwf/src/decomposer.py
#!/usr/bin/env python3
"""
jsonwf decomposer — translate high-level provisioning order into jsonwf document
Maps service type to fn[] sequence using service catalog templates.
"""

import json
from datetime import datetime
from jsonwf.catalog.v1.service_catalog import SERVICE_TEMPLATES

def now():
    return datetime.utcnow().strftime('%y%m%d%H%M')

class Decomposer:
    """Translate provisioning order into executable jsonwf document."""

    def __init__(self, catalog_v=1):
        self.catalog_v  = catalog_v
        self.templates  = SERVICE_TEMPLATES

    def decompose(self, order: dict) -> dict:
        """
        Decompose order into jsonwf document.
        order must contain: service_type, params{}
        Returns jsonwf document with fn[] populated.
        """
        service_type = order.get('service_type')
        if not service_type:
            raise ValueError('order missing service_type')

        template = self.templates.get(service_type)
        if not template:
            raise ValueError(f'no template for service_type: {service_type}')

        # Build fn[] from template, injecting order params
        fn_list = []
        for step in template['steps']:
            fn_name = step['fn']
            args    = {k: order['params'].get(v, v) for k, v in step['args'].items()}
            fn_list.append({fn_name: args})

        doc = {
            'process':    service_type,
            'start_time': now(),
            'catalog_v':  self.catalog_v,
            'order':      order,
            'state':      dict(order.get('params', {})),
            'fn':         fn_list,
            'status':     'pending'
        }
        return doc


if __name__ == '__main__':
    import sys
    d = Decomposer()
    order = {
        'service_type': 'provision_device',
        'params': {
            'ne_name':      'cisco7559',
            'parent_ip':    '10.0.0.0',
            'parent_cidr':  24,
            'cidr':         28,
            'domain':       '_',
            'vrf_name':     'CUST_A',
            'vrf_customer': 'acme',
            'rd':           '65000:100',
            'if_name':      'eth0.100',
            'vlan':         100,
        }
    }
    doc = d.decompose(order)
    print(json.dumps(doc, indent=2))
