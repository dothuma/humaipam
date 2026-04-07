#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
PYTHONPATH=. python3 backend/app.py
