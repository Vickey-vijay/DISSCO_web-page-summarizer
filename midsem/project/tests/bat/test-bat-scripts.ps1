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
    Check 'B3b' 'run.bat prints the four load steps' (($r.Output -match 'Developer mode') -and ($r.Output -match 'Load unpacked') -and ($r.Output -match 'Key box')) $r.Output
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
} finally {
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
