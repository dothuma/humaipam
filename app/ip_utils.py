import ipaddress

def ip2int(ip_str: str) -> int:
    """Convert IPv4 string to 32-bit integer"""
    return int(ipaddress.IPv4Address(ip_str))

def int2ip(ip_int: int) -> str:
    """Convert 32-bit integer to IPv4 string"""
    return str(ipaddress.IPv4Address(ip_int))

def align_ip(ip_int: int, cidr: int) -> int:
    """Round down IP to network boundary"""
    mask = 0xFFFFFFFF << (32 - cidr)
    return ip_int & mask

def is_aligned(ip_int: int, cidr: int) -> bool:
    """Check if IP is aligned to CIDR boundary"""
    return ip_int == align_ip(ip_int, cidr)

def cidr_size(cidr: int) -> int:
    """Number of addresses in CIDR block"""
    return 1 << (32 - cidr)

def cidr_subrange_count(parent_cidr: int, subrange_cidr: int) -> int:
    """Calculate how many subranges of subrange_cidr fit in parent_cidr
    
    Examples:
        cidr_subrange_count(24, 32) = 256  # /24 has 256 /32 addresses
        cidr_subrange_count(16, 24) = 256  # /16 has 256 /24 subnets
        cidr_subrange_count(24, 28) = 16   # /24 has 16 /28 subnets
    """
    if subrange_cidr <= parent_cidr:
        return 1
    return 1 << (subrange_cidr - parent_cidr)

def calc_mask(cidr: int) -> int:
    """Calculate subnet mask from CIDR"""
    return 0xFFFFFFFF << (32 - cidr)

# Bitmap operations
def bitmap_init(parent_cidr: int, min_subrange_cidr: int) -> str:
    """Create empty bitmap for CIDR range
    
    Args:
        parent_cidr: The CIDR of the parent range (e.g., 24 for /24)
        min_subrange_cidr: The smallest allocatable unit (e.g., 32 for individual IPs)
    
    Returns:
        Hex string representing empty bitmap
    
    Examples:
        bitmap_init(24, 32) = "0"*64  # /24 with /32 IPs = 256 bits = 64 hex chars
        bitmap_init(24, 30) = "0"*16  # /24 with /30 subnets = 64 bits = 16 hex chars
        bitmap_init(16, 24) = "0"*64  # /16 with /24 subnets = 256 bits = 64 hex chars
    """
    # Calculate number of subranges
    num_subranges = cidr_subrange_count(parent_cidr, min_subrange_cidr)
    
    # Convert to hex length (4 bits per hex char)
    hex_len = num_subranges // 4
    if num_subranges % 4 != 0:
        hex_len += 1
    
    return "0" * hex_len

def hex_to_bits(hex_str: str) -> list:
    """Convert hex string to bit array"""
    bits = []
    for char in hex_str:
        val = int(char, 16)
        for i in range(3, -1, -1):
            bits.append((val >> i) & 1)
    return bits

def bits_to_hex(bits: list) -> str:
    """Convert bit array to hex string"""
    hex_chars = []
    for i in range(0, len(bits), 4):
        chunk = bits[i:i+4]
        while len(chunk) < 4:
            chunk.append(0)
        val = (chunk[0] << 3) | (chunk[1] << 2) | (chunk[2] << 1) | chunk[3]
        hex_chars.append(f"{val:x}")
    return "".join(hex_chars)

def bitmap_is_free(bitmap: str, offset: int, length: int = 1) -> bool:
    """Check if range [offset, offset+length) is free (all zeros)"""
    bits = hex_to_bits(bitmap)
    for i in range(offset, offset + length):
        if i >= len(bits) or bits[i] == 1:
            return False
    return True

def bitmap_set_range(bitmap: str, offset: int, length: int, value: int = 1) -> str:
    """Set bits [offset, offset+length) to value (0 or 1)"""
    bits = hex_to_bits(bitmap)
    for i in range(offset, offset + length):
        if i < len(bits):
            bits[i] = value
    return bits_to_hex(bits)

def bitmap_count_used(bitmap: str) -> int:
    """Count used bits (1s) in bitmap"""
    return hex_to_bits(bitmap).count(1)

