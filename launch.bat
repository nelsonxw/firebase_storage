@echo off
echo ====================================
echo Firebase Storage Manager Launcher
echo ====================================
echo.

REM Get the directory where this batch file is located
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo Starting Firebase Storage Manager...
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8 or higher
    pause
    exit /b 1
)

REM Check if service account key exists
if not exist "serviceAccountKey.json" (
    echo WARNING: serviceAccountKey.json not found
    echo Please copy your service account key to this directory
    echo.
)

REM Start the Flask backend server
echo [1/2] Starting backend server on port 5000...
start "Firebase Storage Backend" cmd /k "python server.py"

REM Wait a moment for the backend to start
timeout /t 3 /nobreak >nul

REM Start the frontend HTTP server
echo [2/2] Starting frontend server on port 8080...
start "Firebase Storage Frontend" cmd /k "python -m http.server 8080"

REM Wait a moment for the frontend to start
timeout /t 2 /nobreak >nul

echo.
echo ====================================
echo Servers started successfully!
echo ====================================
echo.
echo Backend API: http://localhost:5000
echo Web Interface: http://localhost:8080
echo.
echo Opening web interface in your default browser...
echo.

REM Open the web interface in the default browser
start http://localhost:8080

echo.
echo Press any key to stop all servers and close this window...
pause >nul

REM Stop the servers when user presses a key
echo.
echo Stopping servers...
taskkill /FI "WINDOWTITLE eq Firebase Storage Backend*" /T >nul 2>&1
taskkill /FI "WINDOWTITLE eq Firebase Storage Frontend*" /T >nul 2>&1

echo Servers stopped. Goodbye!
timeout /t 2 /nobreak >nul
