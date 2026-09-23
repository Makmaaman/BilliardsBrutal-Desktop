@echo off
REM ----- запустити booking-server -----
cd /d "E:\Billiard V2\booking-server"
start "BookingServer" cmd /c "npm run dev"

REM ----- запустити основну програму -----
cd /d "E:\Billiard V2"

REM Якщо ти запускаєш програму командою npm:
REM start "DunaBilliard" cmd /c "npm run dev"

REM Якщо у тебе вже зібраний .exe, то щось типу:
REM start "DunaBilliard" "E:\Billiard V2\DunaBilliard.exe"
