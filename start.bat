@echo off
chcp 65001 >nul
title 压测日志管理系统

:: ============================================
::  配置：修改下面这行为你的 log_stash_agent 安装路径
:: ============================================
set LOGSTASH_DIR=%~dp0

:: ============================================
echo.
echo   ╔════════════════════════════════════════╗
echo   ║    压测日志管理系统 v0.1               ║
echo   ╚════════════════════════════════════════╝
echo.

cd /d "%LOGSTASH_DIR%"

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装: https://nodejs.org
    pause
    exit /b 1
)

:: 自动编译
if not exist "dist\main.js" (
    echo [1/2] 正在编译...
    call npm install --silent
    call npm run build
    if %errorlevel% neq 0 (
        echo [错误] 编译失败
        pause
        exit /b 1
    )
)

echo [启动] 正在启动 Web 服务...
echo.
echo   浏览器将自动打开 http://localhost:3000
echo   按 Ctrl+C 停止服务
echo.

start http://localhost:3000
node dist/main.js serve --port 3000
pause
