@echo off
rem ==========================================================================
rem  Page Summarizer - run (V1)
rem  Double-click after setup.bat. Chrome no longer lets a script load an
rem  extension by itself, so this opens Chrome's extensions page and shows the
rem  four steps to load it. Set RUN_NOPAUSE=1 to skip the pause and RUN_NOCLIP=1 to skip the clipboard (automated runs).
rem ==========================================================================
setlocal EnableExtensions
cd /d "%~dp0"

set "MARKER=%~dp0.setup-ok"
set "CHROME="

if not exist "%MARKER%" (
  echo.
  echo Setup has not been completed yet.
  echo Please double-click setup.bat first, wait for "SETUP COMPLETE", then run this file again.
  call :end_pause
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%MARKER%") do (
  if /i "%%A"=="CHROME" set "CHROME=%%B"
)
if not defined CHROME goto :stale
if not exist "%CHROME%" goto :stale

if not exist "%~dp0manifest.json" (
  echo.
  echo manifest.json is missing from this folder, so there is nothing to load.
  echo Download or clone the project again, then run setup.bat.
  call :end_pause
  exit /b 1
)

set "EXT=%~dp0"
if "%EXT:~-1%"=="\" set "EXT=%EXT:~0,-1%"

rem Put the folder path on the clipboard so it can be pasted into the "Load unpacked" dialog.
if not "%RUN_NOCLIP%"=="1" <nul set /p ="%EXT%" | clip

start "" "%CHROME%" chrome://extensions
timeout /t 2 /nobreak >nul
start "" "%CHROME%" https://en.wikipedia.org/wiki/Lighthouse

echo.
echo Chrome is opening the extensions page and a sample article.
echo.
echo   1. On the extensions page, turn on "Developer mode" (top right).
echo   2. Click "Load unpacked", paste this folder path (it is already on your clipboard)
echo      and press Select Folder:
echo         %EXT%
echo   3. Click the puzzle-piece icon in Chrome and pin "Page Summarizer".
echo   4. Click the Page Summarizer icon, paste your Gemini API key in the Key box, then Save key
echo      (free key: https://aistudio.google.com/apikey) and click Save.
echo.
echo Then open any article, click the Page Summarizer icon and press "Summarize this page".
call :end_pause
exit /b 0

:stale
echo.
echo The setup record is out of date (Chrome was moved or removed).
echo Please run setup.bat again.
call :end_pause
exit /b 1

:end_pause
if "%RUN_NOPAUSE%"=="1" goto :eof
echo.
pause
goto :eof
