from flask import request, jsonify
from app.api import api_bp
from app.models import db, PublicRange, PrivateRange, PublicAddress, PrivateAddress
from app.ip_utils import ip2int, int2ip, align_ip, cidr_size, cidr_subrange_count, bitmap_init, bitmap_is_free, bitmap_set_range, find_aligned_block, bitmap_set_bit, bitmap_set_range_optimized
from app.ip_validator import validate_ip_type

# Accept is_private as bool or int (0/1)
def _bool(v): return bool(v) if isinstance(v, bool) else v == 1 or v == '1' or v is True


# ── Dispatch ──────────────────────────────────────────────────────────────────
# Single POST endpoint — routes to handler by func name
# Request:  { "func": "create_range", "args": {...} }
# Response: { "op": "create_range", "status": "ok"|"fail", "data": {...}, "error": null|{...} }

@api_bp.route('/', methods=['POST'])
def dispatch():
    data = request.get_json()
    func = data.get('func')
    args = data.get('args', {})

    handlers = {
        'ls_ranges':     handle_ls_ranges,
        'ls_range':      handle_ls_range,
        'ls_ranges_by_ip': handle_ls_ranges_by_ip,
        'create_range':  handle_create_range,
        'alloc_range':   handle_alloc_range,
        'alloc_ip':      handle_alloc_ip,
        'release_range': handle_release_range,
        'release_ip':    handle_release_ip,
        'ls_addresses':  handle_ls_addresses,

    }

    handler = handlers.get(func)
    if not handler:
        return jsonify({
            'op': func, 'status': 'fail',
            'error': {'reason': 'UNKNOWN_FUNC', 'message': f'Unknown function: {func}'},
            'data': None
        }), 400

    try:
        result = handler(args)
        return jsonify({'op': func, 'status': 'ok', 'data': result, 'error': None})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'op': func, 'status': 'fail',
            'error': {'reason': 'EXCEPTION', 'message': str(e)},
            'data': None
        }), 500


# ── ls_ranges ─────────────────────────────────────────────────────────────────
# List all ranges in a domain, optionally filtered by parent
# Args: domain, is_private, parent_ip_int (opt), parent_cidr (opt)

def handle_ls_ranges(args):
    domain        = args.get('domain', 'default')
    parent_ip_int = args.get('parent_ip_int')
    parent_cidr   = args.get('parent_cidr')
    is_private = _bool(args.get('is_private', False))

    if is_private:
        query = PrivateRange.query.filter_by(domain=domain)
    else:
        query = PublicRange.query.filter_by(domain=domain)

    if parent_ip_int is not None and parent_cidr is not None:
        query = query.filter_by(parent_range_ip_int=parent_ip_int, parent_range_cidr=parent_cidr)

    ranges = query.all()
    return [{
        'domain': r.domain, 'ip': r.ip_str, 'ip_int': r.ip_int, 'cidr': r.cidr,
        'usage': r.used_subranges, 'max_free_offset': r.max_free_subrange_offset,
        'max_free_count': r.max_free_subrange_count, 'owner': r.owner,
        'parent_ip_int': r.parent_range_ip_int, 'parent_cidr': r.parent_range_cidr
    } for r in ranges]


# ── ls_range ──────────────────────────────────────────────────────────────────
# Get single range with bitmap — used to refresh hexmap in UI
# Args: ip, cidr, is_private, domain

def handle_ls_range(args):
    ip_str     = args.get('ip')
    cidr       = args.get('cidr')
    is_private = _bool(args.get('is_private', False))
    domain     = args.get('domain', 'default')

    if not ip_str or not cidr:
        raise Exception("ip and cidr required")

    ip_int = ip2int(ip_str)

    if is_private:
        range_obj = PrivateRange.query.filter_by(domain=domain, ip_int=ip_int, cidr=cidr).first()
    else:
        range_obj = PublicRange.query.filter_by(domain=domain, ip_int=ip_int, cidr=cidr).first()

    if not range_obj:
        raise Exception(f'Range not found: {ip_str}/{cidr} in domain {domain}')

    return {
        'domain': range_obj.domain, 'ip': range_obj.ip_str, 'ip_int': range_obj.ip_int,
        'cidr': range_obj.cidr, 'bitmap': range_obj.bitmap,
        'used_subranges': range_obj.used_subranges,
        'max_free_offset': range_obj.max_free_subrange_offset,
        'max_free_count': range_obj.max_free_subrange_count,
        'min_subrange_cidr': range_obj.min_subrange_cidr,
        'owner': range_obj.owner,
        'parent_ip_int': range_obj.parent_range_ip_int,
        'parent_cidr': range_obj.parent_range_cidr
    }


