$ErrorActionPreference = "Stop"
Set-Location "C:\Users\Lenovo\Documents\tabungan-qurban"

Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue
Remove-Item .git\HEAD.lock -Force -ErrorAction SilentlyContinue

git checkout main
git pull
git merge dhafinul-dev -m "Merge dhafinul-dev: fitur Survey Sapi + fix multi-admin"
git push
git checkout dhafinul-dev

Write-Host "SELESAI: main sudah berisi semua perubahan terbaru, Vercel akan auto-deploy." -ForegroundColor Green
