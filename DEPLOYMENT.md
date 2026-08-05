# 🚀 DEPLOYMENT GUIDE - VERCEL + GOOGLE APPS SCRIPT

Panduan lengkap untuk deploy aplikasi Tabungan Qurban ke Vercel.

---

## STEP 1️⃣: PREPARE GOOGLE SHEETS & APPS SCRIPT

### 1. Create Google Sheet
1. Buka [Google Sheets](https://sheets.google.com)
2. Klik "New Spreadsheet"
3. Rename ke "Tabungan Qurban Database"
4. Copy Sheet ID dari URL:
   ```
   https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit
                                          ↑ Copy ini
   ```

### 2. Create Sheet Tabs
Di Google Sheet, buat tab-tab ini (klik + icon):
- **Members** - Data anggota
- **Savings** - Data tabungan
- **Pendaftaran** - Pendaftar baru
- **Messages** - Log notifikasi

### 3. Add Headers

**Members Tab:**
```
Row 1 Headers: id | name | phone | password | rt | blok | no | sapi | urutan | status | created_date | role
```

**Savings Tab:**
```
Row 1 Headers: id | memberId | amount | bankSource | transferDate | buktiFile | status | approved_by | approved_at
```

**Pendaftaran Tab:**
```
Row 1 Headers: id | name | phone | rt | blok | no | reason | status | approved_at | approved_by | password
```

**Messages Tab:**
```
Row 1 Headers: id | title | recipients | message | status | sentAt
```

### 4. Deploy Google Apps Script

1. Di Google Sheet, buka **Tools > Script Editor**
2. Delete default code, paste from `apps-script.gs`
3. Replace line 10:
   ```javascript
   const SHEET_ID = 'YOUR_SHEET_ID_HERE';
   // Ganti dengan Sheet ID yang sudah dicopy
   ```
4. Save file (Ctrl+S)
5. Di menu, pilih **Run > testDeployment**
   - Klik "Review Permissions"
   - Pilih account kamu
   - Klik "Allow"
   - Lihat execution log untuk confirmation

6. Setelah test berhasil, klik **Deploy > New Deployment**
   - Icon gear > Web app
   - Execute as: *[Your Account]*
   - Who has access: **Anyone**
   - Klik "Deploy"
   
7. Copy deployment URL yang terlihat:
   ```
   https://script.google.com/macros/d/[DEPLOYMENT_ID]/usercopy
   ```

✅ Save URL ini untuk nanti!

---

## STEP 2️⃣: SETUP FONNTE API

1. Buka [Fonnte.com](https://fonnte.com)
2. Register atau login
3. Buka Dashboard > Settings > API
4. Copy **API Key**

✅ Save API Key ini!

---

## STEP 3️⃣: PREPARE GITHUB REPOSITORY

### A. Setup Git Locally

```bash
# Create/navigate to project folder
mkdir tabungan-qurban
cd tabungan-qurban

# Initialize git
git init

# Create .gitignore (copy from repo)
touch .gitignore

# Add all files
git add .

# Commit
git commit -m "Initial commit: Tabungan Qurban PWA"
```

### B. Create GitHub Repository

1. Buka [GitHub](https://github.com/new)
2. Nama: `tabungan-qurban`
3. Description: "Aplikasi tabungan qurban PWA"
4. Public or Private (your choice)
5. Jangan initialize with README/gitignore
6. Klik "Create repository"

### C. Push ke GitHub

```bash
# Set remote (ganti YOURUSERNAME)
git remote add origin https://github.com/YOURUSERNAME/tabungan-qurban.git
git branch -M main
git push -u origin main
```

✅ Repository sudah di GitHub!

---

## STEP 4️⃣: DEPLOY KE VERCEL

### A. Connect GitHub to Vercel

1. Buka [Vercel.com](https://vercel.com)
2. Login atau Sign Up
3. Klik "New Project"
4. Import repository: pilih `tabungan-qurban`
5. Konfigurasi:
   - **Framework Preset**: Other (atau biarkan kosong)
   - **Root Directory**: ./public
   - **Build Command**: `echo 'No build needed'`
   - **Output Directory**: (kosongkan)
   - **Install Command**: (kosongkan)

### B. Environment Variables

Saat di halaman "Configure Project":

1. Klik "Environment Variables"
2. Add variable:
   ```
   Name: GOOGLE_APPS_SCRIPT_URL
   Value: https://script.google.com/macros/d/[DEPLOYMENT_ID]/usercopy
   ```
3. Add variable:
   ```
   Name: FONNTE_API_KEY
   Value: [API_KEY_DARI_FONNTE]
   ```
4. Klik "Deploy"

⏳ Tunggu deployment selesai (~ 1-2 menit)

### C. Update Config File

1. Di local, buka `public/config.js`
2. Update:
   ```javascript
   GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/d/[ID]/usercopy',
   FONNTE_API_KEY: '[API_KEY]'
   ```
3. Commit & push:
   ```bash
   git add public/config.js
   git commit -m "Update API config for production"
   git push
   ```

✅ Vercel akan auto-redeploy!

---

## STEP 5️⃣: VERIFY DEPLOYMENT

### A. Check App
- Vercel akan show URL seperti: `https://tabungan-qurban.vercel.app`
- Buka di browser
- Cek Console (F12) untuk errors

### B. Test Service Worker
```javascript
// Di browser console:
navigator.serviceWorker.getRegistrations().then(r => console.log(r))
```

### C. Test API
```javascript
// Di browser console:
api.login('DQH-001', 'test').then(console.log)
```

### D. Test Offline
1. Open DevTools (F12)
2. Network tab
3. Check "Offline"
4. Reload page
5. Harus tetap bisa akses cache

---

## STEP 6️⃣: CUSTOM DOMAIN (OPTIONAL)

### A. Add Custom Domain
1. Di Vercel dashboard > project settings
2. Klik "Domains"
3. Input domain kamu
4. Ikuti instruksi DNS

### B. SSL Certificate
- Vercel otomatis generate SSL certificate (gratis!)

---

## STEP 7️⃣: MONITORING & UPDATES

### A. Enable Analytics
- Vercel dashboard > Analytics tab
- View performance metrics

### B. Update Apps Script
```
1. Edit di Google Apps Script editor
2. Test dengan testDeployment()
3. Deploy (akan create new version)
4. Tidak perlu re-deploy Vercel
```

### C. Update Frontend
```bash
git add .
git commit -m "Update features"
git push
# Vercel auto-deploy!
```

---

## 🔐 SECURITY CHECKLIST

- [ ] Google Apps Script set to "Anyone" with authentication
- [ ] Environment variables not in `.gitignore`
- [ ] HTTPS enabled (Vercel default)
- [ ] CORS properly configured
- [ ] Admin credentials secured
- [ ] Fonnte API key kept secret
- [ ] Regular backups of Google Sheet

---

## 📋 TROUBLESHOOTING

### Apps Script Error
```
"Error: Service not available"
- Check SHEET_ID di apps-script.gs
- Test dengan testDeployment()
- Check Google Sheet permissions
```

### Service Worker Error
```
"Service Worker registration failed"
- Clear browser cache
- Check manifest.json syntax
- Check service-worker.js for errors
```

### API Call Timeout
```
"Fetch failed / Network error"
- Check internet connection
- Increase TIMEOUT di config.js
- Check Apps Script logs
```

### WhatsApp Not Sending
```
"Fonnte API error"
- Verify API key
- Check phone number format (62xxx)
- Check Fonnte dashboard logs
- Check if balance available
```

---

## 📞 GETTING HELP

- **Vercel Status**: https://vercel.com/status
- **Google Apps Script Docs**: https://developers.google.com/apps-script
- **Service Worker**: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- **PWA Docs**: https://web.dev/progressive-web-apps/

---

## ✨ NEXT STEPS

1. ✅ Test login dengan akun test
2. ✅ Test registration baru
3. ✅ Test WhatsApp notifications
4. ✅ Test offline mode
5. ✅ Test install as app (PWA)
6. ✅ Share URL ke users

---

**Selamat! Aplikasi Anda sudah live! 🎉**
