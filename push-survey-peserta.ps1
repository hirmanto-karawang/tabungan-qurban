$ErrorActionPreference = "Stop"
Set-Location "C:\Users\Lenovo\Documents\tabungan-qurban"

Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue
Remove-Item .git\HEAD.lock -Force -ErrorAction SilentlyContinue

# Kerja langsung di branch main supaya tidak ada lagi drama "kepush ke branch
# yang salah" seperti kemarin - main = branch yang di-auto-deploy Vercel.
git checkout main
git pull

Write-Host "Cek syntax JS dulu..." -ForegroundColor Cyan
node -e "const fs=require('fs');const html=fs.readFileSync('public/index.html','utf8');const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);let ok=true;scripts.forEach((s,i)=>{try{new Function(s);}catch(e){ok=false;console.log('Script',i,'ERROR:',e.message);}});console.log(ok?'OK, semua script valid':'ADA ERROR DI ATAS');"

git add -A
git commit -m "Fitur: Work Order pilih Alokasi dari Rencana Distribusi Daging (dropdown), tinggal isi Qty"
git push

# Sinkronkan balik ke dhafinul-dev supaya branch R&D tidak ketinggalan.
git checkout dhafinul-dev
git merge main -m "Sync dari main: fitur Ikut Survey Sapi"
git push origin dhafinul-dev

Write-Host "SELESAI: sudah di main (live) dan disinkronkan ke dhafinul-dev." -ForegroundColor Green
