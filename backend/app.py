#!/usr/bin/env python3
"""Network Manager — unified Flask app. Port 5002. IPAM v5 + Interface Manager + VRF."""

import sys
import os

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IPAM_SRC = os.path.join(ROOT, 'ipam_v5', 'src')
sys.path.insert(0, IPAM_SRC)

from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector

# ── IPAM v5 imports ───────────────────────────────────────────
from app.models import db as ipam_db
from app.config import Config as IPAMConfig
from app.api.routes import (
    handle_ls_ranges, handle_ls_range, handle_ls_ranges_by_ip,
    handle_create_range, handle_alloc_range, handle_alloc_ip,
    handle_release_range, handle_release_ip, handle_ls_addresses
)

# ── Interface Manager DB ──────────────────────────────────────
IFACE_DB = {
    'host':     os.getenv('DB_HOST',     'localhost'),
    'user':     os.getenv('DB_USER',     'isla55'),
    'password': os.getenv('DB_PASSWORD', 'ipam'),
    'database': os.getenv('DB_NAME',     'ipam'),
}

def get_db():
    return mysql.connector.connect(**IFACE_DB)

def query(sql, params=None, fetchone=False):
    conn   = get_db()
    cur    = conn.cursor(dictionary=True)
    cur.execute(sql, params or [])
    result = cur.fetchone() if fetchone else cur.fetchall()
    conn.close()
    return result

def execute(sql, params=None):
    conn     = get_db()
    cur      = conn.cursor()
    cur.execute(sql, params or [])
    conn.commit()
    affected = cur.rowcount
    conn.close()
    return affected

def wrap_like(value):
    return f'%{value}%'

# ── Device handlers ───────────────────────────────────────────

def handle_find_device(args):
    ne_name    = args.get('ne_name', '')
    location   = args.get('location', '')
    model      = args.get('device_model', '')
    ip_address = args.get('ip_address', '')
    role_mask  = args.get('role_mask', 0)
    exact      = args.get('exact', False)
    if not ne_name and not location and not model and not ip_address and not role_mask:
        raise Exception('MISSING_SEARCH_CRITERIA: fill at least one field')
    sql    = 'SELECT * FROM devices WHERE status = 1'
    params = []
    if ne_name:
        if exact: sql += ' AND ne_name = %s';        params.append(ne_name)
        else:     sql += ' AND ne_name LIKE %s';     params.append(wrap_like(ne_name))
    if location:   sql += ' AND location LIKE %s';     params.append(wrap_like(location))
    if model:      sql += ' AND device_model LIKE %s'; params.append(wrap_like(model))
    if ip_address: sql += ' AND ip_address LIKE %s';   params.append(wrap_like(ip_address))
    if role_mask:  sql += ' AND role_mask & %s != 0';  params.append(role_mask)
    sql += ' ORDER BY ne_name ASC LIMIT 10'
    results = query(sql, params)
    return results[0] if len(results) == 1 else results

def handle_create_device(args):
    ne_name = args.get('ne_name')
    if not ne_name: raise Exception('ne_name is required')
    if query('SELECT ne_name FROM devices WHERE ne_name = %s', [ne_name], fetchone=True):
        raise Exception('DUPLICATE: device already exists')
    execute(
        'INSERT INTO devices (ne_name, ip_address, alias, location, device_model, role_mask, status) VALUES (%s,%s,%s,%s,%s,%s,1)',
        [ne_name, args.get('ip_address'), args.get('alias', ''),
         args.get('location', ''), args.get('device_model', ''), args.get('role_mask', 0)]
    )
    return query('SELECT * FROM devices WHERE ne_name = %s', [ne_name], fetchone=True)

# ── Interface handlers ────────────────────────────────────────

def handle_find_interface(args):
    ne_name  = args.get('ne_name', '')
    if_name  = args.get('if_name', '')
    vrf      = args.get('vrf_name', '')
    customer = args.get('customer', '')
    exact    = args.get('exact', False)
    if not ne_name and not if_name and not vrf and not customer:
        raise Exception('MISSING_SEARCH_CRITERIA: fill at least one field')
    sql    = 'SELECT * FROM interfaces WHERE 1=1'
    params = []
    if ne_name: sql += ' AND ne_name = %s';          params.append(ne_name)
    if if_name:
        if exact: sql += ' AND if_name = %s';        params.append(if_name)
        else:     sql += ' AND if_name LIKE %s';     params.append(wrap_like(if_name))
    if vrf:      sql += ' AND vrf_name = %s';        params.append(vrf)
    if customer: sql += ' AND customer = %s';        params.append(customer)
    sql += ' ORDER BY ne_name ASC, if_name ASC LIMIT 10'
    results = query(sql, params)
    return results[0] if len(results) == 1 else results

