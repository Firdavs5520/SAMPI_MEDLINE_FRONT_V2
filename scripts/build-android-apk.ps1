$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$frontendRoot = Split-Path -Parent $scriptDir
$projectRoot = Split-Path -Parent $frontendRoot
$toolsRoot = Join-Path $projectRoot ".codex\android-build"
$jdkHome = Join-Path $toolsRoot "jdk-21"
$sdkRoot = Join-Path $toolsRoot "sdk"

if (!(Test-Path (Join-Path $jdkHome "bin\java.exe"))) {
  throw "JDK 21 not found at $jdkHome"
}

if (!(Test-Path (Join-Path $sdkRoot "platforms\android-36"))) {
  throw "Android SDK android-36 not found at $sdkRoot"
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$jdkHome\bin;$sdkRoot\cmdline-tools\latest\bin;$sdkRoot\platform-tools;$env:Path"

Push-Location $frontendRoot
try {
  npm run build
  npx cap sync android

  Push-Location "android"
  try {
    .\gradlew.bat assembleDebug
  } finally {
    Pop-Location
  }

  $outputsDir = Join-Path $projectRoot "outputs"
  New-Item -ItemType Directory -Force -Path $outputsDir | Out-Null

  $sourceApk = Join-Path $frontendRoot "android\app\build\outputs\apk\debug\app-debug.apk"
  $targetApk = Join-Path $outputsDir "sampi-medline-tv-debug.apk"
  Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force

  Write-Output "APK_READY=$targetApk"
} finally {
  Pop-Location
}
