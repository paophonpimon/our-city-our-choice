@echo off
setlocal

cd /d "%~dp0.."

if "%~1"=="" goto :usage

set "ROOM_CODE=%~1"
set "BOT_COUNT=%~2"
set "INTEGRITY_RATE=%~3"

if not defined BOT_COUNT set "BOT_COUNT=8"
if not defined INTEGRITY_RATE set "INTEGRITY_RATE=0.75"

echo Starting %BOT_COUNT% classroom bots in room %ROOM_CODE%...
echo Integrity answer rate: %INTEGRITY_RATE%
echo Press Ctrl+C to stop the bots.
echo.

node scripts\classroom-bots.mjs ^
  --room "%ROOM_CODE%" ^
  --count "%BOT_COUNT%" ^
  --integrity-rate "%INTEGRITY_RATE%"

exit /b %ERRORLEVEL%

:usage
echo Usage:
echo   scripts\run-classroom-bots.cmd ROOM_CODE [BOT_COUNT] [INTEGRITY_RATE]
echo.
echo Example:
echo   scripts\run-classroom-bots.cmd 0RC1KG 8 0.75
echo.
echo INTEGRITY_RATE is between 0 and 1. Default is 0.75.
exit /b 1
