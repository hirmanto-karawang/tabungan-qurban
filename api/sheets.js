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
//   GOOGLE_REFRESH_TOKEN
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
//
// Endpoint & format request/response SENGAJA dibuat sama persis dengan Apps
// Script lama, supaya frontend cuma perlu ganti SHEETDB_CONFIG.ENDPOINT.
// Semua endpoint di bawah bisa ditambah "&tenant=<slug>" (mis. "&tenant=
// dhafinul") buat nunjuk ke data masjid tertentu di platform multi-tenant -
// tanpa "tenant", tetap jalan seperti biasa (mode single-tenant/legacy):
//   GET  /api/sheets                          -> { status: 'API is running' }
//   GET  /api/sheets?tenant=<slug>&config=1   -> config publik masjid (nama, logo, rekening, dst)
//   GET  /api/sheets?sheet=Members             -> array of objects
//   GET  /api/sheets?bootstrap=1               -> { Members:[], Savings:[], Verifications:[], Pesan:[], Pendaftaran:[], Templates:[], LoginLog:[], SurveySapi:[], SurveyPeserta:[], DistribusiDaging:[], RencanaDistribusi:[], WorkOrderAktual:[], PenerimaQR:[], PosBudget:[], TransaksiKeuangan:[], KemasanInventaris:[] }
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
//   fonnteApiKey | createdDate
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
// posisiKontak, teleponKontak, emailKontak, paket, anggaran, target, modul,
// catatan, status (pending/approved/rejected), created_date. Direview lewat
// public/superadmin.html, dilindungi SUPERADMIN_PASSWORD.
const PENDAFTARAN_MASJID_SHEET = 'PendaftaranMasjid';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';
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
// created_date). "kodeTiket" itu kode unik acak yang di-encode ke QR;
// "diambil" ditandai otomatis begitu tiket di-scan (atau dicek manual)
// supaya 1 tiket cuma bisa dipakai 1x. "lokasiLat"/"lokasiLng" & "fotoAmbil"
// ditangkap otomatis pas admin konfirmasi pengambilan (GPS browser + foto
// opsional) - bukti buat pelaporan/transparansi. "fotoAmbil" (base64)
// SENGAJA dibuang dari list/bootstrap biasa (lihat stripPenerimaFoto di
// bawah), sama alasannya dengan foto SurveySapi.
// Keduanya pakai "status" sebagai soft-delete ('batal' = disembunyikan,
// bukan dihapus dari sheet, sama pola dengan SurveyPeserta).
const SHEET_NAMES = ['Members', 'Savings', 'Verifications', 'Pesan', 'Pendaftaran', 'Templates', 'LoginLog', 'SurveySapi', 'SurveyPeserta', 'DistribusiDaging', 'RencanaDistribusi', 'WorkOrderAktual', 'PenerimaQR', 'PosBudget', 'TransaksiKeuangan', 'KemasanInventaris'];

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

// ----- Cache access token di memori (bertahan selama instance function masih "warm") -----
let cachedAccessToken = null;
let accessTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('Gagal refresh access token: ' + errText);
  }

  const data = await resp.json();
  cachedAccessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedAccessToken;
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
export default async function handler(req, res) {
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
    const accessToken = await getAccessToken();
    const { sheet, bootstrap, getFile, action, col, tenant, config, superadmin } = req.query;

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
      if (superadmin === 'submit') {
        const record = {
          ref: saBody.ref || '',
          namaMasjid: saBody.namaOrg || '',
          kota: saBody.kotaOrg || '',
          jumlahJamaah: saBody.jumlahJamaah || '',
          namaKontak: saBody.namaKontak || '',
          posisiKontak: saBody.posisiKontak || '',
          teleponKontak: saBody.teleponKontak || '',
          emailKontak: saBody.emailKontak || '',
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

      // Aksi lain (list, updateStatus) WAJIB password Super Admin yang benar.
      if (!SUPERADMIN_PASSWORD || saBody.password !== SUPERADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Password Super Admin salah' });
      }

      if (superadmin === 'list') {
        const rows = await readSheet(REGISTRY_SHEET_ID, PENDAFTARAN_MASJID_SHEET, accessToken);
        return res.status(200).json(rows);
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
