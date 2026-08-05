# ✅ SETUP CHECKLIST - TABUNGAN QURBAN PWA

Checklist lengkap untuk memastikan semua setup dengan benar.

---

## 📦 FILES YANG SUDAH DIBUAT

```
tabungan-qurban/
│
├── 📄 apps-script.gs                    ← Backend API
├── 📄 package.json                      ← Project metadata
├── 📄 vercel.json                       ← Vercel config
├── 📄 .gitignore                        ← Git ignore
├── 📄 README.md                         ← Main documentation
├── 📄 DEPLOYMENT.md                     ← Deployment guide
├── 📄 SETUP_CHECKLIST.md               ← This file
│
└── 📁 public/
    ├── 📄 index.html                   ← Main PWA app (sudah diperbaiki)
    ├── 📄 index-head.html              ← PWA meta tags reference
    ├── 📄 config.js                    ← API client & config
    ├── 📄 service-worker.js            ← Offline support
    ├── 📄 manifest.json                ← PWA manifest
    ├── 📄 offline.html                 ← Offline fallback
    │
    └── 📁 icons/
        ├── icon-192x192.png            ← Generate yourself
        ├── icon-512x512.png            ← Generate yourself
        ├── icon-maskable-192x192.png   ← Generate yourself
        └── icon-maskable-512x512.png   ← Generate yourself
```

---

## 🔧 LANGKAH-LANGKAH SETUP

### FASE 1: Persiapan Google Sheets & Apps Script

- [ ] **Step 1.1** - Buat Google Sheet baru
  - URL: https://sheets.google.com
  - Name: "Tabungan Qurban Database"
  - Copy Sheet ID dari URL

- [ ] **Step 1.2** - Buat sheet tabs
  - Members
  - Savings
  - Pendaftaran
  - Messages

- [ ] **Step 1.3** - Add headers di setiap tab
  - See DEPLOYMENT.md untuk header list

- [ ] **Step 1.4** - Deploy Google Apps Script
  - Tools > Script Editor
  - Copy code dari `apps-script.gs`
  - Replace SHEET_ID
  - Run testDeployment()
  - Deploy > New Deployment > Web App
  - **Save deployment URL!**

- [ ] **Step 1.5** - Setup Fonnte API
  - Buka https://fonnte.com
  - Register/Login
  - Copy API Key
  - **Save API Key!**

### FASE 2: Setup GitHub Repository

- [ ] **Step 2.1** - Clone atau buat folder
  ```bash
  mkdir tabungan-qurban
  cd tabungan-qurban
  ```

- [ ] **Step 2.2** - Copy semua files ke folder
  - Semua files dari `/home/claude/` ke folder lokal
  - Ensure `public/index.html` ada (original file yang sudah diperbaiki)

- [ ] **Step 2.3** - Initialize Git
  ```bash
  git init
  git add .
  git commit -m "Initial commit: Tabungan Qurban PWA"
  ```

- [ ] **Step 2.4** - Create GitHub repository
  - Buka https://github.com/new
  - Name: `tabungan-qurban`
  - Don't initialize with README/gitignore
  - Create repository

- [ ] **Step 2.5** - Push ke GitHub
  ```bash
  git remote add origin https://github.com/YOURUSERNAME/tabungan-qurban.git
  git branch -M main
  git push -u origin main
  ```

### FASE 3: Deploy ke Vercel

- [ ] **Step 3.1** - Setup Vercel
  - Buka https://vercel.com
  - Login/Sign up (recommend: login dengan GitHub)

- [ ] **Step 3.2** - Import project
  - New Project > Import Git Repository
  - Select `tabungan-qurban`

- [ ] **Step 3.3** - Configure Vercel
  - Framework Preset: Other
  - Root Directory: `./public`
  - Build Command: `echo 'No build needed'`
  - Leave other fields empty

- [ ] **Step 3.4** - Add Environment Variables
  - GOOGLE_APPS_SCRIPT_URL: [URL dari step 1.4]
  - FONNTE_API_KEY: [Key dari step 1.5]

- [ ] **Step 3.5** - Deploy
  - Klik "Deploy"
  - Tunggu selesai (~ 1-2 menit)
  - **Save Vercel URL!**

### FASE 4: Update Config Files

- [ ] **Step 4.1** - Update public/config.js
  ```javascript
  GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/d/[ID]/usercopy',
  FONNTE_API_KEY: '[KEY]'
  ```

- [ ] **Step 4.2** - Commit & push
  ```bash
  git add public/config.js
  git commit -m "Update API config"
  git push
  ```
  (Vercel auto-redeploy)

### FASE 5: Testing

- [ ] **Step 5.1** - Test app loads
  - Buka URL dari Vercel
  - Check console (F12) no errors
  - Login page visible

- [ ] **Step 5.2** - Test Service Worker
  ```javascript
  // Di console:
  navigator.serviceWorker.getRegistrations().then(r => console.log(r))
  ```

- [ ] **Step 5.3** - Test API connection
  ```javascript
  // Di console:
  api.syncAllData().then(console.log)
  ```

- [ ] **Step 5.4** - Test offline mode
  - DevTools > Network > Offline
  - Reload page
  - Should show cached content

- [ ] **Step 5.5** - Test WhatsApp (optional)
  - Admin > Broadcast
  - Send test message
  - Check WhatsApp

### FASE 6: Generate App Icons (PENTING!)

