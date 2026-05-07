@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "LOGFILE=install-log.txt"

> "%LOGFILE%" echo =========================================
>> "%LOGFILE%" echo Node.js / Next.js Windows installer log
>> "%LOGFILE%" echo =========================================
>> "%LOGFILE%" echo.

cls
echo =========================================
echo Instalador Windows para App Node.js / Next.js
echo =========================================
echo Carpeta del proyecto: %CD%
echo Log: %LOGFILE%
echo.

>> "%LOGFILE%" echo [INFO] Carpeta del proyecto: %CD%

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

echo [INFO] Versiones detectadas:
call node -v
call npm -v
>> "%LOGFILE%" echo [INFO] Versiones detectadas:
call node -v >> "%LOGFILE%" 2>&1
call npm -v >> "%LOGFILE%" 2>&1

if not exist ".env.local" (
  echo.
  echo [INFO] Creando .env.local base...
  >> "%LOGFILE%" echo [INFO] Creando .env.local base
  (
    echo # Archivo generado por install.windows.bat
    echo # Ajusta estos valores si tu app usa autenticacion, base de datos externa o APIs.
    echo DATABASE_URL=file:./prisma/dev.db
    echo NEXTAUTH_URL=http://localhost:3000
    echo NEXTAUTH_SECRET=change-me-local-dev-secret
  ) > ".env.local"
) else (
  echo [INFO] .env.local ya existe, no se modifico.
  >> "%LOGFILE%" echo [INFO] .env.local ya existe, no se modifico.
)

if not exist ".env" (
  echo [INFO] Creando .env base...
  >> "%LOGFILE%" echo [INFO] Creando .env base
  (
    echo DATABASE_URL=file:./prisma/dev.db
  ) > ".env"
) else (
  echo [INFO] .env ya existe, no se modifico.
  >> "%LOGFILE%" echo [INFO] .env ya existe, no se modifico.
)

echo.
echo [1/3] Instalando dependencias con npm...
>> "%LOGFILE%" echo [1/3] npm install
call npm install >> "%LOGFILE%" 2>&1
if errorlevel 1 goto :err

if exist "prisma\schema.prisma" (
  echo.
  echo [2/3] Prisma detectado. Generando cliente...
  >> "%LOGFILE%" echo [2/3] npx prisma generate
  call npx prisma generate >> "%LOGFILE%" 2>&1
  if errorlevel 1 goto :err

  echo.
  echo [3/3] Aplicando esquema de Prisma a la base local...
  >> "%LOGFILE%" echo [3/3] npx prisma db push
  call npx prisma db push >> "%LOGFILE%" 2>&1
  if errorlevel 1 goto :err
) else (
  echo.
  echo [2/3] No se encontro prisma\schema.prisma. Se omite Prisma.
  >> "%LOGFILE%" echo [2/3] No se encontro prisma\schema.prisma. Se omite Prisma.
  echo [3/3] Instalacion base completada.
  >> "%LOGFILE%" echo [3/3] Instalacion base completada.
)

echo.
echo =========================================
echo Instalacion completada correctamente.
echo Ahora ejecuta start.windows.bat
echo =========================================
>> "%LOGFILE%" echo.
>> "%LOGFILE%" echo Instalacion completada correctamente.
pause
exit /b 0

:node_missing
echo.
echo ERROR: Node.js no esta instalado o no esta en PATH.
echo Instala Node.js LTS y vuelve a ejecutar este archivo.
echo ERROR: Node.js no esta instalado o no esta en PATH. >> "%LOGFILE%"
pause
exit /b 1

:npm_missing
echo.
echo ERROR: npm no esta disponible en PATH.
echo Reinstala Node.js LTS o revisa tu PATH.
echo ERROR: npm no esta disponible en PATH. >> "%LOGFILE%"
pause
exit /b 1

:err
echo.
echo =========================================
echo ERROR: La instalacion fallo.
echo Revisa el archivo %LOGFILE%
echo =========================================
echo.
type "%LOGFILE%"
pause
exit /b 1
