@echo off
REM ============================================================================
REM  SHAKEAHOLIC - abrir todo el dia de trabajo con un solo clic
REM ============================================================================
REM  Este es EL archivo del dia: se prende la PC, doble clic aqui, y queda
REM  todo listo - el agente de impresion y las cinco pantallas en su monitor.
REM
REM  Antes eran dos archivos y el equipo tenia que acordarse de los dos; si
REM  se les olvidaba el agente, las comandas salian en pantalla pero nunca
REM  en papel y nadie entendia por que.
REM
REM  Lo que hace, en orden:
REM    1. Levanta el agente de impresion (si no esta ya corriendo).
REM    2. Abre kiosko, barra, cocina, caja y admin en sus monitores.
REM
REM  Para cerrar todo al final del dia: cerrar las ventanas normalmente
REM  (Alt+F4 sobre cada pantalla). El agente puede quedarse abierto.
REM ============================================================================

setlocal
title Shakeaholic - abriendo el dia
color 0A

echo.
echo   SHAKEAHOLIC
echo   ===========
echo.

REM ---------------------------------------------------------------------------
REM 1. Agente de impresion
REM ---------------------------------------------------------------------------
REM  Se comprueba si ya hay uno corriendo ANTES de abrir otro: dos agentes
REM  compitiendo por la misma impresora se pelean los trabajos y algunas
REM  comandas salen dos veces. La marca es el titulo de su ventana.
set "AGENTE=C:\Shakeaholic\agente-impresion\arrancar-agente.bat"

tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "Shakeaholic - agente de impresion" >nul
if not errorlevel 1 (
  echo   [OK] El agente de impresion ya estaba corriendo.
  goto :pantallas
)

if not exist "%AGENTE%" (
  echo   [!] No encuentro el agente de impresion en:
  echo       %AGENTE%
  echo.
  echo       Las pantallas van a abrir igual, pero NO saldran comandas en
  echo       papel hasta instalarlo ^(instalar-agente-impresion.bat^).
  echo.
  goto :pantallas
)

echo   Arrancando el agente de impresion...
start "" "%AGENTE%"
echo   [OK] Agente arrancado ^(deja su ventana abierta todo el dia^).

:pantallas
REM ---------------------------------------------------------------------------
REM 2. Pantallas
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
echo   Navegador: %NAV%
echo.

REM Banderas comunes: sin barras, sin dialogos de error, sin el globo de
REM "Chrome no se cerro correctamente" que aparece tras un corte de luz.
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
REM se ABRE LA CAJA al inicio del turno. Sin corte abierto, el modo cajero
REM avisa y la venta no entraria al arqueo del dia.
echo   Abriendo POS - CAJA (ventana normal)...
start "" "%NAV%" --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --user-data-dir="%LOCALAPPDATA%\shake-pos" --window-position=160,160 --window-size=980,1500 https://caja.shakeaholic.mx
timeout /t 3 /nobreak >nul

REM Admin va en ventana normal, no a pantalla completa: es la herramienta del
REM gerente (fotos, precios, empleados, impresoras, "En vivo") y se usa a
REM ratos, encima de lo demas. Alt+Tab para alternar.
echo   Abriendo ADMIN (ventana normal)...
start "" "%NAV%" --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --user-data-dir="%LOCALAPPDATA%\shake-admin" --window-position=100,100 --window-size=980,1500 https://admin.shakeaholic.mx

echo.
echo   ----------------------------------------------------------------
echo   LISTO. Buen turno.
echo.
echo   * Si cambian precios en Costeos o Admin, NO hay que reabrir nada:
echo     en Admin - "En vivo" esta el boton "Actualizar pantallas".
echo   * Si alguna app quedo en el monitor equivocado, intercambia las
echo     coordenadas --window-position entre esas dos lineas.
echo   ----------------------------------------------------------------
timeout /t 8 /nobreak >nul
endlocal
