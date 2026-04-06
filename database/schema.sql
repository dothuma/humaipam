-- node: 'database/schema.sql'
-- Network Manager — Complete Schema
-- All 8 tables — correct drop and create order

USE ipam;

-- ── Drop order — children first ──────────────────────────────
DROP TABLE IF EXISTS int2ip_assignments;
DROP TABLE IF EXISTS vrf;
DROP TABLE IF EXISTS interfaces;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS private_addresses;
DROP TABLE IF EXISTS public_addresses;
DROP TABLE IF EXISTS private_ranges;
DROP TABLE IF EXISTS public_ranges;

-- ── IPAM v5 ───────────────────────────────────────────────────

CREATE TABLE public_ranges (
    domain                   VARCHAR(64)       NOT NULL,
    ip_int                   INT UNSIGNED      NOT NULL,
    ip_str                   VARCHAR(15)       NOT NULL,
    cidr                     TINYINT UNSIGNED  NOT NULL,
    min_subrange_cidr        TINYINT UNSIGNED  NOT NULL,
    bitmap                   VARCHAR(64)       NOT NULL,
    used_subranges           INT UNSIGNED      DEFAULT 0,
    max_free_subrange_offset INT UNSIGNED,
    max_free_subrange_count  INT UNSIGNED,
    parent_range_ip_int      INT UNSIGNED,
    parent_range_cidr        TINYINT UNSIGNED,
    owner                    VARCHAR(128),
    description              TEXT,
    created_at               TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (domain, ip_int, cidr),
    INDEX idx_parent (domain, parent_range_ip_int, parent_range_cidr),
    INDEX idx_ip_str (domain, ip_str)
) ENGINE=InnoDB;

CREATE TABLE private_ranges (
    domain                   VARCHAR(64)       NOT NULL,
    ip_int                   INT UNSIGNED      NOT NULL,
    ip_str                   VARCHAR(15)       NOT NULL,
    cidr                     TINYINT UNSIGNED  NOT NULL,
    min_subrange_cidr        TINYINT UNSIGNED  NOT NULL,
    bitmap                   VARCHAR(64)       NOT NULL,
    used_subranges           INT UNSIGNED      DEFAULT 0,
    max_free_subrange_offset INT UNSIGNED,
    max_free_subrange_count  INT UNSIGNED,
    parent_range_ip_int      INT UNSIGNED,
    parent_range_cidr        TINYINT UNSIGNED,
    owner                    VARCHAR(128),
    description              TEXT,
    created_at               TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (domain, ip_int, cidr),
    INDEX idx_parent (domain, parent_range_ip_int, parent_range_cidr),
    INDEX idx_ip_str (domain, ip_str)
) ENGINE=InnoDB;

CREATE TABLE public_addresses (
    domain              VARCHAR(64)      NOT NULL,
    ip_int              INT UNSIGNED     NOT NULL,
    ip_str              VARCHAR(15)      NOT NULL,
    parent_range_ip_int INT UNSIGNED     NOT NULL,
    parent_range_cidr   TINYINT UNSIGNED NOT NULL,
    offset              INT UNSIGNED,
    owner               VARCHAR(128),
    description         TEXT,
    created_at          TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (domain, ip_int),
    FOREIGN KEY (domain, parent_range_ip_int, parent_range_cidr)
        REFERENCES public_ranges(domain, ip_int, cidr) ON DELETE CASCADE,
    INDEX idx_range (domain, parent_range_ip_int, parent_range_cidr)
) ENGINE=InnoDB;

CREATE TABLE private_addresses (
    domain              VARCHAR(64)      NOT NULL,
    ip_int              INT UNSIGNED     NOT NULL,
    ip_str              VARCHAR(15)      NOT NULL,
    parent_range_ip_int INT UNSIGNED     NOT NULL,
    parent_range_cidr   TINYINT UNSIGNED NOT NULL,
    offset              INT UNSIGNED,
    owner               VARCHAR(128),
    description         TEXT,
    created_at          TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (domain, ip_int),
    FOREIGN KEY (domain, parent_range_ip_int, parent_range_cidr)
        REFERENCES private_ranges(domain, ip_int, cidr) ON DELETE CASCADE,
    INDEX idx_range (domain, parent_range_ip_int, parent_range_cidr)
) ENGINE=InnoDB;

-- ── Interface Manager ─────────────────────────────────────────

