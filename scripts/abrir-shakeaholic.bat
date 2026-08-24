@echo off
REM ============================================================================
REM  SHAKEAHOLIC - abrir el dia con un solo clic (y actualizarse solo)
REM ============================================================================
REM  Se prende la PC, doble clic aqui, y queda todo listo:
REM
REM    1. Comprueba si hay una version nueva del agente de impresion y, si la
REM       hay, la instala sola (pide el permiso de Windows una vez).
REM    2. Levanta el agente (si no estaba ya corriendo).
REM    3. Abre kiosko, barra, cocina, caja y admin en su monitor.
REM
REM  Por que la actualizacion va AQUI y no a media jornada: cambiar el
REM  programa mientras se cobra es la peor hora posible. Al abrir el local
REM  no hay comandas en vuelo y si algo sale mal hay tiempo de resolverlo.
REM
REM  Los cambios de PRECIOS y PRODUCTOS no necesitan nada de esto: para eso
REM  esta el boton "Actualizar pantallas" en Admin - En vivo.
REM ============================================================================

setlocal EnableDelayedExpansion
title Shakeaholic - abriendo el dia
color 0A

set "BASE=C:\Shakeaholic\agente-impresion"
set "AGENTE=%BASE%\arrancar-agente.bat"
set "RAWVER=https://raw.githubusercontent.com/EleevateMX/ventashake/main/agente-impresion/package.json"
set "RAWPS1=https://raw.githubusercontent.com/EleevateMX/ventashake/main/scripts/instalar-agente-impresion.ps1"

echo.
echo   SHAKEAHOLIC
echo   ===========
echo.

REM ---------------------------------------------------------------------------
REM 1. ?Hay version nueva del agente?
REM ---------------------------------------------------------------------------
if not exist "%BASE%\package.json" (
  echo   [!] El agente de impresion no esta instalado en esta PC.
  echo       Las pantallas abriran igual, pero NO saldran comandas en papel.
  echo       Para instalarlo: instalar-agente-impresion.bat ^(como administrador^)
  echo.
  goto :arrancar
)

set "VLOCAL="
set "VNUEVA="
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command ^
  "try{(Get-Content '%BASE%\package.json' -Raw | ConvertFrom-Json).version}catch{''}"`) do set "VLOCAL=%%v"
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command ^
  "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;((Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 '%RAWVER%').Content | ConvertFrom-Json).version}catch{''}"`) do set "VNUEVA=%%v"

if "%VNUEVA%"=="" (
  REM Sin internet o GitHub caido: no es motivo para no abrir el local.
  echo   [i] No se pudo comprobar si hay actualizacion ^(sin internet?^).
  echo       Se abre con lo que ya esta instalado.
  echo.
  goto :arrancar
)

echo   Agente instalado: %VLOCAL%   ^|   publicado: %VNUEVA%

if "%VLOCAL%"=="%VNUEVA%" (
  echo   [OK] El agente esta al dia.
  echo.
  goto :arrancar
)

REM ---------------------------------------------------------------------------
REM 2. Actualizar - la llave sale del .env que ya quedo en esta PC, para que
REM    nadie tenga que teclearla otra vez.
REM ---------------------------------------------------------------------------
set "LLAVE="
for /f "usebackq tokens=1,* delims==" %%a in ("%BASE%\.env") do (
  if /i "%%a"=="SUPABASE_ANON_KEY" set "LLAVE=%%b"
)

if "%LLAVE%"=="" (
  echo   [!] Hay una version nueva pero no encontre la llave en el .env.
  echo       Corre instalar-agente-impresion.bat como administrador.
  echo.
  goto :arrancar
)

echo.
echo   Hay una version nueva del agente. Actualizando...
echo   ^(Windows va a pedir permiso una vez - acepta^)
echo.

REM El agente viejo debe soltar la impresora antes de reemplazar archivos.
taskkill /f /fi "WINDOWTITLE eq Shakeaholic - agente de impresion*" >nul 2>&1

