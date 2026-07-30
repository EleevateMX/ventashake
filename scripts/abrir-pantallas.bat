@echo off
REM ============================================================================
REM  Shakeaholic — abre las 3 pantallas en sus monitores  (Windows)
REM ============================================================================
REM  Mapa de esta sucursal (DESKTOP-O5BVMOC), tomado de la posicion real de los
REM  monitores. Si mueves un monitor en Configuracion de Windows, hay que
REM  ajustar las coordenadas de abajo.
REM
REM    Monitor              Posicion    Tamano      App
REM    ViewSonic TD2223     0,0         1080x1920   kiosko      (cliente)
REM    Touch 1024x768 izq   1080,150    768x1024    bebidas     (barra)
REM    Touch 1024x768 der   1848,139    768x1024    alimentos   (cocina)
REM
REM  Ojo: alimentos va en el monitor DERECHO y bebidas en el IZQUIERDO. No es
REM  un descuido — es como estan fisicamente puestas las estaciones en el
REM  local. Se comprobo en sitio: con el orden inverso, a cocina le llegaban
REM  las bebidas y a la barra los alimentos.
REM
REM  Cada ventana usa su PROPIO perfil (--user-data-dir). Sin eso Chrome
REM  reutiliza la instancia que ya esta abierta, ignora --window-position y
REM  las tres apps terminan amontonadas en el mismo monitor.
REM
REM  Para salir de una pantalla: Alt+F4 sobre ella.
REM ============================================================================

setlocal

set "NAV=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%NAV%" (
  echo No se encontro Chrome ni Edge. Instala Google Chrome y vuelve a correr esto.
  pause
  exit /b 1
)
echo Navegador: %NAV%

REM Banderas comunes: sin barras, sin dialogos de error, sin el globo de
REM "Chrome no se cerro correctamente" que aparece tras un corte de luz.
set "FLAGS=--kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --disable-features=TranslateUI"

echo Abriendo KIOSKO (monitor vertical grande)...
start "" "%NAV%" %FLAGS% --user-data-dir="%LOCALAPPDATA%\shake-kiosko" --window-position=0,0 https://shake-kiosko.pages.dev
timeout /t 4 /nobreak >nul

echo Abriendo BARRA - BEBIDAS (monitor chico izquierdo)...
start "" "%NAV%" %FLAGS% --user-data-dir="%LOCALAPPDATA%\shake-bebidas" --window-position=1080,150 https://shake-cocina-bebidas.pages.dev
timeout /t 4 /nobreak >nul

echo Abriendo COCINA - ALIMENTOS (monitor chico derecho)...
start "" "%NAV%" %FLAGS% --user-data-dir="%LOCALAPPDATA%\shake-alimentos" --window-position=1848,139 https://shake-cocina-alimentos.pages.dev
timeout /t 4 /nobreak >nul

REM Admin va en ventana normal, no a pantalla completa: es la herramienta del
REM gerente (fotos, precios, empleados, impresoras) y se usa a ratos, encima de
REM lo demas. Alt+Tab para alternar.
REM POS: hace falta abierto aunque se cobre desde el kiosko, porque es donde
REM se ABRE LA CAJA al inicio del turno. Sin corte abierto, el modo cajero
REM avisa y la venta no entraria al arqueo del dia.
echo Abriendo POS - CAJA (ventana normal)...
start "" "%NAV%" --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --user-data-dir="%LOCALAPPDATA%\shake-pos" --window-position=160,160 --window-size=980,1500 https://shake-pos.pages.dev
timeout /t 3 /nobreak >nul

echo Abriendo ADMIN (ventana normal)...
start "" "%NAV%" --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --user-data-dir="%LOCALAPPDATA%\shake-admin" --window-position=100,100 --window-size=980,1500 https://shake-admin.pages.dev

echo.
echo Listo. Si alguna app quedo en el monitor equivocado, intercambia las
echo coordenadas --window-position entre esas dos lineas y vuelve a correrlo.
timeout /t 6 /nobreak >nul
endlocal
