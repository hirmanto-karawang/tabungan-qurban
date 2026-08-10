$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/hirmanto-karawang/tabungan-qurban-annurlam.git"
$work = Join-Path $env:TEMP "annurlam-multiadmin-fix"

if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

Write-Host "Cloning repo An-Nurlam..." -ForegroundColor Cyan
git clone $repoUrl $work
Set-Location $work

$branch = (git remote show origin | Select-String "HEAD branch" | ForEach-Object { $_.ToString().Split(":")[1].Trim() })
Write-Host "Default branch: $branch" -ForegroundColor Cyan
git checkout $branch

$patchPath = Join-Path $work "multi-admin.patch"

@'
From 6153202363e1ded391296cbdb71226b160f40d8f Mon Sep 17 00:00:00 2001
From: BANG HIR <hirmanto.karawang@gmail.com>
Date: Sun, 9 Aug 2026 20:33:30 +0700
Subject: [PATCH] Fitur multi-admin: role ditentukan dari kolom Members.role,
 bukan hardcode id===1

---
 public/index.html | 33 ++++++++++++++++++++-------------
 1 file changed, 20 insertions(+), 13 deletions(-)

diff --git a/public/index.html b/public/index.html
index bcd4558..5ee1d10 100644
--- a/public/index.html
+++ b/public/index.html
@@ -3107,7 +3107,12 @@ async function loadDataFromSheets() {
         blok: row.blok || '',
         no: row.no || '',
         sapi: parseInt(row.sapi) || 0,
-        urutan: parseInt(row.urutan) || 0
+        urutan: parseInt(row.urutan) || 0,
+        // 'role' dari kolom Members!role di Google Sheet - 'admin' atau 'member'
+        // (kosong/lainnya dianggap 'member'). Ini sumber kebenaran satu-satunya
+        // untuk status admin, MENGGANTIKAN cara lama yang hardcode id===1 -
+        // supaya bisa ada admin lebih dari satu orang.
+        role: (row.role || '').toString().trim().toLowerCase() === 'admin' ? 'admin' : 'member'
     })).filter(m => m.id && m.name);

     // Parse Savings
@@ -3401,7 +3406,7 @@ async function handleLogin() {
             id: member.id,
             name: member.name,
             phone: member.phone,
-            role: (Number(member.id) === 1) ? 'admin' : 'member'
+            role: member.role === 'admin' ? 'admin' : 'member'
         };
         recordLogin(currentUser);
         saveSession(currentUser);
@@ -3508,7 +3513,7 @@ async function restoreSession() {
             id: stillExists.id,
             name: stillExists.name,
             phone: stillExists.phone,
-            role: (Number(stillExists.id) === 1) ? 'admin' : 'member'
+            role: stillExists.role === 'admin' ? 'admin' : 'member'
         };
         saveSession(currentUser);
     }
