# Looks at the computer Version 2 will run on and says what it found, in plain English.
# Called by setup.bat. Exit code 1 only when there is not enough free disk space (the model is
# about 700 MB and Chrome stores it on the system drive); everything else is advice.
param([string]$LogFile = "", [double]$MinFreeGB = 3)

$ErrorActionPreference = 'Continue'

function Say($message) {
    Write-Host $message
    if ($LogFile) { Add-Content -Path $LogFile -Value "[computer] $message" }
}

$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
Say "  Windows: $($os.Caption) (build $($os.BuildNumber))"
Say "  Processor: $cpu"
Say "  Memory: $ramGB GB"

$gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -and $_.Name -notmatch 'Basic Display|Remote|Virtual' })
$hasDiscrete = $false
$hasIntel = $false
foreach ($g in $gpus) {
    $mem = if ($g.AdapterRAM -gt 0) { " ($([math]::Round($g.AdapterRAM / 1MB)) MB reported)" } else { "" }
    Say "  Graphics: $($g.Name)$mem"
    if ($g.Name -match 'NVIDIA|AMD|Radeon|GeForce|RTX|GTX|Arc') { $hasDiscrete = $true }
    if ($g.Name -match 'Intel\(R\) (UHD|HD|Iris)|Intel UHD|Intel HD|Intel Iris') { $hasIntel = $true }
}
if ($gpus.Count -eq 0) { Say "  Graphics: none found. Version 2 needs a graphics card that supports WebGPU." }

$system = (Get-Item $env:SystemDrive).PSDrive
$freeGB = [math]::Round((Get-PSDrive -Name $system.Name).Free / 1GB, 1)
Say "  Free space on $($env:SystemDrive): $freeGB GB (the model download is about 700 MB)"

if ($hasDiscrete -and $hasIntel) {
    Say "  Tip: this computer has built-in AND separate graphics. Chrome may pick the slow built-in one."
    Say "       Run  setup.bat --gpu  to set Chrome to use the separate card, or use Windows Settings > System > Display > Graphics."
} elseif ($hasIntel -and -not $hasDiscrete) {
    Say "  Note: only built-in graphics were found. Version 2 will use the small model and can be slow."
}
Say "  After setup, open chrome://gpu in Chrome and check that WebGPU says 'Hardware accelerated'."

if ($freeGB -lt $MinFreeGB) {
    Say "  Not enough free disk space: $freeGB GB free, at least $MinFreeGB GB is needed."
    exit 1
}
exit 0
