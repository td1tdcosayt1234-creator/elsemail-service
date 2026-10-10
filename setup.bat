@echo off
REM ElseMail one-click setup (new PC). No secrets in this file.
REM After this: edit .env, copy dkim-private.pem, then run start-smtp-pc.bat
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 18+ required - install from https://nodejs.org/
  pause
  exit /b 1
)
echo [1/4] npm install...
call npm install --no-audit --no-fund
echo [2/4] .env...
if not exist .env (
  copy .env.example .env
  echo   created .env - EDIT IT (PORT, EMAIL_FROM, SERVICE_API_KEY, TEMP_OPEN)
) else (
  echo   .env exists - skipped
)
echo [3/4] frontend build...
call npm run web:build
echo [4/4] checks...
if not exist scripts\dkim-private.pem (
  echo   WARNING: scripts\dkim-private.pem missing - copy it from the old PC
  echo   (or generate a new pair, see SETUP.md section 4)
) else (
  echo   DKIM key present
)
echo.
echo Done. Next: read SETUP.md, then run start-smtp-pc.bat
pause
