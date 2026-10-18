@echo off
REM Deja el agente como Servicio de Windows: arranca solo al encender la PC,
REM antes de que alguien inicie sesion, y se reinicia si truena.
REM Ejecutar ESTE archivo como Administrador (clic derecho > Ejecutar como
REM administrador). Sin eso, Windows no deja registrar servicios.
cd /d "%~dp0"
echo Instalando node-windows (solo la primera vez)...
call npm install node-windows --no-save
if errorlevel 1 goto error
echo Registrando el servicio...
node instalar-servicio.mjs
if errorlevel 1 goto error
echo.
echo Listo. El agente arranca solo con Windows.
pause
exit /b 0
:error
echo.
echo FALLO. Revisa el mensaje de arriba.
pause
exit /b 1
