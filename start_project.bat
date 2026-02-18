@echo off
echo ==========================================
echo       SYNOX - STARTING PROJECT
echo ==========================================

echo [1/2] Starting Signaling Server (for Video)...
start "Signaling Server" cmd /k "cd signaling && npm install && node server.js"

echo [2/2] Starting Frontend Application...
start "SYNOX Frontend" cmd /k "cd frontend && npm install && npm run dev"

echo.
echo ==========================================
echo Project launched! 
echo 1. Check the "Signaling Server" window for logs
echo 2. Check the "SYNOX Frontend" window for the localhost URL
echo.
echo You can close this window now.
pause
