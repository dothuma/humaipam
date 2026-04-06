"""IP validation utilities - RFC1918 private vs public"""

def ip2int(ip_str: str) -> int:
    """Convert IPv4 string to 32-bit integer"""
    parts = ip_str.split('.')
    return (int(parts[0]) << 24) | (int(parts[1]) << 16) | (int(parts[2]) << 8) | int(parts[3])

def is_private_ip(ip_str: str) -> bool:
    """Check if IP is RFC1918 private address"""
    try:
        ip_int = ip2int(ip_str)
        
        # 10.0.0.0/8
        if (ip_int >> 24) == 10:
            return True
        
        # 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
        if (ip_int >> 20) == 0xAC1:  # 172.16 to 172.31
            return True
        
        # 192.168.0.0/16
        if (ip_int >> 16) == 0xC0A8:  # 192.168
            return True
            
        return False
    except (ValueError, IndexError):
        return False

def validate_ip_type(ip_str: str, is_private_flag: bool) -> tuple:
    """
    Validate IP matches private/public flag
    Returns: (ok: bool, error_message: str)
    """
    if not ip_str:
        return False, "IP address required"
    
    try:
        ip2int(ip_str)  # Validate format
    except (ValueError, IndexError):
        return False, f"Invalid IP format: {ip_str}"
    
    actually_private = is_private_ip(ip_str)
    
    if is_private_flag and not actually_private:
        return False, f"IP {ip_str} is not private (RFC1918). Uncheck 'Private' flag."
    
    if not is_private_flag and actually_private:
        return False, f"IP {ip_str} is private (RFC1918). Check 'Private' flag."
    
    return True, ""
