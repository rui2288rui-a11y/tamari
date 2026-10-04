@echo off
cd /d "%~dp0"
if "%ADMIN_KEY%"=="" (
  set /p ADMIN_KEY=Tamari管理者キーを入力してください: 
)
if "%ADMIN_KEY%"=="" (
  echo ADMIN_KEYが空です。終了します。
  pause
  exit /b 1
)
node --disable-warning=ExperimentalWarning server.js
pause
