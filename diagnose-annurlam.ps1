$file = Join-Path $env:TEMP "annurlam-multiadmin-fix-v2\public\index.html"
if (-not (Test-Path $file)) {
    Write-Host "File tidak ditemukan di $file - repo temp mungkin sudah kehapus. Beri tahu saya kalau ini terjadi." -ForegroundColor Red
    exit 1
}

Write-Host "=== SEKITAR 'urutan: parseInt' (mapping members) ===" -ForegroundColor Cyan
Select-String -Path $file -Pattern "urutan: parseInt" -Context 2,4

Write-Host ""
Write-Host "=== SEKITAR 'computeActivitySummary' ===" -ForegroundColor Cyan
Select-String -Path $file -Pattern "function computeActivitySummary" -Context 1,6
