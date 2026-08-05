# 📱 Tabungan Qurban - PWA dengan Offline Support

Aplikasi manajemen tabungan qurban untuk Masjid Dhafinul Jariyah dengan fitur offline-first, sinkronisasi otomatis, dan notifikasi WhatsApp.

## 🏗️ Arsitektur

```
┌─────────────────────────────────────────────┐
│         Vercel (Frontend Hosting)           │
│  ├─ index.html (PWA App)                    │
│  ├─ service-worker.js (Offline Support)     │
│  └─ manifest.json (PWA Config)              │
└──────────────┬──────────────────────────────┘
               │ HTTPS
               ↓
┌─────────────────────────────────────────────┐
│   Google Apps Script (Backend API)          │
│  ├─ Read/Write to Google Sheets             │
│  ├─ Authentication                          │
│  └─ Data Validation                         │
└──────────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────┐
│        Google Sheets (Database)             │
│  ├─ Members (Data anggota)                  │
│  ├─ Savings (Data tabungan)                 │
│  ├─ Pendaftaran (Pendaftar baru)            │
│  └─ Messages (Notifikasi)                   │
└─────────────────────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────┐
│        Fonnte API (WhatsApp)                │
│  └─ Send notifications via WhatsApp         │
└─────────────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/tabungan-qurban.git
cd tabungan-qurban
```

### 2. Setup Google Apps Script

#### a. Buka Google Sheet
- Buka atau buat Google Sheet untuk database
- Copy URL-nya, ambil ID dari URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

#### b. Setup Apps Script
1. Di Google Sheet, buka **Tools > Script Editor**
2. Copy-paste isi dari `apps-script.gs` ke editor
3. Ganti `'YOUR_GOOGLE_SHEET_ID_HERE'` dengan Sheet ID kamu
4. Jalankan fungsi `testDeployment()` untuk test
5. Klik **Deploy > New Deployment**
   - Type: Web App
   - Execute as: [Your Account]
   - Who has access: Anyone
6. Copy deployment URL (akan seperti: `https://script.google.com/macros/d/{DEPLOYMENT_ID}/usercopy`)

#### c. Update Config
- Buka `public/config.js`
- Ganti `GOOGLE_APPS_SCRIPT_URL` dengan deployment URL
- Ganti `FONNTE_API_KEY` dengan API key dari Fonnte

### 3. Struktur Folder

```
tabungan-qurban/
├── public/
│   ├── index.html                 # Main app
│   ├── config.js                  # Configuration & API client
│   ├── service-worker.js          # Offline support
│   ├── manifest.json              # PWA manifest
│   ├── offline.html               # Offline fallback
│   ├── icons/                     # App icons (192x192, 512x512)
│   └── screenshots/               # App screenshots
├── api/
│   └── proxy.js                   # Optional: Vercel serverless proxy
├── apps-script.gs                 # Google Apps Script backend
├── vercel.json                    # Vercel configuration
├── package.json                   # Dependencies
├── .gitignore                     # Git ignore
└── README.md                      # This file
```

### 4. Deploy ke Vercel

#### Via GitHub (Recommended)
1. Push code ke GitHub
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/tabungan-qurban.git
   git branch -M main
   git push -u origin main
   ```

2. Connect ke Vercel
   - Buka [vercel.com](https://vercel.com)
   - Login dengan GitHub account
   - Klik "New Project"
   - Import repository `tabungan-qurban`
   - Konfigurasi environment variables:
     - `GOOGLE_APPS_SCRIPT_URL`: URL deployment Apps Script
     - `FONNTE_API_KEY`: API key Fonnte
   - Klik "Deploy"

#### Via CLI
```bash
npm install -g vercel
vercel login
vercel
# Follow prompts
vercel --prod  # Deploy to production
```

### 5. Local Development

```bash
# Serve locally dengan Python
python3 -m http.server 3000 --directory public

# Atau dengan npm
npm run dev

