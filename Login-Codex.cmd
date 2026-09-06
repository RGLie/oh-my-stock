@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\oms.ps1" login-codex
pause