@@ -4352,7 +4357,7 @@ function loadLaporan() {
     const approved = appData.savings.filter(s => s.status === 'APPROVED');
     const totalApproved = approved.reduce((sum, s) => sum + s.amount, 0);
     const totalTransactions = appData.savings.length;
-    const totalMembers = appData.members.filter(m => m.id !== 1 && m.id > 0).length; // exclude admin
+    const totalMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length; // exclude admin
     const average = totalMembers > 0 ? Math.round(totalApproved / totalMembers) : 0;

     const rupiah = v => `Rp ${v.toLocaleString('id-ID')}`;
@@ -4442,7 +4447,7 @@ function loadAllMembersTable() {
     const tbody = document.getElementById('sapiMemberTable');
     tbody.innerHTML = '';

-    const members = appData.members.filter(m => m.id !== 1 && m.id > 0);
+    const members = appData.members.filter(m => m.role !== 'admin' && m.id > 0);

     members.forEach(member => {
         const memberSavings = appData.savings.filter(s => s.memberId === member.id && s.status === 'APPROVED');
@@ -4544,7 +4549,7 @@ function loadAnalisisTab() {
 function loadStatistics() {
     const approved = appData.savings.filter(s => s.status === 'APPROVED');
     const pending = appData.savings.filter(s => s.status === 'PENDING');
-    const activeMembers = appData.members.filter(m => m.id !== 1 && m.id > 0).length;
+    const activeMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length;
     const paidMembers = new Set(approved.map(s => s.memberId)).size;
     const pendingMembers = new Set(pending.map(s => s.memberId)).size;

@@ -4820,7 +4825,7 @@ async function exportLaporanExcel(evt) {
         const sapiStats = getSapiStatistics();
         const approved = appData.savings.filter(s => s.status === 'APPROVED');
         const totalApproved = approved.reduce((sum, s) => sum + s.amount, 0);
-        const totalMembers = appData.members.filter(m => m.id !== 1 && m.id > 0).length;
+        const totalMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length;
         const totalTransactions = appData.savings.length;
         const average = totalMembers > 0 ? Math.round(totalApproved / totalMembers) : 0;

@@ -4889,7 +4894,7 @@ async function exportLaporanExcel(evt) {
             { header: 'Total', key: 'total', width: 16 }, { header: 'Transaksi', key: 'transaksi', width: 12 }
         ];
         wsMembers.getRow(1).eachCell(cell => { cell.font = headerFont; cell.fill = headerFill; });
-        appData.members.filter(m => m.id !== 1 && m.id > 0).forEach(member => {
+        appData.members.filter(m => m.role !== 'admin' && m.id > 0).forEach(member => {
             const memberSavings = appData.savings.filter(s => s.memberId === member.id && s.status === 'APPROVED');
             const total = memberSavings.reduce((sum, s) => sum + s.amount, 0);
             wsMembers.addRow({
@@ -5014,7 +5019,7 @@ function exportLaporanPDF(evt) {
         const approved = appData.savings.filter(s => s.status === 'APPROVED');
         const totalApproved = approved.reduce((sum, s) => sum + s.amount, 0);
         const totalTransactions = appData.savings.length;
-        const totalMembers = appData.members.filter(m => m.id !== 1 && m.id > 0).length;
+        const totalMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length;
         const average = totalMembers > 0 ? Math.round(totalApproved / totalMembers) : 0;

         const sapiStats = getSapiStatistics();
@@ -5127,7 +5132,7 @@ function exportLaporanPDF(evt) {

             const members = selectedSapi
                 ? appData.members.filter(m => m.sapi === parseInt(selectedSapi))
-                : appData.members.filter(m => m.id !== 1 && m.id > 0);
+                : appData.members.filter(m => m.role !== 'admin' && m.id > 0);

             const cx = {
                 id: marginX + 3,
@@ -5251,7 +5256,7 @@ function exportLaporanPDF(evt) {
             drawChartImage(laporanCharts.monthly, 'Transaksi per Bulan');

             const pendingS = appData.savings.filter(s => s.status === 'PENDING');
-            const activeMembers = appData.members.filter(m => m.id !== 1 && m.id > 0).length;
+            const activeMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length;
             const paidMembers = new Set(approved.map(s => s.memberId)).size;
             const pendingMembers = new Set(pendingS.map(s => s.memberId)).size;
             const avgApproved = paidMembers > 0 ? Math.round(totalApproved / paidMembers) : 0;
@@ -6248,7 +6253,9 @@ function timeAgo(isoString) {
 // Susun ringkasan aktivitas per anggota (login terakhir + jumlah login) dari
 // appData.loginLogs, dipakai bareng oleh kartu ringkasan dan tabel.
 function computeActivitySummary() {
-    return appData.members.map(member => {
+    // Admin tidak ikut dihitung di sini - menu ini untuk memantau keaktifan
+    // anggota penabung qurban, bukan akun admin masjid.
+    return appData.members.filter(member => member.role !== 'admin').map(member => {
         const logs = appData.loginLogs.filter(l => l.memberId === member.id);
         const lastLog = logs.reduce((latest, l) => {
             const t = new Date(l.loginAt).getTime();
@@ -6283,7 +6290,7 @@ function loadActivityLog() {
     const statsBox = document.getElementById('activityStats');
     if (statsBox) {
         const stats = [
-            { value: appData.members.length, label: 'Total Anggota' },
+            { value: appData.members.filter(m => m.role !== 'admin').length, label: 'Total Anggota' },
             { value: active7, label: 'Aktif 7 Hari Terakhir' },
             { value: active30, label: 'Aktif 30 Hari Terakhir' },
             { value: neverLoggedIn, label: 'Belum Pernah Login' }
--
2.34.1
'@ | Set-Content -Path $patchPath -Encoding UTF8

Write-Host "Menerapkan patch..." -ForegroundColor Cyan
$applied = $false
try {
    git apply --check $patchPath
    git apply $patchPath
    $applied = $true
} catch {
    Write-Host "Patch exact gagal, coba mode fuzzy (git apply --3way)..." -ForegroundColor Yellow
    try {
        git apply --3way $patchPath
        $applied = $true
    } catch {
        Write-Host "GAGAL menerapkan patch otomatis. File public/index.html An-Nurlam kemungkinan sudah berbeda struktur dari Dhafinul di titik ini." -ForegroundColor Red
        Write-Host "Silakan kirim screenshot error ini, akan disiapkan fix manual." -ForegroundColor Red
        exit 1
    }
}

if ($applied) {
    git add public/index.html
    git commit -m "Fitur multi-admin: role ditentukan dari kolom Members.role, bukan hardcode id===1"
    git push origin $branch
    Write-Host "SELESAI: fix multi-admin berhasil di-push ke repo An-Nurlam." -ForegroundColor Green
}
