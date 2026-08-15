// ===== api/sheets.js =====
// Pengganti Google Apps Script. Berjalan sebagai Vercel Serverless Function,
// jauh lebih cepat karena tidak ada overhead "buka Spreadsheet dari nol" ala
// Apps Script, dan tidak perlu redirect ke script.googleusercontent.com.
//
// Autentikasi pakai OAuth refresh token (bukan service account key, karena
// organization policy Google Cloud memblokir pembuatan service account key).
// Ini bertindak sebagai akun Google pemilik Sheet, jadi otomatis punya akses
// edit tanpa perlu "share" sheet ke siapapun.
//
// ENV VARS yang wajib diisi di Vercel (Project Settings -> Environment Variables):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REFRESH_TOKEN  - 1 akun Google (mode lama/default). BISA diganti
//                         GOOGLE_REFRESH_TOKENS (jamak, dipisah koma) kalau
//                         mau sharding kuota API ke beberapa akun Google
//                         sekaligus - lihat komentar "SHARDING KUOTA API" di
//                         dekat getAccessToken(). Opsional, cuma perlu kalau
//                         jumlah masjid sudah banyak & mulai kena rate-limit
//                         Google Sheets API (60 request/menit PER AKUN).
//   GOOGLE_SHEET_ID     - ID Google Sheet single-tenant lama (fallback kalau
//                         request tidak bawa ?tenant=, lihat panduan setup:
//                         bagian antara /d/ dan /edit di URL spreadsheet Anda)
//   REGISTRY_SHEET_ID   - ID Google Sheet "Registry" (daftar semua masjid
//                         platform multi-tenant, lihat komentar
//                         REGISTRY_SHEET_ID di bawah) - opsional, cuma
//                         wajib kalau mau pakai fitur multi-masjid.
//   SUPERADMIN_PASSWORD - password buat halaman /superadmin.html (review
//                         pengajuan masjid baru dari landing page). Opsional,
//                         tapi tanpa ini endpoint list/approve pendaftaran
//                         SELALU menolak (lihat blok "Super Admin" di bawah).
//   BLOB_READ_WRITE_TOKEN - OTOMATIS ke-set oleh Vercel begitu store "Blob"
//                         di-connect ke project (Vercel dashboard -> Storage
//                         -> Create Database -> Blob). TIDAK diisi manual.
//                         Tanpa ini, logo pendaftaran masjid tetap jalan tapi
//                         fallback ke data URI base64 lama (lihat
//                         uploadLogoToBlob()), bukan URL Blob asli.
//
// Endpoint & format request/response SENGAJA dibuat sama persis dengan Apps
// Script lama, supaya frontend cuma perlu ganti SHEETDB_CONFIG.ENDPOINT.
// Semua endpoint di bawah bisa ditambah "&tenant=<slug>" (mis. "&tenant=
// dhafinul") buat nunjuk ke data masjid tertentu di platform multi-tenant -
// tanpa "tenant", tetap jalan seperti biasa (mode single-tenant/legacy):
//   GET  /api/sheets                          -> { status: 'API is running' }
//   GET  /api/sheets?tenant=<slug>&config=1   -> config publik masjid (nama, logo, rekening, dst)
//   GET  /api/sheets?sheet=Members             -> array of objects
//   GET  /api/sheets?bootstrap=1               -> { Members:[], Savings:[], Verifications:[], Pesan:[], Pendaftaran:[], Templates:[], LoginLog:[], SurveySapi:[], SurveyPeserta:[], DistribusiDaging:[], RencanaDistribusi:[], WorkOrderAktual:[], PenerimaQR:[], PosBudget:[], TransaksiKeuangan:[], KemasanInventaris:[], LPJNarasi:[] }
//   GET  /api/sheets?sheet=Savings&getFile=<id>            -> { id, fileData }
//   GET  /api/sheets?sheet=SurveySapi&getFile=<id>&col=foto1..foto5 -> { id, col, fileData }
//   POST /api/sheets?sheet=Members&action=append  body: JSON record
//   POST /api/sheets?sheet=Members&action=update  body: { keyColumn, keyValue, updates }
//
// Super Admin - pendaftaran masjid baru (landing page Alur Qurban, TERPISAH
// dari sistem tenant, sheet-nya di REGISTRY_SHEET_ID tab "PendaftaranMasjid"):
//   POST /api/sheets?superadmin=submit         body: data form (publik, tanpa password)
//   POST /api/sheets?superadmin=list           body: { password }         -> array pengajuan
//   POST /api/sheets?superadmin=updateStatus   body: { password, ref, status }

// Fallback ke ID spreadsheet Masjid Dhafinul Jariyah kalau env var belum
// diset, supaya deployment yang sudah jalan tidak tiba-tiba rusak. Masjid/DKM
// lain yang deploy ulang project ini WAJIB set GOOGLE_SHEET_ID di Vercel ke
// ID spreadsheet mereka sendiri - jangan pakai ID di bawah ini.
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1UareCU-UMZianvrCKWVeI7_LHZlOgEAOlBJfBwjcH4Q';

// ===== MULTI-TENANT (platform "1 kode, banyak masjid") =====
// REGISTRY_SHEET_ID menunjuk ke 1 Google Sheet KHUSUS yang cuma dipegang
// Super Admin (bukan Sheet data masjid manapun) - isinya daftar semua masjid
// yang pakai platform ini, 1 baris = 1 masjid, kolom (header baris 1):
//   slug | status | mosqueName | mosqueShortName | logoFile | locationName |
//   prayerLocationId | bankName | bankCode | bankAccountNumber |
//   bankAccountNumberDisplay | bankAccountHolder | qurbanTarget | sheetId |
//   credentialPool | fonnteApiKey | createdDate
// "credentialPool" (angka, 0-based) = index akun Google mana (dari
// GOOGLE_REFRESH_TOKENS) yang PUNYA/akses Sheet data tenant ini - dipakai
// buat sharding kuota API (lihat komentar "SHARDING KUOTA API" dekat
// getAccessToken()). Kosong/0 = akun utama (mode lama, tidak ada sharding).
// WAJIB DITAMBAH manual sbg kolom baru di header baris 1 kalau belum ada -
// kalau kolom ini belum ada, tenant baru SELALU dianggap pool 0 (aman, cuma
// berarti sharding belum aktif, bukan error).
// "slug" dipakai di path URL (mis. /dhafinul, /annurlam) buat nentuin masjid
// mana yang sedang diakses. "sheetId" = ID Google Sheet DATA masjid itu
// (skema persis sama dengan SHEET_NAMES di bawah - bukan Registry-nya).
// "status" != 'aktif' dianggap tenant nonaktif/belum siap, ditolak.
// Kalau request TIDAK bawa parameter ?tenant=, fallback ke SHEET_ID di atas
// (mode single-tenant lama) - supaya deployment yang belum di-migrasi ke
// Registry tetap jalan seperti biasa selama masa transisi.
const REGISTRY_SHEET_ID = process.env.REGISTRY_SHEET_ID || '';
const REGISTRY_SHEET_NAME = 'Registry';
// Tab TERPISAH di Sheet Registry yang sama, isinya pengajuan "Ajukan work
// order" dari landing page Alur Qurban (public/index.html) - BUKAN sheet
// per-masjid manapun. Kolom: ref, namaMasjid, kota, jumlahJamaah, namaKontak,
// posisiKontak, teleponKontak, emailKontak, bankName, bankAccountNumber,
// bankAccountHolder, logoUrl, logoDataUrl, paket, anggaran, target, modul,
// catatan, status (pending/approved/rejected), created_date. "logoUrl" WAJIB
// DITAMBAH manual sbg kolom baru di header baris 1 (lihat uploadLogoToBlob())
// - kalau kolom ini belum ada, URL Blob hasil upload logo cuma didiamkan
// (tidak tersimpan, appendRow() generic & header-driven) sampai kolomnya
// dibuat. Direview lewat public/superadmin.html, dilindungi SUPERADMIN_PASSWORD.
const PENDAFTARAN_MASJID_SHEET = 'PendaftaranMasjid';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';

