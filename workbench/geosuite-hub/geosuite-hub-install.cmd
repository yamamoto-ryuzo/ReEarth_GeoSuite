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
set "PS1B64=IyBnZW9zdWl0ZS1odWIgdmlld2VyIHNlcnZlciDigJQgc2VydmVzIHZpZXdlci5odG1sIG9uIDEyNy4wLjAuMTo4NTE1CiMgQVNDSUktb25seSBzb3VyY2Ugc28gUG93ZXJTaGVsbCBuZXZlciBtaXNyZWFkcyB0aGUgZW5jb2RpbmcuCiMgdmlld2VyLmh0bWwgaXMgcmVhZCBleHBsaWNpdGx5IGFzIFVURi04IChpdCBjb250YWlucyBub24tQVNDSUkgdGV4dCkuCiRwb3J0ID0gODUxNQokZGlyID0gU3BsaXQtUGF0aCAtUGFyZW50ICRNeUludm9jYXRpb24uTXlDb21tYW5kLlBhdGgKJGh0bWwgPSBbSU8uRmlsZV06OlJlYWRBbGxUZXh0KChKb2luLVBhdGggJGRpciAndmlld2VyLmh0bWwnKSwgW1RleHQuRW5jb2RpbmddOjpVVEY4KQokbCA9IE5ldy1PYmplY3QgU3lzdGVtLk5ldC5Tb2NrZXRzLlRjcExpc3RlbmVyKFtTeXN0ZW0uTmV0LklQQWRkcmVzc106Okxvb3BiYWNrLCAkcG9ydCkKJGwuU3RhcnQoKQp3aGlsZSAoJHRydWUpIHsKICAkYyA9ICRsLkFjY2VwdFRjcENsaWVudCgpCiAgdHJ5IHsKICAgICRzID0gJGMuR2V0U3RyZWFtKCkKICAgICRidWYgPSBOZXctT2JqZWN0IGJ5dGVbXSA4MTkyCiAgICAkbiA9ICRzLlJlYWQoJGJ1ZiwgMCwgODE5MikKICAgIGlmICgkbiAtZ3QgMCkgewogICAgICAkYm9keSA9IFtUZXh0LkVuY29kaW5nXTo6VVRGOC5HZXRCeXRlcygkaHRtbCkKICAgICAgJGhkciA9ICJIVFRQLzEuMSAyMDAgT0tgcmBuQ29udGVudC1UeXBlOiB0ZXh0L2h0bWw7IGNoYXJzZXQ9dXRmLThgcmBuQ29udGVudC1MZW5ndGg6ICQoJGJvZHkuTGVuZ3RoKWByYG5Db25uZWN0aW9uOiBjbG9zZWByYG5gcmBuIgogICAgICAkaGIgPSBbVGV4dC5FbmNvZGluZ106OkFTQ0lJLkdldEJ5dGVzKCRoZHIpCiAgICAgICRzLldyaXRlKCRoYiwgMCwgJGhiLkxlbmd0aCk7ICRzLldyaXRlKCRib2R5LCAwLCAkYm9keS5MZW5ndGgpOyAkcy5GbHVzaCgpCiAgICB9CiAgfSBjYXRjaCB7fQogIHRyeSB7ICRjLkNsb3NlKCkgfSBjYXRjaCB7fQp9Cg=="
set "HTMLB64=PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImphIj48aGVhZD48bWV0YSBjaGFyc2V0PSJ1dGYtOCI+PHRpdGxlPkdlb1N1aXRlIFZpZXdlcjwvdGl0bGU+CjxzdHlsZT5odG1sLGJvZHl7bWFyZ2luOjA7aGVpZ2h0OjEwMCU7Zm9udC1mYW1pbHk6c2Fucy1zZXJpZn1pZnJhbWV7Ym9yZGVyOjA7d2lkdGg6MTAwJTtoZWlnaHQ6MTAwdmg7ZGlzcGxheTpibG9ja30jZW1wdHl7cGFkZGluZzozZW0gMmVtO2NvbG9yOiM0NDQ7bWF4LXdpZHRoOjY0MHB4fTwvc3R5bGU+CjwvaGVhZD48Ym9keT48ZGl2IGlkPSJhcHAiPjwvZGl2Pgo8c2NyaXB0Pgp2YXIgdT1uZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCkuZ2V0KCd1cmwnKTsKdmFyIGE9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcCcpOwppZih1KXt2YXIgZj1kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtmLnNyYz11O2YuYWxsb3c9J2NsaXBib2FyZC13cml0ZTsgZnVsbHNjcmVlbjsgZ2VvbG9jYXRpb24nO2RvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZik7ZG9jdW1lbnQudGl0bGU9J0dlb1N1aXRlIFZpZXdlcic7fQplbHNle2EuaW5uZXJIVE1MPSc8ZGl2IGlkPSJlbXB0eSI+PGgyPkdlb1N1aXRlIFZpZXdlcjwvaDI+PHA+PGNvZGU+Z2Vvc3VpdGUtaHViOi8vb3Blbj91cmw9Jmx0O3NjZW5lIFVSTCZndDs8L2NvZGU+IOOBp+OCt+ODvOODs+OCkumWi+OBhOOBpuOBj+OBoOOBleOBhOOAgjwvcD48cD5odWI6IDxhIGhyZWY9Imh0dHA6Ly8xMjcuMC4wLjE6ODUxNC8iPjEyNy4wLjAuMTo4NTE0IChzdGF0dXMpPC9hPjwvcD48L2Rpdj4nO30KPC9zY3JpcHQ+PC9ib2R5PjwvaHRtbD4K"
powershell -NoProfile -Command "[IO.File]::WriteAllBytes('%DIR%\serve-viewer.ps1',[Convert]::FromBase64String($env:PS1B64)); [IO.File]::WriteAllBytes('%DIR%\viewer.html',[Convert]::FromBase64String($env:HTMLB64))"

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
