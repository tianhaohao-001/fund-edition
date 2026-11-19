@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-Morrowfolio.ps1" %*
if errorlevel 1 pause
