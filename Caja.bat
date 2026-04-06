@echo off
title Sistema de Gestion La Macelleria
color 0A
echo ==========================================
echo      INICIANDO SISTEMA DE VENTAS
echo ==========================================
echo.
echo Por favor espere, cargando componentes...
echo.

:: Esto asegura que se ejecute en la carpeta correcta
cd /d "%~dp0"

:: Ejecuta el programa
call npm start

:: Si el programa se cierra por error, pausa para poder leerlo
if %errorlevel% neq 0 (
    echo.
    echo ==========================================
    echo OCURRIO UN ERROR AL CERRAR EL SISTEMA
    echo ==========================================
    pause
)