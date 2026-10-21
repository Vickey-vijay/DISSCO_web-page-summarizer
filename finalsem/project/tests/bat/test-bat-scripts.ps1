# Runs setup.bat and run.bat for real, in throw-away copies of the project, and checks that
# both the success path and the plain-English failure messages work.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tests\bat\test-bat-scripts.ps1
#
# Not covered here: the clipboard step of run.bat (the test must not touch the user's clipboard),
# and the "Chrome not installed" and "Chrome too old" branches, because they
# need a machine without Chrome. Those are checked by reading the script only.
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$results = @()
$temps = @()

function New-ProjectCopy {
    $dst = Join-Path $env:TEMP ('ps-bat-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    robocopy $project $dst /E /XD node_modules test-output .git /XF .setup-ok setup.log /NFL /NDL /NJH /NJS /NP | Out-Null
    $script:temps += $dst
    return $dst
}

function Invoke-Bat([string]$dir, [string]$command, [hashtable]$envVars = @{}) {
    $saved = @{}
    foreach ($k in $envVars.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $envVars[$k]) }
    try {
        $out = cmd /c "cd /d `"$dir`" && $command 2>&1"
        $code = $LASTEXITCODE
    } finally {
        foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
    }
    return [pscustomobject]@{ Output = ($out -join "`n"); Code = $code }
}

function Check([string]$id, [string]$what, [bool]$ok, [string]$detail = '') {
    $script:results += [pscustomobject]@{ Id = $id; Check = $what; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail }
    Write-Host ("{0,-6} {1,-4} {2}" -f $id, $(if ($ok) { 'PASS' } else { 'FAIL' }), $what)
    if (-not $ok -and $detail) { Write-Host "       $detail" }
}

try {
    # B1: run.bat before setup tells the user to run setup.bat first
    $d = New-ProjectCopy
    $r = Invoke-Bat $d '.\run.bat' @{ RUN_NOPAUSE = '1'; RUN_NOCLIP = '1' }
    Check 'B1' 'run.bat without setup says to run setup.bat first' (($r.Output -match 'Setup has not been completed') -and $r.Code -eq 1) $r.Output

    # B2: normal setup succeeds, writes the marker and the log
    $d = New-ProjectCopy
    $r = Invoke-Bat $d '.\setup.bat' @{ SETUP_NOPAUSE = '1' }
    Check 'B2' 'setup.bat succeeds on a complete project' (($r.Output -match 'SETUP COMPLETE') -and $r.Code -eq 0) $r.Output
    Check 'B2b' 'setup.bat wrote .setup-ok and setup.log' ((Test-Path "$d\.setup-ok") -and (Test-Path "$d\setup.log"))
    $setupOut = $r.Output

    # B3: run.bat after setup (with a stand-in for Chrome so no real browser window opens)
    $fake = Join-Path $d 'fake-chrome.bat'
    Set-Content -Path $fake -Value "@echo off`r`necho %* >> `"$d\fake-chrome-args.txt`"`r`nexit" -Encoding ascii
    Set-Content -Path "$d\.setup-ok" -Value "CHROME=$fake" -Encoding ascii
    $r = Invoke-Bat $d '.\run.bat' @{ RUN_NOPAUSE = '1'; RUN_NOCLIP = '1' }
    Start-Sleep -Seconds 5
    $seen = if (Test-Path "$d\fake-chrome-args.txt") { Get-Content "$d\fake-chrome-args.txt" -Raw } else { '' }
    Check 'B3' 'run.bat opens chrome://extensions and a sample article' (($seen -match 'chrome://extensions') -and ($seen -match 'wikipedia.org/wiki/Lighthouse')) "args seen: $seen"
    Check 'B3b' 'run.bat prints the four load steps' (($r.Output -match 'Developer mode') -and ($r.Output -match 'Load unpacked') -and ($r.Output -match 'Download model and summarize')) $r.Output
    $runOut = $r.Output

    # B4: a damaged project (manifest.json removed) fails with a plain message and no marker
    $d = New-ProjectCopy
    Remove-Item "$d\manifest.json"
    $r = Invoke-Bat $d '.\setup.bat' @{ SETUP_NOPAUSE = '1' }
    Check 'B4' 'setup.bat reports a missing manifest.json and exits 1' (($r.Output -match 'SETUP FAILED') -and ($r.Output -match 'manifest.json is missing') -and $r.Code -eq 1 -and -not (Test-Path "$d\.setup-ok")) $r.Output
    $failOut = $r.Output

    # B5: an unreadable manifest.json
    $d = New-ProjectCopy
    Set-Content "$d\manifest.json" '{ not json' -Encoding ascii
    $r = Invoke-Bat $d '.\setup.bat' @{ SETUP_NOPAUSE = '1' }
    Check 'B5' 'setup.bat reports an unreadable manifest.json' (($r.Output -match 'SETUP FAILED') -and ($r.Output -match 'cannot be read') -and $r.Code -eq 1) $r.Output

    # B6: a file the manifest points to is missing
    $d = New-ProjectCopy
    Remove-Item "$d\src\ui\popup.html"
    $r = Invoke-Bat $d '.\setup.bat' @{ SETUP_NOPAUSE = '1' }
    Check 'B6' 'setup.bat names the missing popup file' (($r.Output -match 'popup\.html') -and $r.Code -eq 1) $r.Output

    # B7: --dev without Node.js on PATH gives the install-Node message
    $d = New-ProjectCopy
    $sys = "$env:SystemRoot\System32;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
    $r = Invoke-Bat $d '.\setup.bat --dev' @{ SETUP_NOPAUSE = '1'; PATH = $sys }
    Check 'B7' 'setup.bat --dev without Node.js explains how to install it' (($r.Output -match 'Node.js was not found') -and ($r.Output -match 'nodejs.org') -and $r.Code -eq 1) $r.Output

    # B8: --dev --reset rebuilds node_modules from scratch (uses the network, cached browser)
    $d = New-ProjectCopy
    $r = Invoke-Bat $d '.\setup.bat --dev --reset' @{ SETUP_NOPAUSE = '1' }
    Check 'B8' 'setup.bat --dev --reset installs the test tools and completes' (($r.Output -match 'SETUP COMPLETE') -and (Test-Path "$d\node_modules\playwright") -and $r.Code -eq 0) $r.Output

    # B9: the computer check describes the graphics card, memory and disk, and passes with enough space
    $r = Invoke-Bat $project '.\setup.bat' @{ SETUP_NOPAUSE = '1' }
    Check 'B9' 'setup.bat step 4 describes graphics, memory and free disk space' (($r.Output -match 'Graphics:') -and ($r.Output -match 'Memory:') -and ($r.Output -match 'Free space on')) $r.Output
    # B9b: with an impossible disk requirement the check fails with its plain message and exit code 1
    $out = powershell -NoProfile -ExecutionPolicy Bypass -File "$project\scripts\check-computer.ps1" -MinFreeGB 99999 2>&1
    Check 'B9b' 'check-computer.ps1 fails clearly when there is not enough free disk space' (($LASTEXITCODE -eq 1) -and (($out -join ' ') -match 'Not enough free disk space')) ($out -join "`n")

    # B10: the graphics-card preference script writes and removes its value (a throw-away registry key is used, never the real Chrome setting)
    $tmpKey = 'HKCU:\Software\PageSummarizerTest-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $fakeChrome = 'C:\Fake Chrome\chrome.exe'
    $o1 = powershell -NoProfile -ExecutionPolicy Bypass -File "$project\scripts\set-chrome-gpu.ps1" -ChromePath $fakeChrome -RegistryPath $tmpKey 2>&1
    $val = (Get-ItemProperty -Path $tmpKey -Name $fakeChrome -ErrorAction SilentlyContinue).$fakeChrome
    Check 'B10' 'set-chrome-gpu.ps1 writes GpuPreference=2; for Chrome (test key only)' (($val -eq 'GpuPreference=2;') -and (($o1 -join ' ') -match 'high-performance')) (($o1 -join "`n") + " value=$val")
    $o2 = powershell -NoProfile -ExecutionPolicy Bypass -File "$project\scripts\set-chrome-gpu.ps1" -ChromePath $fakeChrome -RegistryPath $tmpKey -Remove 2>&1
    $gone = $null -eq (Get-ItemProperty -Path $tmpKey -Name $fakeChrome -ErrorAction SilentlyContinue).$fakeChrome
    Check 'B10b' 'set-chrome-gpu.ps1 -Remove undoes it' $gone ($o2 -join "`n")
    # B10c: without -ChromePath the script finds Chrome itself, so plain -Remove works (still only the throw-away key)
    $o3 = powershell -NoProfile -ExecutionPolicy Bypass -File "$project\scripts\set-chrome-gpu.ps1" -RegistryPath $tmpKey 2>&1
    $names = @((Get-Item -Path $tmpKey -ErrorAction SilentlyContinue).Property)
    $found = $names.Count -eq 1 -and $names[0] -match 'chrome\.exe$'
    $o4 = powershell -NoProfile -ExecutionPolicy Bypass -File "$project\scripts\set-chrome-gpu.ps1" -RegistryPath $tmpKey -Remove 2>&1
    $left = @((Get-Item -Path $tmpKey -ErrorAction SilentlyContinue).Property).Count
    Check 'B10c' 'set-chrome-gpu.ps1 finds Chrome by itself, and plain -Remove undoes it' ($found -and $left -eq 0) ((($o3 + $o4) -join "`n") + " names=$($names -join ',') left=$left")
    Remove-Item -Path $tmpKey -Recurse -Force -ErrorAction SilentlyContinue} finally {
    foreach ($t in $temps) { try { Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue } catch { } }
}

Write-Host ''
$fail = ($results | Where-Object Result -eq 'FAIL').Count
Write-Host ("{0} checks, {1} passed, {2} failed" -f $results.Count, ($results.Count - $fail), $fail)
Write-Host ''
Write-Host '---- sample output: successful setup.bat ----'
Write-Host $setupOut
Write-Host '---- sample output: run.bat ----'
Write-Host $runOut
Write-Host '---- sample output: failing setup.bat (manifest.json removed) ----'
Write-Host $failOut
exit $(if ($fail -eq 0) { 0 } else { 1 })
