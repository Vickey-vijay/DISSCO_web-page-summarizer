@echo off
rem ==========================================================================
rem  Page Summarizer - setup (V2, local model)
rem  Double-click this file once. It checks everything the extension needs and
rem  tells you in plain English what to do if something is missing.
rem
rem  Options (for developers):
rem    setup.bat --dev      also install the test tools (needs Node.js 20 or newer)
rem    setup.bat --gpu      set Chrome to use the separate graphics card (asks Windows; undo with scripts\set-chrome-gpu.ps1 -Remove)
rem    setup.bat --reset    delete node_modules and the setup marker, then set up again
rem  Set SETUP_NOPAUSE=1 to skip the final pause (used by automated runs only).
rem ==========================================================================
setlocal EnableExtensions
cd /d "%~dp0"

set "LOG=%~dp0setup.log"
set "MARKER=%~dp0.setup-ok"
set "DEV=0"
set "RESET=0"
set "GPU=0"
set "CHROME="
set "FAIL_WHAT="
set "FAIL_FIX="

for %%A in (%*) do (
  if /i "%%A"=="--dev" set "DEV=1"
  if /i "%%A"=="--reset" set "RESET=1"
  if /i "%%A"=="--gpu" set "GPU=1"
)

> "%LOG%" echo Page Summarizer setup log
>> "%LOG%" echo Started: %date% %time%
>> "%LOG%" echo Folder: %~dp0

call :say "Page Summarizer (Version 2) - setup"
call :say "Details are written to setup.log in this folder."
call :say ""

if "%RESET%"=="1" call :do_reset

rem ---- Step 1: Google Chrome -------------------------------------------------
call :say "Step 1 of 5: looking for Google Chrome..."
call :find_chrome
if not defined CHROME (
  set "FAIL_WHAT=Google Chrome was not found on this computer."
  set "FAIL_FIX=Install Chrome from https://www.google.com/chrome and then run setup.bat again."
  goto :fail
)
call :say "  Found: %CHROME%"

rem ---- Step 2: Chrome version ------------------------------------------------
call :say "Step 2 of 5: checking the Chrome version..."
call :check_chrome_version
if errorlevel 1 goto :fail

rem ---- Step 3: extension files ----------------------------------------------
call :say "Step 3 of 5: checking the extension files..."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-extension.ps1" -LogFile "%LOG%"
if errorlevel 1 (
  set "FAIL_WHAT=The extension files are incomplete or damaged (see the message above)."
  set "FAIL_FIX=Download or clone the project again so that the whole folder is present, then run setup.bat again."
  goto :fail
)

rem ---- Step 4: graphics card, memory and disk space --------------------------
call :say "Step 4 of 5: looking at this computer (graphics card, memory, free disk space)..."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-computer.ps1" -LogFile "%LOG%"
if errorlevel 1 (
  set "FAIL_WHAT=There is not enough free disk space for the model."
  set "FAIL_FIX=Free at least 3 GB on the C: drive (the model is about 700 MB and Chrome keeps it on this drive), then run setup.bat again."
  goto :fail
)
if "%GPU%"=="1" call :set_gpu
rem ---- Step 4: developer tools (optional) -----------------------------------
if "%DEV%"=="0" (
  call :say "Step 5 of 5: test tools skipped. You do not need them to use the extension."
  call :say "  Developers: run  setup.bat --dev  to install the test tools."
  goto :done
)

call :say "Step 5 of 5: installing the developer test tools..."
where node >nul 2>nul
if errorlevel 1 (
  set "FAIL_WHAT=Node.js was not found, and the developer tools need it."
  set "FAIL_FIX=Install Node.js 20 or newer (LTS) from https://nodejs.org, tick the option to add it to PATH, close this window, then run setup.bat --dev again."
  goto :fail
)
call :check_node_version
if errorlevel 1 goto :fail

call :npm_install
if errorlevel 1 (
  set "FAIL_WHAT=npm install failed after 3 tries (see setup.log)."
  set "FAIL_FIX=Check your internet connection and run setup.bat --dev again. If it keeps failing, run setup.bat --dev --reset to rebuild from scratch."
  goto :fail
)
call :playwright_install
if errorlevel 1 (
  set "FAIL_WHAT=Downloading the test browser failed after 3 tries (see setup.log)."
  set "FAIL_FIX=Check your internet connection and run setup.bat --dev again. It needs about 200 MB of free disk space."
  goto :fail
)