def handle_find_subinterface(args):
    ne_name = args.get('ne_name', '')
    vlan    = args.get('vlan')
    vrf     = args.get('vrf_name', '')
    if not vlan and not vrf: raise Exception('MISSING_SEARCH_CRITERIA: fill vlan or vrf')
    sql    = 'SELECT * FROM interfaces WHERE ne_name = %s AND encapsulation != 0'
    params = [ne_name]
    if vlan: sql += ' AND vlan = %s';     params.append(vlan)
    if vrf:  sql += ' AND vrf_name = %s'; params.append(vrf)
    sql += ' ORDER BY vlan ASC LIMIT 10'
    results = query(sql, params)
    return results[0] if len(results) == 1 else results

def handle_create_interface(args):
    ne_name = args.get('ne_name')
    if_name = args.get('if_name')
    if not ne_name or not if_name: raise Exception('ne_name and if_name are required')
    if not query('SELECT ne_name FROM devices WHERE ne_name = %s', [ne_name], fetchone=True):
        raise Exception('NOT_FOUND: device not found')
    if query('SELECT if_name FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name], fetchone=True):
        raise Exception('DUPLICATE: interface already exists')
    vlan = args.get('vlan')
    if vlan and (vlan < 1 or vlan > 4095): raise Exception('VLAN_OUT_OF_RANGE')
    execute(
        'INSERT INTO interfaces (ne_name, if_name, vrf_name, customer, encapsulation, vlan, subif, description) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
        [ne_name, if_name, args.get('vrf_name'), args.get('customer'),
         args.get('encapsulation', 0), vlan, args.get('subif'), args.get('description')]
    )
    return query('SELECT * FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name], fetchone=True)

def handle_create_subinterface(args):
    ne_name = args.get('ne_name')
    if_name = args.get('if_name')
    vlan    = args.get('vlan')
    if not ne_name or not if_name or not vlan: raise Exception('ne_name if_name vlan are required')
    if vlan < 1 or vlan > 4095: raise Exception('VLAN_OUT_OF_RANGE: must be 1-4095')
    if query('SELECT if_name FROM interfaces WHERE ne_name = %s AND vlan = %s', [ne_name, vlan], fetchone=True):
        raise Exception(f'VLAN_DUPLICATE: vlan {vlan} already exists on {ne_name}')
    if query('SELECT if_name FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name], fetchone=True):
        raise Exception('DUPLICATE: subinterface already exists')
    execute(
        'INSERT INTO interfaces (ne_name, if_name, vrf_name, customer, encapsulation, vlan, description) VALUES (%s,%s,%s,%s,1,%s,%s)',
        [ne_name, if_name, args.get('vrf_name'), args.get('customer'), vlan, args.get('description')]
    )
    return query('SELECT * FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name], fetchone=True)

def handle_delete_interface(args):
    ne_name = args.get('ne_name')
    if_name = args.get('if_name')
    if not query('SELECT if_name FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name], fetchone=True):
        raise Exception('NOT_FOUND: interface not found')
    ikey = f'{ne_name}:{if_name}'
    execute('DELETE FROM int2ip_assignments WHERE interface_key = %s', [ikey])
    execute('DELETE FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name])
    return {'deleted': True}

# ── IP assignment handlers ────────────────────────────────────

def handle_assign_ip(args):
    ikey   = args.get('interface_key')
    ip_key = args.get('ip_key')
    if not ikey or not ip_key: raise Exception('interface_key and ip_key are required')
    if query('SELECT interface_key FROM int2ip_assignments WHERE interface_key = %s AND ip_key = %s', [ikey, ip_key], fetchone=True):
        raise Exception('DUPLICATE: assignment already exists')
    execute(
        'INSERT INTO int2ip_assignments (interface_key, ip_key, ip_role) VALUES (%s,%s,%s)',
        [ikey, ip_key, args.get('ip_role', 0)]
    )
    return query('SELECT * FROM int2ip_assignments WHERE interface_key = %s AND ip_key = %s', [ikey, ip_key], fetchone=True)

def handle_release_ip_assign(args):
    ikey     = args.get('interface_key')
    ip_key   = args.get('ip_key')
    affected = execute('DELETE FROM int2ip_assignments WHERE interface_key = %s AND ip_key = %s', [ikey, ip_key])
    if affected == 0: raise Exception('NOT_FOUND: assignment not found')
    return {'released': True}

# ── VRF handlers ──────────────────────────────────────────────

def handle_find_vrf(args):
    ne_name      = args.get('ne_name')
    vrf_name     = args.get('vrf_name', '')
    vrf_customer = args.get('vrf_customer', '')
    if not ne_name: raise Exception('NE_REQUIRED: ne_name is required')
    sql    = 'SELECT * FROM vrf WHERE ne_name = %s'
    params = [ne_name]
    if vrf_name:     sql += ' AND vrf_name LIKE %s';     params.append(wrap_like(vrf_name))
    if vrf_customer: sql += ' AND vrf_customer LIKE %s'; params.append(wrap_like(vrf_customer))
    sql += ' ORDER BY vrf_name ASC'
    results = query(sql, params)
    return results[0] if len(results) == 1 else results

def handle_create_vrf(args):
    ne_name      = args.get('ne_name')
    vrf_name     = args.get('vrf_name')
    vrf_customer = args.get('vrf_customer')
    if not ne_name:      raise Exception('NE_REQUIRED: ne_name is required')
    if not vrf_name:     raise Exception('VRF_NAME_REQUIRED: vrf_name is required')
    if not vrf_customer: raise Exception('VRF_CUSTOMER_REQUIRED: vrf_customer is required')
    if not query('SELECT ne_name FROM devices WHERE ne_name = %s', [ne_name], fetchone=True):
        raise Exception('DEVICE_NOT_FOUND: device not found')
    if query('SELECT vrf_name FROM vrf WHERE vrf_name = %s AND ne_name = %s', [vrf_name, ne_name], fetchone=True):
        raise Exception('DUPLICATE: VRF already exists on this device')
    execute(
        'INSERT INTO vrf (vrf_name, ne_name, vrf_customer, rd, rt, description) VALUES (%s,%s,%s,%s,%s,%s)',
        [vrf_name, ne_name, vrf_customer,
         args.get('rd') or None, args.get('rt') or None, args.get('description') or None]
    )
    return query('SELECT * FROM vrf WHERE vrf_name = %s AND ne_name = %s', [vrf_name, ne_name], fetchone=True)

def handle_update_vrf(args):
    ne_name  = args.get('ne_name')
    vrf_name = args.get('vrf_name')
    if not ne_name or not vrf_name: raise Exception('MISSING_FIELD: ne_name and vrf_name required')
    if not query('SELECT vrf_name FROM vrf WHERE vrf_name = %s AND ne_name = %s', [vrf_name, ne_name], fetchone=True):
        raise Exception('NOT_FOUND: VRF not found')
    fields, params = [], []
    if args.get('vrf_customer') is not None:
        fields.append('vrf_customer = %s'); params.append(args['vrf_customer'])
    if 'rd' in args:
        fields.append('rd = %s');          params.append(args.get('rd') or None)
    if 'rt' in args:
        fields.append('rt = %s');          params.append(args.get('rt') or None)
    if 'description' in args:
        fields.append('description = %s'); params.append(args.get('description') or None)
    if fields:
        params.extend([vrf_name, ne_name])
        execute(f"UPDATE vrf SET {', '.join(fields)} WHERE vrf_name = %s AND ne_name = %s", params)
    return query('SELECT * FROM vrf WHERE vrf_name = %s AND ne_name = %s', [vrf_name, ne_name], fetchone=True)

def handle_delete_vrf(args):
    ne_name  = args.get('ne_name')
    vrf_name = args.get('vrf_name')
    if not ne_name or not vrf_name: raise Exception('MISSING_FIELD: ne_name and vrf_name required')
    if not query('SELECT vrf_name FROM vrf WHERE vrf_name = %s AND ne_name = %s', [vrf_name, ne_name], fetchone=True):
        raise Exception('NOT_FOUND: VRF not found')
    count = query('SELECT COUNT(*) as cnt FROM interfaces WHERE ne_name = %s AND vrf_name = %s', [ne_name, vrf_name], fetchone=True)
    if count and count['cnt'] > 0:
        raise Exception(f'VRF_HAS_INTERFACES: {count["cnt"]} interfaces still assigned to this VRF')
    execute('DELETE FROM vrf WHERE vrf_name = %s AND ne_name = %s', [vrf_name, ne_name])
    return {'deleted': True, 'vrf_name': vrf_name}

def handle_assign_interface_vrf(args):
    ne_name  = args.get('ne_name')
    if_name  = args.get('if_name')
    vrf_name = args.get('vrf_name')
    if not ne_name or not if_name or not vrf_name:
        raise Exception('MISSING_FIELD: ne_name if_name vrf_name required')
    iface = query('SELECT * FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name], fetchone=True)
    if not iface: raise Exception('NOT_FOUND: interface not found')
    if iface.get('vrf_name'):
        raise Exception(f'ALREADY_IN_VRF: interface already assigned to VRF {iface["vrf_name"]}')
    vrf = query('SELECT * FROM vrf WHERE vrf_name = %s AND ne_name = %s', [vrf_name, ne_name], fetchone=True)
    if not vrf: raise Exception('VRF_NOT_FOUND: VRF not found on this device')
    execute(
        'UPDATE interfaces SET vrf_name = %s, customer = %s WHERE ne_name = %s AND if_name = %s',
        [vrf_name, vrf['vrf_customer'], ne_name, if_name]
    )
    return query('SELECT * FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name], fetchone=True)

def handle_release_interface_vrf(args):
    ne_name = args.get('ne_name')
    if_name = args.get('if_name')
    if not ne_name or not if_name: raise Exception('MISSING_FIELD: ne_name and if_name required')
    if not query('SELECT if_name FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name], fetchone=True):
        raise Exception('NOT_FOUND: interface not found')
    execute(
        'UPDATE interfaces SET vrf_name = NULL, customer = NULL WHERE ne_name = %s AND if_name = %s',
        [ne_name, if_name]
    )
    return query('SELECT * FROM interfaces WHERE ne_name = %s AND if_name = %s', [ne_name, if_name], fetchone=True)

# ── Flask app ─────────────────────────────────────────────────

app = Flask(__name__, static_folder='../ui/static', static_url_path='')
app.config['SQLALCHEMY_DATABASE_URI'] = IPAMConfig.SQLALCHEMY_DATABASE_URI
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
CORS(app)
ipam_db.init_app(app)

ALL_HANDLERS = {
    # IPAM v5
    'ls_ranges':             handle_ls_ranges,
    'ls_range':              handle_ls_range,
    'ls_ranges_by_ip':       handle_ls_ranges_by_ip,
    'create_range':          handle_create_range,
    'alloc_range':           handle_alloc_range,
    'alloc_ip':              handle_alloc_ip,
    'release_range':         handle_release_range,
    'release_ip':            handle_release_ip,
    'ls_addresses':          handle_ls_addresses,
    # Devices
    'find_device':           handle_find_device,
    'create_device':         handle_create_device,
    # Interfaces
    'find_interface':        handle_find_interface,
    'find_subinterface':     handle_find_subinterface,
    'create_interface':      handle_create_interface,
    'create_subinterface':   handle_create_subinterface,
    'delete_interface':      handle_delete_interface,
    # IP assignments
    'assign_ip':             handle_assign_ip,
    'release_ip_assign':     handle_release_ip_assign,
    # VRF
    'find_vrf':              handle_find_vrf,
    'create_vrf':            handle_create_vrf,
    'update_vrf':            handle_update_vrf,
    'delete_vrf':            handle_delete_vrf,
    'assign_interface_vrf':  handle_assign_interface_vrf,
    'release_interface_vrf': handle_release_interface_vrf,
}

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/', methods=['POST'])
def dispatch():
    data    = request.get_json()
    func    = data.get('func')
    args    = data.get('args', {})
    handler = ALL_HANDLERS.get(func)
    if not handler:
        return jsonify({'op': func, 'status': 'fail',
                        'error': {'reason': 'UNKNOWN_FUNC', 'message': f'Unknown: {func}'},
                        'data': None}), 400
    try:
        result = handler(args)
        return jsonify({'op': func, 'status': 'ok', 'data': result, 'error': None})
    except Exception as e:
        msg = str(e)
        if   msg.startswith('DUPLICATE'):  http = 409
        elif msg.startswith('NOT_FOUND'):  http = 404
        elif msg.startswith('MISSING'):    http = 400
        elif msg.startswith('VLAN'):       http = 400
        else:                              http = 500
        return jsonify({'op': func, 'status': 'fail',
                        'error': {'reason': msg.split(':')[0], 'message': msg},
                        'data': None}), http

if __name__ == '__main__':
    print('Network Manager — http://localhost:5002')
    app.run(host='0.0.0.0', port=5002, debug=True)
