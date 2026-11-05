@echo off
rem geosuite-hub unified installer for Re:Earth GeoSuite.
rem One run installs the GeoSuite-dedicated hub: geosuite-hub.exe (renamed
rem bridge-hub binary) on port 8514 + logon autostart + the geosuite-hub://
rem URL protocol (HKCU, no admin required). KASUGAI's shared bridge-hub on
rem 8511 is NOT used and NOT touched.
setlocal EnableDelayedExpansion

rem --- 0. layout -------------------------------------------------------
set "DIR=%LOCALAPPDATA%\geosuite-hub"
set "HUBEXE=%DIR%\geosuite-hub.exe"
set "HUBURL=http://127.0.0.1:8514"
if not exist "%DIR%" mkdir "%DIR%"

rem --- 1. hub binary: prefer an installed bridge-hub.exe, else CDN -----
if not exist "%HUBEXE%" (
  if exist "%LOCALAPPDATA%\kasugai\bridge-hub\bridge-hub.exe" (
    echo copying installed bridge-hub.exe -^> geosuite-hub.exe
    copy /y "%LOCALAPPDATA%\kasugai\bridge-hub\bridge-hub.exe" "%HUBEXE%" >nul
  ) else (
    set "DL=%TEMP%\geosuite-hub-dl"
    if not exist "!DL!" mkdir "!DL!"
    echo downloading bridge-hub.zip ...
    curl -fsSL -o "!DL!\bridge-hub.zip" "https://yamamoto-ryuzo.github.io/kasugai-canvas-web/stable/download/bridge-hub.zip"
    if exist "!DL!\bridge-hub.zip" tar -xf "!DL!\bridge-hub.zip" -C "!DL!"
    for /f "delims=" %%f in ('dir /b /s "!DL!\bridge-hub.exe" 2^>nul') do (
      if not exist "%HUBEXE%" copy /y "%%f" "%HUBEXE%" >nul
    )
  )
)

rem --- 2. hidden autostart (Run key + wscript launcher, no console) ----
rem The vbs sets BRIDGE_HUB_PORT=8514 for the child process — with the env
rem set, the binary skips its self-install/legacy-cleanup path entirely.
>  "%DIR%\run-hidden.vbs" echo Set fso = CreateObject^("Scripting.FileSystemObject"^)
>> "%DIR%\run-hidden.vbs" echo dir = fso.GetParentFolderName^(WScript.ScriptFullName^)
>> "%DIR%\run-hidden.vbs" echo Set sh = CreateObject^("Wscript.Shell"^)
>> "%DIR%\run-hidden.vbs" echo sh.Environment^("PROCESS"^)^("BRIDGE_HUB_PORT"^) = "8514"
>> "%DIR%\run-hidden.vbs" echo sh.Run """" ^& dir ^& "\geosuite-hub.exe"" --serve", 0, False

rem --- 3. geosuite-hub:// handler shim ---------------------------------
rem bare `open` (no ?url=) -> geosuite-hub's own status page (:8514).
rem The binary's built-in bare-open fallback is hardcoded to 8511.
>  "%DIR%\geosuite-hub.cmd" echo @echo off
>> "%DIR%\geosuite-hub.cmd" echo setlocal
>> "%DIR%\geosuite-hub.cmd" echo set "ARG=%%~1"
>> "%DIR%\geosuite-hub.cmd" echo set "BRIDGE_HUB_PORT=8514"
>> "%DIR%\geosuite-hub.cmd" echo set "EXE=%%~dp0geosuite-hub.exe"
>> "%DIR%\geosuite-hub.cmd" echo if not "%%ARG:url=%%"=="%%ARG%%" (set "VIEW=%%ARG:geosuite-hub:=kasugai-hub:%%") else (set "VIEW=%HUBURL%/")
>> "%DIR%\geosuite-hub.cmd" echo if exist "%%EXE%%" (start "" "%%EXE%%" --view "%%VIEW%%") else (start "" "%HUBURL%/")

rem --- 4. registration: geosuite-hub:// + logon Run key (.reg import) --
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
echo.
echo [HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run]
echo "geosuite-hub"="wscript.exe \"%DIR_ESC%\\run-hidden.vbs\""
) > "%REG%"
reg import "%REG%" >nul && del "%REG%"

rem --- 5. start the hub now (skip if already answering) -----------------
if exist "%HUBEXE%" (
  curl -fs -m 2 "%HUBURL%/health" >nul 2>&1 || start "" wscript.exe "%DIR%\run-hidden.vbs"
)

echo geosuite-hub installed: geosuite-hub.exe on 8514 + autostart + geosuite-hub:// protocol
pause
