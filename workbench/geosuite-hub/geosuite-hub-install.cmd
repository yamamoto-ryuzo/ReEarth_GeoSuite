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
rem It also launches the viewer shell server on 8515 (PowerShell, hidden).
>  "%DIR%\run-hidden.vbs" echo Set fso = CreateObject^("Scripting.FileSystemObject"^)
>> "%DIR%\run-hidden.vbs" echo dir = fso.GetParentFolderName^(WScript.ScriptFullName^)
>> "%DIR%\run-hidden.vbs" echo Set sh = CreateObject^("Wscript.Shell"^)
>> "%DIR%\run-hidden.vbs" echo sh.Environment^("PROCESS"^)^("BRIDGE_HUB_PORT"^) = "8514"
>> "%DIR%\run-hidden.vbs" echo sh.Run """" ^& dir ^& "\geosuite-hub.exe"" --serve", 0, False
>> "%DIR%\run-hidden.vbs" echo sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """" ^& dir ^& "\serve-viewer.ps1""", 0, False

rem --- 2.5 viewer shell server (:8515) — embedded as base64 -------------
set "PS1B64=IyBnZW9zdWl0ZS1odWIgdmlld2VyIHNlcnZlciDigJQgc2VydmVzIHRoZSBHZW9TdWl0ZSB2aWV3ZXIgc2hlbGwgb24gMTI3LjAuMC4xOjg1MTUKIyBPbmUgZmlsZTogYW55IEdFVCByZXR1cm5zIHRoZSBzYW1lIEhUTUw7ID91cmw9PHNjZW5lPiBpcyBoYW5kbGVkIGNsaWVudC1zaWRlLgokcG9ydCA9IDg1MTUKJGh0bWwgPSBAJwo8IURPQ1RZUEUgaHRtbD4KPGh0bWwgbGFuZz0iamEiPjxoZWFkPjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij48dGl0bGU+R2VvU3VpdGUgVmlld2VyPC90aXRsZT4KPHN0eWxlPmh0bWwsYm9keXttYXJnaW46MDtoZWlnaHQ6MTAwJTtmb250LWZhbWlseTpzYW5zLXNlcmlmfWlmcmFtZXtib3JkZXI6MDt3aWR0aDoxMDAlO2hlaWdodDoxMDB2aDtkaXNwbGF5OmJsb2NrfSNlbXB0eXtwYWRkaW5nOjNlbSAyZW07Y29sb3I6IzQ0NDttYXgtd2lkdGg6NjQwcHh9PC9zdHlsZT4KPC9oZWFkPjxib2R5PjxkaXYgaWQ9ImFwcCI+PC9kaXY+CjxzY3JpcHQ+CnZhciB1PW5ldyBVUkxTZWFyY2hQYXJhbXMobG9jYXRpb24uc2VhcmNoKS5nZXQoJ3VybCcpOwp2YXIgYT1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBwJyk7CmlmKHUpe3ZhciBmPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO2Yuc3JjPXU7Zi5hbGxvdz0nY2xpcGJvYXJkLXdyaXRlOyBmdWxsc2NyZWVuOyBnZW9sb2NhdGlvbic7ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChmKTtkb2N1bWVudC50aXRsZT0nR2VvU3VpdGUgVmlld2VyJzt9CmVsc2V7YS5pbm5lckhUTUw9JzxkaXYgaWQ9ImVtcHR5Ij48aDI+R2VvU3VpdGUgVmlld2VyPC9oMj48cD48Y29kZT5nZW9zdWl0ZS1odWI6Ly9vcGVuP3VybD0mbHQ7c2NlbmUgVVJMJmd0OzwvY29kZT4g44Gn44K344O844Oz44KS6ZaL44GE44Gm44GP44Gg44GV44GE44CCPC9wPjxwPmh1YjogPGEgaHJlZj0iaHR0cDovLzEyNy4wLjAuMTo4NTE0LyI+MTI3LjAuMC4xOjg1MTQgKHN0YXR1cyk8L2E+PC9wPjwvZGl2Pic7fQo8L3NjcmlwdD48L2JvZHk+PC9odG1sPgonQAokbCA9IE5ldy1PYmplY3QgU3lzdGVtLk5ldC5Tb2NrZXRzLlRjcExpc3RlbmVyKFtTeXN0ZW0uTmV0LklQQWRkcmVzc106Okxvb3BiYWNrLCAkcG9ydCkKJGwuU3RhcnQoKQp3aGlsZSAoJHRydWUpIHsKICAkYyA9ICRsLkFjY2VwdFRjcENsaWVudCgpCiAgdHJ5IHsKICAgICRzID0gJGMuR2V0U3RyZWFtKCkKICAgICRidWYgPSBOZXctT2JqZWN0IGJ5dGVbXSA4MTkyCiAgICAkbiA9ICRzLlJlYWQoJGJ1ZiwgMCwgODE5MikKICAgIGlmICgkbiAtZ3QgMCkgewogICAgICAkYm9keSA9IFtUZXh0LkVuY29kaW5nXTo6VVRGOC5HZXRCeXRlcygkaHRtbCkKICAgICAgJGhkciA9ICJIVFRQLzEuMSAyMDAgT0tgcmBuQ29udGVudC1UeXBlOiB0ZXh0L2h0bWw7IGNoYXJzZXQ9dXRmLThgcmBuQ29udGVudC1MZW5ndGg6ICQoJGJvZHkuTGVuZ3RoKWByYG5Db25uZWN0aW9uOiBjbG9zZWByYG5gcmBuIgogICAgICAkaGIgPSBbVGV4dC5FbmNvZGluZ106OlVURjguR2V0Qnl0ZXMoJGhkcikKICAgICAgJHMuV3JpdGUoJGhiLCAwLCAkaGIuTGVuZ3RoKTsgJHMuV3JpdGUoJGJvZHksIDAsICRib2R5Lkxlbmd0aCk7ICRzLkZsdXNoKCkKICAgIH0KICB9IGNhdGNoIHt9CiAgdHJ5IHsgJGMuQ2xvc2UoKSB9IGNhdGNoIHt9Cn0K"
powershell -NoProfile -Command "[IO.File]::WriteAllText('%DIR%\serve-viewer.ps1',[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:PS1B64)))"

rem --- 3. geosuite-hub:// handler shim ---------------------------------
rem All invocations resolve to the viewer shell on :8515 (served by
rem serve-viewer.ps1). ?url= is passed through — the page iframes the scene.
>  "%DIR%\geosuite-hub.cmd" echo @echo off
>> "%DIR%\geosuite-hub.cmd" echo setlocal
>> "%DIR%\geosuite-hub.cmd" echo set "ARG=%%~1"
>> "%DIR%\geosuite-hub.cmd" echo set "BRIDGE_HUB_PORT=8514"
>> "%DIR%\geosuite-hub.cmd" echo set "EXE=%%~dp0geosuite-hub.exe"
>> "%DIR%\geosuite-hub.cmd" echo if not "%%ARG:url=%%"=="%%ARG%%" (set "VIEW=%%ARG:geosuite-hub:=http://127.0.0.1:8515%%") else (set "VIEW=http://127.0.0.1:8515/")
>> "%DIR%\geosuite-hub.cmd" echo if exist "%%EXE%%" (start "" "%%EXE%%" --view "%%VIEW%%") else (start "" "http://127.0.0.1:8515/")

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

rem --- 5. start hub+viewer now (skip if both already answering) ---------
set "UP="
curl -fs -m 2 "%HUBURL%/health" >nul 2>&1 && curl -fs -m 2 "http://127.0.0.1:8515/" >nul 2>&1 && set "UP=1"
if not defined UP if exist "%HUBEXE%" start "" wscript.exe "%DIR%\run-hidden.vbs"

echo geosuite-hub installed: geosuite-hub.exe on 8514 + viewer on 8515 + autostart + geosuite-hub:// protocol
pause
