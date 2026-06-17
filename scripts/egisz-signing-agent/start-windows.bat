@echo off
REM Запуск агента подписи на Windows (ПК с флешкой КриптоПро)
cd /d "%~dp0"

if "%EGISZ_SIGNING_SECRET%"=="" (
  echo Задайте секрет: set EGISZ_SIGNING_SECRET=ваш-длинный-секрет
  exit /b 1
)

if "%CRYPTOPRO_CRYPTCP%"=="" (
  set "CRYPTOPRO_CRYPTCP=C:\Program Files\Crypto Pro\CSP\cryptcp.exe"
)

echo Агент подписи Emkaro — порт %EGISZ_SIGNING_PORT%
node server.mjs
