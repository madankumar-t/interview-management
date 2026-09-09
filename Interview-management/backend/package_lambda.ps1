Param(
  [string]$OutputZip = "..\\artifacts\\backend.zip"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
if (!(Test-Path "..\\artifacts")) {
  New-Item -ItemType Directory -Path "..\\artifacts" | Out-Null
}
$buildDir = Join-Path $env:TEMP "ims-lambda-package"
if (Test-Path $buildDir) {
  Remove-Item -Recurse -Force $buildDir
}
New-Item -ItemType Directory -Path $buildDir | Out-Null

d:/Users/kumar.madan/code/Sazemaker/.venv/Scripts/python.exe -m pip install . -t $buildDir
if ($LASTEXITCODE -ne 0) {
  throw "pip install failed while building Lambda package"
}
Copy-Item -Recurse "app" (Join-Path $buildDir "app")
if (Test-Path $OutputZip) {
  Remove-Item -Force $OutputZip
}
Compress-Archive -Path (Join-Path $buildDir "*") -DestinationPath $OutputZip
Write-Host "Created $OutputZip"
