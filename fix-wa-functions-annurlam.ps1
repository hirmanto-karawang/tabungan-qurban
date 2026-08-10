$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/hirmanto-karawang/tabungan-qurban-annurlam.git"
$work = Join-Path $env:TEMP "annurlam-fix-wa-functions"

if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

Write-Host "Cloning repo An-Nurlam..." -ForegroundColor Cyan
git clone $repoUrl $work
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL clone repo." -ForegroundColor Red; exit 1 }
Set-Location $work

$branch = (git remote show origin | Select-String "HEAD branch" | ForEach-Object { $_.ToString().Split(":")[1].Trim() })
git checkout $branch | Out-Null

$srcSend = Join-Path $work "public\api\wa-send.js"
$srcStatus = Join-Path $work "public\api\wa-status.js"
$dstSend = Join-Path $work "api\wa-send.js"
$dstStatus = Join-Path $work "api\wa-status.js"

if (-not (Test-Path $srcSend) -or -not (Test-Path $srcStatus)) {
    Write-Host "GAGAL: public/api/wa-send.js atau wa-status.js tidak ditemukan." -ForegroundColor Red
    exit 1
}

# Root api/ folder pakai ES module (package.json "type":"module"), sedangkan
# public/api/ pakai CommonJS. Konversi persis seperti fix sheets.js sebelumnya:
# ganti "module.exports = async function handler" -> "export default async function handler".
function Convert-ToRootFunction {
    param($srcPath, $dstPath)
    $text = [System.IO.File]::ReadAllText($srcPath, [System.Text.Encoding]::UTF8)
    $usedCRLF = $text.Contains("`r`n")
    $norm = $text -replace "`r`n", "`n"
    if (-not $norm.Contains("module.exports = async function handler")) {
        throw "Pola 'module.exports = async function handler' tidak ditemukan di $srcPath"
    }
    $norm = $norm.Replace("module.exports = async function handler", "export default async function handler")
    if ($usedCRLF) { $norm = $norm -replace "`n", "`r`n" }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($dstPath, $norm, $utf8NoBom)
}

Convert-ToRootFunction -srcPath $srcSend -dstPath $dstSend
Convert-ToRootFunction -srcPath $srcStatus -dstPath $dstStatus
Write-Host "api/wa-send.js dan api/wa-status.js berhasil dibuat (ES module, disalin dari public/api/)" -ForegroundColor Green

git add api/wa-send.js api/wa-status.js
git commit -m "Fix 404 /api/wa-send & /api/wa-status: tambah salinan di api/ root (ES module), sama seperti fix sheets.js"
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL commit." -ForegroundColor Red; exit 1 }

git push origin $branch
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL push." -ForegroundColor Red; exit 1 }

Write-Host "SELESAI: fix wa-send/wa-status berhasil di-push. Tunggu redeploy lalu tes lagi." -ForegroundColor Green

Write-Host ""
Write-Host "--- Cek tambahan: isi api/sheets.js (root) saat ini ---" -ForegroundColor Cyan
Select-String -Path (Join-Path $work "api\sheets.js") -Pattern "SHEET_ID|SHEET_NAMES" | Select-Object -First 4
