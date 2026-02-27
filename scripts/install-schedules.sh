#!/bin/bash
# Generate and load launchd plists for Ground Control scheduled jobs.
# Usage: bash scripts/install-schedules.sh

set -e

PLIST_DIR="$HOME/Library/LaunchAgents"
API_URL="http://localhost:3000/api/schedule/run"
PREFIX="com.ground-control"

mkdir -p "$PLIST_DIR"

generate_plist() {
  local job_id="$1"
  local hour="$2"
  local minute="$3"
  local weekday="$4"   # 0=Sun, 1=Mon ... 6=Sat (empty = daily)
  local day="$5"       # Day of month (empty = no restriction)

  local plist_file="$PLIST_DIR/${PREFIX}.${job_id}.plist"
  local log_file="$HOME/Library/Logs/${PREFIX}.${job_id}.log"

  # Build calendar interval
  local calendar="<key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer>"
  [ -n "$weekday" ] && calendar="$calendar<key>Weekday</key><integer>${weekday}</integer>"
  [ -n "$day" ] && calendar="$calendar<key>Day</key><integer>${day}</integer>"

  cat > "$plist_file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PREFIX}.${job_id}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/curl</string>
        <string>-s</string>
        <string>-X</string>
        <string>POST</string>
        <string>${API_URL}</string>
        <string>-H</string>
        <string>Content-Type: application/json</string>
        <string>-d</string>
        <string>{"jobId":"${job_id}"}</string>
        <string>--max-time</string>
        <string>600</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        ${calendar}
    </dict>
    <key>StandardOutPath</key>
    <string>${log_file}</string>
    <key>StandardErrorPath</key>
    <string>${log_file}</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

  echo "  Created: $plist_file"
}

echo "Unloading existing plists..."
for plist in "$PLIST_DIR/${PREFIX}."*.plist; do
  [ -f "$plist" ] && launchctl unload "$plist" 2>/dev/null || true
done

echo "Generating plists..."

#                    job_id               hour min weekday day
generate_plist "postman-morning"           8    0   ""     ""
generate_plist "postman-afternoon"        13    0   ""     ""
generate_plist "postman-evening"          18    0   ""     ""
generate_plist "evening-tasks"            19    0   ""     ""
generate_plist "coach-weekly"             16    0   "5"    ""    # Friday
generate_plist "architect-watcher"         22    0   ""     ""
generate_plist "oracle-weekly"            20    0   "0"    ""    # Sunday
generate_plist "oracle-monthly"           20    0   ""     "1"   # 1st of month

echo ""
echo "Loading plists..."
for plist in "$PLIST_DIR/${PREFIX}."*.plist; do
  launchctl load "$plist"
  echo "  Loaded: $(basename "$plist")"
done

echo ""
echo "Done. Verify with: launchctl list | grep ground-control"
