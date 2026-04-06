from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class PublicRange(db.Model):
    __tablename__ = 'public_ranges'
    
    domain = db.Column(db.String(64), primary_key=True, nullable=False)
    ip_int = db.Column(db.Integer, primary_key=True, nullable=False)
    cidr = db.Column(db.Integer, primary_key=True, nullable=False)
    
    ip_str = db.Column(db.String(15), nullable=False)
    min_subrange_cidr = db.Column(db.Integer, nullable=False)
    bitmap = db.Column(db.String(64), nullable=False)
    
    used_subranges = db.Column(db.Integer, default=0)
    max_free_subrange_offset = db.Column(db.Integer)
    max_free_subrange_count = db.Column(db.Integer)
    
    parent_range_ip_int = db.Column(db.Integer)
    parent_range_cidr = db.Column(db.Integer)
    
    owner = db.Column(db.String(128))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    
    __table_args__ = (
        db.Index('idx_parent', 'domain', 'parent_range_ip_int', 'parent_range_cidr'),
        db.Index('idx_ip_str', 'domain', 'ip_str'),
    )

class PrivateRange(db.Model):
    __tablename__ = 'private_ranges'
    
    domain = db.Column(db.String(64), primary_key=True, nullable=False)
    ip_int = db.Column(db.Integer, primary_key=True, nullable=False)
    cidr = db.Column(db.Integer, primary_key=True, nullable=False)
    
    ip_str = db.Column(db.String(15), nullable=False)
    min_subrange_cidr = db.Column(db.Integer, nullable=False)
    bitmap = db.Column(db.String(64), nullable=False)
    
    used_subranges = db.Column(db.Integer, default=0)
    max_free_subrange_offset = db.Column(db.Integer)
    max_free_subrange_count = db.Column(db.Integer)
    
    parent_range_ip_int = db.Column(db.Integer)
    parent_range_cidr = db.Column(db.Integer)
    
    owner = db.Column(db.String(128))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    
    __table_args__ = (
        db.Index('idx_parent', 'domain', 'parent_range_ip_int', 'parent_range_cidr'),
        db.Index('idx_ip_str', 'domain', 'ip_str'),
    )

class PublicAddress(db.Model):
    __tablename__ = 'public_addresses'
    
    domain = db.Column(db.String(64), primary_key=True, nullable=False)
    ip_int = db.Column(db.Integer, primary_key=True, nullable=False)
    
    ip_str = db.Column(db.String(15), nullable=False)
    
    parent_range_ip_int = db.Column(db.Integer, nullable=False)
    parent_range_cidr = db.Column(db.Integer, nullable=False)
    offset = db.Column(db.Integer)
    
    owner = db.Column(db.String(128))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    
    __table_args__ = (
        db.ForeignKeyConstraint(
            ['domain', 'parent_range_ip_int', 'parent_range_cidr'],
            ['public_ranges.domain', 'public_ranges.ip_int', 'public_ranges.cidr'],
            ondelete='CASCADE'
        ),
        db.Index('idx_range', 'domain', 'parent_range_ip_int', 'parent_range_cidr'),
    )

class PrivateAddress(db.Model):
    __tablename__ = 'private_addresses'
    
    domain = db.Column(db.String(64), primary_key=True, nullable=False)
    ip_int = db.Column(db.Integer, primary_key=True, nullable=False)
    
    ip_str = db.Column(db.String(15), nullable=False)
    
    parent_range_ip_int = db.Column(db.Integer, nullable=False)
    parent_range_cidr = db.Column(db.Integer, nullable=False)
    offset = db.Column(db.Integer)
    
    owner = db.Column(db.String(128))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    
    __table_args__ = (
        db.ForeignKeyConstraint(
            ['domain', 'parent_range_ip_int', 'parent_range_cidr'],
            ['private_ranges.domain', 'private_ranges.ip_int', 'private_ranges.cidr'],
            ondelete='CASCADE'
        ),
        db.Index('idx_range', 'domain', 'parent_range_ip_int', 'parent_range_cidr'),
    )
