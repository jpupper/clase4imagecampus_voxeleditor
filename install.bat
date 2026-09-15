@echo off
title Instalador - Minecraft 3D Voxel Studio
color 0A
echo =============================================================
echo   INSTALANDO DEPENDENCIAS DE MINECRAFT 3D VOXEL STUDIO
echo =============================================================
echo.
echo Verificando Node.js y NPM...
call node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js no esta instalado o no se encuentra en el PATH.
    echo Por favor instala Node.js desde https://nodejs.org/ antes de continuar.
    pause
    exit /b 1
)

echo Node.js detectado correctamente.
echo Instalando modulos de Node.js (express, cors)...
echo.
call npm install

if %errorlevel% equ 0 (
    echo.
    echo =============================================================
    echo   DEPENDENCIAS INSTALADAS CON EXITO!
    echo   Ahora puedes ejecutar la aplicacion haciendo doble clic en run.bat
    echo =============================================================
) else (
    color 0C
    echo.
    echo [ERROR] Ocurrio un problema durante la instalacion de dependencias.
)
echo.
pause
