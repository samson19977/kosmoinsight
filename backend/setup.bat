@echo off
:: KosmoInsight AI — Windows setup script
:: Run this once from inside the backend\ folder:
::   cd backend
::   setup.bat

echo ==> Setting up KosmoInsight AI backend...
echo.

:: Check Python
python --version 2>NUL
if errorlevel 1 (
    echo ERROR: Python not found. Install Python 3.11+ from python.org
    pause
    exit /b 1
)

:: Remove broken venv if it exists
if exist venv (
    echo ==> Removing old/broken venv...
    rmdir /s /q venv
)

:: Create fresh venv
echo ==> Creating virtual environment...
python -m venv venv
if errorlevel 1 (
    echo ERROR: Failed to create venv
    pause
    exit /b 1
)

:: Activate and upgrade pip
echo ==> Activating venv and upgrading pip...
call venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet

:: Install dependencies
echo ==> Installing packages (this may take 2-3 minutes)...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed. Check requirements.txt
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Setup complete!
echo ============================================
echo.
echo Next steps:
echo   1. Make sure your .env file exists with DATABASE_URL and SECRET_KEY
echo   2. Run: venv\Scripts\activate
echo   3. Run: uvicorn app.main:app --reload
echo.
echo VS Code: Ctrl+Shift+P ^> Python: Select Interpreter ^> .\venv\Scripts\python.exe
echo.
pause