def handle_ls_ranges_by_ip(args):
    """List all ranges with specific IP (any CIDR)"""
    ip_str     = args.get('ip')
    domain     = args.get('domain', 'default')
    is_private = _bool(args.get('is_private', False))
    
    if not ip_str:
        raise Exception("ip required")
    
    ip_int = ip2int(ip_str)
    
    if is_private:
        ranges = PrivateRange.query.filter_by(domain=domain, ip_int=ip_int).all()
    else:
        ranges = PublicRange.query.filter_by(domain=domain, ip_int=ip_int).all()
    
    return [{
        'domain': r.domain, 'ip': r.ip_str, 'cidr': r.cidr,
        'owner': r.owner, 'usage': r.used_subranges,
        'parent_ip_int': r.parent_range_ip_int,
        'parent_cidr': r.parent_range_cidr
    } for r in ranges]

# ── create_range ──────────────────────────────────────────────────────────────
# Create a new top-level IP range
# min_subrange_cidr: if omitted → /24+ gets 32, others get n+8
# Args: ip_range, ip_range_cidr, is_private, domain, owner, description, min_subrange_cidr (opt)

def handle_create_range(args):
    ip_str            = args.get('ip_range')
    cidr              = args.get('ip_range_cidr')
    min_subrange_cidr = args.get('min_subrange_cidr')
    owner             = args.get('owner', 'default')
    is_private = _bool(args.get('is_private', False))
    domain            = args.get('domain', 'default')
    description       = args.get('description', '')

    if not ip_str or not cidr:
        raise Exception("ip_range and ip_range_cidr required")

    cidr = int(cidr)

    if min_subrange_cidr is None:
        min_subrange_cidr = 32 if cidr >= 24 else min(cidr + 8, 32)
    else:
        min_subrange_cidr = int(min_subrange_cidr)

    ok, error_msg = validate_ip_type(ip_str, is_private)
    if not ok:
        raise Exception(error_msg)

    ip_int      = ip2int(ip_str)
    aligned_ip  = align_ip(ip_int, cidr)
    if ip_int != aligned_ip:
        raise Exception(f'IP {ip_str} not aligned to /{cidr}')
    aligned_ip_str = int2ip(aligned_ip)

    bitmap         = bitmap_init(cidr, min_subrange_cidr)
    max_free_count = cidr_subrange_count(cidr, min_subrange_cidr) if cidr < min_subrange_cidr else 1

    if is_private:
        existing = PrivateRange.query.filter_by(domain=domain, ip_int=aligned_ip, cidr=cidr).first()
        if existing:
            raise Exception(f'Range already exists: {aligned_ip_str}/{cidr} in domain {domain}')
        new_range = PrivateRange(
            domain=domain, ip_int=aligned_ip, ip_str=aligned_ip_str,
            cidr=cidr, min_subrange_cidr=min_subrange_cidr,
            bitmap=bitmap, max_free_subrange_offset=0, max_free_subrange_count=max_free_count,
            owner=owner, description=description
        )
    else:
        existing = PublicRange.query.filter_by(domain=domain, ip_int=aligned_ip, cidr=cidr).first()
        if existing:
            raise Exception(f'Range already exists: {aligned_ip_str}/{cidr} in domain {domain}')
        new_range = PublicRange(
            domain=domain, ip_int=aligned_ip, ip_str=aligned_ip_str,
            cidr=cidr, min_subrange_cidr=min_subrange_cidr,
            bitmap=bitmap, max_free_subrange_offset=0, max_free_subrange_count=max_free_count,
            owner=owner, description=description
        )

    db.session.add(new_range)
    db.session.commit()

    return {
        'domain': domain, 'ip': aligned_ip_str, 'ip_int': aligned_ip,
        'cidr': cidr, 'min_subrange_cidr': min_subrange_cidr,
        'bitmap': bitmap, 'owner': owner, 'is_private': is_private
    }


# ── alloc_range ───────────────────────────────────────────────────────────────
# Allocate one or more subranges from a parent range
# specific_ip_range: manual start IP (qty must be 1)
# min_subrange_cidr: smallest unit for new subrange bitmap (default n+8 capped at 32)
# Args: parent_ip, parent_cidr, cidr, qty, is_private, domain, owner,
#       specific_ip_range (opt), min_subrange_cidr (opt), description (opt)

