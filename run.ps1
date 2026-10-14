$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) { & '.\setup.ps1' }
& '.\.venv\Scripts\python.exe' app.py @args
exit $LASTEXITCODE
