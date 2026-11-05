@echo off
rem geosuite-hub:// protocol shim — forwards the invoked URL to the Node handler.
node "%~dp0geosuite-hub.js" %*
