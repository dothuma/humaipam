# Network Manager — Lightweight IP & Interface Provisioning

> Built in two weeks using [dothuma](https://dothuma.ai) — human-machine collaborative development by [Yaroslav Vlasov / HuMaDev](https://humadev.ai).  
> All the good ideas are mine. All the tedious parts are Claude AI's.

A lightweight, API-first network provisioning tool for operators who need IP address management and interface tracking without the overhead of a full IPAM/DCIM platform.

Built for machine-to-machine workflows. Up and running in one day.

---

## Who this is for

- Small to mid-size network operators
- Teams where NMS or EMS is already the source of truth
- Environments where provisioning is automated — not manually entered
- Anyone who needs IP allocation and interface assignment without a heavy platform

---

## What it does

- **IP Address Management** — manage ranges, allocate subranges and individual IPs, track assignments
- **Interface Manager** — track devices, physical interfaces, subinterfaces, VRF associations
- **IP ↔ Interface assignment** — link allocated IPs to specific interfaces with domain isolation
- **VRF namespacing** — same private IP can exist in multiple VRF domains simultaneously
- **REST API** — single `/api/` endpoint, JSON in/out, 24 functions

---

## Design principles

**API first.** The UI exists for testing and investigation. Real usage is machine-to-machine.

**NMS/EMS as source of truth.** This tool does not try to discover or reconcile your network. Your existing NMS or EMS knows what's there — this tool handles provisioning and allocation on top of it.

**No bloat.** One Flask app, one MySQL database, one endpoint. Easy to deploy, easy to understand, easy to extend.

**Private IP reuse by design.** The same RFC1918 address can be allocated across multiple VRF domains. Domain namespacing is built into every IP record and assignment.

---

## Architecture

```
NMS / EMS
    │
    ▼
Network Manager API  (Flask, port 5002)
    ├── IPAM v5           — ranges, subranges, IP allocation (bitmap-based)
    ├── Interface Manager — devices, interfaces, subinterfaces, VRFs
    └── Assignment layer  — IP ↔ interface with domain isolation
    │
    ▼
MySQL
```

### Bitmap allocation

IP ranges use a bitmap to track allocations — one row per range, no SELECT of all allocated IPs needed. Allocation is O(1). Efficient for high-frequency provisioning.

### Domain = VRF namespace

Every IP carries a domain label. `domain='_'` is the global provider pool. `domain='CUST_A'` is a customer VRF namespace. The same IP address can be allocated independently in each domain — uniqueness is enforced per domain, not globally.

---

## Repository structure

```
humaipam/
  backend/        ← Flask app (app.py) + requirements.txt
  app/            ← IPAM v5 models, config, bitmap utils, API routes
  ui/             ← single-page UI (index.html + JS modules)
  database/       ← schema.sql
```

---

## Quick start

### Requirements

- Python 3.10+
- MySQL 8+
- pip

### Install

```bash
git clone https://github.com/dothuma/humaipam.git
cd humaipam
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### Database setup

```bash
mysql -u root -p < database/schema.sql
```

Set credentials as environment variables:

```bash
export DB_HOST=localhost
export DB_USER=youruser
export DB_PASSWORD=yourpassword
export DB_NAME=ipam
```

### Run

```bash
source venv/bin/activate
python3 backend/app.py
```

App is available at `http://localhost:5002`

### Verify

```bash
curl -s -X POST http://localhost:5002/api/ \
  -H "Content-Type: application/json" \
  -d '{"func":"ls_ranges","args":{"domain":"_"}}' | python3 -m json.tool
```

Expected: `"status": "ok"` with list of ranges.

---

## API

All requests are POST to `/api/` with JSON body:

```json
{"func": "function_name", "args": {...}}
```

Response:

```json
{"op": "function_name", "status": "ok", "data": {...}, "error": null}
```

### IPAM functions

| func | description |
|---|---|
| `ls_ranges` | list ranges by domain/owner |
| `ls_range` | find single range |
| `ls_ranges_by_ip` | find range containing a given IP |
| `create_range` | create new IP range |
| `alloc_range` | allocate subrange within parent |
| `alloc_ip` | allocate individual IP |
| `release_range` | release subrange |
| `release_ip` | release individual IP |
| `ls_addresses` | list allocated addresses |

### Interface Manager functions

| func | description |
|---|---|
| `find_device` / `create_device` | device management |
| `find_interface` / `create_interface` / `delete_interface` | interface management |
| `find_subinterface` / `create_subinterface` | subinterface management |
| `find_vrf` / `create_vrf` / `update_vrf` / `delete_vrf` | VRF management |
| `assign_interface_vrf` / `release_interface_vrf` | VRF association |
| `assign_ip` / `release_ip_assign` | IP ↔ interface assignment |

### Domain model

| domain value | meaning |
|---|---|
| `_` | global / provider pool |
| `CUST_A` | customer VRF namespace |

`ip_key` format: `domain:ip_address` — e.g. `_:10.0.0.1` or `CUST_A:10.0.0.1`

### Example — full provisioning chain

```bash
# 1. Create range
curl -s -X POST http://localhost:5002/api/ \
  -H "Content-Type: application/json" \
  -d '{"func":"create_range","args":{"ip_range":"10.0.0.0","ip_range_cidr":24,"is_private":1,"domain":"_","owner":"default","min_subrange_cidr":32}}'

# 2. Allocate subrange
curl -s -X POST http://localhost:5002/api/ \
  -H "Content-Type: application/json" \
  -d '{"func":"alloc_range","args":{"parent_ip":"10.0.0.0","parent_cidr":24,"cidr":28,"qty":1,"domain":"_","is_private":1,"owner":"me","min_subrange_cidr":32}}'

# 3. Allocate IP
curl -s -X POST http://localhost:5002/api/ \
  -H "Content-Type: application/json" \
  -d '{"func":"alloc_ip","args":{"range_ip":"10.0.0.0","range_cidr":28,"domain":"_","is_private":true,"owner":"default","specific_ip":"10.0.0.1"}}'

# 4. Create device
curl -s -X POST http://localhost:5002/api/ \
  -H "Content-Type: application/json" \
  -d '{"func":"create_device","args":{"ne_name":"router1","location":"dc1","device_model":"7750 SR-1"}}'

# 5. Create interface
curl -s -X POST http://localhost:5002/api/ \
  -H "Content-Type: application/json" \
  -d '{"func":"create_interface","args":{"ne_name":"router1","if_name":"eth0","encapsulation":0}}'

# 6. Assign IP to interface
curl -s -X POST http://localhost:5002/api/ \
  -H "Content-Type: application/json" \
  -d '{"func":"assign_ip","args":{"interface_key":"router1:eth0","ip_key":"_:10.0.0.1","ip_role":0}}'
```

---

## Migration from an existing inventory

If you have device and IP data in an existing system:

1. Pull devices and interfaces from your NMS/EMS
2. POST `create_device` + `create_interface` for each
3. Create IP ranges matching your existing allocations
4. Use `alloc_ip` with `specific_ip` to register existing IPs
5. Use `assign_ip` to link them to interfaces

No schema mapping tools required — the API is the migration interface.

---

## License

© 2026 Yaroslav Vlasov / HuMaDev. All rights reserved.

This project is licensed under [Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 International (CC BY-NC-ND 4.0)](https://creativecommons.org/licenses/by-nc-nd/4.0/).

You may use and share this work for non-commercial purposes with attribution. You may not distribute modified versions or use it commercially without permission.

For commercial licensing: dothuma.dev@gmail.com

---

*built with [dothuma](https://dothuma.ai) · [HuMaDev](https://humadev.ai) · [medium/@islavv](https://medium.com/@islavv)*