// Kode bank (SKN/kliring) standar Indonesia - dipakai auto-isi kolom
// "bankCode" Registry pas approve pendaftaran masjid, supaya Super Admin
// tidak perlu cari manual utk bank-bank umum. "prayerLocationId" SENGAJA
// TIDAK ada lookup serupa - itu ID lokasi khusus api.myquran.com, tidak bisa
// ditebak dari nama kota, tetap harus dicari & diisi manual di Registry.
const BANK_CODES = {
  'bca': '014', 'bri': '002', 'mandiri': '008', 'bni': '009', 'bsi': '451',
  'btn': '200', 'cimb niaga': '022', 'danamon': '011', 'permata': '013',
  'bjb': '110', 'muamalat': '147'
};
function lookupBankCode(bankName) {
  return BANK_CODES[(bankName || '').toString().trim().toLowerCase()] || '';
}

// ===== VERCEL BLOB - upload logo masjid jadi URL gambar asli =====
// Sebelumnya logo pendaftaran cuma disimpan sbg data URI base64 langsung di
// sel Google Sheets (kolom logoFile/logoDataUrl) - jalan, tapi (a) boros sel
// (limit Google Sheets ~50rb karakter/sel, makanya logo landing page dikompres
// agresif jadi thumbnail kecil) dan (b) bukan URL gambar "asli" yang bebas
// dipakai di tempat lain (og:image share, dst). Vercel Blob kasih URL publik
// beneran, jadi kolom logoFile di Registry sekarang isinya URL
// (https://...public.blob.vercel-storage.com/...) - kalau upload gagal/Blob
// store belum di-setup, fallback otomatis ke data URI apa adanya (tidak
// pernah gagal total, cuma tidak dapat URL asli).
// WAJIB di Vercel dashboard: Storage tab -> Create Database -> Blob -> Connect
// ke project ini. Env var BLOB_READ_WRITE_TOKEN ke-set OTOMATIS, tidak perlu
// diisi manual.
async function uploadLogoToBlob(dataUrl, filenameHint) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return '';
  if (!process.env.BLOB_READ_WRITE_TOKEN) return ''; // Blob store belum di-connect - caller fallback ke data URI
  try {
    // Dynamic import (bukan require) - jalan sama persis di CommonJS
    // (public/api/sheets.js) maupun ES module (api/sheets.js root), jadi
    // kedua file bisa tetap identik di bagian ini.
    const { put } = await import('@vercel/blob');
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return '';
    const mime = match[1] || 'image/png';
    const buffer = Buffer.from(match[2], 'base64');
    const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg').split('+')[0];
    const safeName = (filenameHint || 'logo').toString().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'logo';
    const blob = await put(`logos/${safeName}-${Date.now()}.${ext}`, buffer, {
      access: 'public',
      contentType: mime,
      addRandomSuffix: false
    });
    return blob.url || '';
  } catch (err) {
    console.error('[uploadLogoToBlob] gagal upload:', err && err.message ? err.message : err);
    return ''; // caller fallback ke data URI
  }
}

const REGISTRY_TTL_MS = 30000; // Registry jarang berubah, cache lebih lama dari bootstrap biasa
let registryCache = null;
let registryCacheAt = 0;

async function loadRegistry(accessToken) {
  if (registryCache && (Date.now() - registryCacheAt) < REGISTRY_TTL_MS) return registryCache;
  const data = await sheetsFetch(REGISTRY_SHEET_ID, `/values/${encodeURIComponent(REGISTRY_SHEET_NAME)}`, accessToken);
  const rows = valuesToObjects(data.values || []);
  registryCache = rows;
  registryCacheAt = Date.now();
  return rows;
}

// Cari 1 baris tenant by slug (case-insensitive). null kalau tidak ada atau
// statusnya bukan 'aktif'. Butuh REGISTRY_SHEET_ID ke-set di env var Vercel.
async function resolveTenant(tenantSlug, accessToken) {
  if (!tenantSlug || !REGISTRY_SHEET_ID) return null;
  const rows = await loadRegistry(accessToken);
  const tenant = rows.find(r => (r.slug || '').toString().trim().toLowerCase() === tenantSlug.toString().trim().toLowerCase());
  if (!tenant) return null;
  if ((tenant.status || '').toString().trim().toLowerCase() !== 'aktif') return null;
  return tenant;
}

