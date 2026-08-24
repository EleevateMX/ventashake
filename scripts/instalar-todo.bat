@echo off
REM ============================================================================
REM  SHAKEAHOLIC - dejar la PC lista, de un solo clic
REM ============================================================================
REM  Este archivo se corre UNA VEZ por computadora. Hace todo lo que antes
REM  eran dos instaladores y varios pasos a mano:
REM
REM    1. Instala (o actualiza) el agente de impresion.
REM    2. Deja "abrir-shakeaholic.bat" guardado en la PC.
REM    3. Lo pone en el ARRANQUE de Windows: al prender la maquina, las
REM       pantallas y el agente se abren solos.
REM    4. Deja un acceso directo en el escritorio por si hay que reabrir.
REM    5. Arranca todo ahora mismo.
REM
REM  Se pide el permiso de Windows una sola vez, al principio: sin permisos
REM  no se puede instalar Node ni escribir en C:\Shakeaholic. Se avisa aqui
REM  y no a la mitad, con medio trabajo hecho.
REM
REM  Despues de esto, el dia a dia es: prender la PC. Nada mas.
REM ============================================================================

setlocal EnableDelayedExpansion
title Shakeaholic - dejar la PC lista
color 0A

set "BASE=C:\Shakeaholic"
set "AGENTE=%BASE%\agente-impresion"
set "RAWPS1=https://raw.githubusercontent.com/EleevateMX/ventashake/main/scripts/instalar-agente-impresion.ps1"
set "RAWBAT=https://raw.githubusercontent.com/EleevateMX/ventashake/main/scripts/abrir-shakeaholic.bat"

REM ---------------------------------------------------------------------------
REM 0. Permisos: si no los hay, este mismo archivo se vuelve a lanzar con ellos
REM ---------------------------------------------------------------------------
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Pidiendo permiso de Windows para instalar...
  powershell -NoProfile -Command "Start-Process '%~f0' -Verb RunAs" >nul 2>&1
  if errorlevel 1 (
    echo.
    echo   [X] No se pudo elevar. Haz clic DERECHO sobre este archivo
    echo       y elige "Ejecutar como administrador".
    pause
  )
  exit /b
)

echo.
echo   SHAKEAHOLIC - dejando esta PC lista
echo   ==================================
echo.

REM ---------------------------------------------------------------------------
REM 1. La llave: si ya se instalo antes, se reutiliza y no se pregunta nada
REM ---------------------------------------------------------------------------
set "LLAVE=%~1"

if "%LLAVE%"=="" if exist "%AGENTE%\.env" (
  for /f "usebackq tokens=1,* delims==" %%a in ("%AGENTE%\.env") do (
    if /i "%%a"=="SUPABASE_ANON_KEY" set "LLAVE=%%b"
  )
  if not "!LLAVE!"=="" echo   [OK] Llave tomada de la instalacion anterior.
)

if "%LLAVE%"=="" (
  echo   Pega la llave publica de Supabase y presiona Enter.
  echo   ^(Te la paso por WhatsApp; empieza con sb_publishable_^)
  echo.
  set /p LLAVE=  Llave:
)

if "%LLAVE%"=="" (
  echo.
  echo   [X] Sin llave no se puede continuar.
  pause
  exit /b 1
)

REM ---------------------------------------------------------------------------
REM 2. Agente de impresion
REM ---------------------------------------------------------------------------
echo.
echo   [1/4] Instalando el agente de impresion...
echo.

REM El agente viejo debe soltar la impresora antes de reemplazar archivos.
taskkill /f /fi "WINDOWTITLE eq Shakeaholic - agente de impresion*" >nul 2>&1

set "TMPPS=%TEMP%\shake-instalar-agente.ps1"
> "%TMPPS%" echo [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
>>"%TMPPS%" echo $i = Join-Path $env:TEMP 'shake-instalador.ps1'
>>"%TMPPS%" echo Invoke-WebRequest -UseBasicParsing '%RAWPS1%' -OutFile $i
>>"%TMPPS%" echo Unblock-File $i
>>"%TMPPS%" echo ^& $i -AnonKey '%LLAVE%'

powershell -NoProfile -ExecutionPolicy Bypass -File "%TMPPS%"
set "RESULTADO=%ERRORLEVEL%"
del "%TMPPS%" >nul 2>&1

if not "%RESULTADO%"=="0" (
  echo.
  echo   [!] El instalador del agente termino con problemas.
  echo       Arriba esta el detalle. Se continua con el resto: las
  echo       pantallas van a funcionar aunque el papel no salga.
  echo.
)

REM ---------------------------------------------------------------------------
REM 3. El lanzador del dia a dia
REM ---------------------------------------------------------------------------
echo.
echo   [2/4] Guardando el lanzador...

if not exist "%BASE%" mkdir "%BASE%" >nul 2>&1
powershell -NoProfile -Command ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing '%RAWBAT%' -OutFile '%BASE%\abrir-shakeaholic.bat'" >nul 2>&1

if not exist "%BASE%\abrir-shakeaholic.bat" (
  echo   [X] No se pudo bajar el lanzador. Revisa el internet de esta PC.
  pause
  exit /b 1
)
echo   [OK] %BASE%\abrir-shakeaholic.bat

REM ---------------------------------------------------------------------------
REM 4. Arranque automatico de Windows
REM ---------------------------------------------------------------------------
echo.
echo   [3/4] Dejandolo en el arranque de Windows...

REM Se usa el Inicio del USUARIO (no el de "todos los usuarios"): las
REM ventanas de Chrome tienen que abrirse en la sesion de quien usa la
REM caja, no en una sesion de sistema donde nadie las veria.
set "INICIO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /y "%BASE%\abrir-shakeaholic.bat" "%INICIO%\Shakeaholic.bat" >nul 2>&1
if exist "%INICIO%\Shakeaholic.bat" (
  echo   [OK] Al prender la PC se abre solo.
) else (
  echo   [!] No se pudo poner en el arranque. Se puede hacer a mano:
  echo       tecla Windows + R, escribir  shell:startup  y copiar ahi
  echo       el archivo %BASE%\abrir-shakeaholic.bat
)

copy /y "%BASE%\abrir-shakeaholic.bat" "%USERPROFILE%\Desktop\Abrir Shakeaholic.bat" >nul 2>&1
if exist "%USERPROFILE%\Desktop\Abrir Shakeaholic.bat" echo   [OK] Acceso directo en el escritorio.

REM ---------------------------------------------------------------------------
REM 5. Arrancar
REM ---------------------------------------------------------------------------
echo.
echo   [4/4] Abriendo todo...
echo.
start "" "%BASE%\abrir-shakeaholic.bat"

echo.
echo   ================================================================
echo   LISTO. Esta PC ya no necesita mantenimiento.
echo.
echo   * Al prender la maquina se abre todo solo.
echo   * El agente se actualiza solo cuando haya version nueva.
echo   * Precios y productos: boton "Actualizar pantallas" en
echo     Admin - En vivo. No hay que tocar esta computadora.
echo   ================================================================
echo.
pause
endlocal
