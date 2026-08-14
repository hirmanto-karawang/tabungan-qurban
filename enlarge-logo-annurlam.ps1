$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/hirmanto-karawang/tabungan-qurban-annurlam.git"
$work = Join-Path $env:TEMP "annurlam-logo-enlarge"

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

# Desktop: wrap 72px -> 110px, logo 52px -> 96px
$content = Try-Replace $content "    width:72px;`n    height:72px;" "    width:110px;`n    height:110px;" "1-wrap-desktop" ([ref]$errors)
$content = Try-Replace $content "    width: 52px;`n    height: 52px;" "    width: 96px;`n    height: 96px;" "2-logo-desktop" ([ref]$errors)

# Mobile: wrap 60px -> 90px, logo 42px -> 80px
$content = Try-Replace $content "    .dashboard-logo-wrap{ width:60px; height:60px; border-radius:14px; }" "    .dashboard-logo-wrap{ width:90px; height:90px; border-radius:14px; }" "3-wrap-mobile" ([ref]$errors)
$content = Try-Replace $content "    .dashboard-logo{ width: 42px; height: 42px; }" "    .dashboard-logo{ width: 80px; height: 80px; }" "4-logo-mobile" ([ref]$errors)

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "GAGAL: pola berikut tidak ditemukan:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "Tidak ada yang di-commit." -ForegroundColor Yellow
    exit 1
}

if ($usedCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -Path $file -Value $content -NoNewline
Write-Host "Ukuran logo Dashboard & Laporan berhasil diperbesar" -ForegroundColor Green

git add public/index.html
git commit -m "Perbesar logo di Dashboard & Laporan (72/52px -> 110/96px desktop, 60/42px -> 90/80px mobile)"
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL commit." -ForegroundColor Red; exit 1 }

git push origin $branch
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL push." -ForegroundColor Red; exit 1 }

Write-Host "SELESAI: logo diperbesar & berhasil di-push ke repo An-Nurlam." -ForegroundColor Green
