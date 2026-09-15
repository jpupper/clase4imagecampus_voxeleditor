@echo off
title Servidor - Minecraft 3D Voxel Studio
color 0B
echo =============================================================
echo          INICIANDO MINECRAFT 3D VOXEL STUDIO
echo =============================================================
echo.

:: Verificar si node_modules existe, si no, sugerir o ejecutar install
if not exist node_modules\ (
    echo No se detectaron las dependencias instaladas.
    echo Ejecutando instalacion automatica primero...
    call npm install
    echo.
)

echo Iniciando servidor Node.js...
echo.
echo =============================================================
echo  PUERTO DE LA APLICACION: 3000
echo  DIRECCION WEB:           http://localhost:3000
echo =============================================================
echo.
echo Presiona Ctrl+C en cualquier momento para detener el servidor.
echo.

node server.js
pause
