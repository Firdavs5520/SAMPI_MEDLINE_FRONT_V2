$ErrorActionPreference = "Stop"

$frontendDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$rootDir = Resolve-Path (Join-Path $frontendDir "..")
$installerOutDir = Join-Path $rootDir "outputs\windows-installer"
$updateOutDir = Join-Path $rootDir "outputs\desktop-updates"
$publicUpdateOutDir = Join-Path $frontendDir "public\desktop-updates"
$finalInstaller = Join-Path $rootDir "outputs\sampi-medline-setup.exe"

Set-Location $frontendDir

$buildStart = Get-Date
$staleFiles = @(
  (Join-Path $installerOutDir "latest.yml"),
  (Join-Path $installerOutDir "sampi-medline-setup.exe"),
  (Join-Path $installerOutDir "sampi-medline-setup.exe.blockmap")
)

foreach ($staleFile in $staleFiles) {
  Remove-Item -LiteralPath $staleFile -Force -ErrorAction SilentlyContinue
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win nsis --publish never
if ($LASTEXITCODE -ne 0) {
  throw "electron-builder failed with exit code $LASTEXITCODE."
}

$builtInstaller = Join-Path $installerOutDir "sampi-medline-setup.exe"
if (-not (Test-Path -LiteralPath $builtInstaller)) {
  throw "Windows installer was not produced."
}

$builtInstallerItem = Get-Item -LiteralPath $builtInstaller
if ($builtInstallerItem.LastWriteTime -lt $buildStart) {
  throw "Windows installer is stale and was not rebuilt."
}

New-Item -ItemType Directory -Path $updateOutDir -Force | Out-Null
New-Item -ItemType Directory -Path $publicUpdateOutDir -Force | Out-Null

Copy-Item -LiteralPath $builtInstaller -Destination $finalInstaller -Force

$updateFiles = @(
  "latest.yml",
  "sampi-medline-setup.exe",
  "sampi-medline-setup.exe.blockmap"
)

foreach ($fileName in $updateFiles) {
  $source = Join-Path $installerOutDir $fileName
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $updateOutDir $fileName) -Force
    Copy-Item -LiteralPath $source -Destination (Join-Path $publicUpdateOutDir $fileName) -Force
  }
}

Write-Host "Windows installer copied to: $finalInstaller"
Write-Host "Auto-update files copied to: $updateOutDir"
Write-Host "Public site update files copied to: $publicUpdateOutDir"
