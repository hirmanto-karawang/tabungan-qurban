$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/hirmanto-karawang/tabungan-qurban-annurlam.git"
$work = Join-Path $env:TEMP "annurlam-fix-title"

if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

Write-Host "Cloning repo An-Nurlam..." -ForegroundColor Cyan
git clone $repoUrl $work
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL clone repo." -ForegroundColor Red; exit 1 }
Set-Location $work

$branch = (git remote show origin | Select-String "HEAD branch" | ForEach-Object { $_.ToString().Split(":")[1].Trim() })
git checkout $branch | Out-Null

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

# Ganti <title> statis + tambah Open Graph tags supaya preview share
# (WhatsApp dll, yang tidak menjalankan JS) tampil benar sebagai An-Nurlam,
# bukan lagi "Masjid Dhafinul Jariyah" bawaan waktu duplikasi awal.
$old1 = "<title>Tabungan Qurban - Masjid Dhafinul Jariyah</title>`n<link rel=`"preconnect`" href=`"https://fonts.googleapis.com`">"
# (placeholder tidak dipakai, di-skip - lihat old1b di bawah pakai em dash asli)
$old1b = "<title>Tabungan Qurban — Masjid Dhafinul Jariyah</title>`n<link rel=`"preconnect`" href=`"https://fonts.googleapis.com`">"
$new1b = "<title>Tabungan Qurban — Masjid An-Nurlam</title>`n<meta name=`"description`" content=`"Aplikasi pencatatan tabungan Qurban jemaah Masjid An-Nurlam, Karawang.`">`n<meta property=`"og:title`" content=`"Tabungan Qurban — Masjid An-Nurlam`">`n<meta property=`"og:description`" content=`"Platform pencatatan tabungan Qurban untuk jemaah Masjid An-Nurlam — transparan dari transfer hingga hari penyembelihan.`">`n<meta property=`"og:image`" content=`"https://tabungan-qurban-annurlam.vercel.app/logo-masjid.png`">`n<meta property=`"og:type`" content=`"website`">`n<link rel=`"preconnect`" href=`"https://fonts.googleapis.com`">"
$content = Try-Replace $content $old1b $new1b "1-title-and-og-tags" ([ref]$errors)

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "GAGAL: pola berikut tidak ditemukan:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "Tidak ada yang di-commit." -ForegroundColor Yellow
    exit 1
}

if ($usedCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -Path $file -Value $content -NoNewline
Write-Host "Title & Open Graph tags berhasil diupdate" -ForegroundColor Green

git add public/index.html
git commit -m "Fix judul tab & tambah Open Graph tags untuk An-Nurlam (title masih Dhafinul Jariyah)"
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL commit." -ForegroundColor Red; exit 1 }

git push origin $branch
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL push." -ForegroundColor Red; exit 1 }

Write-Host "SELESAI: title & Open Graph An-Nurlam berhasil di-push." -ForegroundColor Green
