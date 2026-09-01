# Desktop Controls Launcher — Mobile for `Desktop\Controls`

Mobile web panel for `C:\Users\User\Desktop\Controls` (8 shortcuts + GIT_P4_Link). Tap to RUN or TOGGLE.

**URL (phone on Tailscale):** `http://100.99.206.17:3157`  
**Local:** `http://127.0.0.1:3157` / `http://192.168.1.113:3157`

## Features
- **Real ON/OFF for OpenChamber Server** — not just firing the `.lnk` blindly. Status via `Get-NetTCPConnection -LocalPort 3000 -State Listen` + `openchamber stop` / `openchamber --lan --port 3000 --ui-password ...` with port verification after. Green RUNNING / Red STOPPED.
- **Helpers (Blender Local/Server, Houdini)** — toggle via lock files `%TEMP%\.blender-helper*.lock` + PID alive check. Start hidden `powershell -WindowStyle Hidden -File Helper.ps1`, stop via `Stop-Process -Id lockPid -Force`.
- **MCP Orphan Cleanup** — blocked when any `opencode.exe serve` running (safety gate, PID-targeted `cleanup_orphan_mcp.ps1`).
- **One-shot** — Vault Reindex, GIT_P4_Link robocopy, Helper Dashboard via `WScript.Shell` hidden.

## Run
```
node server.js
# auto-start via Startup: %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Desktop Controls Launcher.lnk
```

## API
- `GET /api/items` — scan Controls
- `GET /api/status` — all toggle states
- `POST /api/toggle {id}` — toggle OpenChamber / helpers
- `POST /api/run {id}` — one-shot
