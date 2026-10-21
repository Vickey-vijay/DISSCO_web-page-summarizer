# Tells Windows to run Chrome on the high-performance (separate) graphics card.
# It is the same setting as Windows Settings > System > Display > Graphics > Chrome > Options >
# High performance. It only changes the current user's setting, needs no administrator rights,
# and only runs when setup.bat is started with --gpu. Use -Remove to undo it.
#
#   set-chrome-gpu.ps1 -ChromePath "C:\Program Files\Google\Chrome\Application\chrome.exe"
#   set-chrome-gpu.ps1 -Remove            (finds Chrome by itself; or add -ChromePath "...")
#   -RegistryPath lets the tests use a throw-away key instead of the real one.
param(
    [string]$ChromePath = "",
    [string]$RegistryPath = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences',
    [switch]$Remove,
    [string]$LogFile = ""
)

function Find-Chrome {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe')
    )
    foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
    try {
        $reg = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction Stop).'(default)'
        if ($reg -and (Test-Path $reg)) { return $reg }
    } catch { }
    return ""
}

function Say($message) {
    Write-Host $message
    if ($LogFile) { Add-Content -Path $LogFile -Value "[gpu] $message" }
}

if (-not $ChromePath) { $ChromePath = Find-Chrome }
if (-not $ChromePath) {
    Say "  Could not find Google Chrome. Give its path:  set-chrome-gpu.ps1 -ChromePath `"C:\...\chrome.exe`""
    exit 1
}

try {
    if ($Remove) {
        if (Test-Path $RegistryPath) { Remove-ItemProperty -Path $RegistryPath -Name $ChromePath -ErrorAction SilentlyContinue }
        Say "  Removed the high-performance setting for: $ChromePath"
        exit 0
    }
    if (-not (Test-Path $RegistryPath)) { New-Item -Path $RegistryPath -Force | Out-Null }
    New-ItemProperty -Path $RegistryPath -Name $ChromePath -Value 'GpuPreference=2;' -PropertyType String -Force | Out-Null
    Say "  Windows will now run Chrome on the high-performance graphics card."
    Say "  Close ALL Chrome windows and open Chrome again for this to take effect."
    Say "  To undo it: run  powershell -File scripts\set-chrome-gpu.ps1 -ChromePath `"$ChromePath`" -Remove"
    exit 0
} catch {
    Say "  Could not change the graphics setting: $($_.Exception.Message)"
    Say "  You can do it by hand: Windows Settings > System > Display > Graphics > Chrome > Options > High performance."
    exit 1
}
