@echo off
echo Starting Tuned In ZW Backend Server on http://127.0.0.1:8006 ...
call .\venv\Scripts\activate.bat
python -m uvicorn main:app --host 127.0.0.1 --port 8006 --reload
pause
