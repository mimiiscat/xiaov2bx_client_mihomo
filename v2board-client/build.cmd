@echo off
setlocal

cd /d "%~dp0"

if "%TARGET%"=="" (
  node scripts\build.js
) else if "%ARCH%"=="" (
  node scripts\build.js "%TARGET%"
) else (
  node scripts\build.js "%TARGET%" "%ARCH%"
)