⚠️ **PASTIKAN DI-GENERATE!** Tanpa icons, PWA install akan tidak bekerja optimal.

Pilih salah satu:

**Option A: Online Generator (Recommended)**
1. Buka https://www.pwabuilder.com/imageGenerator
2. Upload logo/image
3. Download 4 icons:
   - icon-192x192.png
   - icon-512x512.png
   - icon-maskable-192x192.png
   - icon-maskable-512x512.png
4. Upload ke `public/icons/`
5. Commit & push

**Option B: Manual dengan ImageMagick**
```bash
# Jika punya ImageMagick:
convert logo.png -resize 192x192 icon-192x192.png
convert logo.png -resize 512x512 icon-512x512.png
```

**Option C: Gunakan existing**
- Jika tidak ada logo, bisa pakai design simple
- Pastikan background transparan

- [ ] **Step 6.1** - Generate icons
- [ ] **Step 6.2** - Upload ke public/icons/
- [ ] **Step 6.3** - Verify di manifest.json
- [ ] **Step 6.4** - Commit & push

### FASE 7: Create First Test User

- [ ] **Step 7.1** - Buka Google Sheet
- [ ] **Step 7.2** - Add row di Members tab:
  ```
  id: DQH-001
  name: Admin Test
  phone: 628123456789
  password: 6789
  rt: 1
  blok: AA
  no: 1
  sapi: 1
  urutan: 1
  status: active
  role: admin
  ```
- [ ] **Step 7.3** - Test login dengan ID: DQH-001, Password: 6789

---

## 📋 VERIFICATION CHECKLIST

Pastikan semua ini bekerja:

### Frontend
- [ ] App loads tanpa error
- [ ] Service Worker registered (check DevTools)
- [ ] Manifest file valid (check DevTools > Application > Manifest)
- [ ] Icons display correctly
- [ ] PWA install prompt appears on mobile
- [ ] Responsive design di semua ukuran

### Backend
- [ ] Apps Script deployment URL valid
- [ ] Can read data from Google Sheets
- [ ] Can write data to Google Sheets
- [ ] Login works with test user
- [ ] Sync data returns all tabs

### Offline
- [ ] App works offline (NetworkFirst strategy)
- [ ] IndexedDB storing data
- [ ] Sync works when back online
- [ ] Fallback page shows when offline

### PWA
- [ ] Installable on mobile
- [ ] Works standalone mode
- [ ] Splash screen shows
- [ ] Status bar theme correct

### WhatsApp Integration
- [ ] Fonnte API key valid
- [ ] Can send test message
- [ ] Phone number formatting correct (62xxx)

---

## 🔐 Security Checklist

- [ ] No API keys in source code (use env vars)
- [ ] Google Apps Script set to "Anyone"
- [ ] HTTPS enabled (Vercel default ✓)
- [ ] CORS headers configured
- [ ] Input validation in Apps Script
- [ ] Output sanitization
- [ ] Admin password changed from default
- [ ] Regular backups of Google Sheet

---

## 📱 Browser Compatibility

Test di browsers ini:

- [ ] Chrome/Chromium (Desktop & Mobile)
- [ ] Firefox (Desktop & Mobile)
- [ ] Safari (Desktop & iOS)
- [ ] Edge (Desktop)
- [ ] Samsung Internet (Mobile)

---

## 🚀 POST-DEPLOYMENT

- [ ] Update DNS records (jika custom domain)
- [ ] Setup analytics (Vercel dashboard)
- [ ] Monitor error logs
- [ ] Backup Google Sheet regularly
- [ ] Keep Apps Script updated
- [ ] Monitor Fonnte API usage

---

## 📞 SUPPORT & TROUBLESHOOTING

**Issue: App tidak load**
- [ ] Check internet connection
- [ ] Check Vercel deployment status
- [ ] Clear browser cache
- [ ] Try different browser

**Issue: Service Worker error**
- [ ] Check DevTools Application tab
- [ ] Clear Service Worker cache
- [ ] Re-register: Uninstall & reinstall app

**Issue: API call timeout**
- [ ] Check Apps Script logs
- [ ] Verify GOOGLE_APPS_SCRIPT_URL
- [ ] Increase timeout di config.js

**Issue: WhatsApp tidak terkirim**
- [ ] Verify Fonnte API key
- [ ] Check phone number format
- [ ] Check Fonnte dashboard

---

## ✨ NEXT STEPS SETELAH LAUNCH

1. Share link ke users
2. Create documentation untuk users
3. Monitor feedback & bug reports
4. Regular maintenance updates
5. Feature improvements berdasarkan feedback

---

## 📊 FINAL CHECKLIST

- [ ] Folder structure complete
- [ ] All files created & configured
- [ ] Google Sheet setup
- [ ] Apps Script deployed
- [ ] GitHub repository created
- [ ] Vercel project deployed
- [ ] Environment variables set
- [ ] App icons generated
- [ ] Test user created
- [ ] Login works
- [ ] All verification tests passed
- [ ] Security checklist completed
- [ ] Ready for production ✅

---

**🎉 Selamat! Setup sudah lengkap. App siap untuk produksi!**

Untuk pertanyaan lebih lanjut, lihat:
- README.md - Overview & features
- DEPLOYMENT.md - Detailed deployment steps
- config.js - Configuration options
- apps-script.gs - Backend API documentation
