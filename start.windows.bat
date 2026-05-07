@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "LOGFILE=start-log.txt"
set "PORT=3000"

> "%LOGFILE%" echo =========================================
>> "%LOGFILE%" echo Node.js / Next.js Windows start log
>> "%LOGFILE%" echo =========================================
>> "%LOGFILE%" echo.

cls
echo =========================================
echo Iniciando App Node.js / Next.js en Windows
echo =========================================
echo Carpeta del proyecto: %CD%
echo Log: %LOGFILE%
echo.

if not exist "package.json" (
  echo ERROR: No se encontro package.json en esta carpeta.
  echo ERROR: No se encontro package.json en esta carpeta. >> "%LOGFILE%"
  echo Copia este .bat dentro de la raiz del proyecto.
  pause
  exit /b 1
)

where node >> "%LOGFILE%" 2>&1
if errorlevel 1 goto :node_missing

where npm >> "%LOGFILE%" 2>&1
if errorlevel 1 goto :npm_missing

if not exist "node_modules" (
  echo ERROR: No existe node_modules. Ejecuta install.windows.bat primero.
  echo ERROR: No existe node_modules. Ejecuta install.windows.bat primero. >> "%LOGFILE%"
  pause
  exit /b 1
)

for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo ADVERTENCIA: El puerto %PORT% parece estar ocupado por el proceso PID %%A.
  echo ADVERTENCIA: El puerto %PORT% parece estar ocupado por el proceso PID %%A. >> "%LOGFILE%"
  echo Si la app no inicia, cierra ese proceso o cambia PORT en este archivo.
  echo.
  goto :port_checked
)
:port_checked

set "LOCAL_IP=localhost"
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4"') do (
  set "TMP_IP=%%A"
  set "TMP_IP=!TMP_IP: =!"
  if not "!TMP_IP!"=="" (
    set "LOCAL_IP=!TMP_IP!"
    goto :ip_found
  )
)
:ip_found

if exist "prisma\schema.prisma" (
  echo [INFO] Prisma detectado. Ejecutando generate antes de iniciar...
  echo [INFO] Prisma detectado. Ejecutando generate antes de iniciar... >> "%LOGFILE%"
  call npx prisma generate >> "%LOGFILE%" 2>&1
  if errorlevel 1 goto :err
) else (
  echo [INFO] No se encontro prisma\schema.prisma. Se omite Prisma.
  echo [INFO] No se encontro prisma\schema.prisma. Se omite Prisma. >> "%LOGFILE%"
)

echo.
echo =========================================
echo Servidor de desarrollo
echo URL local:     http://localhost:%PORT%
echo URL red local: http://%LOCAL_IP%:%PORT%
echo =========================================
echo.
echo Para detener el servidor usa CTRL + C.
echo.
>> "%LOGFILE%" echo URL local: http://localhost:%PORT%
>> "%LOGFILE%" echo URL red local: http://%LOCAL_IP%:%PORT%
>> "%LOGFILE%" echo Ejecutando npm run dev:windows

call npm run dev:windows
set "EXITCODE=%ERRORLEVEL%"

echo.
echo Servidor detenido. Codigo de salida: %EXITCODE%
echo Servidor detenido. Codigo de salida: %EXITCODE% >> "%LOGFILE%"
pause
exit /b %EXITCODE%

:node_missing
echo ERROR: Node.js no esta instalado o no esta en PATH.
echo ERROR: Node.js no esta instalado o no esta en PATH. >> "%LOGFILE%"
pause
exit /b 1

:npm_missing
echo ERROR: npm no esta disponible en PATH.
echo ERROR: npm no esta disponible en PATH. >> "%LOGFILE%"
pause
exit /b 1

:err
echo.
echo ERROR: No se pudo preparar el proyecto antes de iniciar.
echo Revisa el archivo %LOGFILE%
echo.
type "%LOGFILE%"
pause
exit /b 1