CREATE TABLE devices (
    ne_name        VARCHAR(128) NOT NULL,
    alias          VARCHAR(128),
    location       VARCHAR(64),
    device_model   VARCHAR(64),
    ip_address     VARCHAR(64)  DEFAULT NULL,
    role_mask      SMALLINT     NOT NULL DEFAULT 0,
    status         TINYINT(1)   NOT NULL DEFAULT 1,
    source_system  VARCHAR(64),
    last_synced_at TIMESTAMP    NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY    (ne_name),
    INDEX idx_location   (location),
    INDEX idx_role_mask  (role_mask),
    INDEX idx_status     (status),
    INDEX idx_ip_address (ip_address)
) ENGINE=InnoDB COMMENT='Network devices — ne_name is natural key';

CREATE TABLE interfaces (
    ne_name        VARCHAR(128) NOT NULL,
    if_name        VARCHAR(64)  NOT NULL,
    vrf_name       VARCHAR(128),
    customer       VARCHAR(128),
    encapsulation  TINYINT(1)   NOT NULL DEFAULT 0,
    vlan           SMALLINT,
    subif          SMALLINT,
    description    VARCHAR(255),
    source_system  VARCHAR(64),
    last_synced_at TIMESTAMP    NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY    (ne_name, if_name),
    FOREIGN KEY    (ne_name) REFERENCES devices(ne_name) ON DELETE CASCADE,
    INDEX idx_vrf_name (vrf_name),
    INDEX idx_customer (customer)
) ENGINE=InnoDB COMMENT='Interfaces and subinterfaces — composite PK';

CREATE TABLE int2ip_assignments (
    interface_key VARCHAR(196) NOT NULL,
    ip_key        VARCHAR(64)  NOT NULL,
    ip_role       TINYINT(1)   NOT NULL DEFAULT 0,
    assigned_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY   (interface_key, ip_key)
) ENGINE=InnoDB COMMENT='Loose link interface to IP — no FK to IPAM';

-- ── VRF ───────────────────────────────────────────────────────

CREATE TABLE vrf (
    vrf_name     VARCHAR(64)  NOT NULL,
    ne_name      VARCHAR(196) NOT NULL,
    vrf_customer VARCHAR(128) NOT NULL,
    rd           VARCHAR(24)  NULL,
    rt           VARCHAR(64)  NULL,
    description  TEXT         NULL,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY  (vrf_name, ne_name),
    FOREIGN KEY  (ne_name) REFERENCES devices(ne_name) ON DELETE RESTRICT,
    INDEX idx_vrf_customer (vrf_customer),
    INDEX idx_vrf_ne       (ne_name)
) ENGINE=InnoDB COMMENT='VRF instances per device';

-- ── Test data ─────────────────────────────────────────────────

INSERT IGNORE INTO devices (ne_name, alias, location, device_model, ip_address, role_mask) VALUES
    ('router1.dc1.example.com', 'DC1-CORE-R1', 'DC1-Amsterdam', '7750 SR-1',  '10.0.1.1',   17),
    ('router2.dc1.example.com', 'DC1-CORE-R2', 'DC1-Amsterdam', '7750 SR-1',  '10.0.1.2',   17),
    ('router1.dc2.example.com', 'DC2-EDGE-R1', 'DC2-Frankfurt', '7750 SR-7',  '10.0.2.1',   24),
    ('fw1.dc1.example.com',     'DC1-FW1',     'DC1-Amsterdam', 'NCS5501',    '10.0.1.100', 32);

INSERT IGNORE INTO interfaces (ne_name, if_name, vrf_name, encapsulation, vlan, description, customer) VALUES
    ('router1.dc1.example.com', 'loopback0',  'MGMT',   0, NULL, 'Management loopback', NULL),
    ('router1.dc1.example.com', 'eth0',        NULL,    0, NULL, 'Uplink to spine',      NULL),
    ('router1.dc1.example.com', 'eth0.v100',  'CUST_A', 1, 100,  'Customer A',          'acme'),
    ('router1.dc1.example.com', 'eth0.v200',  'CUST_B', 1, 200,  'Customer B',          'globex'),
    ('router2.dc1.example.com', 'loopback0',  'MGMT',   0, NULL, 'Management loopback', NULL),
    ('router2.dc1.example.com', 'eth0',        NULL,    0, NULL, 'Uplink to spine',      NULL);
