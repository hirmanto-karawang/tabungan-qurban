$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/hirmanto-karawang/tabungan-qurban-annurlam.git"
$work = Join-Path $env:TEMP "annurlam-fix-title-v2"

if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

Write-Host "Cloning repo An-Nurlam..." -ForegroundColor Cyan
git clone $repoUrl $work
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL clone repo." -ForegroundColor Red; exit 1 }
Set-Location $work

$branch = (git remote show origin | Select-String "HEAD branch" | ForEach-Object { $_.ToString().Split(":")[1].Trim() })
git checkout $branch | Out-Null

$file = Join-Path $work "public\index.html"
# Baca sebagai UTF-8 eksplisit (bukan default ANSI Windows PowerShell), supaya
# karakter em-dash di dalam file tidak rusak saat dibaca/ditulis ulang.
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
$usedCRLF = $content.Contains("`r`n")
$content = $content -replace "`r`n", "`n"
$errors = @()

# Bangun karakter em-dash lewat kode unicode, supaya script .ps1 ini sendiri
# tidak perlu menyimpan byte non-ASCII (itu penyebab error sebelumnya).
$dash = [char]0x2014

function Try-Replace {
    param($content, $old, $new, $label, [ref]$errorsRef)
    if ($content.Contains($old)) {
        return $content.Replace($old, $new)
    } else {
        $errorsRef.Value += $label
        return $content
    }
}

$oldTitle = "<title>Tabungan Qurban $dash Masjid Dhafinul Jariyah</title>`n<link rel=`"preconnect`" href=`"https://fonts.googleapis.com`">"
$newTitle = "<title>Tabungan Qurban $dash Masjid An-Nurlam</title>`n<meta name=`"description`" content=`"Aplikasi pencatatan tabungan Qurban jemaah Masjid An-Nurlam, Karawang.`">`n<meta property=`"og:title`" content=`"Tabungan Qurban $dash Masjid An-Nurlam`">`n<meta property=`"og:description`" content=`"Platform pencatatan tabungan Qurban untuk jemaah Masjid An-Nurlam $dash transparan dari transfer hingga hari penyembelihan.`">`n<meta property=`"og:image`" content=`"https://tabungan-qurban-annurlam.vercel.app/logo-masjid.png`">`n<meta property=`"og:type`" content=`"website`">`n<link rel=`"preconnect`" href=`"https://fonts.googleapis.com`">"
$content = Try-Replace $content $oldTitle $newTitle "1-title-and-og-tags" ([ref]$errors)

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "GAGAL: pola berikut tidak ditemukan:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "Tidak ada yang di-commit." -ForegroundColor Yellow
    exit 1
}

if ($usedCRLF) { $content = $content -replace "`n", "`r`n" }
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($file, $content, $utf8NoBom)
Write-Host "Title & Open Graph tags berhasil diupdate" -ForegroundColor Green

git add public/index.html
git commit -m "Fix judul tab & tambah Open Graph tags untuk An-Nurlam (title masih Dhafinul Jariyah)"
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL commit." -ForegroundColor Red; exit 1 }

git push origin $branch
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL push." -ForegroundColor Red; exit 1 }

Write-Host "SELESAI: title & Open Graph An-Nurlam berhasil di-push." -ForegroundColor Green