// Subset field yang aman dikirim ke browser - "sheetId" & "fonnteApiKey"
// SENGAJA tidak pernah ikut terkirim ke frontend (internal-only, dipakai
// server-side saja).
function tenantConfigPublicFields(tenant) {
  return {
    slug: tenant.slug || '',
    mosqueName: tenant.mosqueName || '',
    mosqueShortName: tenant.mosqueShortName || '',
    logoFile: tenant.logoFile || '',
    locationName: tenant.locationName || '',
    prayerLocationId: tenant.prayerLocationId || '',
    bankName: tenant.bankName || '',
    bankCode: tenant.bankCode || '',
    bankAccountNumber: tenant.bankAccountNumber || '',
    bankAccountNumberDisplay: tenant.bankAccountNumberDisplay || '',
    bankAccountHolder: tenant.bankAccountHolder || '',
    qurbanTarget: parseInt(tenant.qurbanTarget) || 0
  };
}
// 'SurveyPeserta' menyimpan siapa saja anggota yang klik "Ikut" di sebuah
// survey sapi (kolom: id, surveyId, memberId, memberName, phone, created_date)
// - dipakai untuk menampilkan list peserta grup sapi ke sesama anggota.
// 'DistribusiDaging' menyimpan rencana pembagian daging per alokasi per sapi
// (Work Order - detail pelaksanaan lapangan), diinput manual oleh admin
// (kolom: id, surveyId, alokasi, berat, qty, status, created_date) -
// "surveyId" mengaitkan tiap baris ke 1 sapi survey tertentu.
// 'RencanaDistribusi' adalah versi GLOBAL/kasar (tidak terikat 1 sapi
// tertentu) buat estimasi awal sebelum dirinci ke Work Order per sapi
// (kolom: id, alokasi, berat, qty, wo, status, created_date) - "wo" ('ya'/
// 'tidak') menandakan baris ini sudah dipindahkan/dimasukkan ke Work Order
// atau belum.
// 'WorkOrderAktual' menyimpan ANGKA AKTUAL saat hari pelaksanaan (bisa beda
// dari rencana di DistribusiDaging - dilapangan sering tidak persis sesuai
// rencana), skema kolom sama persis dengan DistribusiDaging (id, surveyId,
// alokasi, berat, qty, status, created_date) tapi sheet TERPISAH & Qty-nya
// TIDAK dibatasi kuota seperti di Work Order rencana.
// 'PenerimaQR' menyimpan daftar penerima daging BERNAMA per alokasi (bukan
// cuma angka qty) - dipakai buat cetak e-tiket QR & check-in pas hari
// pelaksanaan (kolom: id, alokasi, nama, noHp, alamat, kodeTiket, status,
// diambil ('ya'/'tidak'), waktuAmbil, lokasiLat, lokasiLng, fotoAmbil,
// kategori, berat, kelompokSapi, sourcePesertaId, created_date). "kodeTiket"
// itu kode unik acak yang di-encode ke QR; "diambil" ditandai otomatis
// begitu tiket di-scan (atau dicek manual) supaya 1 tiket cuma bisa dipakai
// 1x. "lokasiLat"/"lokasiLng" & "fotoAmbil" ditangkap otomatis pas admin
// konfirmasi pengambilan (GPS browser + foto opsional) - bukti buat
// pelaporan/transparansi. "fotoAmbil" (base64) SENGAJA dibuang dari
// list/bootstrap biasa (lihat stripPenerimaFoto di bawah), sama alasannya
// dengan foto SurveySapi. Kolom "kategori" ('umum'/'mudhohi'), "berat" (kg),
// "kelompokSapi", dan "sourcePesertaId" (id baris SurveyPeserta asal) dipakai
// fitur Kupon Mudhohi (generateKuponMudhohi() di app.html) - baris lama
// sebelum fitur ini ada otomatis dianggap kategori 'umum'.
// Keduanya pakai "status" sebagai soft-delete ('batal' = disembunyikan,
// bukan dihapus dari sheet, sama pola dengan SurveyPeserta).
// "LPJNarasi" - satu baris config (id tetap 'lpj') isi narasi/kata pengantar
// yang bisa ditulis admin di tab LPJ (Laporan Pertanggungjawaban). Sengaja
// dibuatkan sheet sendiri (bukan hardcode) supaya kontennya bisa diedit
// tanpa ubah kode, sama semangatnya dengan Templates.
const SHEET_NAMES = ['Members', 'Savings', 'Verifications', 'Pesan', 'Pendaftaran', 'Templates', 'LoginLog', 'SurveySapi', 'SurveyPeserta', 'DistribusiDaging', 'RencanaDistribusi', 'WorkOrderAktual', 'PenerimaQR', 'PosBudget', 'TransaksiKeuangan', 'KemasanInventaris', 'LPJNarasi'];

// Kolom foto (base64) di sheet SurveySapi - sama alasannya dengan fileData di
// Savings: base64 foto bisa besar, jadi DIBUANG dari list/bootstrap biasa dan
// diganti flag hasFotoN. Isi foto sebenarnya baru diambil on-demand lewat
// ?sheet=SurveySapi&getFile=<id>&col=fotoN saat admin klik lihat foto.
const SURVEY_FOTO_COLUMNS = ['foto1', 'foto2', 'foto3', 'foto4', 'foto5'];

function stripSurveyFotos(row) {
  const stripped = { ...row };
  SURVEY_FOTO_COLUMNS.forEach(col => {
    const hasKey = 'has' + col.charAt(0).toUpperCase() + col.slice(1);
    stripped[hasKey] = !!row[col];
    stripped[col] = '';
  });
  return stripped;
}

// Sama pola dengan stripSurveyFotos, tapi utk 1 kolom foto di PenerimaQR
// ("fotoAmbil" - foto bukti saat penerima ambil daging).
function stripPenerimaFoto(row) {
  return { ...row, hasFotoAmbil: !!row.fotoAmbil, fotoAmbil: '' };
}

// Sama pola lagi, utk 1 kolom foto bukti transaksi keuangan (nota/struk) di
// sheet TransaksiKeuangan - modul "Keuangan" (Pos Budget + arus kas harian).
function stripBuktiTransaksi(row) {
  return { ...row, hasBukti: !!row.bukti, bukti: '' };
}

// 'KemasanInventaris' - modul "Kemasan & Inventaris", 2 kategori dalam 1
// sheet (kolom "kategori"): 'kemasan' (habis pakai spt plastik/dus/tali -
// kebutuhan dihitung OTOMATIS dari basisHitung ['paket'/'kg'] x rasioPerUnit,
// lihat hitungKebutuhanKemasan() di frontend) dan 'inventaris' (alat/
// perlengkapan spt pisau/timbangan - kebutuhan diisi MANUAL lewat kolom
// kebutuhanManual, tidak ikut skala paket/kg). Kolom lengkap: id, namaItem,
// kategori, basisHitung, rasioPerUnit, kebutuhanManual, stokTersedia,
// catatan, status, created_date. Checklist sederhana, tanpa histori in/out -
// "status" tetap dipakai sebagai soft-delete ('batal'), sama pola dengan
// sheet lain.

// ===== SHARDING KUOTA API: pool banyak akun Google =====
// Google Sheets API membatasi 60 request/menit PER AKUN Google (bukan per
// project) - kalau SEMUA masjid platform ini pakai 1 akun Google yang sama,
// mereka berebut jatah 60/menit yang SAMA, paling parah pas hari pelaksanaan
// qurban (semua masjid scan tiket bersamaan di hari & jam yang sama persis).
// Solusinya: GOOGLE_REFRESH_TOKENS (jamak, dipisah koma) - tiap token dari
// akun Google BERBEDA, masing-masing dapat jatah 60/menit SENDIRI. Index 0
// SELALU akun utama/lama (Registry & tenant lama/belum di-assign pool selalu
// pakai ini) - kalau env var ini cuma diisi 1 token atau belum diisi sama
// sekali (fallback ke GOOGLE_REFRESH_TOKEN tunggal, mode lama), semua
// behavior PERSIS sama seperti sebelum fitur ini ada - tidak ada breaking
// change buat deployment yang belum sempat setup akun tambahan.
// Cara nambah akun ke pool: lihat komentar provisionTenantSpreadsheet() &
// pickPoolIndexForNewTenant() di bawah, ulangi proses ambil refresh token
// (OAuth Playground) pakai akun Google LAIN, lalu tambahkan hasilnya ke
// GOOGLE_REFRESH_TOKENS dipisah koma (mis. "token1,token2,token3").
const REFRESH_TOKENS = (process.env.GOOGLE_REFRESH_TOKENS || process.env.GOOGLE_REFRESH_TOKEN || '')
  .split(',').map(t => t.trim()).filter(Boolean);
