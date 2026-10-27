# Desktop Controls Launcher — Mobile for `Desktop\Controls`

Mobile web panel for `C:\Users\Kim\Desktop\Controls` (8 shortcuts + GIT_P4_Link). Tap to RUN or TOGGLE.

**URL (phone on Tailscale):** `http://100.92.107.30:3157`  
**Local:** `http://127.0.0.1:3157`

## Features
- **Real ON/OFF for OpenChamber Server** — not just firing the `.lnk` blindly. Status via `Get-NetTCPConnection -LocalPort 3000 -State Listen` + `openchamber stop` / `openchamber --lan --port 3000 --ui-password ...` with port verification after. Green RUNNING / Red STOPPED.
- **Helpers (Blender Local/Server, Houdini)** — toggle via lock files `%TEMP%\.blender-helper*.lock` + PID alive check. Start hidden `powershell -WindowStyle Hidden -File Helper.ps1`, stop via `Stop-Process -Id lockPid -Force`.
- **MCP Orphan Cleanup** — blocked when any `opencode.exe serve` running (safety gate, PID-targeted `cleanup_orphan_mcp.ps1`).
- **K3 Review Server** — toggle for the K3 AI Workspace review API on `:8901` (`K3-Review-Server.ps1`), which powers the Approve/Reject/Comment buttons on workspace cards. Auto-starts at logon via the `K3-Review-Server` scheduled task and on launcher boot.
- **One-shot** — Vault Reindex, GIT_P4_Link robocopy, Helper Dashboard via `WScript.Shell` hidden.

## Run
```
node server.js
# auto-start: Scheduled Task "DesktopControlsLauncher" runs run-hidden.vbs -> run-forever.ps1
# run-forever.ps1 is a single-instance watchdog: restarts node on :3157 if it stops
```

## API
- `GET /api/items` — scan Controls
- `GET /api/status` — all toggle states
- `POST /api/toggle {id}` — toggle OpenChamber / helpers / review server (`review-server`)
- `POST /api/run {id}` — one-shot

## Review server (:8901)

The K3 AI Workspace review API — `E:\Git\AI_SYSTEMS\K3-AI-Workspace-Master\K3-AI-Workspace\workspace\_shared\k3-review-server.mjs`.
Helper: `D:\Nextcloud\_AI_SYSTEMS\tools\_Control\K3-Review-Server.ps1` (`-Stop`, `-Status`).
Auto-start: scheduled task **K3-Review-Server** (`wscript` → `K3-Review-Server.vbs` → helper) at logon, plus an idempotent ensure on launcher boot.