:done
> "%MARKER%" echo CHROME=%CHROME%
>> "%MARKER%" echo DATE=%date% %time%
call :say ""
call :say "SETUP COMPLETE."
call :say "Next step: double-click run.bat"
call :end_pause
exit /b 0

rem ---- failure ---------------------------------------------------------------
:fail
if exist "%MARKER%" del "%MARKER%" >nul 2>nul
call :say ""
call :say "SETUP FAILED."
call :say "What failed: %FAIL_WHAT%"
call :say "How to fix:  %FAIL_FIX%"
call :say "The full log is in setup.log. Send that file to the developer if you are stuck."
call :end_pause
exit /b 1

rem ---- helpers ---------------------------------------------------------------
:say
echo.%~1
>> "%LOG%" echo [%time%] %~1
goto :eof

:end_pause
if "%SETUP_NOPAUSE%"=="1" goto :eof
echo.
pause
goto :eof

:set_gpu
call :say "  --gpu was given: asking Windows to run Chrome on the separate graphics card..."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\set-chrome-gpu.ps1" -ChromePath "%CHROME%" -LogFile "%LOG%"
if errorlevel 1 call :say "  The graphics setting was NOT changed (see the message above). Setup goes on; the extension works without it, only slower."
goto :eof
:find_chrome
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
  if not defined CHROME if exist %%P set "CHROME=%%~P"
)
if defined CHROME goto :eof
for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul') do set "CHROME=%%B"
if defined CHROME if not exist "%CHROME%" set "CHROME="
goto :eof

rem The two version checks avoid if-blocks on purpose: a variable that is set inside a
rem parenthesised block cannot be read again in the same block.
:check_chrome_version
set "CHROME_VER="
set "CHROME_MAJOR="
for /f "tokens=3" %%V in ('reg query "HKCU\Software\Google\Chrome\BLBeacon" /v version 2^>nul') do set "CHROME_VER=%%V"
if not defined CHROME_VER goto :cv_unknown
for /f "delims=." %%M in ("%CHROME_VER%") do set "CHROME_MAJOR=%%M"
call :say "  Chrome version %CHROME_VER%"
if %CHROME_MAJOR% lss 116 goto :cv_old
exit /b 0
:cv_unknown
call :say "  Could not read the Chrome version. Continuing; the extension needs Chrome 116 or newer."
exit /b 0
:cv_old
set "FAIL_WHAT=Chrome %CHROME_VER% is too old. The extension needs Chrome 116 or newer."
set "FAIL_FIX=Open Chrome, go to chrome://settings/help, let it update, restart Chrome, then run setup.bat again."
exit /b 1

:check_node_version
set "NODE_MAJOR="
for /f "tokens=1 delims=." %%N in ('node -v') do set "NODE_MAJOR=%%N"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
call :say "  Node.js major version %NODE_MAJOR%"
if %NODE_MAJOR% lss 20 goto :nv_old
exit /b 0
:nv_old
set "FAIL_WHAT=Node.js %NODE_MAJOR% is too old. Version 20 or newer is needed."
set "FAIL_FIX=Install the current LTS version from https://nodejs.org and then run setup.bat --dev again."
exit /b 1

:do_reset
call :say "Reset requested: removing node_modules and the setup marker..."
if exist "%~dp0node_modules" rmdir /s /q "%~dp0node_modules"
if exist "%MARKER%" del "%MARKER%"
call :say "  Done. Setting up from scratch."
call :say ""
goto :eof

:npm_install
set /a TRY=0
:npm_install_try
set /a TRY+=1
call :say "  npm install (try %TRY% of 3)..."
call npm install >> "%LOG%" 2>&1
if not errorlevel 1 goto :eof
if %TRY% lss 3 (
  call :say "  That failed, probably the network. Waiting 5 seconds, then trying again..."
  timeout /t 5 /nobreak >nul
  goto :npm_install_try
)
exit /b 1

:playwright_install
set /a TRY=0
:playwright_install_try
set /a TRY+=1
call :say "  Downloading the test browser (try %TRY% of 3, about 200 MB)..."
call npx playwright install chromium >> "%LOG%" 2>&1
if not errorlevel 1 goto :eof
if %TRY% lss 3 (
  call :say "  That failed, probably the network. Waiting 5 seconds, then trying again..."
  timeout /t 5 /nobreak >nul
  goto :playwright_install_try
)
exit /b 1
