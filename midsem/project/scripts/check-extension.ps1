# Checks that the extension folder is complete: manifest.json parses, is Manifest V3,
# and every file it points to (plus the two injected scripts) exists.
# Called by setup.bat. Prints what is wrong in plain English; exit code 1 means a problem.
param([string]$LogFile = "")

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Say($message) {
    Write-Host $message
    if ($LogFile) { Add-Content -Path $LogFile -Value "[check] $message" }
}

$manifestPath = Join-Path $root 'manifest.json'
if (-not (Test-Path $manifestPath)) {
    Say "manifest.json is missing from $root. The download looks incomplete."
    exit 1
}

try {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
} catch {
    Say "manifest.json cannot be read: $($_.Exception.Message)"
    exit 1
}

$problems = @()
if ($manifest.manifest_version -ne 3) { $problems += "manifest.json is not Manifest V3 (found version $($manifest.manifest_version))." }

$files = @('src/lib/readability.js', 'src/content/extract.js')
if ($manifest.background.service_worker) { $files += $manifest.background.service_worker }
if ($manifest.action.default_popup) { $files += $manifest.action.default_popup }
if ($manifest.options_page) { $files += $manifest.options_page }
if ($manifest.icons) { $manifest.icons.PSObject.Properties | ForEach-Object { $files += $_.Value } }

foreach ($file in ($files | Select-Object -Unique)) {
    if (-not (Test-Path (Join-Path $root $file))) { $problems += "A file the extension needs is missing: $file" }
}

if ($problems.Count -gt 0) {
    foreach ($p in $problems) { Say $p }
    exit 1
}

Say "Extension files look complete (extension version $($manifest.version))."
exit 0
