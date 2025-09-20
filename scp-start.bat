@echo off
call npm install
if errorlevel 1 pause
call npm start
pause