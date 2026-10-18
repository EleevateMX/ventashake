@echo off
REM ============================================================================
REM  Shakeaholic - instalar el agente de TICKETS de caja  (doble clic)
REM ============================================================================
REM  Es el agente de la impresora de tickets (3nStar, 192.168.1.50), APARTE
REM  del agente de etiquetas de barra y cocina. Los dos conviven en la misma
REM  PC: si uno se cae, el otro sigue imprimiendo.
REM
REM  Baja el instalador y lo corre saltandose la politica de scripts SOLO para
REM  ese proceso. No cambia la configuracion del equipo.
REM
REM  USO: clic derecho -> "Ejecutar como administrador".
REM       Si la PC ya tiene el agente de etiquetas, usa su llave; si no, la pide.
REM ============================================================================

setlocal
title Shakeaholic - instalar agente de tickets de caja
color 0A

powershell -NoProfile -Command "try{Unblock-File -LiteralPath '%~f0'}catch{}" >nul 2>&1

echo.
echo   SHAKEAHOLIC - agente de tickets de caja
echo   =======================================
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
REM La llave ya vive en la PC: en el .env del agente de etiquetas o en el de
REM caja de una instalacion anterior. Quien esta en la tienda no la sabe.
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
if not "%LLAVE%"=="" echo   Usando la llave que ya tiene esta PC.
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

set "PS1=%TEMP%\shake-instalar-agente-caja.ps1"
set "URL=https://raw.githubusercontent.com/EleevateMX/ventashake/main/scripts/instalar-agente-caja.ps1"

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