const CREDENTIAL_POOL_SIZE = REFRESH_TOKENS.length || 1;

// ----- Cache access token di memori, PER POOL INDEX (bertahan selama instance
// function masih "warm") - beda dari sebelumnya yang cuma 1 token global. -----
let cachedAccessTokens = {}; // { [poolIndex]: { token, expiresAt } }

async function getAccessToken(poolIndex) {
  const idx = (Number.isInteger(poolIndex) && poolIndex >= 0 && poolIndex < REFRESH_TOKENS.length) ? poolIndex : 0;
  const cached = cachedAccessTokens[idx];
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.token;
  }

  const refreshToken = REFRESH_TOKENS[idx];
  if (!refreshToken) {
    throw new Error(`GOOGLE_REFRESH_TOKEN(S) belum diset (pool index ${idx})`);
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gagal refresh access token (pool index ${idx}): ` + errText);
  }

  const data = await resp.json();
  cachedAccessTokens[idx] = { token: data.access_token, expiresAt: Date.now() + (data.expires_in * 1000) };
  return data.access_token;
}

// ----- Cache hasil bootstrap di memori, TTL pendek (mirip CacheService di Apps Script) -----
// Di-key per tenant slug ('default' utk mode single-tenant lama) supaya data
// masjid A tidak pernah ke-cache-tertukar dengan masjid B di instance
// function yang sama.
let bootstrapCacheStore = {};
const BOOTSTRAP_TTL_MS = 12000;

function invalidateBootstrapCache(tenantKey) {
  delete bootstrapCacheStore[tenantKey || 'default'];
}

// ----- Helper: panggil Google Sheets API v4 -----
// "sheetId" WAJIB dioper eksplisit (bukan baca SHEET_ID global lagi) supaya
// 1 handler yang sama bisa melayani banyak masjid sekaligus, tiap request
// bisa nunjuk ke spreadsheet DATA masjid yang berbeda-beda (lihat resolveTenant()).
async function sheetsFetch(sheetId, path, accessToken, options = {}) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Sheets API error (${resp.status}): ${errText}`);
  }
  return resp.json();
}

// Konversi array 2D (values dari Sheets API) jadi array of objects pakai baris pertama sebagai header
function valuesToObjects(values) {
  if (!values || values.length === 0) return [];
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[i][idx] !== undefined ? values[i][idx] : ''; });
    rows.push(row);
  }
  return rows;
}

function columnToLetter(colIndexZeroBased) {
  let letter = '';
  let col = colIndexZeroBased + 1;
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// Baca 1 sheet penuh -> array of objects. Untuk Savings, fileData (base64 foto
// bukti, bisa besar) DIBUANG dan diganti flag hasFile - sama seperti versi
// Apps Script sebelumnya, supaya list/bootstrap tetap ringan & cepat.
async function readSheet(sheetId, sheetName, accessToken) {
  const data = await sheetsFetch(sheetId, `/values/${encodeURIComponent(sheetName)}`, accessToken);
  let rows = valuesToObjects(data.values || []);
  if (sheetName === 'Savings') {
    rows = rows.map(row => {
      const hasFile = !!row.fileData;
      return { ...row, fileData: '', hasFile };
    });
  }
  if (sheetName === 'SurveySapi') {
    rows = rows.map(stripSurveyFotos);
  }
  if (sheetName === 'PenerimaQR') {
    rows = rows.map(stripPenerimaFoto);
  }
  if (sheetName === 'TransaksiKeuangan') {
    rows = rows.map(stripBuktiTransaksi);
  }
  return rows;
}

async function readAllSheetsBatch(sheetId, accessToken) {
  try {
    const rangesQuery = SHEET_NAMES.map(n => `ranges=${encodeURIComponent(n)}`).join('&');
    const data = await sheetsFetch(sheetId, `/values:batchGet?${rangesQuery}`, accessToken);
    const result = {};
    SHEET_NAMES.forEach((name, idx) => {
      const valueRange = data.valueRanges[idx];
      let rows = valuesToObjects(valueRange.values || []);
      if (name === 'Savings') {
        rows = rows.map(row => {
          const hasFile = !!row.fileData;
          return { ...row, fileData: '', hasFile };
        });
      }
      if (name === 'SurveySapi') {
        rows = rows.map(stripSurveyFotos);
      }
      if (name === 'PenerimaQR') {
        rows = rows.map(stripPenerimaFoto);
      }
      if (name === 'TransaksiKeuangan') {
        rows = rows.map(stripBuktiTransaksi);
      }
      result[name] = rows;
    });
    return result;
  } catch (err) {
    // Kalau salah satu sheet di SHEET_NAMES belum ada (mis. sheet "Templates"
    // belum dibuat user), Google Sheets API menolak SELURUH request batchGet
    // (bukan cuma range yang bermasalah) -> tanpa fallback ini, satu sheet
    // yang belum ada bisa bikin SEMUA data (Members, Savings, dst) gagal
    // dimuat. Jadi kalau batch gagal, coba baca satu-satu; yang error
    // (sheet belum ada) cukup dianggap kosong, bukan bikin semuanya gagal.
    console.error('batchGet gagal, fallback ke baca per-sheet:', err.message);
    const result = {};
    await Promise.all(SHEET_NAMES.map(async (name) => {
      try {
        result[name] = await readSheet(sheetId, name, accessToken);
      } catch (innerErr) {
        console.error(`Sheet "${name}" gagal dibaca (mungkin belum dibuat):`, innerErr.message);
        result[name] = [];
      }
    }));
    return result;
  }
}

async function appendRow(sheetId, sheetName, record, accessToken) {
  // Ambil header dulu buat tahu urutan kolom
  const headerData = await sheetsFetch(sheetId, `/values/${encodeURIComponent(sheetName)}!1:1`, accessToken);
  const headers = (headerData.values && headerData.values[0]) || [];
  const newRow = headers.map(h => (record[h] !== undefined ? record[h] : ''));

  // Batasi range append ke kolom A sampai kolom terakhir header (mis. "Members!A:K"),
  // JANGAN cuma nama sheet tanpa batas kolom. Kalau range tidak dibatasi, Google
  // Sheets API mendeteksi "tabel" secara otomatis - dan kalau ada teks nyasar di
  // kolom jauh (mis. catatan/komentar admin), append bisa salah sasaran nulis ke
  // kolom yang jauh sekali alih-alih bikin baris baru di kolom A. Sudah pernah
  // kejadian nyata: data anggota baru nyasar ke kolom M-U gara-gara ada teks
  // "<- baris contoh" di kolom M baris 2.
  const lastColLetter = columnToLetter(headers.length - 1);
  const appendRange = `${encodeURIComponent(sheetName)}!A:${lastColLetter}`;

  // valueInputOption=RAW penting: supaya nilai seperti "0812..." TIDAK diubah
  // jadi angka (dan kehilangan 0 di depan) oleh Google Sheets.
  await sheetsFetch(
    sheetId,
    `/values/${appendRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken,
    { method: 'POST', body: JSON.stringify({ values: [newRow] }) }
  );
}

async function updateRows(sheetId, sheetName, keyColumn, keyValue, updates, accessToken) {
  const data = await sheetsFetch(sheetId, `/values/${encodeURIComponent(sheetName)}`, accessToken);
  const values = data.values || [];
  if (values.length === 0) return { success: false, updated: 0 };

  const headers = values[0];
  const keyColIndex = headers.indexOf(keyColumn);
  if (keyColIndex === -1) return { success: false, updated: 0, error: `Kolom ${keyColumn} tidak ditemukan` };

  const lastColLetter = columnToLetter(headers.length - 1);
  const batchData = [];
  let updatedCount = 0;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][keyColIndex] || '') === String(keyValue)) {
      const rowCopy = headers.map((h, idx) => (values[i][idx] !== undefined ? values[i][idx] : ''));
      for (const key in updates) {
        const colIdx = headers.indexOf(key);
        if (colIdx !== -1) rowCopy[colIdx] = updates[key];
      }
      const rowNumber = i + 1; // 1-indexed, +1 lagi karena header di baris 1
      batchData.push({
        range: `${sheetName}!A${rowNumber}:${lastColLetter}${rowNumber}`,
        values: [rowCopy]
      });
      updatedCount++;
    }
  }

  if (updatedCount === 0) return { success: false, updated: 0 };

  await sheetsFetch(sheetId, `/values:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: batchData })
  });

  return { success: true, updated: updatedCount };
}

