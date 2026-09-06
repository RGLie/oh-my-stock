param([ValidateSet('start','dev','build','test','login-codex','login-claude','status')][string]$Action='start')
$ErrorActionPreference = 'Stop'
$omsRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $omsRoot
$omsNodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$omsBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$omsNode = $null
$omsCandidates = @($omsBundledNode)
if ($omsNodeCommand) { $omsCandidates += $omsNodeCommand.Source }
foreach ($omsCandidate in $omsCandidates) {
  if (-not (Test-Path -LiteralPath $omsCandidate)) { continue }
  $omsVersionText = (& $omsCandidate --version | Out-String).Trim()
  if ($omsVersionText -match '^v(\d+)\.' -and [int]$Matches[1] -ge 24) { $omsNode = $omsCandidate; break }
}
if (-not $omsNode) { throw 'Node.js 24 or newer is required. Install Node.js and run this script again.' }
$env:PATH = (Split-Path -Parent $omsNode) + ';' + $env:PATH
if (-not (Test-Path -LiteralPath (Join-Path $omsRoot 'node_modules\tsx'))) { throw 'Dependencies are missing. Run pnpm install in this folder first (see README.md).' }
switch ($Action) {
  'build' {
    & $omsNode node_modules/typescript/bin/tsc --noEmit
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $omsNode node_modules/vite/bin/vite.js build
  }
  'test' { & $omsNode --import tsx --test 'tests/*.test.ts' }
  'dev' { & $omsNode --import tsx --watch server/index.ts }
  'login-codex' { & $omsNode node_modules/@openai/codex/bin/codex.js login }
  'login-claude' { & (Join-Path $omsRoot 'node_modules\@anthropic-ai\claude-code\bin\claude.exe') auth login }
  'status' { & $omsNode --import tsx scripts/status.ts }
  'start' {
    if (-not (Test-Path -LiteralPath (Join-Path $omsRoot 'dist\index.html'))) {
      & $omsNode node_modules/typescript/bin/tsc --noEmit
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
      & $omsNode node_modules/vite/bin/vite.js build
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    & $omsNode --import tsx server/index.ts --production
  }
}
exit $LASTEXITCODE
