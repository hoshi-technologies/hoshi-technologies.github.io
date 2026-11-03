@echo off
REM Lance Hoshi Club sur votre boutique de test Shopify (double-clic).
cd /d "%~dp0"
where shopify >nul 2>nul
if errorlevel 1 (
  echo Installation de Shopify CLI...
  call npm install -g @shopify/cli
)
echo Installation des dependances...
call npm install
echo Configuration : shopify.app.toml
call shopify app config use shopify.app.toml
call shopify app dev
pause
