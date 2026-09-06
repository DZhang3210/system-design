@echo off
cd /d "%~dp0viewer-app"

if exist node_modules goto :run
echo Installing dependencies (first run only)...
call npm install

:run
start "Vault Viewer" cmd /k node server.js
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:4173"
