@echo off
title Shakeaholic - Agente de Pantallas
cd /d "%~dp0"
echo Iniciando agente de pantallas...
node agente-pantallas.mjs
echo.
echo El agente se detuvo. Revisa el mensaje de arriba.
pause
