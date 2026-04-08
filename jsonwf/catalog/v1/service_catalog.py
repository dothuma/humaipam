# node: 'jsonwf/catalog/v1/service_catalog.py'
# fqnp: jsonwf/catalog/v1/service_catalog.py
#!/usr/bin/env python3
"""
jsonwf service catalog v1 — provisioning service templates
Maps service_type to fn[] sequence templates.
"""

SERVICE_TEMPLATES = {
    'provision_device': {
        'description': 'Full device provisioning — subrange, VRF, subif, IP assignment',
        'steps': [
            {'fn': 'find_device',          'args': {'ne_name': 'ne_name'}},
            {'fn': 'alloc_range',          'args': {'parent_ip': 'parent_ip', 'parent_cidr': 'parent_cidr',
                                                     'cidr': 'cidr', 'domain': 'domain',
                                                     'is_private': '1', 'owner': 'ne_name',
                                                     'min_subrange_cidr': '32'}},
            {'fn': 'create_vrf',           'args': {'ne_name': 'ne_name', 'vrf_name': 'vrf_name',
                                                     'vrf_customer': 'vrf_customer', 'rd': 'rd'}},
            {'fn': 'create_subinterface',  'args': {'ne_name': 'ne_name', 'if_name': 'if_name',
                                                     'vlan': 'vlan', 'encapsulation': '1'}},
            {'fn': 'assign_interface_vrf', 'args': {'ne_name': 'ne_name', 'if_name': 'if_name',
                                                     'vrf_name': 'vrf_name'}},
            {'fn': 'alloc_ip',             'args': {'range_ip': 'parent_ip', 'range_cidr': 'cidr',
                                                     'domain': 'vrf_name', 'is_private': 'true',
                                                     'owner': 'vrf_customer'}},
            {'fn': 'assign_ip',            'args': {'interface_key': 'ne_name:if_name',
                                                     'ip_key': 'vrf_name:ip', 'ip_role': '0'}},
        ]
    },

    'allocate_ip_only': {
        'description': 'Allocate IP from existing range and assign to interface',
        'steps': [
            {'fn': 'alloc_ip',   'args': {'range_ip': 'range_ip', 'range_cidr': 'cidr',
                                           'domain': 'domain', 'is_private': 'true',
                                           'owner': 'owner'}},
            {'fn': 'assign_ip',  'args': {'interface_key': 'interface_key',
                                           'ip_key': 'domain:ip', 'ip_role': '0'}},
        ]
    },

    'create_vrf_only': {
        'description': 'Create VRF on device',
        'steps': [
            {'fn': 'find_device', 'args': {'ne_name': 'ne_name'}},
            {'fn': 'create_vrf',  'args': {'ne_name': 'ne_name', 'vrf_name': 'vrf_name',
                                            'vrf_customer': 'vrf_customer', 'rd': 'rd'}},
        ]
    },
}
