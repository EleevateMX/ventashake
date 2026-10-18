@echo off
REM ============================================================================
REM  Shakeaholic - instalar el agente de PANTALLAS (TV)  (doble clic)
REM ============================================================================
REM  Mantiene las televisiones mostrando lo que gerencia les asigno en
REM  Admin -> Pantallas (TV). Es APARTE del agente de etiquetas y del de
REM  tickets de caja: los tres conviven en la misma PC y si uno se cae, los
REM  otros siguen.
REM
REM  Pide DOS cosas distintas, no las confundas:
REM    - la llave publica de Supabase (la misma que usan los otros agentes;
REM      si esta PC ya los tiene, se toma sola)
REM    - la LLAVE DEL EMPUJADOR, que genera gerencia en Admin -> Pantallas
REM      y se ve una sola vez. Si ya esta en esta PC, se reutiliza.
REM
REM  USO: clic derecho -> "Ejecutar como administrador".
REM ============================================================================

setlocal
title Shakeaholic - instalar agente de pantallas
color 0A

powershell -NoProfile -Command "try{Unblock-File -LiteralPath '%~f0'}catch{}" >nul 2>&1

echo.
echo   SHAKEAHOLIC - agente de pantallas (TV)
echo   ======================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo   [X] Esto necesita permisos de administrador.
  echo.
  echo       Cierra esta ventana, haz clic DERECHO sobre este archivo
  echo       y elige "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)

set "LLAVE=%~1"
REM La llave publica de Supabase ya vive en la PC si hay otro agente puesto.
if "%LLAVE%"=="" if exist "C:\Shakeaholic\agente-impresion\.env" (
  for /f "usebackq tokens=1,* delims==" %%a in ("C:\Shakeaholic\agente-impresion\.env") do (
    if /i "%%a"=="SUPABASE_ANON_KEY" set "LLAVE=%%b"
  )
)
if "%LLAVE%"=="" if exist "C:\Shakeaholic\agente-caja\.env" (
  for /f "usebackq tokens=1,* delims==" %%a in ("C:\Shakeaholic\agente-caja\.env") do (
    if /i "%%a"=="SUPABASE_ANON_KEY" set "LLAVE=%%b"
  )
)
if "%LLAVE%"=="" if exist "C:\Shakeaholic\agente-pantallas\.env" (
  for /f "usebackq tokens=1,* delims==" %%a in ("C:\Shakeaholic\agente-pantallas\.env") do (
    if /i "%%a"=="SUPABASE_ANON_KEY" set "LLAVE=%%b"
  )
)
if not "%LLAVE%"=="" echo   Usando la llave publica que ya tiene esta PC.
if "%LLAVE%"=="" (
  echo   Pega la llave publica de Supabase y presiona Enter.
  echo   ^(Supabase - Project Settings - API Keys^)
  echo.
  set /p LLAVE=  Llave:
)
if "%LLAVE%"=="" (
  echo.
  echo   [X] Sin llave no se puede continuar.
  pause
  exit /b 1
)

REM La llave del EMPUJADOR no se pide aqui: el .ps1 la lee del .env si ya
REM existe y solo la pide cuando de verdad falta. Asi reinstalar no obliga a
REM generar una llave nueva, que invalidaria la anterior.

set "PS1=%TEMP%\shake-instalar-agente-pantallas.ps1"
set "URL=https://raw.githubusercontent.com/EleevateMX/ventashake/main/scripts/instalar-agente-pantallas.ps1"

echo.
echo   Bajando el instalador...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -OutFile '%PS1%'; Unblock-File '%PS1%'"

if not exist "%PS1%" (
  echo   [X] No se pudo bajar. Revisa que este equipo tenga internet.
  pause
  exit /b 1
)

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -AnonKey "%LLAVE%" %~2 %~3

echo.
echo   ----------------------------------------------------------------
echo   Ventana abierta a proposito: arriba esta el detalle de cada paso.
pause
endlocal