def handle_alloc_range(args):
    parent_ip_str     = args.get('parent_ip')
    parent_cidr       = args.get('parent_cidr')
    requested_cidr    = args.get('cidr')
    specific_ip_range = args.get('specific_ip_range')
    qty               = args.get('qty', 1)
    min_subrange_cidr = args.get('min_subrange_cidr')
    owner             = args.get('owner', 'default')
    is_private = _bool(args.get('is_private', False))
    domain            = args.get('domain', 'default')
    description       = args.get('description', '')

    if not parent_ip_str or not parent_cidr or not requested_cidr:
        raise Exception("parent_ip, parent_cidr, and cidr required")

    parent_cidr    = int(parent_cidr)
    requested_cidr = int(requested_cidr)
    qty            = int(qty)

    if qty < 1 or qty > 8:
        raise Exception("qty must be between 1 and 8")

    parent_ip_int = ip2int(parent_ip_str)

    if is_private:
        parent = PrivateRange.query.filter_by(domain=domain, ip_int=parent_ip_int, cidr=parent_cidr).first()
    else:
        parent = PublicRange.query.filter_by(domain=domain, ip_int=parent_ip_int, cidr=parent_cidr).first()

    if not parent:
        raise Exception(f'Parent range not found: {parent_ip_str}/{parent_cidr}')

    if requested_cidr < parent.cidr:
        raise Exception(f'Requested CIDR /{requested_cidr} is larger than parent /{parent.cidr}')

    # Determine min_subrange_cidr for the new subrange
    if min_subrange_cidr is not None:
        min_subrange_cidr = int(min_subrange_cidr)
        if min_subrange_cidr < requested_cidr:
            raise Exception(f'min_subrange_cidr /{min_subrange_cidr} must be >= /{requested_cidr}')
        if min_subrange_cidr > 32:
            raise Exception('min_subrange_cidr cannot exceed 32')
    else:
        min_subrange_cidr = min(requested_cidr + 8, 32)

    # Validate specific_ip_range before the allocation loop
    specific_block_offset = None
    if specific_ip_range:
        if qty != 1:
            raise Exception("specific_ip_range can only be used with qty=1")
        specific_ip_int = ip2int(specific_ip_range)
        if specific_ip_int < parent_ip_int or specific_ip_int >= parent_ip_int + cidr_size(parent.cidr):
            raise Exception(f'Subrange {specific_ip_range} is outside parent {parent_ip_str}/{parent_cidr} (valid: {parent_ip_str} - {int2ip(parent_ip_int + cidr_size(parent_cidr) - 1)})')
        mask = (0xFFFFFFFF << (32 - requested_cidr)) & 0xFFFFFFFF
        if specific_ip_int & (~mask & 0xFFFFFFFF) != 0:
            raise Exception(f'{specific_ip_range} is not aligned to /{requested_cidr}')
        specific_block_offset = (specific_ip_int - parent_ip_int) >> (32 - parent.min_subrange_cidr)
        if not bitmap_is_free(parent.bitmap, specific_block_offset):
            raise Exception(f'Block at {specific_ip_range}/{requested_cidr} is already allocated')

    allocated = []

    for i in range(qty):
        if specific_block_offset is not None and i == 0:
            block_offset = specific_block_offset
        else:
            block_offset = find_aligned_block(parent.bitmap, parent.cidr, requested_cidr, parent.min_subrange_cidr)
            if block_offset is None:
                db.session.commit()
                raise Exception(f'No free block available after allocating {i}/{qty} subranges')

        subrange_ip_int = parent_ip_int + (block_offset << (32 - parent.min_subrange_cidr))
        subrange_ip_str = int2ip(subrange_ip_int)

        block_size     = cidr_subrange_count(requested_cidr, parent.min_subrange_cidr)
        parent.bitmap  = bitmap_set_range(parent.bitmap, block_offset, block_size)
        parent.used_subranges += 1

        subrange_bitmap = bitmap_init(requested_cidr, min_subrange_cidr)
        max_free_count  = cidr_subrange_count(requested_cidr, min_subrange_cidr) if requested_cidr < min_subrange_cidr else 1

        if is_private:
            new_range = PrivateRange(
                domain=domain, ip_int=subrange_ip_int, ip_str=subrange_ip_str,
                cidr=requested_cidr, min_subrange_cidr=min_subrange_cidr,
                bitmap=subrange_bitmap, max_free_subrange_offset=0, max_free_subrange_count=max_free_count,
                parent_range_ip_int=parent_ip_int, parent_range_cidr=parent_cidr,
                owner=owner, description=description
            )
        else:
            new_range = PublicRange(
                domain=domain, ip_int=subrange_ip_int, ip_str=subrange_ip_str,
                cidr=requested_cidr, min_subrange_cidr=min_subrange_cidr,
                bitmap=subrange_bitmap, max_free_subrange_offset=0, max_free_subrange_count=max_free_count,
                parent_range_ip_int=parent_ip_int, parent_range_cidr=parent_cidr,
                owner=owner, description=description
            )

        db.session.add(new_range)
        allocated.append({
            'ip': subrange_ip_str, 'cidr': requested_cidr,
            'ip_int': subrange_ip_int, 'min_subrange_cidr': min_subrange_cidr,
            'bitmap': subrange_bitmap,
            'hexmap': parent.bitmap,
            'owner': owner, 'domain': domain
        })

    db.session.commit()

    return allocated[0] if qty == 1 else allocated


