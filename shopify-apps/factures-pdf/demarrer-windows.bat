@echo off
REM Lance Hoshi Factures sur votre boutique de test Shopify (double-clic).
cd /d "%~dp0"
echo Installation des dependances...
call npm install
echo Configuration : shopify.app.toml
call shopify app config use shopify.app.toml
call shopify app dev
pause