// ===== AUTO-PROVISIONING: bikin Google Sheet data masjid baru otomatis =====
// Header PERSIS harus sama dgn field yang dipakai appendSheetDB/updateSheetDB
// di app.html (readSheet/appendRow/updateRows semua header-driven by NAME,
// bukan posisi) - kolom yang tidak ada di header manapun cuma didiamkan diam-
// diam (tidak error, tapi datanya hilang). Daftar ini disusun dari 2 sumber:
// tabungan_qurban_template.xlsx (7 sheet dasar/lama) + hasil audit semua
// pemanggilan appendSheetDB()/updateSheetDB() di app.html (9 sheet fitur
// baru: SurveySapi dst). Kalau nanti ada field baru ditambah di app.html,
// WAJIB ditambah juga di sini - kalau tidak, tenant baru hasil auto-
// provisioning bakal kehilangan kolom itu (sama seperti kasus manual dulu).
const TENANT_SHEET_TEMPLATE = {
  Members: ['id', 'name', 'phone', 'status', 'created_date', 'password', 'rt', 'blok', 'no', 'sapi', 'urutan', 'role'],
  Savings: ['id', 'memberId', 'amount', 'transferDate', 'bankSource', 'accountName', 'fileUrl', 'fileData', 'status', 'uploadedAt', 'approvedAt', 'approvedBy', 'notes'],
  Verifications: ['id', 'savingsId', 'adminId', 'action', 'reason', 'timestamp'],
  Pesan: ['id', 'type', 'recipients', 'title', 'message', 'scheduledTime', 'status', 'sentAt', 'createdBy', 'notes'],
  Pendaftaran: ['id', 'name', 'rt', 'blok', 'no', 'phone', 'reason', 'password', 'status', 'applied_at', 'approved_at', 'approved_by'],
  Templates: ['key', 'title', 'message'],
  LoginLog: ['id', 'memberId', 'memberName', 'role', 'loginAt'],
  SurveySapi: ['id', 'tanggal', 'supplier', 'latitude', 'longitude', 'alamat', 'jenisSapi', 'berat', 'harga', 'biayaPengolahan', 'foto1', 'foto2', 'foto3', 'foto4', 'foto5', 'createdBy', 'created_date'],
  // "alamat" & "tipe" ditambah utk fitur "Daftar Langsung" (Qurban Instan) -
  // peserta yang ikut TANPA menabung (mendekati hari-H, bayar penuh
  // langsung, dihubungi admin via WA, tanpa akun login). tipe='tabungan'
  // (peserta anggota biasa, hasil joinSurveySapi()) atau 'instan' (hasil
  // submitInstantJoin(), memberId selalu 0 krn tidak ada akun) - baris lama
  // sebelum kolom ini ada otomatis dianggap 'tabungan' (lihat parsing di
  // app.html). "alamat" cuma diisi utk tipe 'instan' (member biasa sudah
  // punya alamat di data Members-nya sendiri).
  // "atasNama" - khusus tipe 'instan', opsional: nama penerima manfaat qurban
  // kalau BEDA dari pendaftar (mis. qurban atas nama orang tua yg sudah
  // wafat, format umum "Ahmad bin Abdullah"). Kosong = qurban atas nama
  // pendaftar sendiri (memberName). Dipakai generateKuponMudhohi() sbg nama
  // utama di e-tiket (lihat komentar di sana).
  SurveyPeserta: ['id', 'surveyId', 'memberId', 'memberName', 'phone', 'status', 'created_date', 'alamat', 'tipe', 'atasNama'],
  DistribusiDaging: ['id', 'surveyId', 'alokasi', 'berat', 'qty', 'status', 'created_date'],
  RencanaDistribusi: ['id', 'alokasi', 'berat', 'qty', 'wo', 'status', 'created_date'],
  WorkOrderAktual: ['id', 'surveyId', 'alokasi', 'berat', 'qty', 'status', 'created_date'],
  PenerimaQR: ['id', 'alokasi', 'nama', 'noHp', 'alamat', 'kodeTiket', 'status', 'diambil', 'waktuAmbil', 'lokasiLat', 'lokasiLng', 'fotoAmbil', 'kategori', 'berat', 'kelompokSapi', 'sourcePesertaId', 'created_date'],
  PosBudget: ['id', 'nama', 'jenisPos', 'jumlahAnggaran', 'keterangan', 'status', 'created_date'],
  TransaksiKeuangan: ['id', 'posId', 'tanggal', 'jumlah', 'keterangan', 'status', 'created_date', 'bukti'],
  KemasanInventaris: ['id', 'namaItem', 'kategori', 'basisHitung', 'rasioPerUnit', 'kebutuhanManual', 'stokTersedia', 'catatan', 'status', 'created_date'],
  // Cuma dipakai 1 baris (id selalu 'lpj') - lihat komentar SHEET_NAMES di atas.
  LPJNarasi: ['id', 'narasi', 'updatedBy', 'updatedDate']
};