def find_aligned_block(bitmap: str, parent_cidr: int, target_cidr: int, min_subrange_cidr: int):
    """
    Find first aligned free block of target_cidr size in parent.
    
    Args:
        bitmap: Hex string bitmap
        parent_cidr: Parent range CIDR
        target_cidr: Desired subrange CIDR
        min_subrange_cidr: Minimum subrange size (for bitmap granularity)
    
    Returns:
        offset: Offset in units of min_subrange_cidr, or None if not found
    """
    # Calculate block size in terms of min_subrange_cidr units
    block_size = cidr_subrange_count(target_cidr, min_subrange_cidr)
    
    # Total units in the bitmap
    total_units = cidr_subrange_count(parent_cidr, min_subrange_cidr)
    
    # Search for aligned free block
    for offset in range(0, total_units, block_size):
        if bitmap_is_free(bitmap, offset, block_size):
            return offset
    
    return None
# ── Optimized bitmap operations (direct hex manipulation) ────────────────────

def bitmap_set_bit(hex_str: str, bit_offset: int, value: int = 1) -> str:
    """Set single bit in hex string (direct operation, no conversion)
    
    Args:
        hex_str: Hex bitmap string (e.g., "0002")
        bit_offset: Bit index (0-based, left to right)
        value: 0 or 1
    
    Returns:
        Modified hex string
    
    Examples:
        bitmap_set_bit("0002", 14, 0) = "0000"  # Clear bit 14
        bitmap_set_bit("0000", 14, 1) = "0002"  # Set bit 14
    """
    # Calculate which hex character contains this bit
    char_index = bit_offset // 4
    bit_in_char = bit_offset % 4
    
    # Bounds check
    if char_index >= len(hex_str):
        raise IndexError(f"Bit offset {bit_offset} outside bitmap (length {len(hex_str)*4})")
    
    # Convert to list for modification
    chars = list(hex_str)
    
    # Get current hex character value
    char_val = int(chars[char_index], 16)
    
    # Calculate bit position (MSB first: 3,2,1,0)
    bit_pos = 3 - bit_in_char
    
    # Set or clear the bit
    if value:
        char_val |= (1 << bit_pos)   # Set bit to 1
    else:
        char_val &= ~(1 << bit_pos)  # Clear bit to 0
    
    # Update character
    chars[char_index] = f"{char_val:x}"
    
    return ''.join(chars)


def bitmap_set_range_optimized(hex_str: str, offset: int, length: int, value: int = 1) -> str:
    """Set range of bits in hex string (optimized for direct manipulation)
    
    Args:
        hex_str: Hex bitmap string
        offset: Starting bit offset (0-based, left to right)
        length: Number of bits to set
        value: 0 or 1
    
    Returns:
        Modified hex string
    """
    result = list(hex_str)
    
    for i in range(length):
        bit_offset = offset + i
        char_index = bit_offset // 4
        bit_in_char = bit_offset % 4
        
        if char_index >= len(result):
            break  # Out of bounds
        
        # Get current value
        char_val = int(result[char_index], 16)
        
        # Calculate bit position (MSB first)
        bit_pos = 3 - bit_in_char
        
        # Set or clear bit
        if value:
            char_val |= (1 << bit_pos)
        else:
            char_val &= ~(1 << bit_pos)
        
        # Update character
        result[char_index] = f"{char_val:x}"
    
    return ''.join(result)


def bitmap_is_bit_set(hex_str: str, bit_offset: int) -> bool:
    """Check if single bit is set (direct operation, no conversion)
    
    Args:
        hex_str: Hex bitmap string
        bit_offset: Bit index (0-based, left to right)
    
    Returns:
        True if bit is 1, False if 0
    """
    char_index = bit_offset // 4
    bit_in_char = bit_offset % 4
    
    if char_index >= len(hex_str):
        return False
    
    char_val = int(hex_str[char_index], 16)
    bit_pos = 3 - bit_in_char
    
    return bool((char_val >> bit_pos) & 1)


# Keep old functions for compatibility, but mark as deprecated
# bitmap_set_range() can be replaced with bitmap_set_range_optimized()