REM Se escribe un .ps1 temporal en vez de armar un comando gigante con
REM comillas escapadas: eso ultimo se rompe en cuanto alguien lo edita.
set "TMPPS=%TEMP%\shake-actualizar.ps1"
> "%TMPPS%" echo [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
>>"%TMPPS%" echo $i = Join-Path $env:TEMP 'shake-instalador.ps1'
>>"%TMPPS%" echo Invoke-WebRequest -UseBasicParsing '%RAWPS1%' -OutFile $i
>>"%TMPPS%" echo Unblock-File $i
>>"%TMPPS%" echo ^& $i -AnonKey '%LLAVE%'

powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%TMPPS%'"
del "%TMPPS%" >nul 2>&1

echo   [OK] Actualizacion terminada.
echo.

:arrancar
REM ---------------------------------------------------------------------------
REM 3. Agente de impresion
REM ---------------------------------------------------------------------------
REM  Se comprueba si ya hay uno corriendo ANTES de abrir otro: dos agentes
REM  compitiendo por la misma impresora se pelean los trabajos y algunas
REM  comandas salen dos veces.
tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "Shakeaholic - agente de impresion" >nul
if not errorlevel 1 (
  echo   [OK] El agente de impresion ya estaba corriendo.
  goto :pantallas
)

if not exist "%AGENTE%" goto :pantallas

echo   Arrancando el agente de impresion...
start "" "%AGENTE%"
echo   [OK] Agente arrancado ^(deja su ventana abierta todo el dia^).

:pantallas
REM ---------------------------------------------------------------------------
REM 4. Pantallas
REM ---------------------------------------------------------------------------
REM  Mapa de esta sucursal (DESKTOP-O5BVMOC), tomado de la posicion real de
REM  los monitores. Si mueves un monitor en Configuracion de Windows, hay que
REM  ajustar las coordenadas.
REM
REM    Monitor              Posicion    Tamano      App
REM    ViewSonic TD2223     0,0         1080x1920   kiosko      (cliente)
REM    Touch 1024x768 izq   1080,150    768x1024    bebidas     (barra)
REM    Touch 1024x768 der   1848,139    768x1024    alimentos   (cocina)
REM
REM  Ojo: alimentos va en el monitor DERECHO y bebidas en el IZQUIERDO. No es
REM  un descuido - es como estan fisicamente puestas las estaciones.
REM
REM  Cada ventana usa su PROPIO perfil (--user-data-dir). Sin eso Chrome
REM  reutiliza la instancia abierta, ignora --window-position y las tres
REM  apps terminan amontonadas en el mismo monitor.

set "NAV=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%NAV%" (
  echo.
  echo   [X] No se encontro Chrome ni Edge. Instala Google Chrome y vuelve
  echo       a correr esto.
  pause
  exit /b 1
)

echo.
set "FLAGS=--kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --disable-features=TranslateUI"

echo   Abriendo KIOSKO (monitor vertical grande)...
start "" "%NAV%" %FLAGS% --user-data-dir="%LOCALAPPDATA%\shake-kiosko" --window-position=0,0 https://kiosko.shakeaholic.mx
timeout /t 4 /nobreak >nul

echo   Abriendo BARRA - BEBIDAS (monitor chico izquierdo)...
start "" "%NAV%" %FLAGS% --user-data-dir="%LOCALAPPDATA%\shake-bebidas" --window-position=1080,150 https://barra.shakeaholic.mx
timeout /t 4 /nobreak >nul

echo   Abriendo COCINA - ALIMENTOS (monitor chico derecho)...
start "" "%NAV%" %FLAGS% --user-data-dir="%LOCALAPPDATA%\shake-alimentos" --window-position=1848,139 https://cocina.shakeaholic.mx
timeout /t 4 /nobreak >nul

REM POS: hace falta abierto aunque se cobre desde el kiosko, porque es donde
REM se ABRE LA CAJA al inicio del turno.
echo   Abriendo POS - CAJA (ventana normal)...
start "" "%NAV%" --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --user-data-dir="%LOCALAPPDATA%\shake-pos" --window-position=160,160 --window-size=980,1500 https://caja.shakeaholic.mx
timeout /t 3 /nobreak >nul

echo   Abriendo ADMIN (ventana normal)...
start "" "%NAV%" --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --user-data-dir="%LOCALAPPDATA%\shake-admin" --window-position=100,100 --window-size=980,1500 https://admin.shakeaholic.mx

echo.
echo   ----------------------------------------------------------------
echo   LISTO. Buen turno.
echo.
echo   * Cambios de precios o productos: NO hace falta reabrir nada.
echo     Admin - En vivo - boton "Actualizar pantallas".
echo   * El agente se actualiza solo la proxima vez que abras el dia.
echo   ----------------------------------------------------------------
timeout /t 8 /nobreak >nul
endlocal