// Bikin 1 Google Spreadsheet BARU (isinya SEMUA tab modul di atas, sudah ada
// baris header, siap dipakai langsung) - dipakai superadmin=approve supaya
// tenant baru bisa langsung 'aktif' tanpa Super Admin harus bikin/duplikat
// sheet secara manual. Spreadsheet baru otomatis dimiliki akun Google yang
// sama dengan GOOGLE_REFRESH_TOKEN (pemilik semua sheet platform ini) - jadi
// langsung kelihatan di Drive akun itu, tidak perlu di-share manual.
// Return spreadsheetId kalau sukses, throw kalau gagal (caller WAJIB
// menangkap & fallback ke alur manual lama - lihat pemakaian di "approve").
async function provisionTenantSpreadsheet(title, accessToken) {
  const tabNames = Object.keys(TENANT_SHEET_TEMPLATE);

  const createResp = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: `TQ Data - ${title}` },
      sheets: tabNames.map(name => ({ properties: { title: name } }))
    })
  });
  if (!createResp.ok) {
    throw new Error(`Gagal bikin spreadsheet baru (${createResp.status}): ${await createResp.text()}`);
  }
  const created = await createResp.json();
  const spreadsheetId = created.spreadsheetId;
  if (!spreadsheetId) throw new Error('Spreadsheet baru dibuat tapi spreadsheetId tidak ada di respons');

  // Isi baris header (baris 1) semua tab sekaligus dalam 1 batchUpdate.
  await sheetsFetch(spreadsheetId, `/values:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: tabNames.map(name => ({
        range: `${name}!A1`,
        values: [TENANT_SHEET_TEMPLATE[name]]
      }))
    })
  });

  return spreadsheetId;
}

// Load-balancing sederhana buat sharding: pilih pool (akun Google) dgn JUMLAH
// TENANT PALING SEDIKIT saat ini (bukan round-robin murni berdasar urutan -
// self-correcting kalau distribusinya pernah timpang, mis. gara-gara 1 pool
// sempat gagal provisioning beberapa kali). Kalau GOOGLE_REFRESH_TOKENS cuma
// diisi 1 token (atau belum diisi sama sekali), CREDENTIAL_POOL_SIZE = 1,
// fungsi ini SELALU balikin 0 - tidak ada efek apapun sampai akun tambahan
// benar-benar di-setup.
function pickPoolIndexForNewTenant(registryRows) {
  const counts = new Array(CREDENTIAL_POOL_SIZE).fill(0);
  registryRows.forEach(r => {
    const idx = parseInt(r.credentialPool) || 0;
    if (idx >= 0 && idx < CREDENTIAL_POOL_SIZE) counts[idx]++;
  });
  let best = 0;
  for (let i = 1; i < CREDENTIAL_POOL_SIZE; i++) {
    if (counts[i] < counts[best]) best = i;
  }
  return best;
}

// Generik: ambil isi 1 kolom (biasanya base64 foto/file) dari 1 baris (dicari
// via kolom "id") di sheet manapun. Dipakai baik oleh Savings!fileData maupun
// SurveySapi!foto1..foto5 - keduanya sama-sama "kolom berat" yang sengaja
// dibuang dari list biasa dan diambil satu-satu on-demand (lihat readSheet).
async function getFileData(sheetId, sheetName, recordId, accessToken, columnName) {
  const data = await sheetsFetch(sheetId, `/values/${encodeURIComponent(sheetName)}`, accessToken);
  const values = data.values || [];
  if (values.length === 0) return '';
  const headers = values[0];
  const idCol = headers.indexOf('id');
  const fileCol = headers.indexOf(columnName);
  if (idCol === -1 || fileCol === -1) return '';
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol] || '') === String(recordId)) {
      return values[i][fileCol] || '';
    }
  }
  return '';
}

// ----- Handler utama -----
module.exports = async function handler(req, res) {
  // Same-origin (frontend & API di domain Vercel yang sama), tapi tambahkan
  // CORS permisif juga buat jaga-jaga/testing dari domain lain.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    // Pool index 0 = akun utama - dipakai buat Registry & superadmin (SELALU
    // pool 0, tidak pernah di-shard) dan default sblm tenant di-resolve.
    // "let" (bukan "const") karena bisa di-reassign ke pool lain setelah
    // tenant diketahui - lihat blok "Resolve tenant" di bawah.
    let accessToken = await getAccessToken(0);
    const { sheet, bootstrap, getFile, action, col, tenant, config, superadmin, findMasjid } = req.query;

    // ----- Pencarian masjid publik (tombol "Masuk" di landing page, buat
    // pengurus yang lupa kode/slug masjidnya) -----
    // Publik, TANPA password - makanya field yang dikembalikan dibatasi
    // ketat (cuma slug/nama/logo, TIDAK ada bank/qurbanTarget/dll) dan query
    // minimal 2 karakter supaya tidak jadi jalan pintas nge-dump seluruh
    // Registry cuma dengan query kosong.
    if (findMasjid !== undefined) {
      if (!REGISTRY_SHEET_ID) {
        return res.status(500).json({ error: 'REGISTRY_SHEET_ID belum diset' });
      }
      const q = (findMasjid || '').toString().trim().toLowerCase();
      if (q.length < 2) {
        return res.status(200).json([]);
      }
      const rows = await loadRegistry(accessToken);
      const results = rows
        .filter(r => (r.status || '').toString().trim().toLowerCase() === 'aktif')
        .filter(r => {
          const name = (r.mosqueName || '').toString().toLowerCase();
          const short = (r.mosqueShortName || '').toString().toLowerCase();
          return name.includes(q) || short.includes(q);
        })
        .slice(0, 8)
        .map(r => ({
          slug: r.slug || '',
          mosqueName: r.mosqueName || '',
          mosqueShortName: r.mosqueShortName || '',
          logoFile: r.logoFile || ''
        }));
      return res.status(200).json(results);
    }

    // ----- Super Admin: pendaftaran masjid baru dari landing page -----
    // Berdiri sendiri, tidak lewat logic tenant di bawah (sheet-nya di
    // REGISTRY_SHEET_ID, bukan sheet data masjid manapun).
    if (superadmin) {
      if (!REGISTRY_SHEET_ID) {
        return res.status(500).json({ error: 'REGISTRY_SHEET_ID belum diset - fitur pendaftaran masjid belum aktif' });
      }
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method tidak didukung untuk superadmin' });
      }

      let saBody = req.body;
      if (typeof saBody === 'string') saBody = saBody ? JSON.parse(saBody) : {};
      if (!saBody) saBody = {};

      // Submit pengajuan baru dari landing page - publik, TANPA password.
      // Kolom bank (bankName/bankAccountNumber/bankAccountHolder) sengaja
      // ditampung di sini juga - dipakai langsung isi Registry begitu
      // pengajuan di-approve (lihat aksi "approve" di bawah), supaya Super
      // Admin tidak perlu ketik ulang info rekening masjid baru secara manual.
      if (superadmin === 'submit') {
        // Logo dikirim browser sebagai data URI (thumbnail terkompresi, lihat
        // shrinkLogo() di index.html). Coba upload ke Vercel Blob dulu supaya
        // dapat URL gambar ASLI (bukan data: URI ditumpuk di sel Sheet) - kalau
        // Blob store belum di-connect atau upload gagal karena sebab apapun,
        // uploadLogoToBlob() balikin '' dan kita fallback simpan data URI apa
        // adanya (perilaku lama), jadi submit TIDAK PERNAH gagal gara-gara ini.
        const logoDataUrlRaw = (saBody.logo && saBody.logo.dataUrl) || '';
        const logoUrl = await uploadLogoToBlob(logoDataUrlRaw, saBody.namaOrg);
        const record = {
          ref: saBody.ref || '',
          namaMasjid: saBody.namaOrg || '',
          kota: saBody.kotaOrg || '',
          jumlahJamaah: saBody.jumlahJamaah || '',
          namaKontak: saBody.namaKontak || '',
          posisiKontak: saBody.posisiKontak || '',
          teleponKontak: saBody.teleponKontak || '',
          bankName: saBody.bankName || '',
          bankAccountNumber: saBody.bankAccountNumber || '',
          bankAccountHolder: saBody.bankAccountHolder || '',
          // logoUrl = URL asli hasil upload Blob (kosong kalau upload gagal/
          // belum di-setup). logoDataUrl = fallback lama, cuma diisi kalau
          // logoUrl KOSONG - supaya tidak dobel simpan gambar yang sama.
          logoUrl,
          logoDataUrl: logoUrl ? '' : logoDataUrlRaw,
          paket: saBody.paketPilih || '',
          anggaran: saBody.budget || '',
          target: saBody.timeline || '',
          modul: Array.isArray(saBody.modul) ? saBody.modul.join(', ') : (saBody.modul || ''),
          catatan: saBody.catatan || '',
          status: 'pending',
          created_date: new Date().toISOString()
        };
        await appendRow(REGISTRY_SHEET_ID, PENDAFTARAN_MASJID_SHEET, record, accessToken);
        return res.status(200).json({ success: true });
      }

      // Aksi lain (list, approve, updateStatus) WAJIB password Super Admin yang benar.
      if (!SUPERADMIN_PASSWORD || saBody.password !== SUPERADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Password Super Admin salah' });
      }

      if (superadmin === 'list') {
        const rows = await readSheet(REGISTRY_SHEET_ID, PENDAFTARAN_MASJID_SHEET, accessToken);
        return res.status(200).json(rows);
      }

      // Approve = tandai pengajuan "approved" DAN langsung bikin baris baru
      // di Registry (tab "Registry") dari data pengajuan - supaya Super Admin
      // tidak perlu ketik ulang manual. Sekalian coba AUTO-PROVISIONING: bikin
      // Google Sheet data masjid baru (provisionTenantSpreadsheet(), semua tab
      // + header lengkap) supaya status bisa langsung 'aktif' - tanpa Super
      // Admin harus bikin/duplikat sheet manual. Kalau provisioning gagal
      // (mis. Sheets API error/kuota), fallback ke perilaku lama: status
      // 'pending_setup' & sheetId kosong, Super Admin lengkapi manual.
      if (superadmin === 'approve') {
        const { ref } = saBody;
        if (!ref) return res.status(400).json({ error: 'ref wajib diisi' });

        const pendaftaranRows = await readSheet(REGISTRY_SHEET_ID, PENDAFTARAN_MASJID_SHEET, accessToken);
        const row = pendaftaranRows.find(r => String(r.ref || '') === String(ref));
        if (!row) return res.status(404).json({ error: `Pengajuan dengan ref "${ref}" tidak ditemukan` });

        let baseSlug = (row.namaMasjid || '').toString().trim().toLowerCase()
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!baseSlug) baseSlug = 'masjid-' + Date.now();

        const registryRows = await loadRegistry(accessToken);
        let slug = baseSlug, n = 2;
        while (registryRows.some(t => (t.slug || '').toString().trim().toLowerCase() === slug)) {
          slug = `${baseSlug}-${n}`;
          n++;
        }

        // Pilih pool (akun Google) buat masjid baru ini - load-balancing
        // sederhana berdasar jumlah tenant per pool saat ini (lihat
        // pickPoolIndexForNewTenant()). Kalau belum ada akun tambahan di-
        // setup (GOOGLE_REFRESH_TOKENS cuma 1 token), ini SELALU balik 0,
        // sama seperti sebelum fitur sharding ada.
        const chosenPool = pickPoolIndexForNewTenant(registryRows);

        let newSheetId = '';
        let tenantStatus = 'pending_setup';
        let provisionError = '';
        let assignedPool = 0;
        let adminAccounts = []; // [{username, password}, ...]
        try {
          const poolToken = await getAccessToken(chosenPool);
          newSheetId = await provisionTenantSpreadsheet(row.namaMasjid || slug, poolToken);
          tenantStatus = 'aktif';
          assignedPool = chosenPool;

          // Auto-seed 3 akun pengurus inti (Ketua/Bendahara/Sekretaris)
          // supaya masjid bisa langsung login sebagai admin, tanpa Super
          // Admin harus buka Sheet-nya dan isi baris manual. Password ke-3
          // akun SAMA, dari 4 digit terakhir No. HP kontak pengajuan (dianggap
          // No. HP Ketua) - masing-masing pengurus ganti sendiri ke No. HP
          // mereka (atau pakai Password Khusus) via menu Profil setelah bisa
          // akses (lihat handleProfileUpdate() di app.html).
          //
          // id = 'ketua1'/'bendum2'/'sekre3' (TEKS, bukan angka) - ini SEKALIGUS
          // jadi username login (app.html cocokkan username ke id ATAU name).
          // name = label peran ('Ketua'/'Bendahara'/'Sekretaris') buat
          // ditampilkan di UI. app.html!loadDataFromSheets() SENGAJA tidak
          // parseInt() id kalau bukan string angka murni, supaya id teks ini
          // tidak collapse jadi 0/tabrakan - jangan ubah balik ke id angka
          // tanpa cek ulang bagian itu.
          try {
            const phoneDigits = (row.teleponKontak || '').toString().replace(/\D/g, '');
            const sharedPassword = phoneDigits.slice(-4).padStart(4, '0');
            const seedRows = [
              { id: 'ketua1', name: 'Ketua', phone: row.teleponKontak || '' },
              { id: 'bendum2', name: 'Bendahara', phone: '' },
              { id: 'sekre3', name: 'Sekretaris', phone: '' }
            ];
            for (const seed of seedRows) {
              await appendRow(newSheetId, 'Members', {
                id: seed.id,
                name: seed.name,
                phone: seed.phone,
                status: 'aktif',
                created_date: new Date().toISOString(),
                password: sharedPassword,
                role: 'admin'
              }, poolToken);
              adminAccounts.push({ username: seed.id, password: sharedPassword });
            }
          } catch (seedErr) {
            // Sheet tetap dibuat & aktif walau seeding admin gagal sebagian/
            // semua - Super Admin cukup lengkapi manual di tab Members kalau
            // ini terjadi (adminAccounts yang berhasil dibuat tetap dikirim).
            console.error('[seedAdminAccounts] gagal isi akun pengurus:', seedErr && seedErr.message);
          }
        } catch (err) {
          provisionError = (err && err.message) ? err.message : String(err);
          console.error('[provisionTenantSpreadsheet] gagal, fallback ke pending_setup manual:', provisionError);
        }

        await appendRow(REGISTRY_SHEET_ID, REGISTRY_SHEET_NAME, {
          slug,
          status: tenantStatus,
          mosqueName: row.namaMasjid || '',
          mosqueShortName: row.namaMasjid || '',
          // Utamakan URL Blob asli (row.logoUrl) - baru fallback ke data URI
          // lama (row.logoDataUrl) kalau pengajuan ini belum pernah sukses
          // upload ke Blob (mis. Blob store belum di-connect saat submit).
          // img.src terima keduanya (URL http atau data: URI) tanpa beda kode
          // di frontend. Kosong kalau pemohon tidak upload logo sama sekali.
          logoFile: row.logoUrl || row.logoDataUrl || '',
          locationName: row.kota || '',
          prayerLocationId: '',
          bankName: row.bankName || '',
          bankCode: lookupBankCode(row.bankName),
          bankAccountNumber: row.bankAccountNumber || '',
          bankAccountNumberDisplay: row.bankAccountNumber || '',
          bankAccountHolder: row.bankAccountHolder || '',
          qurbanTarget: 0,
          sheetId: newSheetId,
          credentialPool: assignedPool,
          fonnteApiKey: '',
          createdDate: new Date().toISOString()
        }, accessToken);
        registryCache = null; // biar baris baru ini langsung kebaca, tidak nunggu TTL cache

        await updateRows(REGISTRY_SHEET_ID, PENDAFTARAN_MASJID_SHEET, 'ref', ref, { status: 'approved' }, accessToken);
        return res.status(200).json({
          success: true,
          slug,
          sheetId: newSheetId,
          tenantStatus,
          credentialPool: assignedPool,
          // Dikirim ke frontend cuma kalau provisioning gagal, supaya Super
          // Admin tahu perlu setup manual (bukan diam-diam nyangkut pending).
          provisionError: provisionError || undefined,
          // Kredensial 3 akun pengurus (Ketua/Bendahara/Sekretaris) - dipakai
          // frontend buat isi pesan WA ke masjid. Array kosong kalau seeding
          // gagal total (lihat log [seedAdminAccounts]).
          adminAccounts: adminAccounts.length ? adminAccounts : undefined
        });
      }

      if (superadmin === 'updateStatus') {
        const { ref, status } = saBody;
        if (!ref || !status) {
          return res.status(400).json({ error: 'ref dan status wajib diisi' });
        }
        const result = await updateRows(REGISTRY_SHEET_ID, PENDAFTARAN_MASJID_SHEET, 'ref', ref, { status }, accessToken);
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: `Aksi superadmin="${superadmin}" tidak dikenal` });
    }

    // ----- Resolve tenant (platform multi-masjid) -----
    // Ada "tenant" di query -> WAJIB ketemu di Registry & statusnya 'aktif',
    // pakai Sheet DATA masjid itu. Tidak ada "tenant" -> mode single-tenant
    // lama, pakai SHEET_ID (env var GOOGLE_SHEET_ID / fallback Dhafinul),
    // supaya deployment yang belum sempat migrasi ke Registry tetap jalan.
    let targetSheetId = SHEET_ID;
    let tenantRow = null;
    if (tenant) {
      tenantRow = await resolveTenant(tenant, accessToken);
      if (!tenantRow) {
        return res.status(404).json({ error: `Masjid "${tenant}" tidak ditemukan atau belum aktif` });
      }
      if (!tenantRow.sheetId) {
        return res.status(500).json({ error: `Masjid "${tenant}" belum punya Sheet data (kolom sheetId kosong di Registry)` });
      }
      targetSheetId = tenantRow.sheetId;

      // SHARDING: kalau tenant ini di-assign ke pool lain (kolom
      // credentialPool di Registry, diisi otomatis pas provisioning - lihat
      // pickPoolIndexForNewTenant()), ganti accessToken ke akun Google pool
      // itu buat SEMUA operasi baca/tulis Sheet data tenant ini di bawah -
      // supaya kuota 60 request/menit-nya terpisah dari tenant di pool lain.
      // Tenant lama/belum di-assign (kolom kosong) tetap pool 0, tidak ganti.
      const poolIndex = parseInt(tenantRow.credentialPool) || 0;
      if (poolIndex > 0) {
        accessToken = await getAccessToken(poolIndex);
      }
    }
    const cacheKey = tenant || 'default';

    if (req.method === 'GET') {
      // Config publik masjid (nama, logo, rekening, dst) - dipakai frontend
      // buat isi APP_CONFIG saat boot, sebelum login. WAJIB pakai ?tenant=.
      if (config) {
        if (!tenantRow) {
          return res.status(400).json({ error: 'Parameter tenant wajib diisi utk ambil config, contoh: ?tenant=dhafinul&config=1' });
        }
        return res.status(200).json(tenantConfigPublicFields(tenantRow));
      }

      if (sheet === 'Savings' && getFile) {
        const fileData = await getFileData(targetSheetId, 'Savings', getFile, accessToken, 'fileData');
        return res.status(200).json({ id: getFile, fileData });
      }

      if (sheet === 'SurveySapi' && getFile) {
        const columnName = SURVEY_FOTO_COLUMNS.includes(col) ? col : 'foto1';
        const fileData = await getFileData(targetSheetId, 'SurveySapi', getFile, accessToken, columnName);
        return res.status(200).json({ id: getFile, col: columnName, fileData });
      }

      if (sheet === 'PenerimaQR' && getFile) {
        const fileData = await getFileData(targetSheetId, 'PenerimaQR', getFile, accessToken, 'fotoAmbil');
        return res.status(200).json({ id: getFile, fileData });
      }

      if (sheet === 'TransaksiKeuangan' && getFile) {
        const fileData = await getFileData(targetSheetId, 'TransaksiKeuangan', getFile, accessToken, 'bukti');
        return res.status(200).json({ id: getFile, fileData });
      }

      if (bootstrap) {
        const cached = bootstrapCacheStore[cacheKey];
        if (cached && (Date.now() - cached.at) < BOOTSTRAP_TTL_MS) {
          return res.status(200).json(cached.data);
        }
        const data = await readAllSheetsBatch(targetSheetId, accessToken);
        bootstrapCacheStore[cacheKey] = { data, at: Date.now() };
        return res.status(200).json(data);
      }

      if (!sheet) {
        return res.status(200).json({ status: 'API is running', timestamp: new Date(), tenant: tenant || null });
      }

      const rows = await readSheet(targetSheetId, sheet, accessToken);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      if (!sheet) {
        return res.status(400).json({ error: 'Parameter sheet wajib diisi, contoh: ?sheet=Members' });
      }

      let body = req.body;
      if (typeof body === 'string') {
        body = body ? JSON.parse(body) : {};
      }
      if (!body) body = {};

      invalidateBootstrapCache(cacheKey);

      if (action === 'update') {
        const { keyColumn, keyValue, updates } = body;
        const result = await updateRows(targetSheetId, sheet, keyColumn, keyValue, updates || {}, accessToken);
        return res.status(200).json(result);
      } else {
        await appendRow(targetSheetId, sheet, body, accessToken);
        return res.status(200).json({ success: true, created: true });
      }
    }

    res.status(405).json({ error: 'Method tidak didukung' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
