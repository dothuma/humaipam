# node: 'jsonwf/src/dispatch.py'
# fqnp: jsonwf/src/dispatch.py
#!/usr/bin/env python3
"""
jsonwf dispatch — catalog versions and function registry
Maps function names to callables per catalog version.
"""

import requests

MERGED_UI = 'http://localhost:5002/api/'

def api_call(func, args):
    """Call merged_ui API."""
    r = requests.post(MERGED_UI, json={'func': func, 'args': args})
    data = r.json()
    if data['status'] != 'ok':
        raise Exception(data['error']['message'])
    return data['data']

# ── Catalog v1 — 24 merged_ui functions ──────────────────────────────────────

def find_device(**kwargs):    return api_call('find_device',    kwargs)
def create_device(**kwargs):  return api_call('create_device',  kwargs)
def find_vrf(**kwargs):       return api_call('find_vrf',       kwargs)
def create_vrf(**kwargs):     return api_call('create_vrf',     kwargs)
def update_vrf(**kwargs):     return api_call('update_vrf',     kwargs)
def delete_vrf(**kwargs):     return api_call('delete_vrf',     kwargs)
def find_interface(**kwargs): return api_call('find_interface', kwargs)
def create_interface(**kwargs):     return api_call('create_interface',     kwargs)
def create_subinterface(**kwargs):  return api_call('create_subinterface',  kwargs)
def delete_interface(**kwargs):     return api_call('delete_interface',     kwargs)
def assign_interface_vrf(**kwargs): return api_call('assign_interface_vrf', kwargs)
def release_interface_vrf(**kwargs):return api_call('release_interface_vrf',kwargs)
def assign_ip(**kwargs):      return api_call('assign_ip',      kwargs)
def release_ip_assign(**kwargs):    return api_call('release_ip_assign',    kwargs)
def ls_ranges(**kwargs):      return api_call('ls_ranges',      kwargs)
def create_range(**kwargs):   return api_call('create_range',   kwargs)
def alloc_range(**kwargs):    return api_call('alloc_range',    kwargs)
def alloc_ip(**kwargs):       return api_call('alloc_ip',       kwargs)
def release_range(**kwargs):  return api_call('release_range',  kwargs)
def release_ip(**kwargs):     return api_call('release_ip',     kwargs)
def ls_addresses(**kwargs):   return api_call('ls_addresses',   kwargs)

DISPATCH_V1 = {
    'find_device':           find_device,
    'create_device':         create_device,
    'find_vrf':              find_vrf,
    'create_vrf':            create_vrf,
    'update_vrf':            update_vrf,
    'delete_vrf':            delete_vrf,
    'find_interface':        find_interface,
    'create_interface':      create_interface,
    'create_subinterface':   create_subinterface,
    'delete_interface':      delete_interface,
    'assign_interface_vrf':  assign_interface_vrf,
    'release_interface_vrf': release_interface_vrf,
    'assign_ip':             assign_ip,
    'release_ip_assign':     release_ip_assign,
    'ls_ranges':             ls_ranges,
    'create_range':          create_range,
    'alloc_range':           alloc_range,
    'alloc_ip':              alloc_ip,
    'release_range':         release_range,
    'release_ip':            release_ip,
    'ls_addresses':          ls_addresses,
}

CATALOGS = {
    1: DISPATCH_V1,
    # 2: DISPATCH_V2,  ← future
}

def get_dispatch(doc: dict) -> dict:
    """Get dispatch table for catalog version in document."""
    v = doc.get('catalog_v', 1)
    if v not in CATALOGS:
        raise Exception(f'catalog_v {v} not found')
    return CATALOGS[v]
