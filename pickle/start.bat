@echo off
set PORT=4173
echo PicklePulse is available at http://localhost:%PORT%
py -m http.server %PORT%