# ── alloc_ip ──────────────────────────────────────────────────────────────────
# Allocate a single host IP from a /32-splittable range
# Network (offset 0) and broadcast (last offset) are protected
# specific_ip: manual IP (optional); auto mode finds first free host
# Args: range_ip, range_cidr, is_private, domain, owner, specific_ip (opt), description (opt)

def handle_alloc_ip(args):
    print("DEBUG args:", args)
    range_ip_str = args.get('range_ip')
    range_cidr   = args.get('range_cidr')
    specific_ip  = args.get('specific_ip')
    owner        = args.get('owner', 'default')
    is_private = _bool(args.get('is_private', False))
    domain       = args.get('domain', 'default')
    description  = args.get('description', '')

    if not range_ip_str or not range_cidr:
        raise Exception("range_ip and range_cidr required")

    range_cidr   = int(range_cidr)
    range_ip_int = ip2int(range_ip_str)

    if is_private:
        parent = PrivateRange.query.filter_by(domain=domain, ip_int=range_ip_int, cidr=range_cidr).first()
    else:
        parent = PublicRange.query.filter_by(domain=domain, ip_int=range_ip_int, cidr=range_cidr).first()

    if not parent:
        raise Exception(f'Range not found: {range_ip_str}/{range_cidr}')

    if parent.min_subrange_cidr != 32:
        raise Exception(f'Range {range_ip_str}/{range_cidr} has min_subrange_cidr=/{parent.min_subrange_cidr} — to allocate IPs set min_subrange_cidr=32 when creating the range')

    total_ips        = cidr_size(range_cidr)
    network_offset   = 0
    broadcast_offset = total_ips - 1

    if specific_ip:
        specific_ip_int = ip2int(specific_ip)
        offset = specific_ip_int - range_ip_int
        if offset < 0 or offset >= total_ips:
            raise Exception(f'IP {specific_ip} is outside range {range_ip_str}/{range_cidr} (valid: {range_ip_str} - {int2ip(range_ip_int + total_ips - 1)})')
        if offset == network_offset:
            raise Exception(f'{specific_ip} is the network address of {range_ip_str}/{range_cidr}')
        if offset == broadcast_offset:
            raise Exception(f'{specific_ip} is the broadcast address of {range_ip_str}/{range_cidr}')
        if not bitmap_is_free(parent.bitmap, offset):
            raise Exception(f'{specific_ip} is already allocated')
    else:
        # Skip offset 0 (network) and last (broadcast)
        offset = None
        for candidate in range(1, total_ips - 1):
            if bitmap_is_free(parent.bitmap, candidate):
                offset = candidate
                break
        if offset is None:
            raise Exception('No free IP addresses available')

    ip_int = range_ip_int + offset
    ip_str = int2ip(ip_int)

    #parent.bitmap = bitmap_set_range(parent.bitmap, offset, 1)
    parent.bitmap = bitmap_set_bit(parent.bitmap, offset, value=1)
    parent.used_subranges += 1

    if is_private:
        new_addr = PrivateAddress(
            domain=domain, ip_int=ip_int, ip_str=ip_str,
            parent_range_ip_int=range_ip_int, parent_range_cidr=range_cidr,
            offset=offset, owner=owner, description=description
        )
    else:
        new_addr = PublicAddress(
            domain=domain, ip_int=ip_int, ip_str=ip_str,
            parent_range_ip_int=range_ip_int, parent_range_cidr=range_cidr,
            offset=offset, owner=owner, description=description
        )

    db.session.add(new_addr)
    db.session.commit()

    return {
        'domain': domain, 'ip': ip_str, 'ip_int': ip_int,
        'range_ip': range_ip_str, 'range_cidr': range_cidr,
        'owner': owner
    }


