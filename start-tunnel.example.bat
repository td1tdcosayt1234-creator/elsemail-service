@echo off
REM Elsemail Cloudflare Tunnel - keeps public URLs alive. Auto-started at logon.
REM
REM Setup:
REM   1. Download cloudflared.exe into this folder (or make sure it is in PATH).
REM   2. copy start-tunnel.example.bat start-tunnel.bat
REM   3. Set your tunnel token:  setx CF_TUNNEL_TOKEN "eyJhIjoi..."
REM      (Cloudflare dashboard -> Zero Trust -> Networks -> Tunnels -> token)
REM   4. Double-click start-tunnel.bat (it restarts itself if it ever exits).
setlocal
if "%CF_TUNNEL_TOKEN%"=="" (
  echo ERROR: CF_TUNNEL_TOKEN is not set. Run: setx CF_TUNNEL_TOKEN "your-token"
  pause
  exit /b 1
)
cd /d "%~dp0"
:loop
cloudflared.exe tunnel --no-autoupdate --protocol http2 run --token %CF_TUNNEL_TOKEN%
echo Tunnel exited, restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop
