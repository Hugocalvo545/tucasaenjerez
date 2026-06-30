# deploy.ps1 — Script de deploy para JLA Apartments
# Uso: .\deploy.ps1
# Actualiza la versión del SW y despliega en Firebase Hosting

$fecha = Get-Date -Format "yyyyMMdd"

Write-Host "Actualizando service workers a version v$fecha..." -ForegroundColor Cyan

# Encoding UTF-8 SIN BOM (necesario para service workers)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Actualizar versión en sw.js (app pública)
$swPublicPath = "public/sw.js"
$swPublic = [System.IO.File]::ReadAllText($swPublicPath, $utf8NoBom)
$swPublic = $swPublic -replace 'jla-public-v\d+', "jla-public-v$fecha"
[System.IO.File]::WriteAllText((Resolve-Path $swPublicPath), $swPublic, $utf8NoBom)
Write-Host "  OK $swPublicPath" -ForegroundColor Green

# Actualizar versión en service-worker.js (intranet)
$swAdminPath = "public-admin/intranet/service-worker.js"
$swAdmin = [System.IO.File]::ReadAllText($swAdminPath, $utf8NoBom)
$swAdmin = $swAdmin -replace 'jla-intranet-v\d+', "jla-intranet-v$fecha"
[System.IO.File]::WriteAllText((Resolve-Path $swAdminPath), $swAdmin, $utf8NoBom)
Write-Host "  OK $swAdminPath" -ForegroundColor Green

Write-Host ""
Write-Host "Desplegando en Firebase..." -ForegroundColor Cyan
firebase deploy --only hosting

Write-Host ""
Write-Host "Deploy completado. Version: v$fecha" -ForegroundColor Green
