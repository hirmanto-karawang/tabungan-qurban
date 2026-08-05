# 🚀 PANDUAN INSTALASI LENGKAP - TABUNGAN QURBAN PWA

Panduan step-by-step untuk install dan deploy aplikasi ke Vercel.

---

## 📋 OVERVIEW

Aplikasi ini menggunakan:
- **Frontend**: Vercel (hosting static files)
- **Backend**: Google Apps Script (API)
- **Database**: Google Sheets
- **Notifikasi**: Fonnte WhatsApp API
- **Offline**: Service Worker + IndexedDB

---

## 🎯 QUICK SUMMARY

1. ✅ Setup Google Sheets & Apps Script (15 menit)
2. ✅ Setup GitHub & Push code (10 menit)
3. ✅ Deploy ke Vercel (5 menit)
4. ✅ Generate app icons (10 menit)
5. ✅ Testing & launch (10 menit)

**Total waktu: ~50 menit**

---

## BAGIAN 1: SETUP GOOGLE SHEETS & APPS SCRIPT ⏱️ 15 MENIT

### Step 1.1: Buat Google Sheet

1. Buka browser, masuk ke [Google Sheets](https://sheets.google.com)
2. Klik tombol "+ Spreadsheet baru"
3. Rename nama sheet:
   - Klik title di atas kiri
   - Type: `Tabungan Qurban Database`
   - Press Enter

### Step 1.2: Copy Sheet ID

1. Di URL bar, copy bagian ini:
   ```
   https://docs.google.com/spreadsheets/d/[COPY_BAGIAN_INI]/edit
   ```
   Contoh ID: `1a2b3c4d5e6f7g8h9i0j...`

2. **Simpan ID ini! Akan dipakai nanti.**

### Step 1.3: Buat Sheet Tabs

Sheet sudah punya "Sheet1", rename & buat tabs baru:

1. **Rename Sheet1:**
   - Klik kanan "Sheet1"
   - Klik "Rename"
   - Type: `Members`
   - Press Enter

2. **Buat 3 tab baru:**
   - Klik tombol `+` di bawah
   - Buat: `Savings`, `Pendaftaran`, `Messages`

Sekarang ada 4 tabs: Members | Savings | Pendaftaran | Messages

### Step 1.4: Add Headers

**Di tab MEMBERS**, baris 1, add header:
```
id | name | phone | password | rt | blok | no | sapi | urutan | status | created_date | role
```

**Di tab SAVINGS**:
```
id | memberId | amount | bankSource | transferDate | buktiFile | status | approved_by | approved_at
```

**Di tab PENDAFTARAN**:
```
id | name | phone | rt | blok | no | reason | status | approved_at | approved_by | password
```

**Di tab MESSAGES**:
```
id | title | recipients | message | status | sentAt
```

Cukup ketik di baris 1, Google Sheets otomatis buat kolom.

### Step 1.5: Deploy Google Apps Script

1. Di Google Sheet, klik menu **Tools > Script Editor**
   - Akan buka tab baru

2. Di Google Apps Script editor:
   - Delete kode yang ada (select all, delete)
   - Copy-paste seluruh kode dari file `apps-script.gs`

3. **Ganti Sheet ID:**
   - Cari baris 10: `const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';`
   - Ganti dengan Sheet ID yang sudah dicopy
   - Contoh: `const SHEET_ID = '1a2b3c4d5e6f7g8h9i0j';`

4. **Save file:**
   - Press Ctrl+S (Windows) atau Cmd+S (Mac)

5. **Test deployment:**
   - Di menu atas, klik **Run > testDeployment**
   - Muncul popup "Review Permissions"
   - Klik "Review permissions"
   - Pilih Google account kamu
   - Klik "Allow"
   - Tunggu sebentar...
   - Di "Execution log" akan muncul:
     ```
     ✅ Deployment successful!
     ```

6. **Deploy ke production:**
   - Klik menu **Deploy > New Deployment**
   - Klik icon gear di kiri (settings)
   - Select type: **Web app**
   - Execute as: *[Pilih account kamu]*
   - Who has access: **Anyone**
   - Klik "Deploy"

7. **Copy URL deployment:**
   - Akan muncul URL seperti:
     ```
     https://script.google.com/macros/d/[DEPLOYMENT_ID]/usercopy
     ```
   - **Copypaste ke notepad! Penting!**

✅ Google Apps Script sudah siap!

### Step 1.6: Setup Fonnte API (WhatsApp)

1. Buka [Fonnte.com](https://fonnte.com) di tab baru
2. Klik "Sign Up" atau "Login"
3. Buat account jika belum punya
4. Di Dashboard, cari **Settings > API**
5. Copy "API Key" (panjang string)
6. **Simpan API Key ini!**

---

## BAGIAN 2: SETUP GITHUB & LOCAL FILES ⏱️ 10 MENIT

### Step 2.1: Download Semua Files

1. Di folder ini ada file-file:
   ```
   - apps-script.gs
   - package.json
   - vercel.json
   - .gitignore
   - README.md
   - DEPLOYMENT.md
   - public/
     - index.html
     - config.js
     - service-worker.js
     - manifest.json
     - offline.html
   ```

2. **Buat folder lokal:**
   - Buka Windows Explorer / Finder
   - Buat folder baru: `tabungan-qurban`

3. **Copy semua files ke folder:**
   - Copy file-file di atas ke folder `tabungan-qurban`
   - Pastikan struktur folder sama

### Step 2.2: Update Config File

1. Buka file `public/config.js` dengan text editor
   - Windows: Notepad++ atau VSCode
   - Mac: TextEdit atau VSCode

2. Cari baris:
   ```javascript
   GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/d/YOUR_DEPLOYMENT_ID/usercopy',
   FONNTE_API_KEY: 'YOUR_FONNTE_API_KEY_HERE',
   ```

3. Ganti dengan:
   ```javascript
   GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/d/[DEPLOYMENT_ID]/usercopy',
   FONNTE_API_KEY: '[API_KEY]',
   ```

4. **Save file** (Ctrl+S)

### Step 2.3: Setup GitHub Repository

1. **Create GitHub account jika belum:**
   - Buka [GitHub.com](https://github.com)
   - Sign up jika belum punya

2. **Buat repository baru:**
   - Klik icon `+` di atas kanan
   - Pilih "New repository"
   - Repository name: `tabungan-qurban`
   - Description: "Aplikasi tabungan qurban PWA"
   - Public atau Private (pilih sesuai)
   - **Jangan** centang "Initialize with README"
   - Klik "Create repository"

3. Akan muncul halaman dengan instruksi. Copy instruksi untuk "push an existing repository".

### Step 2.4: Push ke GitHub (Pakai Command Line)

**Jika belum install Git:**
- Windows: Download dari [git-scm.com](https://git-scm.com)
- Mac: Buka Terminal, type `git --version` (akan auto-install jika belum)

**Setup & push:**

1. Buka Terminal/Command Prompt
2. Navigate ke folder project:
   ```bash
   cd C:\Users\YourName\Documents\tabungan-qurban
   # atau di Mac:
   cd ~/Documents/tabungan-qurban
   ```

3. Initialize & push:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Tabungan Qurban PWA"
   git remote add origin https://github.com/YOURUSERNAME/tabungan-qurban.git
   git branch -M main
   git push -u origin main
   ```

4. Masukkan GitHub username & password (atau personal access token)

5. Tunggu selesai...

✅ Code sudah di GitHub!

---

## BAGIAN 3: DEPLOY KE VERCEL ⏱️ 5 MENIT

### Step 3.1: Connect ke Vercel

1. Buka [Vercel.com](https://vercel.com)
2. Klik "Sign Up"
3. **Recommend: Sign up dengan GitHub** (lebih mudah)
4. Authorize Vercel untuk akses GitHub

### Step 3.2: Import Repository

1. Di Vercel dashboard, klik "New Project"
2. Klik "Import Git Repository"
3. Cari & select `tabungan-qurban`
4. Klik "Import"

### Step 3.3: Configure Project

1. **Framework Preset:** Pilih "Other"
2. **Root Directory:** `./public` (PENTING!)
3. **Build Command:** `echo 'No build needed'`
4. **Output Directory:** (kosongkan)
5. **Install Command:** (kosongkan)

### Step 3.4: Add Environment Variables

1. Scroll ke bawah, ada section "Environment Variables"
2. Add variable #1:
   - Name: `GOOGLE_APPS_SCRIPT_URL`
   - Value: [Deployment URL dari step 1.5]
3. Add variable #2:
   - Name: `FONNTE_API_KEY`
   - Value: [API Key dari step 1.6]

### Step 3.5: Deploy!

1. Klik tombol "Deploy"
2. Tunggu deploy selesai (1-2 menit)
3. **Copy URL yang muncul:**
   ```
   https://tabungan-qurban.vercel.app
   ```

✅ Aplikasi sudah live!

---

## BAGIAN 4: GENERATE APP ICONS ⏱️ 10 MENIT

**PENTING:** Tanpa icons, PWA tidak akan install dengan benar.

### Option A: Online Generator (Termudah)

1. Buka [PWA Builder](https://www.pwabuilder.com/imageGenerator)
2. Upload logo atau image kamu
3. Download 4 files yang digenerate:
   - `icon-192x192.png`
   - `icon-512x512.png`
   - `icon-maskable-192x192.png`
   - `icon-maskable-512x512.png`

4. **Upload ke GitHub:**
   - Create folder: `public/icons/`
   - Upload 4 icon files ke folder tersebut
   - Commit & push ke GitHub:
     ```bash
     git add public/icons/
     git commit -m "Add app icons"
     git push
     ```

5. Vercel otomatis redeploy! ✅

### Option B: Jika tidak punya logo

1. Gunakan design online gratis:
   - [Figma](https://figma.com) - Free
   - [Canva](https://canva.com) - Free
   - [Pixlr](https://pixlr.com) - Free

2. Buat simple design 512x512 pixels
3. Save sebagai PNG (transparent background)
4. Baru generate icons dengan PWA Builder

---

## BAGIAN 5: TESTING & LAUNCH ⏱️ 10 MENIT

### Step 5.1: Test App Loads

1. Buka URL Vercel (dari step 3.5)
2. Tunggu loading selesai
3. Harusnya muncul login page
4. **Jika error:**
   - Buka DevTools (F12)
   - Tab "Console"
   - Cari error message
   - Check `config.js` apakah URL sudah diupdate

### Step 5.2: Add Test User

1. Buka Google Sheet (tab Members)
2. Baris 2, add data:
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

3. Klik "Enter" untuk save

### Step 5.3: Test Login

1. Buka app di browser
2. Login dengan:
   - ID: `DQH-001`
   - Password: `6789`
3. Harusnya sukses login & masuk ke dashboard

### Step 5.4: Test Service Worker

1. Buka DevTools (F12)
2. Tab "Application" > "Service Workers"
3. Harusnya ada service worker registered
4. URL: `/service-worker.js`
5. Status: "activated and running"

### Step 5.5: Test Offline Mode

1. Di DevTools > Network tab
2. Centang "Offline" checkbox
3. Reload page (Ctrl+R)
4. Harusnya masih bisa akses (dari cache)

### Step 5.6: Test PWA Install

1. **Mobile:**
   - Buka di Chrome mobile
   - Klik 3 dots menu
   - Klik "Install app"
   - Konfirmasi

2. **Desktop:**
   - Chrome akan show install prompt
   - Klik "Install"

---

## ✅ LAUNCH CHECKLIST

Sebelum share ke users, pastikan:

- [ ] App loads tanpa error
- [ ] Login dengan test user berhasil
- [ ] Service Worker registered
- [ ] Offline mode bekerja
- [ ] Icons sudah ter-generate
- [ ] PWA install prompt shows
- [ ] WhatsApp API key valid

---

## 🎉 SELESAI!

Aplikasi sudah ready for production! 

**Next steps:**
1. Share URL ke users
2. Buat dokumentasi untuk users
3. Monitor aplikasi di Vercel dashboard
4. Regular backup Google Sheet

---

## 📞 TROUBLESHOOTING

### ❌ "Cannot read properties of undefined"

**Solusi:**
- Buka `public/config.js`
- Pastikan `GOOGLE_APPS_SCRIPT_URL` sudah diupdate dengan benar
- Tidak ada typo di URL
- Pastikan URL deployment Apps Script benar

### ❌ "Service Worker registration failed"

**Solusi:**
- Clear browser cache: Ctrl+Shift+Delete
- Hapus cache di DevTools > Application > Storage > Clear site data
- Refresh halaman

### ❌ "Login gagal - ID atau password salah"

**Solusi:**
- Pastikan data test user sudah ditambah di Google Sheet
- Check format: ID harus match persis
- Password case-sensitive

### ❌ "WhatsApp notifikasi tidak terkirim"

**Solusi:**
- Check Fonnte API key
- Check nomor telepon format: harus mulai 62xxx
- Check Fonnte account punya balance

---

## 📖 DOKUMENTASI LEBIH LANJUT

- **README.md** - Overview features & architecture
- **DEPLOYMENT.md** - Detailed deployment steps
- **SETUP_CHECKLIST.md** - Complete checklist semua steps

---

**Selamat! Semoga lancar! 🚀**

Jika ada pertanyaan, check README.md atau GitHub issues.
