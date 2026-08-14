$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/hirmanto-karawang/tabungan-qurban-annurlam.git"
$work = Join-Path $env:TEMP "annurlam-logo-update"
$newLogo = Join-Path $PSScriptRoot "logo-masjid-annurlam.jpg"

if (-not (Test-Path $newLogo)) {
    Write-Host "GAGAL: file logo-masjid-annurlam.jpg tidak ditemukan di folder yang sama dengan script ini." -ForegroundColor Red
    Write-Host "Pastikan script ini dijalankan dari folder C:\Users\Lenovo\Documents\tabungan-qurban" -ForegroundColor Yellow
    exit 1
}

if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

Write-Host "Cloning repo An-Nurlam..." -ForegroundColor Cyan
git clone $repoUrl $work
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL clone repo." -ForegroundColor Red; exit 1 }
Set-Location $work

$branch = (git remote show origin | Select-String "HEAD branch" | ForEach-Object { $_.ToString().Split(":")[1].Trim() })
git checkout $branch | Out-Null

$target = Join-Path $work "public\logo-masjid.jpg"
Copy-Item -Path $newLogo -Destination $target -Force
Write-Host "Logo diganti di public/logo-masjid.jpg" -ForegroundColor Green

git add public/logo-masjid.jpg
git commit -m "Ganti logo Masjid An-Nurlam (crop rapi dari file asli, tanpa bingkai kayu & teks)"
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL commit." -ForegroundColor Red; exit 1 }

git push origin $branch
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL push." -ForegroundColor Red; exit 1 }

Write-Host "SELESAI: logo baru berhasil di-push ke repo An-Nurlam." -ForegroundColor Green
