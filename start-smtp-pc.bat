@echo off
REM Elsemail PC SMTP server - double-click to start both services
REM SMTP: 127.0.0.1:587 | Inbox: http://localhost:8025/ | API: http://localhost:3000/health
cd /d "%~dp0"
set SMTP_PORT=587
set SMTP_HTTP_PORT=8025
set ENABLE_MX_DELIVERY=true
set MAIL_DOMAIN=elsemail.indevs.in
set MAIL_HOSTNAME=elsemail.indevs.in
start "elsemail-smtp" node src\mail-server.js
timeout /t 3 /nobreak >nul
start "elsemail-api" node src\index.js
echo.
echo [OK] SMTP: 127.0.0.1:587 ^| Inbox: http://localhost:8025/ ^| API: http://localhost:3000/health
pause
