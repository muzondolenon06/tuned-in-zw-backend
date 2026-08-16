@echo off
echo Starting Tuned In ZW Backend Server...
call .\venv\Scripts\activate.bat
python -m uvicorn main:app --reload
pause
