$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/hirmanto-karawang/tabungan-qurban-annurlam.git"
$work = Join-Path $env:TEMP "annurlam-multiadmin-fix-v2"

if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

Write-Host "Cloning repo An-Nurlam..." -ForegroundColor Cyan
git clone $repoUrl $work
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL clone repo." -ForegroundColor Red; exit 1 }
Set-Location $work

$branch = (git remote show origin | Select-String "HEAD branch" | ForEach-Object { $_.ToString().Split(":")[1].Trim() })
Write-Host "Default branch: $branch" -ForegroundColor Cyan
git checkout $branch | Out-Null

$file = Join-Path $work "public\index.html"
if (-not (Test-Path $file)) {
    Write-Host "GAGAL: public/index.html tidak ditemukan di repo." -ForegroundColor Red
    exit 1
}

$content = Get-Content -Raw -Path $file
# Normalisasi CRLF -> LF dulu, supaya pola yang mengandung newline (`n) tetap
# cocok walau file di-checkout dengan CRLF (default Git di Windows / core.autocrlf).
$usedCRLF = $content.Contains("`r`n")
$content = $content -replace "`r`n", "`n"
$originalLength = $content.Length
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

# 1) Tambah field role di mapping appData.members
$old1 = "urutan: parseInt(row.urutan) || 0`n    })).filter(m => m.id && m.name);"
$new1 = "urutan: parseInt(row.urutan) || 0,`n        role: (row.role || '').toString().trim().toLowerCase() === 'admin' ? 'admin' : 'member'`n    })).filter(m => m.id && m.name);"
$content = Try-Replace $content $old1 $new1 "1-mapping-role" ([ref]$errors)

# 2) Login utama: role dari member.role
$old2 = "role: (Number(member.id) === 1) ? 'admin' : 'member'"
$new2 = "role: member.role === 'admin' ? 'admin' : 'member'"
$content = Try-Replace $content $old2 $new2 "2-handleLogin" ([ref]$errors)

# 3) Restore session: role dari stillExists.role
$old3 = "role: (Number(stillExists.id) === 1) ? 'admin' : 'member'"
$new3 = "role: stillExists.role === 'admin' ? 'admin' : 'member'"
$content = Try-Replace $content $old3 $new3 "3-restoreSession" ([ref]$errors)

# 4) Semua filter m.id !== 1 && m.id > 0  ->  m.role !== 'admin' && m.id > 0  (replace SEMUA kemunculan)
$old4 = "m.id !== 1 && m.id > 0"
$new4 = "m.role !== 'admin' && m.id > 0"
$count4 = ([regex]::Matches($content, [regex]::Escape($old4))).Count
if ($count4 -gt 0) {
    $content = $content.Replace($old4, $new4)
    Write-Host "  - filter m.id!==1 diganti di $count4 tempat" -ForegroundColor Gray
} else {
    $errors += "4-filter-id-not-1 (0 ditemukan)"
}

# 5) Stat box Total Anggota di Log Aktivitas
$old5 = "{ value: appData.members.length, label: 'Total Anggota' }"
$new5 = "{ value: appData.members.filter(m => m.role !== 'admin').length, label: 'Total Anggota' }"
$content = Try-Replace $content $old5 $new5 "5-statbox-total-anggota" ([ref]$errors)

# 6) computeActivitySummary: exclude admin
$old6 = "function computeActivitySummary() {`n    return appData.members.map(member => {"
$new6 = "function computeActivitySummary() {`n    // Admin tidak ikut dihitung di sini - menu ini untuk memantau keaktifan`n    // anggota penabung qurban, bukan akun admin masjid.`n    return appData.members.filter(member => member.role !== 'admin').map(member => {"
$content = Try-Replace $content $old6 $new6 "6-computeActivitySummary" ([ref]$errors)

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "GAGAL: beberapa pola tidak ditemukan di file An-Nurlam (kemungkinan kode di sana sudah beda struktur):" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "Tidak ada yang di-commit. Kirim daftar di atas biar disiapkan fix manual." -ForegroundColor Yellow
    exit 1
}

if ($usedCRLF) {
    $content = $content -replace "`n", "`r`n"
}
Set-Content -Path $file -Value $content -NoNewline
Write-Host "Semua 6 perubahan berhasil diterapkan ke public/index.html" -ForegroundColor Green

git add public/index.html
git commit -m "Fitur multi-admin: role ditentukan dari kolom Members.role, bukan hardcode id===1"
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL commit." -ForegroundColor Red; exit 1 }

git push origin $branch
if ($LASTEXITCODE -ne 0) { Write-Host "GAGAL push." -ForegroundColor Red; exit 1 }

Write-Host "SELESAI: fix multi-admin berhasil di-push ke repo An-Nurlam." -ForegroundColor Green
