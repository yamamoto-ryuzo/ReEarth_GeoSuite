@echo off
rem geosuite-hub unified installer for Re:Earth GeoSuite.
rem One run does everything: bridge-hub download + self-install, plus the
rem geosuite-hub:// URL protocol registration (HKCU, no admin required).
setlocal EnableDelayedExpansion

rem --- 1. bridge-hub (skip if already installed) ------------------------
set "HUBEXE=%LOCALAPPDATA%\kasugai\bridge-hub\bridge-hub.exe"
if not exist "%HUBEXE%" (
  set "DL=%TEMP%\geosuite-hub-dl"
  if not exist "!DL!" mkdir "!DL!"
  echo downloading bridge-hub.zip ...
  curl -fsSL -o "!DL!\bridge-hub.zip" "https://yamamoto-ryuzo.github.io/kasugai-canvas-web/stable/download/bridge-hub.zip"
  if exist "!DL!\bridge-hub.zip" tar -xf "!DL!\bridge-hub.zip" -C "!DL!"
  for /f "delims=" %%f in ('dir /b /s "!DL!\bridge-hub.exe" 2^>nul') do (
    if not exist "%HUBEXE%" start "" /wait "%%f"
  )
)

rem --- 2. geosuite-hub:// handler shim ----------------------------------
set "DIR=%LOCALAPPDATA%\geosuite-hub"
if not exist "%DIR%" mkdir "%DIR%"
>  "%DIR%\geosuite-hub.cmd" echo @echo off
>> "%DIR%\geosuite-hub.cmd" echo setlocal
>> "%DIR%\geosuite-hub.cmd" echo set "ARG=%%~1"
>> "%DIR%\geosuite-hub.cmd" echo set "ARG=%%ARG:geosuite-hub:=kasugai-hub:%%"
>> "%DIR%\geosuite-hub.cmd" echo set "EXE=%%LOCALAPPDATA%%\kasugai\bridge-hub\bridge-hub.exe"
>> "%DIR%\geosuite-hub.cmd" echo if exist "%%EXE%%" (start "" "%%EXE%%" --view "%%ARG%%") else (start "" "http://127.0.0.1:8511/")

rem --- 3. protocol registration (.reg import keeps quoting sane) --------
set "DIR_ESC=%DIR:\=\\%"
set "REG=%TEMP%\geosuite-hub-register.reg"
(
echo Windows Registry Editor Version 5.00
echo.
echo [HKEY_CURRENT_USER\Software\Classes\geosuite-hub]
echo @="URL:GeoSuite Hub Protocol"
echo "URL Protocol"=""
echo.
echo [HKEY_CURRENT_USER\Software\Classes\geosuite-hub\shell\open\command]
echo @="\"%DIR_ESC%\\geosuite-hub.cmd\" \"%%1\""
) > "%REG%"
reg import "%REG%" >nul && del "%REG%"

echo geosuite-hub installed: bridge-hub + geosuite-hub:// protocol
pause
