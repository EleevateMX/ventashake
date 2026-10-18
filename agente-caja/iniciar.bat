@echo off
title Shakeaholic - Agente de Caja
cd /d "%~dp0"
echo Iniciando agente de caja...
node agente-caja.mjs
echo.
echo El agente se detuvo. Revisa el mensaje de arriba.
pause
