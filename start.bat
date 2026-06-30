@echo off
title LogStash

set LOGSTASH_DIR=%~dp0

cd /d "%LOGSTASH_DIR%"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install: https://nodejs.org
    pause
    exit /b 1
)

echo [BUILD] Compiling...
call npm install --silent
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo [START] Starting Web server at http://localhost:3000
echo Press Ctrl+C to stop

start http://localhost:3000
node dist/main.js serve --port 3000
pause
