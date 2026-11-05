#!/bin/sh
# Starts Handoff Brain. Usage: ./run.sh
cd "$(dirname "$0")"
[ -f .env ] || { cp .env.example .env; echo "Created .env. Open it, paste your keys, then run ./run.sh again."; exit 1; }
python3 -c "import triggerware" 2>/dev/null || echo "Tip: pip3 install triggerware   (needed for the Triggerware connection)"
( sleep 1.5; open http://localhost:8787 2>/dev/null ) &
exec python3 server.py
