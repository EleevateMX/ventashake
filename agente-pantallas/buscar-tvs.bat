@echo off
REM Lista las televisiones de la red con su IP y su nombre. Es lo que hay
REM que dar de alta en Admin -> Pantallas (TV).
title Shakeaholic - Buscar televisiones
cd /d "%~dp0"
node agente-pantallas.mjs --buscar
echo.
pause
