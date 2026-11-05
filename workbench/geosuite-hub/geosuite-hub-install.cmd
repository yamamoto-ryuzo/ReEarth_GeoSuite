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
set "PS1B64=IyBnZW9zdWl0ZS1odWIgdmlld2VyIHNlcnZlciDigJQgc2VydmVzIHZpZXdlci5odG1sIG9uIDEyNy4wLjAuMTo4NTE1CiMgQVNDSUktb25seSBzb3VyY2Ugc28gUG93ZXJTaGVsbCBuZXZlciBtaXNyZWFkcyB0aGUgZW5jb2RpbmcuCiMgdmlld2VyLmh0bWwgaXMgcmVhZCBleHBsaWNpdGx5IGFzIFVURi04IChpdCBjb250YWlucyBub24tQVNDSUkgdGV4dCkuCiMgUm91dGVzOgojICAgR0VUIC9zY2VuZSAgICAgICAgICAgIC0+IHRleHQvcGxhaW46IGxhc3Qgb3BlbmVkIHNjZW5lIFVSTCAoZW1wdHkgaWYgbm9uZSkKIyAgIEdFVCAvc2NlbmU/c2V0PTxlbmM+ICAtPiBzdG9yZXMgdGhlIFVSTC1kZWNvZGVkIHZhbHVlIGluIHNjZW5lLnR4dAojICAgYW55dGhpbmcgZWxzZSAgICAgICAgIC0+IHZpZXdlci5odG1sCiRwb3J0ID0gODUxNQokZGlyID0gU3BsaXQtUGF0aCAtUGFyZW50ICRNeUludm9jYXRpb24uTXlDb21tYW5kLlBhdGgKJGh0bWwgPSBbSU8uRmlsZV06OlJlYWRBbGxUZXh0KChKb2luLVBhdGggJGRpciAndmlld2VyLmh0bWwnKSwgW1RleHQuRW5jb2RpbmddOjpVVEY4KQokc2NlbmVGaWxlID0gSm9pbi1QYXRoICRkaXIgJ3NjZW5lLnR4dCcKJHV0ZjggPSBOZXctT2JqZWN0IFRleHQuVVRGOEVuY29kaW5nKCRmYWxzZSkKJGwgPSBOZXctT2JqZWN0IFN5c3RlbS5OZXQuU29ja2V0cy5UY3BMaXN0ZW5lcihbU3lzdGVtLk5ldC5JUEFkZHJlc3NdOjpMb29wYmFjaywgJHBvcnQpCiRsLlN0YXJ0KCkKd2hpbGUgKCR0cnVlKSB7CiAgJGMgPSAkbC5BY2NlcHRUY3BDbGllbnQoKQogIHRyeSB7CiAgICAkcyA9ICRjLkdldFN0cmVhbSgpCiAgICAkYnVmID0gTmV3LU9iamVjdCBieXRlW10gODE5MgogICAgJG4gPSAkcy5SZWFkKCRidWYsIDAsIDgxOTIpCiAgICBpZiAoJG4gLWd0IDApIHsKICAgICAgJHJlcSA9IFtUZXh0LkVuY29kaW5nXTo6QVNDSUkuR2V0U3RyaW5nKCRidWYsIDAsICRuKQogICAgICAkcGF0aCA9ICcnCiAgICAgIGlmICgkcmVxIC1tYXRjaCAnXlx3KyAoW14gXSspJykgeyAkcGF0aCA9ICRNYXRjaGVzWzFdIH0KICAgICAgJGN0eXBlID0gJ3RleHQvaHRtbDsgY2hhcnNldD11dGYtOCcKICAgICAgJGJvZHkgPSAkaHRtbAogICAgICBpZiAoJHBhdGguU3RhcnRzV2l0aCgnL3NjZW5lJykpIHsKICAgICAgICBpZiAoJHBhdGggLW1hdGNoICdbPyZdc2V0PShbXiZdKyknKSB7CiAgICAgICAgICBbSU8uRmlsZV06OldyaXRlQWxsVGV4dCgkc2NlbmVGaWxlLCBbVXJpXTo6VW5lc2NhcGVEYXRhU3RyaW5nKCRNYXRjaGVzWzFdKSwgJHV0ZjgpCiAgICAgICAgfQogICAgICAgICRib2R5ID0gJycKICAgICAgICBpZiAoW0lPLkZpbGVdOjpFeGlzdHMoJHNjZW5lRmlsZSkpIHsgJGJvZHkgPSBbSU8uRmlsZV06OlJlYWRBbGxUZXh0KCRzY2VuZUZpbGUsIFtUZXh0LkVuY29kaW5nXTo6VVRGOCkgfQogICAgICAgICRjdHlwZSA9ICd0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04JwogICAgICB9CiAgICAgICRieXRlcyA9IFtUZXh0LkVuY29kaW5nXTo6VVRGOC5HZXRCeXRlcygkYm9keSkKICAgICAgJGhkciA9ICJIVFRQLzEuMSAyMDAgT0tgcmBuQ29udGVudC1UeXBlOiAkY3R5cGVgcmBuQ29udGVudC1MZW5ndGg6ICQoJGJ5dGVzLkxlbmd0aClgcmBuQ29ubmVjdGlvbjogY2xvc2VgcmBuYHJgbiIKICAgICAgJGhiID0gW1RleHQuRW5jb2RpbmddOjpBU0NJSS5HZXRCeXRlcygkaGRyKQogICAgICAkcy5Xcml0ZSgkaGIsIDAsICRoYi5MZW5ndGgpOyAkcy5Xcml0ZSgkYnl0ZXMsIDAsICRieXRlcy5MZW5ndGgpOyAkcy5GbHVzaCgpCiAgICB9CiAgfSBjYXRjaCB7fQogIHRyeSB7ICRjLkNsb3NlKCkgfSBjYXRjaCB7fQp9Cg=="
set "HTMLB64=PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImphIj48aGVhZD48bWV0YSBjaGFyc2V0PSJ1dGYtOCI+PHRpdGxlPkdlb1N1aXRlIFZpZXdlcjwvdGl0bGU+CjxzdHlsZT5odG1sLGJvZHl7bWFyZ2luOjA7aGVpZ2h0OjEwMCU7Zm9udC1mYW1pbHk6c2Fucy1zZXJpZn1pZnJhbWV7Ym9yZGVyOjA7d2lkdGg6MTAwJTtoZWlnaHQ6MTAwdmg7ZGlzcGxheTpibG9ja30jZW1wdHl7cGFkZGluZzozZW0gMmVtO2NvbG9yOiM0NDQ7bWF4LXdpZHRoOjY0MHB4fSN1e3dpZHRoOjIyZW07cGFkZGluZzo0cHh9PC9zdHlsZT4KPC9oZWFkPjxib2R5PjxkaXYgaWQ9ImFwcCI+PC9kaXY+CjxzY3JpcHQ+CnZhciBwPW5ldyBVUkxTZWFyY2hQYXJhbXMobG9jYXRpb24uc2VhcmNoKSx1PXAuZ2V0KCd1cmwnKSxhPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcHAnKTsKZnVuY3Rpb24gZXNjKHMpe3JldHVybiBzLnJlcGxhY2UoLyYvZywnJmFtcDsnKS5yZXBsYWNlKC88L2csJyZsdDsnKTt9CmZ1bmN0aW9uIHNob3codil7dmFyIGY9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaWZyYW1lJyk7Zi5zcmM9djtmLmFsbG93PSdjbGlwYm9hcmQtd3JpdGU7IGZ1bGxzY3JlZW47IGdlb2xvY2F0aW9uJztkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGYpO30KZnVuY3Rpb24gaG9tZShsYXN0KXthLmlubmVySFRNTD0nPGRpdiBpZD0iZW1wdHkiPjxoMj5HZW9TdWl0ZSBWaWV3ZXI8L2gyPjxwPjxjb2RlPmdlb3N1aXRlLWh1YjovL29wZW4/dXJsPSZsdDtzY2VuZSBVUkwmZ3Q7PC9jb2RlPiDjgafjgrfjg7zjg7PjgpLplovjgYTjgabjgY/jgaDjgZXjgYTjgII8L3A+PHA+PGlucHV0IGlkPSJ1IiBwbGFjZWhvbGRlcj0iaHR0cHM6Ly/igKYiPjxidXR0b24gb25jbGljaz0idmFyIHY9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCd1XCcpLnZhbHVlLnRyaW0oKTtpZih2KWxvY2F0aW9uPVwnP3VybD1cJytlbmNvZGVVUklDb21wb25lbnQodikiPumWi+OBjzwvYnV0dG9uPjwvcD4nKyhsYXN0Pyc8cD7liY3lm57jga7jgrfjg7zjg7M6IDxhIGhyZWY9Ij91cmw9JytlbmNvZGVVUklDb21wb25lbnQobGFzdCkrJyI+Jytlc2MobGFzdCkrJzwvYT48L3A+JzonJykrJzxwPmh1YjogPGEgaHJlZj0iaHR0cDovLzEyNy4wLjAuMTo4NTE0LyI+MTI3LjAuMC4xOjg1MTQgKHN0YXR1cyk8L2E+PC9wPjwvZGl2Pic7fQpmdW5jdGlvbiBsYXN0KGNiKXtmZXRjaCgnL3NjZW5lJykudGhlbihmdW5jdGlvbihyKXtyZXR1cm4gci50ZXh0KCl9KS50aGVuKGZ1bmN0aW9uKHQpe2NiKHQudHJpbSgpKX0pLmNhdGNoKGZ1bmN0aW9uKCl7Y2IoJycpfSk7fQppZih1KXt0cnl7ZmV0Y2goJy9zY2VuZT9zZXQ9JytlbmNvZGVVUklDb21wb25lbnQodSkpLmNhdGNoKGZ1bmN0aW9uKCl7fSk7fWNhdGNoKGUpe31zaG93KHUpO30KZWxzZSBpZihwLmhhcygnaG9tZScpKXtsYXN0KGhvbWUpO30KZWxzZXtsYXN0KGZ1bmN0aW9uKHYpe3Y/c2hvdyh2KTpob21lKCcnKX0pO30KPC9zY3JpcHQ+PC9ib2R5PjwvaHRtbD4K"
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
