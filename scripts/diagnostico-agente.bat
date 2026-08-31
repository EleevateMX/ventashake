@echo off
REM ============================================================================
REM  SHAKEAHOLIC - que agente de impresion esta corriendo, y desde donde
REM ============================================================================
REM  Envoltorio del .ps1 del mismo nombre. Se reparte el .bat y no el .ps1
REM  porque un .ps1 bajado del navegador no abre de doble clic: Windows lo
REM  marca y PowerShell dice "la ejecucion de scripts esta deshabilitada en
REM  este sistema".
REM
REM  Es de SOLO LECTURA y NO pide permisos de administrador: no detiene, no
REM  borra, no instala. Deja un .txt en el Escritorio.
REM ============================================================================

setlocal
title Shakeaholic - diagnostico del agente
color 0A

powershell -NoProfile -Command "try{Unblock-File -LiteralPath '%~f0'}catch{}" >nul 2>&1

set "CRUDO=https://raw.githubusercontent.com/EleevateMX/ventashake/main"
set "PS1=%~dp0diagnostico-agente.ps1"

if not exist "%PS1%" (
  echo.
  echo   Bajando el diagnostico...
  set "PS1=%TEMP%\shake-diagnostico-agente.ps1"
  powershell -NoProfile -Command ^
    "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -TimeoutSec 40 '%CRUDO%/scripts/diagnostico-agente.ps1' -OutFile '%TEMP%\shake-diagnostico-agente.ps1'}catch{}" >nul 2>&1
)

if not exist "%PS1%" (
  echo.
  echo   [X] No se pudo obtener el diagnostico. Revisa el internet de esta PC.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"

echo.
pause
