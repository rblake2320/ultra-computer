$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'private-service.mjs') start
if ($LASTEXITCODE -ne 0) { throw "Private service startup failed; inspect data/private-service.log." }
