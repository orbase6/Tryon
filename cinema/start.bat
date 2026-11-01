@echo off
REM Lumen: get the latest code, start the server and open the browser.
REM Double-click this file, or run "start.bat" from a terminal inside the cinema folder.
title Lumen Cinemas
cd /d "%~dp0"
echo.
echo  Getting the latest Lumen code...
git pull origin claude/virtual-tryon-fashion-store-hjuwq9
if errorlevel 1 (
  echo.
  echo  Could not get the latest code. Starting the version you already have.
  echo  If this keeps happening, run "git status" in this folder and send a screenshot.
)
echo.
echo  Starting Lumen on http://127.0.0.1:5500  (close this window to stop it)
start "" http://127.0.0.1:5500
node server.js
echo.
echo  Lumen stopped. If you saw "EADDRINUSE", Lumen is already running in another window.
pause
