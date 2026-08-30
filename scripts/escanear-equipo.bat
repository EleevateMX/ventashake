@echo off
REM ============================================================================
REM  SHAKEAHOLIC - escanear el equipo
REM ============================================================================
REM  Envoltorio del .ps1 del mismo nombre.
REM
REM  POR QUE EXISTE ESTE ARCHIVO
REM
REM  Un .ps1 bajado del navegador no se puede abrir de doble clic: Windows lo
REM  marca como "venido de internet" y PowerShell contesta
REM
REM      no se puede cargar el archivo ... la ejecucion de scripts esta
REM      deshabilitada en este sistema
REM
REM  ...que suena a que la PC esta rota cuando en realidad es la politica de
REM  siempre. La salida no es pedirle a nadie que cambie esa politica -eso si
REM  seria bajarle la guardia al equipo- sino no repartir .ps1: se baja este
REM  .bat, y el se encarga de correr el script con permiso solo para ESA
REM  ejecucion.
REM
REM  NO pide permisos de administrador: solo mira y escribe un .txt en el
REM  Escritorio. No instala, no configura, no cambia nada.
REM ============================================================================

setlocal
title Shakeaholic - escanear el equipo
color 0A

REM  Quitarse la marca de "venido de internet" a uno mismo. Sin admin y sin
REM  tocar ninguna politica: solo borra el rastro que trae el archivo.
powershell -NoProfile -Command "try{Unblock-File -LiteralPath '%~f0'}catch{}" >nul 2>&1

set "CRUDO=https://raw.githubusercontent.com/EleevateMX/ventashake/main"
set "PS1=%~dp0escanear-equipo.ps1"

if not exist "%PS1%" (
  echo.
  echo   Bajando el escaner...
  set "PS1=%TEMP%\shake-escanear.ps1"
  powershell -NoProfile -Command ^
    "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -TimeoutSec 40 '%CRUDO%/scripts/escanear-equipo.ps1' -OutFile '%TEMP%\shake-escanear.ps1'}catch{}" >nul 2>&1
)

if not exist "%PS1%" (
  echo.
  echo   [X] No se pudo obtener el escaner. Revisa el internet de esta PC.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"

echo.
pause
