@echo off
set PM2_HOME=%USERPROFILE%\.pm2
cd /d %~dp0\webapp-excel
pm2 start ecosystem.config.cjs