# ── release_range ─────────────────────────────────────────────────────────────
# Release a subrange back to its parent
# Refuses if range still has active allocations (used_subranges > 0)
# Updates parent bitmap to free the block
# Args: ip, cidr, is_private, domain

def handle_release_range(args):
    ip_str     = args.get('ip')
    cidr       = args.get('cidr')
    is_private = _bool(args.get('is_private', False))
    domain     = args.get('domain', 'default')

    if not ip_str or not cidr:
        raise Exception("ip and cidr required")

    cidr   = int(cidr)
    ip_int = ip2int(ip_str)

    if is_private:
        range_obj = PrivateRange.query.filter_by(domain=domain, ip_int=ip_int, cidr=cidr).first()
    else:
        range_obj = PublicRange.query.filter_by(domain=domain, ip_int=ip_int, cidr=cidr).first()

    if not range_obj:
        raise Exception(f'Range not found: {ip_str}/{cidr}')

    if range_obj.used_subranges > 0:
        raise Exception(f'Cannot release range with active allocations (used: {range_obj.used_subranges})')

    # Free block in parent bitmap if parent exists
    if range_obj.parent_range_ip_int is not None:
        if is_private:
            parent = PrivateRange.query.filter_by(
                domain=domain, ip_int=range_obj.parent_range_ip_int, cidr=range_obj.parent_range_cidr
            ).first()
        else:
            parent = PublicRange.query.filter_by(
                domain=domain, ip_int=range_obj.parent_range_ip_int, cidr=range_obj.parent_range_cidr
            ).first()

    if parent:
        offset     = (ip_int - parent.ip_int) >> (32 - parent.min_subrange_cidr)
        block_size = cidr_subrange_count(cidr, parent.min_subrange_cidr)
        parent.bitmap = bitmap_set_range_optimized(parent.bitmap, offset, block_size, value=0)
        parent.used_subranges -= 1

    db.session.delete(range_obj)
    db.session.commit()

    return {'domain': domain, 'ip': ip_str, 'cidr': cidr, 'released': True}


# ── release_ip ────────────────────────────────────────────────────────────────
# Release a single allocated IP address
# Frees the corresponding bit in parent range bitmap
# Args: ip, is_private, domain

def handle_release_ip(args):
    ip_str     = args.get('ip')
    is_private = _bool(args.get('is_private', False))
    domain     = args.get('domain', 'default')

    if not ip_str:
        raise Exception("ip required")

    ip_int = ip2int(ip_str)

    if is_private:
        addr = PrivateAddress.query.filter_by(domain=domain, ip_int=ip_int).first()
    else:
        addr = PublicAddress.query.filter_by(domain=domain, ip_int=ip_int).first()

    if not addr:
        raise Exception(f'IP address not found: {ip_str}')

    if is_private:
        parent = PrivateRange.query.filter_by(
            domain=domain, ip_int=addr.parent_range_ip_int, cidr=addr.parent_range_cidr
        ).first()
    else:
        parent = PublicRange.query.filter_by(
            domain=domain, ip_int=addr.parent_range_ip_int, cidr=addr.parent_range_cidr
        ).first()

    if parent:
        parent.bitmap = bitmap_set_bit(parent.bitmap, addr.offset, value=0)
        parent.used_subranges -= 1

    db.session.delete(addr)
    db.session.commit()

    return {'domain': domain, 'ip': ip_str, 'released': True}


# ── ls_addresses ──────────────────────────────────────────────────────────────
# List allocated IP addresses, optionally filtered by parent range
# Args: domain, is_private, range_ip_int (opt), range_cidr (opt)

def handle_ls_addresses(args):
    domain       = args.get('domain', 'default')
    range_ip_int = args.get('range_ip_int')
    range_cidr   = args.get('range_cidr')
    is_private = _bool(args.get('is_private', False))

    if is_private:
        query = PrivateAddress.query.filter_by(domain=domain)
    else:
        query = PublicAddress.query.filter_by(domain=domain)

    if range_ip_int is not None and range_cidr is not None:
        query = query.filter_by(parent_range_ip_int=range_ip_int, parent_range_cidr=range_cidr)

    addresses = query.all()
    return [{
        'domain': a.domain, 'ip': a.ip_str, 'ip_int': a.ip_int,
        'parent_ip_int': a.parent_range_ip_int, 'parent_cidr': a.parent_range_cidr,
        'offset': a.offset, 'owner': a.owner,
        'created_at': a.created_at.isoformat() if a.created_at else None
    } for a in addresses]
