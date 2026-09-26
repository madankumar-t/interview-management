Param(
  [string]$OutputZip = "..\\artifacts\\backend.zip",
  [string]$PythonExecutable = "python"
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

& $PythonExecutable -m pip install . -t $buildDir --platform manylinux2014_x86_64 --python-version 3.12 --implementation cp --abi cp312 --only-binary=:all:
if ($LASTEXITCODE -ne 0) {
  throw "pip install failed while building Lambda package"
}
Copy-Item -Recurse "app" (Join-Path $buildDir "app")
if (Test-Path $OutputZip) {
  Remove-Item -Force $OutputZip
}
Compress-Archive -Path (Join-Path $buildDir "*") -DestinationPath $OutputZip
Write-Host "Created $OutputZip"
