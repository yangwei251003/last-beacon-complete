@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20+ to run this source project.
  echo If you have already built the offline game, open dist\last-beacon.html.
  pause
  exit /b 1
)
echo The server will print its local address below.
echo Keep this window open while playing. Press Ctrl+C to stop.
node server.mjs
if errorlevel 1 pause
