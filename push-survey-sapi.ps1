$ErrorActionPreference = "Stop"
Set-Location "C:\Users\Lenovo\Documents\tabungan-qurban"

Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue
Remove-Item .git\HEAD.lock -Force -ErrorAction SilentlyContinue

Write-Host "Cek syntax JS dulu..." -ForegroundColor Cyan
node -e "const fs=require('fs');const html=fs.readFileSync('public/index.html','utf8');const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);let ok=true;scripts.forEach((s,i)=>{try{new Function(s);}catch(e){ok=false;console.log('Script',i,'ERROR:',e.message);}});console.log(ok?'OK, semua script valid':'ADA ERROR DI ATAS');"

git add -A
git commit -m "Fitur baru: menu Survey Sapi (tanggal, supplier, lokasi GPS, jenis, berat, harga, 5 foto)"
git push

Write-Host "SELESAI." -ForegroundColor Green
