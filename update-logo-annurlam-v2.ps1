$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/hirmanto-karawang/tabungan-qurban-annurlam.git"
$work = Join-Path $env:TEMP "annurlam-logo-update-v2"
$newLogoPng = Join-Path $PSScriptRoot "logo-masjid-annurlam.png"

if (-not (Test-Path $newLogoPng)) {
    Write-Host "GAGAL: file logo-masjid-annurlam.png tidak ditemukan di folder ini." -ForegroundColor Red
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

# 1) Taruh logo PNG transparan (bulat, tanpa kotak putih) sebagai file baru
$pngTarget = Join-Path $work "public\logo-masjid.png"
Copy-Item -Path $newLogoPng -Destination $pngTarget -Force
Write-Host "Logo PNG (transparan, bulat) ditaruh di public/logo-masjid.png" -ForegroundColor Green

# 2) Edit index.html: APP_CONFIG.logoFile & CSS wrapper kotak putih
$file = Join-Path $work "public\index.html"
$content = Get-Content -Raw -Path $file
$usedCRLF = $content.Contains("`r`n")
$content = $content -replace "`r`n", "`n"
$errors = @()

function Try-Replace {
    param($content, $old, $new, $label, [ref]$errorsRef)
    if ($content.Contains($old)) {
        return $content.Replace($old, $new)
    } else {
        $errorsRef.Value += $label
        return $content
    }
}

# Ganti nama file logo yang dipakai APP_CONFIG dari .jpg ke .png
$old1 = "logoFile: 'logo-masjid.jpg',"
$new1 = "logoFile: 'logo-masjid.png',"
$content = Try-Replace $content $old1 $new1 "1-logoFile-config" ([ref]$errors)

# Hilangkan kotak putih (background/border/shadow) di wrapper logo dashboard,
# supaya logo bulat tampil polos tanpa kartu putih di belakangnya.
$old2 = "  .dashboard-logo-wrap{`n    display:inline-flex;`n    align-items:center;`n    justify-content:center;`n    width:72px;`n    height:72px;`n    background: var(--surface);`n    border:1px solid var(--border-soft);`n    border-radius: 16px;`n    box-shadow: var(--shadow-sm);`n    animation: slideDown 0.6s ease-out;`n  }"
$new2 = "  .dashboard-logo-wrap{`n    display:inline-flex;`n    align-items:center;`n    justify-content:center;`n    width:72px;`n    height:72px;`n    animation: slideDown 0.6s ease-out;`n  }"
$content = Try-Replace $content $old2 $new2 "2-dashboard-logo-wrap-css" ([ref]$errors)

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "GAGAL: pola berikut tidak ditemukan (kode An-Nurlam beda struktur di titik ini):" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "Tidak ada yang di-commit. Kirim daftar ini biar disiapkan fix manual." -ForegroundColor Yellow
    exit 1
}

if ($usedCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -Path $file -Value $content -NoNewline
Write-Host "index.html berhasil diupdate (logoFile + hapus kotak putih wrapper)" -ForegroundColor Green

git add public/logo-masjid.png public/index.html
git commit -m "Logo An-Nurlam: pakai PNG transparan bulat, hapus kotak putih di wrapper dashboard"
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL commit." -ForegroundColor Red; exit 1 }

git push origin $branch
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL push." -ForegroundColor Red; exit 1 }

Write-Host "SELESAI: logo bulat transparan berhasil di-push ke repo An-Nurlam." -ForegroundColor Green