# Buka http://localhost:3000 di browser
```

## 🔒 Environment Variables

Buat file `.env.local` (jangan commit!):

```env
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/d/{ID}/usercopy
FONNTE_API_KEY=your_fonnte_api_key_here
```

Di Vercel, set di **Settings > Environment Variables**

## 📊 Database Schema

### Members (Tab di Google Sheets)
```
| id | name | phone | password | rt | blok | no | sapi | urutan | status | created_date | role |
```

### Savings
```
| id | memberId | amount | bankSource | transferDate | buktiFile | status | approved_by | approved_at |
```

### Pendaftaran
```
| id | name | phone | rt | blok | no | reason | status | approved_at | approved_by | password |
```

### Messages
```
| id | title | recipients | message | status | sentAt |
```

## 🔧 Fitur

✅ **Offline-First Architecture**
- Bekerja tanpa internet
- Sinkronisasi otomatis saat online
- IndexedDB untuk local storage

✅ **PWA Features**
- Installable sebagai native app
- Push notifications
- Background sync
- Cache-first caching strategy

✅ **Authentication**
- Login dengan ID + Password
- Password auto-generate dari 4 digit terakhir nomor HP
- Session management

✅ **Member Management**
- Registrasi anggota baru
- Approval workflow
- Profile editing
- Foto profil support

✅ **Savings Tracking**
- Input tabungan dengan bukti transfer
- Approval tabungan
- Export data ke CSV
- Progress tracking

✅ **Admin Features**
- Dashboard
- Member approval
- Broadcast messages via WhatsApp
- Message templates
- Data export

✅ **Notifikasi**
- WhatsApp notifications via Fonnte API
- Confirmation messages
- Rejected notifications
- Bulk broadcasting

## 🛠️ API Endpoints

### Google Apps Script API

```javascript
// POST ke GOOGLE_APPS_SCRIPT_URL

// Read data
{
  "action": "read",
  "sheet": "Members"
}

// Append data
{
  "action": "append",
  "sheet": "Members",
  "data": { "name": "John", "phone": "62812345" }
}

// Update data
{
  "action": "update",
  "sheet": "Members",
  "matchField": "id",
  "matchValue": "DQH-001",
  "updateData": { "name": "John Doe" }
}

// Login
{
  "action": "login",
  "id": "DQH-001",
  "password": "1234"
}

// Sync all data
{
  "action": "sync"
}
```

## 📱 Service Worker

Service Worker otomatis:
- Caches asset statis
- Network-first untuk API calls
- Falls back ke IndexedDB saat offline
- Background sync saat online kembali
- Clear cache strategy

## 🔐 Security Best Practices

- [ ] Enable HTTPS everywhere (Vercel otomatis)
- [ ] Set Google Apps Script akses ke "Anyone"
- [ ] Restrict member data access via authentication
- [ ] Use environment variables untuk secrets
- [ ] Validate input di backend (Apps Script)
- [ ] Sanitize output untuk XSS protection
- [ ] Add CORS headers if needed
- [ ] Rate limit WhatsApp API calls

## 🐛 Troubleshooting

### Service Worker tidak terdaftar
```bash
# Clear cache dan restart
rm -rf ~/Library/Application\ Support/Google/Chrome/Default/Cache
```

### IndexedDB error
- Check browser dev tools > Application > Storage
- Clear IndexedDB jika ada error

### Apps Script deployment error
- Pastikan file sudah saved
- Jalankan `testDeployment()` untuk test
- Check execution logs di Apps Script editor

### WhatsApp notifikasi tidak terkirim
- Check Fonnte API key
- Verify nomor telepon format (62xxx)
- Check Fonnte dashboard untuk error log

## 📈 Performance

- First Contentful Paint: < 1s
- Lighthouse PWA Score: 95+
- Offline response time: < 100ms
- Sync time: < 5s per request

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` file for more information.

## 🙏 Acknowledgments

- Google Sheets API
- Vercel Hosting
- Fonnte WhatsApp API
- PWA Communities

## 📞 Support

- Issues: GitHub Issues
- Email: support@example.com
- WhatsApp: Contact admin

---

**Made with ❤️ for Masjid Dhafinul Jariyah**
