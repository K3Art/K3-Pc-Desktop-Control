# Desktop Controls Launcher — Mobile for `Desktop\Controls`

Mobile web panel for `C:\Users\Kim\Desktop\Controls` (8 shortcuts + GIT_P4_Link). Tap to RUN or TOGGLE.

**Private URL (phone or PC on Tailscale):** `https://kimpc.tail91f061.ts.net:8444`  
The old network HTTP address is disabled. The backend listens only on `127.0.0.1:3157` and requires pairing even on loopback.

## Pair a device

**Replaced by password sign-in (27 Oct 2026).** Open `Desktop\Controls\Set Controls Password.cmd` locally, or `Set Hive and Controls Passwords.cmd` to configure both services. Then sign in at the private HTTPS address. Select **Remember this device for 30 days** for a persistent secure session; the password is not stored by the web app in the browser. Without it, sign-ins last eight hours with a browser-session cookie. Remembered sessions survive restarts; changing the password revokes them. Use **Sign out** to revoke this browser. Ten sign-in attempts per 15 minutes are allowed service-wide. Old code issuance/pair endpoints are disabled in production password mode. The following pairing steps are historical, not current instructions.

1. On the PC, open `Desktop\Controls\Pair K3 Controls.cmd`.
2. Enter the one-use code on the HTTPS pairing screen within five minutes. Eight incorrect attempts exhaust the code; run the command again for a new one.
3. Sessions expire after eight hours; restarting the dashboard revokes all sessions. Pair again when prompted. The local pairing helper's key is Windows-user-protected and the pairing code is never sent to the dashboard logs.
4. The Hive Mobile switch starts or stops the existing Hive mobile service in the background; no console must remain open. Stopping signs out Hive devices and can interrupt active work. Hive's own pairing is separate: when needed, open `Desktop\Controls\Pair Hive Mobile.cmd` briefly to get its one-time code.

The dashboard's HTTPS proxy is Tailscale Serve `:8444` → loopback `:3157`. Existing Workspace `:443` and Hive `:8443` routes remain separate. The former HTTP PWA shortcut must be replaced with the new HTTPS address.

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
