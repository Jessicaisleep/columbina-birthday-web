@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 goto node_missing

where npm.cmd >nul 2>nul
if errorlevel 1 goto npm_missing

if not exist "node_modules\vite\package.json" goto install_packages
goto start_project

:install_packages
echo Installing project packages. Please wait...
call npm.cmd install
if errorlevel 1 goto install_failed

:start_project
echo Starting Columbina Dream Arcade...
echo Close this window to stop the local server.
call npm.cmd run dev -- --host 127.0.0.1 --open
goto finished

:node_missing
echo Node.js was not found. Install Node.js 20 or newer first.
goto failed

:npm_missing
echo npm was not found. Reinstall Node.js with npm enabled.
goto failed

:install_failed
echo Package installation failed. Check the network and try again.
goto failed

:failed
pause
exit /b 1

:finished
endlocal
