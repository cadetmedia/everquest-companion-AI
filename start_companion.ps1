<#
.SYNOPSIS
  Starts EQ Companion from source (the dev app) on this clone's checked-out branch.

.DESCRIPTION
  Fork tooling (main_community_rules). Does, in order, what a dev launch needs on Windows:
    1. finds Node 24 (the PATH node if it is 24+, else the newest nvm-windows v24.x);
    2. refuses to start if this clone's Electron is already running (single-instance lock);
    3. installs node_modules if they are missing;
    4. rebuilds the release engine (npm run build:engine) when engine/ sources are newer
       than engine/target/release/engined.exe, if cargo is installed;
    5. clears ELECTRON_RUN_AS_NODE (VS Code terminals leak it; Electron then runs as Node);
    6. clears the vite pre-bundle and the dev channel's Electron caches (a stale pre-bundle
       once left title-bar clicks silently dead);
    7. runs `npm run dev` (with -NoWatch, `npm start`; with -Prod, a production build) in this
       window. Ctrl+C stops it.

.PARAMETER NoWatch
  Run `npm start` instead of `npm run dev`: no restart when files under src/main change.
  Use it while merging or switching branches in this clone.

.PARAMETER Prod
  Build the app once (`electron-vite build`) and run that build (`electron-vite preview`) instead of
  the dev server: about twice as fast on every tab (owner, 2026-10-20, measured 2.2x), no hot reload
  and no restart on file changes, so a merge here changes nothing until the next launch. Same
  settings and data as the dev app (an unpackaged build is still the dev channel). The dev-only
  tools (the Restart app button, the triage tab) are absent, as in an installer.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\start_companion.ps1
#>
param([switch]$NoWatch, [switch]$Prod)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
Set-Location $repo

function Get-NodeMajor([string]$exe) {
  try { $v = & $exe --version 2>$null } catch { return 0 }
  if ($v -match '^v(\d+)\.') { return [int]$Matches[1] }
  return 0
}

# 1. Node 24. The suite and the dev build assume it; Node 22 misloads tsx modules.
$nodeDir = $null
$pathNode = Get-Command node -ErrorAction SilentlyContinue
if ($pathNode -and (Get-NodeMajor $pathNode.Source) -ge 24) {
  $nodeDir = Split-Path $pathNode.Source
} else {
  $nvmRoot = if ($env:NVM_HOME) { $env:NVM_HOME } else { Join-Path $env:APPDATA 'nvm' }
  if (Test-Path $nvmRoot) {
    $candidate = Get-ChildItem $nvmRoot -Directory -Filter 'v24.*' |
      Where-Object { Test-Path (Join-Path $_.FullName 'node.exe') } |
      Sort-Object { [version]($_.Name.TrimStart('v')) } -Descending |
      Select-Object -First 1
    if ($candidate) { $nodeDir = $candidate.FullName }
  }
}
if (-not $nodeDir) {
  Write-Error 'Node 24 not found. Install it (nvm install 24) or put a Node 24 node.exe on PATH.'
}
$env:PATH = "$nodeDir;$env:PATH"
Write-Host "Node $(& (Join-Path $nodeDir 'node.exe') --version) from $nodeDir"

# 2. One instance per clone. Closing it is the user's call, never this script's.
# Test runs from worktrees (an agent's hidden e2e app, `out-e2e`) share this clone's Electron binary
# through their node_modules junction but are not the app: they are skipped (2026-10-20, a hidden
# test app blocked the owner's relaunch).
$running = Get-CimInstance Win32_Process -Filter "name='electron.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase) -and
    $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch 'out-e2e|worktrees'
  } |
  Select-Object @{ n = 'Id'; e = { $_.ProcessId } }
if ($running) {
  Write-Warning "EQ Companion is already running from this clone (pid $($running[0].Id)). Close it first."
  exit 1
}

# 3. Dependencies.
if (-not (Test-Path (Join-Path $repo 'node_modules'))) {
  Write-Host 'node_modules missing: running npm ci'
  npm ci
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# 4. The engine. Dev mode spawns the RELEASE build; a stale one runs old parser code.
$engineExe = Join-Path $repo 'engine\target\release\engined.exe'
$sources = Get-ChildItem (Join-Path $repo 'engine') -Recurse -File -Include *.rs, Cargo.toml, Cargo.lock |
  Where-Object { $_.FullName -notlike '*\engine\target\*' }
# The engine also BUILDS IN the app's data (include_str! of items.json, mobs.json, spells.json,
# quests and more): a wiki data refresh with no engine code change still needs a rebuild (2026-10-20:
# the delta's mobs left the running engine on the old catalog until a by-hand build:engine).
$sources = @($sources) + @(Get-ChildItem (Join-Path $repo 'src\main\data'), (Join-Path $repo 'src\renderer\src\data\eqlegends') -Recurse -File -Include *.json)
$newest = ($sources | Measure-Object LastWriteTime -Maximum).Maximum
$stale = -not (Test-Path $engineExe) -or ((Get-Item $engineExe).LastWriteTime -lt $newest)
if ($stale) {
  $cargo = (Get-Command cargo -ErrorAction SilentlyContinue) -or (Test-Path (Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'))
  if ($cargo) {
    Write-Host 'Engine sources or its built-in data are newer than engined.exe: running npm run build:engine'
    npm run build:engine
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } elseif (Test-Path $engineExe) {
    Write-Warning 'engined.exe is older than engine/ sources and cargo is not installed; starting with the old engine.'
  } else {
    Write-Warning 'No engined.exe and no cargo: the app will start without its engine.'
  }
}

# 5 and 6. Environment and caches.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$devData = Join-Path $env:APPDATA 'everquest-companion-dev'
foreach ($dir in @((Join-Path $repo 'node_modules\.vite'), (Join-Path $devData 'Cache'), (Join-Path $devData 'Code Cache'))) {
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
}

# 7. Launch.
if ($Prod) { npm run preview } elseif ($NoWatch) { npm start } else { npm run dev }
exit $LASTEXITCODE
