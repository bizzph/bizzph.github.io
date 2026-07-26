@echo off
set PORT=4173
if not "%1"=="" set PORT=%1
python serve.py --port %PORT%
