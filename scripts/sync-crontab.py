#!/usr/bin/env python3
"""Generate crontab entries from ground-control.config.ts and install them.

Usage:
    python3 scripts/sync-crontab.py          # install
    python3 scripts/sync-crontab.py --dry-run # preview only
"""

import sys, re, subprocess, os

dry_run = "--dry-run" in sys.argv

config_path = os.path.join(os.path.dirname(__file__), "..", "ground-control.config.ts")
with open(config_path) as f:
    text = f.read()

jobs_match = re.search(r"jobs:\s*\[(.*?)\],\s*\}", text, re.DOTALL)
if not jobs_match:
    print("ERROR: could not find jobs array in config")
    sys.exit(1)

jobs_text = jobs_match.group(1)
job_pattern = re.compile(
    r"id:\s*'([^']+)'.*?cron:\s*'([^']+)'.*?enabled:\s*(true|false)",
    re.DOTALL,
)

DAY_MAP = {
    "Monday": "1", "Tuesday": "2", "Wednesday": "3",
    "Thursday": "4", "Friday": "5", "Saturday": "6", "Sunday": "0",
}

entries = []
for m in job_pattern.finditer(jobs_text):
    job_id, cron_str, enabled = m.group(1), m.group(2), m.group(3)
    if enabled != "true":
        continue

    parts = cron_str.strip().split()
    minute = hour = "0"
    dom = month = "*"
    dow = "*"

    for part in parts:
        if ":" in part:
            h, mi = part.split(":")
            hour, minute = str(int(h)), str(int(mi))
        elif part == "daily":
            dow = "*"
        elif part in DAY_MAP:
            dow = DAY_MAP[part]
        elif part == "1st":
            dom = "1"
        elif part.startswith("Tu"):
            dow = "2"

    curl = (
        f'curl -sf -X POST http://localhost:3000/api/schedule/run '
        f'-H "Content-Type: application/json" '
        f"-d '{{\"jobId\":\"{job_id}\"}}' >> /tmp/gc-cron.log 2>&1"
    )
    entries.append((int(hour), int(minute), f"{minute} {hour} {dom} {month} {dow}   {curl}"))

entries.sort()

lines = [
    "# Ground Control scheduled jobs -- auto-generated from ground-control.config.ts",
    "# Regenerate with: cd ~/Projects/ground-control && python3 scripts/sync-crontab.py",
    "",
]
for _, _, line in entries:
    lines.append(line)

output = "\n".join(lines) + "\n"

print(f"{len(entries)} jobs from config ({len([e for e in entries])} enabled)")
if dry_run:
    print("\n--- DRY RUN (not installing) ---\n")
    print(output)
else:
    subprocess.run(["crontab", "-"], input=output.encode(), check=True)
    print("Crontab installed.")
