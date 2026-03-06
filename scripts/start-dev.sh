#!/bin/bash
# Kill any existing next dev processes
pkill -f "next dev" 2>/dev/null || true

# Remove stale lock file
rm -f /Users/keremozanbayraktar/Projects/ground-control/.next/dev/lock

# Wait briefly for port to free
sleep 1

# Start dev server
cd /Users/keremozanbayraktar/Projects/ground-control
exec /opt/homebrew/bin/npm run dev
