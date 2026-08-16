/*
 * ALUR QURBAN - kode aplikasi tenant (app.html)
 * ============================================================
 * File ini DULUNYA satu blok <script> inline raksasa (~511 KB) di dalam
 * public/app.html. Dipindah jadi file eksternal terpisah KARENA:
 *
 * 1. Script INLINE hanya bisa di-compile di main thread. Script EKSTERNAL
 *    bisa di-"stream" & di-compile Chrome di thread LATAR (background),
 *    paralel dgn download - jadi main thread (yang juga ngurus sentuhan &
 *    scroll) tidak tersita penuh selama proses itu.
 * 2. V8 code cache (bytecode hasil compile disimpan, dipakai lagi di
 *    kunjungan berikutnya) HANYA berlaku untuk script eksternal, TIDAK
 *    untuk script inline. Artinya dulu 511 KB ini di-compile ULANG dari
 *    nol setiap kali halaman dibuka, tiap kali, selamanya.
 * 3. Sebagai file terpisah, ini bisa di-cache browser sendiri - tidak
 *    ikut ke-download ulang tiap kali app.html berubah.
 *
 * Isi kodenya SAMA PERSIS, tidak ada logika yang diubah saat pemindahan.
 * Kalau nambah/ubah fitur, edit file INI (bukan cari <script> di app.html).
 */


// ================================================================
// ===== LAZY LOAD LIBRARI CDN BERAT (Chart.js/jsPDF/xlsx/exceljs/  =====
// ===== qrcodejs/html5-qrcode) - lihat catatan di <head>.          =====
// ================================================================
// loadScriptOnce(url): suntik <script src> ke <head> on-demand, cache
// promise-nya per URL supaya dipanggil berkali-kali (mis. tiap kali export
// PDF diklik) tidak double-download / double-eksekusi library yang sama.
const _loadedScripts = {};
function loadScriptOnce(url) {
    if (_loadedScripts[url]) return _loadedScripts[url];
    _loadedScripts[url] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = () => resolve();
        s.onerror = () => { delete _loadedScripts[url]; reject(new Error('Gagal memuat library dari ' + url)); };
        document.head.appendChild(s);
    });
    return _loadedScripts[url];
}
function ensureChartJs() {
    if (typeof Chart !== 'undefined') return Promise.resolve();
    return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js');
}
function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js');
}
function ensureXLSX() {
    if (typeof XLSX !== 'undefined') return Promise.resolve();
    return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
}
function ensureExcelJS() {
    if (typeof ExcelJS !== 'undefined') return Promise.resolve();
    return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js');
}
function ensureQRCodeLib() {
    if (typeof QRCode !== 'undefined') return Promise.resolve();
    return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
}
function ensureHtml5Qrcode() {
    if (typeof Html5Qrcode !== 'undefined') return Promise.resolve();
    return loadScriptOnce('https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js');
}

// ================================================================
// ===== APP_CONFIG - SATU-SATUNYA TEMPAT YANG PERLU DIEDIT     =====
// ===== kalau aplikasi ini mau dipakai masjid/DKM lain.         =====
// ================================================================
// Ganti nilai-nilai di bawah ini sesuai masjid Anda, lalu simpan.
// Tidak perlu edit bagian lain di file ini untuk kustomisasi dasar.
// Panduan lengkap setup (Google Sheet, Vercel, dsb) ada di dokumen
// "Panduan Setup Tabungan Qurban".
const APP_CONFIG = {
    // Nama lengkap masjid/DKM - dipakai di judul halaman, PDF, Excel, footer pesan WA
    mosqueName: 'Masjid Dhafinul Jariyah',
    // Nama singkat - dipakai di sidebar
    mosqueShortName: 'Dhafinul Jariyah',
    // Nama file logo - taruh file logo di folder public/ dengan nama yang sama
    logoFile: 'logo-masjid.jpg',
    // Lokasi (kota/kabupaten) untuk keperluan tampilan & jadwal sholat
    locationName: 'Karawang',
    // ID lokasi di api.myquran.com untuk jadwal sholat - cari kota Anda di
    // https://api.myquran.com/v2/sholat/kota/cari/NAMA_KOTA lalu ambil nilai "id"
    prayerLocationId: '1210',
    // Rekening tujuan transfer tabungan qurban
    bankName: 'Bank Muamalat',
    bankCode: '147',
    bankAccountNumber: '3410020637',       // tanpa spasi, dipakai untuk tombol "Salin"
    bankAccountNumberDisplay: '341 002 0637', // dengan spasi, dipakai untuk tampilan
    bankAccountHolder: 'Masjid Dhafinul Jariyah',
    // Target tabungan per porsi qurban (Rp) - basis perhitungan {PROGRESS} di
    // template WA dan progress bar "Lima Tabungan Tertinggi" di Dashboard
    qurbanTarget: 3500000,
    // URL aplikasi setelah di-deploy ke Vercel - dipakai di template pesan WA
    appUrl: 'https://tabungan-qurban-orpin.vercel.app'
};

// ===== KONEKSI BACKEND =====
// Endpoint mengarah ke Vercel Serverless Function (/api/sheets), same-origin
// jadi tidak perlu edit meskipun aplikasi di-deploy ulang di domain lain.
const SHEETDB_CONFIG = {
    ENDPOINT: '/api/sheets'
};

// ===== MULTI-TENANT (platform "1 kode, banyak masjid") =====
// Slug masjid diambil dari segmen PERTAMA path URL, mis. situs dibuka di
// "/dhafinul/apa-saja" -> slug "dhafinul". File ini (app.html) HANYA pernah
// dijangkau lewat rewrite "/slug-masjid" -> "/app.html" di vercel.json, jadi
// CURRENT_TENANT normalnya selalu terisi. Root ("/", tanpa slug) sekarang
// adalah landing page brand "Alur Qurban" yang terpisah (public/index.html),
// BUKAN app ini - kalau file ini kebetulan diakses langsung tanpa slug,
// initApp() di bawah lempar balik ke root.
function detectTenantFromPath() {
    const seg = (window.location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
    // Slug valid cuma huruf kecil/angka/strip - kalau path pertama bukan pola
    // itu (mis. "/manifest.json", "/api/..."), jangan dianggap tenant.
    return /^[a-z0-9-]+$/.test(seg) ? seg : '';
}
const CURRENT_TENANT = detectTenantFromPath();

// Ditempel ke setiap URL /api/sheets... - kosong ('') kalau mode legacy
// (root path), "&tenant=slug" kalau mode multi-tenant.
function tenantParam() {
    return CURRENT_TENANT ? `&tenant=${encodeURIComponent(CURRENT_TENANT)}` : '';
}

// Ambil config publik masjid (nama, logo, rekening, dst) dari Registry lewat
// backend, lalu timpa APP_CONFIG hardcoded di atas. Cuma jalan kalau ada
// CURRENT_TENANT (mode multi-tenant) - di mode legacy langsung selesai tanpa
// fetch tambahan. Return false kalau tenant tidak ditemukan/nonaktif, supaya
// caller bisa tampilkan halaman error alih-alih app kosong yang membingungkan.
async function loadTenantConfigIfNeeded() {
    if (!CURRENT_TENANT) return true;
    try {
        const resp = await fetch(`${SHEETDB_CONFIG.ENDPOINT}?tenant=${encodeURIComponent(CURRENT_TENANT)}&config=1`);
        if (!resp.ok) return false;
        const config = await resp.json();
        if (!config || !config.mosqueName) return false;
        Object.assign(APP_CONFIG, config);
        // appUrl dihitung dari origin+path saat ini (bukan dari Registry) -
        // selalu akurat walau domain/subdomain berubah di kemudian hari.
        APP_CONFIG.appUrl = `${window.location.origin}/${CURRENT_TENANT}`;
        return true;
    } catch (error) {
        console.error('Gagal memuat config tenant:', error);
        return false;
    }
}

// Ditampilkan kalau slug di path tidak ketemu/nonaktif di Registry - dulu
// dari sini user bisa tahu ini masalah URL, bukan app-nya rusak.
function showTenantNotFoundScreen() {
    document.body.innerHTML = `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px; font-family:inherit;">
          <div>
            <div style="font-size:48px; margin-bottom:12px;">🕌</div>
            <h2 style="margin:0 0 8px;">Masjid tidak ditemukan</h2>
            <p style="color:#666; max-width:360px; margin:0 auto;">Alamat "<strong>${CURRENT_TENANT}</strong>" belum terdaftar atau belum aktif di platform ini. Cek kembali link yang diberikan admin masjid Anda.</p>
          </div>
        </div>`;
}

// Pengiriman WhatsApp (Fonnte) sekarang lewat proxy /api/wa-send supaya API
// key Fonnte TIDAK pernah tampil di kode sisi browser (dulu sempat hardcoded
// di sini - itu risiko keamanan karena siapapun bisa lihat lewat "View Source"
// dan pakai kuota WA masjid Anda). API key asli disimpan sebagai environment
// variable FONNTE_API_KEY di Vercel, sama seperti kredensial Google Sheets.

// Terapkan APP_CONFIG ke elemen-elemen statis di HTML (judul halaman, logo,
// nama masjid, info rekening) supaya kustomisasi untuk masjid lain cukup
// edit APP_CONFIG di atas - tidak perlu cari-cari teks di seluruh file HTML.
// Dipanggil sekali saat halaman dimuat (lihat bagian bawah file).
function applyBranding() {
    document.title = `Tabungan Qurban — ${APP_CONFIG.mosqueName}`;

    document.querySelectorAll('.js-brand-logo').forEach(img => {
        img.src = APP_CONFIG.logoFile;
        img.alt = APP_CONFIG.mosqueName;
    });

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('heroDesc', `Ikut Qurban tahun ini dengan cara paling nyaman — menabung bertahap atau langsung lunas lewat Qurban Instan. Progres tabungan, survei sapi, sampai distribusi daging bisa dipantau sendiri, dan laporan pertanggungjawaban terbuka untuk seluruh jemaah ${APP_CONFIG.mosqueName}.`);
    setText('heroWorkspaceName', APP_CONFIG.mosqueName);
    setText('sidebarMosqueName', APP_CONFIG.mosqueShortName);
    setText('prayerLocationLabel', `🕌 Waktu Sholat — ${APP_CONFIG.locationName}`);

    // Dua kotak info rekening (Dashboard & Upload Bukti) sama-sama diisi dari
    // APP_CONFIG yang sama supaya selalu konsisten.
    ['1', '2'].forEach(suffix => {
        setText('rekBankName' + suffix, APP_CONFIG.bankName);
        setText('rekBankCode' + suffix, APP_CONFIG.bankCode);
        setText('rekAccountDisplay' + suffix, APP_CONFIG.bankAccountNumberDisplay);
        setText('rekAccountHolder' + suffix, APP_CONFIG.bankAccountHolder);
    });
}

// ===== STATE =====
let appData = {
    members: [],
    savings: [],
    verifications: [],
    messages: [],
    templates: [],
    loginLogs: [],
    surveySapi: [],
    surveyPeserta: [],
    distribusiDaging: [],
    rencanaDistribusi: [],
    rencanaDistribusiLain: [],
    distribusiBagianLain: [],
    workOrderAktual: [],
    penerimaQR: [],
    posBudget: [],
    transaksiKeuangan: [],
    kemasanInventaris: [],
    // Bukan array - LPJNarasi cuma 1 baris config (narasi/kata pengantar tab
    // LPJ), jadi disimpan sbg object langsung, lihat loadDataFromSheets().
    lpjNarasi: { narasi: '', updatedBy: '', updatedDate: '' },
    // Cicilan pembayaran peserta tipe 'instan' (Daftar Langsung/Qurban
    // Instan) - lihat komentar TENANT_SHEET_TEMPLATE.SetoranInstan di
    // sheets.js & pesertaInstanBayarSummary() di bawah.
    setoranInstan: []
};

let currentUser = null;
let lastDataLoadTime = 0; // timestamp load terakhir, buat throttle refresh saat pindah tab
let dataLoadPromise = null; // supaya tidak ada 2 fetch bootstrap jalan bersamaan

// ===== SESI LOGIN (localStorage) =====
// currentUser cuma variabel JS di memori - hilang setiap kali halaman
// di-reload. Di HP, "tarik ke bawah" di posisi paling atas halaman biasanya
// memicu pull-to-refresh BAWAAN BROWSER, yang me-reload seluruh halaman dari
// nol (persis seperti tekan tombol refresh) - makanya app kembali ke layar
// login walau usernya tidak benar-benar logout. Simpan sesi ke localStorage
// supaya reload seperti itu (atau app di-buka lagi setelah HP membekukan
// tab-nya di background) tetap otomatis lanjut ke akun yang sama.
// Tidak menyimpan password, cuma identitas ringan yang aman disimpan di HP.
// PENTING: key ini HARUS unik per masjid (per slug), BUKAN string tetap.
// Semua masjid berbagi 1 domain yang sama (cuma beda path /slug), dan
// localStorage itu di-scope per ORIGIN (domain), bukan per path - jadi kalau
// key-nya sama rata utk semua tenant, sesi login masjid A masih "nyangkut"
// & sempat ke-restore ketika browser yang sama buka masjid B pertama kali
// (baru ketauan salah setelah validasi appData.members gagal, muncul
// sekilas UI/app lama dulu baru dilempar ke error - user ngerasa cuma
// "buka cache lama"). Dengan CURRENT_TENANT ditempel di key, tiap masjid
// punya slot localStorage sendiri-sendiri, jadi masjid baru yang belum
// pernah dibuka di device itu SELALU mulai bersih dari layar login/welcome.
const SESSION_STORAGE_KEY = 'tqSession_' + (CURRENT_TENANT || 'default');

function saveSession(user) {
    try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } catch (e) {
        console.warn('Gagal simpan sesi login (localStorage tidak tersedia):', e);
    }
}

function loadSavedSession() {
    try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function clearSavedSession() {
    try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
        // abaikan
    }
}

// Berapa lama data di appData dianggap "masih segar" sebelum switchTab()
// mau fetch ulang bootstrap (18 sheet sekaligus) - dinaikkan dari 5 detik ke
// 15 detik supaya pindah-pindah tab dalam sesi singkat (mis. Keuangan ->
// Kemasan -> Laporan dalam <15 detik) tidak trigger fetch+parse ulang
// SEMUA sheet tiap kali, padahal isinya belum tentu berubah. Tombol
// pull-to-refresh & alur setelah aksi penting (approve, generate kupon, dst)
// tetap selalu dapat data BENAR-BENAR baru karena keduanya manggil dengan
// force=true / manggil loadDataFromSheets() langsung, bukan lewat cek ini.
const DATA_FRESH_TTL_MS = 15000;

// Pastikan data ter-load, tapi hindari fetch dobel kalau sudah ada yang jalan
// atau data masih segar (lihat DATA_FRESH_TTL_MS). Dipakai baik oleh
// prefetch saat halaman dibuka maupun oleh handleLogin/switchTab, supaya
// keduanya berbagi 1 request yang sama alih-alih masing-masing fetch
// sendiri-sendiri.
function ensureDataLoaded(force) {
    const isFresh = !force && appData.members.length > 0 && (Date.now() - lastDataLoadTime) < DATA_FRESH_TTL_MS;
    if (isFresh) return Promise.resolve();
    if (!dataLoadPromise) {
        dataLoadPromise = loadDataFromSheets().finally(() => { dataLoadPromise = null; });
    }
    return dataLoadPromise;
}

// ===== SHEETDB API =====
// Google Sheets kadang menyimpan kolom nomor HP sebagai angka (bukan teks),
// sehingga angka 0 di depan (misal 089...) hilang jadi 89.... Fungsi ini
// mengembalikan nomor sebagai string dan mengembalikan 0 di depan kalau hilang,
// supaya .slice()/.startsWith() dan pengiriman WA tidak error/salah kirim.
function normalizePhone(phone) {
    let s = String(phone === undefined || phone === null ? '' : phone).trim();
    if (s && !s.startsWith('0') && !s.startsWith('+') && s.startsWith('8')) {
        s = '0' + s;
    }
    return s;
}

// ===== WHATSAPP: buka wa.me MANUAL, BUKAN kirim otomatis via Fonnte =====
// Semua notifikasi WA (pendaftaran anggota baru, approval/reject anggota,
// upload bukti transfer, approval/reject transfer) SENGAJA tidak lagi
// dikirim otomatis lewat Fonnte - kirim otomatis via API pihak ketiga
// beresiko nomor WA masjid kena banned kalau volumenya dianggap
// mencurigakan oleh WhatsApp. Sebagai gantinya, dipakai link wa.me: pesan
// sudah terisi otomatis, tapi manusia (anggota/pengurus) tetap yang harus
// tekan tombol Kirim di WhatsApp itu sendiri.
//
// PENTING soal timing: window.open() di sini HARUS dipanggil SINKRON,
// sedekat mungkin dengan event klik/submit asli, TANPA ada `await` di
// depannya dalam alur eksekusi yang sama - begitu ada jeda async (fetch,
// dsb) sebelum window.open() dipanggil, sebagian browser (terutama mobile)
// DIAM-DIAM memblokirnya (tab kebuka tapi nyangkut/nggak jalan). Karena itu
// di tiap pemanggil, data buat pesan WA diusahakan sudah lengkap SEBELUM
// baris await pertama. Kalau datanya baru bisa diketahui SETELAH await
// (misal ID anggota baru yang butuh refresh server dulu), dipakai pola
// confirm()-gate: window.open() dipanggil tepat setelah confirm()/prompt()
// di-resolve user, karena itu juga terhitung gesture baru yang sah.
function toWaNumber(phone) {
    let p = String(phone || '').replace(/\D/g, '');
    if (p.startsWith('0')) p = '62' + p.slice(1);
    return p;
}
function waMeLink(phone, message) {
    const p = toWaNumber(phone);
    if (!p) return '';
    return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}
function openWaTo(phone, message) {
    const link = waMeLink(phone, message);
    if (!link) return false;
    window.open(link, '_blank', 'noopener');
    return true;
}
// Cari nomor HP pengurus tertentu dari daftar Members - coba id yang
// diprioritaskan dulu (mis. 'bendum2' = Bendahara), baru fallback ke admin
// manapun yang punya nomor HP (buat tenant lama yang belum pakai skema
// id ketua1/bendum2/sekre3, mis. Dhafinul/An-Nurlam).
function findOfficerPhone(members, preferredIds) {
    for (const id of (preferredIds || [])) {
        const m = (members || []).find(mm => mm.id === id && mm.phone);
        if (m) return m.phone;
    }
    const anyAdmin = (members || []).find(mm => (mm.role || '').toLowerCase() === 'admin' && mm.phone);
    return anyAdmin ? anyAdmin.phone : '';
}

async function fetchSheetDBTable(tableName) {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?sheet=${tableName}${tenantParam()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const rows = data || [];
        // Normalisasi kolom phone di semua baris (kalau ada)
        rows.forEach(row => {
            if (row && Object.prototype.hasOwnProperty.call(row, 'phone')) {
                row.phone = normalizePhone(row.phone);
            }
        });
        return rows;
    } catch (error) {
        console.error(`Error fetching ${tableName}:`, error);
        return [];
    }
}

async function appendSheetDB(tableName, record) {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?sheet=${tableName}&action=append${tenantParam()}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(record)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json().catch(() => null);
        if (result && result.error) throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
        return true;
    } catch (error) {
        console.error(`Error appending to ${tableName}:`, error);
        // Kalau penyebabnya kelewat batas karakter sel Google Sheets (mis.
        // ada jalur lain yang lolos dari validasi kompresi di sisi upload),
        // kasih pesan yang jelas ke user - bukan cuma "gagal" generik.
        const msg = String(error && error.message || error);
        if (/50000|50,000|exceeds|cell limit/i.test(msg)) {
            showAlert('Gagal menyimpan: file bukti transfer masih terlalu besar untuk disimpan. Coba upload ulang dengan foto yang lebih sederhana.', 'error');
        } else {
            showAlert('Gagal menyimpan data.', 'error');
        }
        return false;
    }
}

async function updateSheetDB(tableName, keyColumn, keyValue, updates) {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?sheet=${tableName}&action=update${tenantParam()}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ keyColumn, keyValue, updates })
        });
        if (!response.ok) {
            console.error(`Update ${tableName} gagal: HTTP ${response.status}`);
            return false;
        }
        const result = await response.json().catch(() => null);
        if (result && result.updated === 0) {
            console.error(`Update ${tableName}: tidak ada baris cocok untuk ${keyColumn}=${keyValue}`);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`Error updating ${tableName}:`, error);
        return false;
    }
}

// Ambil SEMUA sheet (Members, Savings, Verifications, Pesan, Pendaftaran)
// dalam SATU kali request ke Apps Script (mode bootstrap), jauh lebih cepat
// daripada 5 request terpisah karena Spreadsheet cuma dibuka sekali di server.
async function fetchAllSheetsBootstrap() {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?bootstrap=1${tenantParam()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // Normalisasi kolom phone di semua sheet yang punya kolom itu
        ['Members', 'Pendaftaran'].forEach(key => {
            (data[key] || []).forEach(row => {
                if (row && Object.prototype.hasOwnProperty.call(row, 'phone')) {
                    row.phone = normalizePhone(row.phone);
                }
            });
        });

        return data;
    } catch (error) {
        console.error('Error fetching bootstrap data:', error);
        return null;
    }
}

// ===== LOAD DATA FROM SHEETDB =====

// Kasih kesempatan browser "bernapas" (proses input/scroll/paint yg tertunda)
// di tengah-tengah kerjaan JS berat. loadDataFromSheets() di bawah mem-parse
// ~18 sheet sekaligus (.map/.filter/.sort per sheet) - kalau semua itu jalan
// dalam SATU long task tanpa jeda, main thread thread jadi tersita penuh buat
// browser Android yang lebih lambat, sehingga sentuhan/scroll user kerasa
// macet/berat SELAMA parsing itu berlangsung (bukan cuma pas awal buka app -
// ini juga kejadian tiap kali switchTab() minta ensureDataLoaded() lagi).
// yieldToMain() dipanggil di antara kelompok sheet supaya parsing dipecah
// jadi beberapa task kecil, browser dapat jeda proses event tiap kelompok.
function yieldToMain() {
    return new Promise(resolve => {
        if (typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') {
            scheduler.yield().then(resolve);
        } else if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => resolve(), { timeout: 50 });
        } else {
            setTimeout(resolve, 0);
        }
    });
}

async function loadDataFromSheets() {
    // Coba mode cepat (1 request) dulu; kalau gagal, fallback ke cara lama (5 request)
    const bootstrap = await fetchAllSheetsBootstrap();

    const memberRows = bootstrap ? (bootstrap.Members || []) : await fetchSheetDBTable('Members');
    const savingsRows = bootstrap ? (bootstrap.Savings || []) : await fetchSheetDBTable('Savings');
    const verificationsRows = bootstrap ? (bootstrap.Verifications || []) : await fetchSheetDBTable('Verifications');
    const messagesRows = bootstrap ? (bootstrap.Pesan || []) : await fetchSheetDBTable('Pesan');
    const pendaftaranRows = bootstrap ? (bootstrap.Pendaftaran || []) : await fetchSheetDBTable('Pendaftaran');
    const templatesRows = bootstrap ? (bootstrap.Templates || []) : await fetchSheetDBTable('Templates');
    const loginLogRows = bootstrap ? (bootstrap.LoginLog || []) : await fetchSheetDBTable('LoginLog');
    const surveySapiRows = bootstrap ? (bootstrap.SurveySapi || []) : await fetchSheetDBTable('SurveySapi');
    const surveyPesertaRows = bootstrap ? (bootstrap.SurveyPeserta || []) : await fetchSheetDBTable('SurveyPeserta');
    const distribusiDagingRows = bootstrap ? (bootstrap.DistribusiDaging || []) : await fetchSheetDBTable('DistribusiDaging');
    const rencanaDistribusiRows = bootstrap ? (bootstrap.RencanaDistribusi || []) : await fetchSheetDBTable('RencanaDistribusi');
    const rencanaDistribusiLainRows = bootstrap ? (bootstrap.RencanaDistribusiLain || []) : await fetchSheetDBTable('RencanaDistribusiLain');
    const distribusiBagianLainRows = bootstrap ? (bootstrap.DistribusiBagianLain || []) : await fetchSheetDBTable('DistribusiBagianLain');
    const workOrderAktualRows = bootstrap ? (bootstrap.WorkOrderAktual || []) : await fetchSheetDBTable('WorkOrderAktual');
    const penerimaQRRows = bootstrap ? (bootstrap.PenerimaQR || []) : await fetchSheetDBTable('PenerimaQR');
    const posBudgetRows = bootstrap ? (bootstrap.PosBudget || []) : await fetchSheetDBTable('PosBudget');
    const transaksiKeuanganRows = bootstrap ? (bootstrap.TransaksiKeuangan || []) : await fetchSheetDBTable('TransaksiKeuangan');
    const kemasanInventarisRows = bootstrap ? (bootstrap.KemasanInventaris || []) : await fetchSheetDBTable('KemasanInventaris');
    const lpjNarasiRows = bootstrap ? (bootstrap.LPJNarasi || []) : await fetchSheetDBTable('LPJNarasi');
    const setoranInstanRows = bootstrap ? (bootstrap.SetoranInstan || []) : await fetchSheetDBTable('SetoranInstan');

    // Parse Members (Sheetdb returns array of objects)
    appData.members = memberRows.map(row => ({
        // Anggota biasa: id murni angka (11, 21, dst) -> tetap di-parseInt
        // seperti sebelumnya (dipakai buat sort/grouping per sapi). Akun
        // pengurus (admin) sengaja pakai id TEKS ('ketua1'/'bendum2'/'sekre3'
        // - lihat provisionTenantSpreadsheet()/seed di public/api/sheets.js)
        // supaya jadi username login yang gampang diingat, jadi id itu TIDAK
        // di-parseInt (kalau di-parseInt jadi NaN->0, 3 admin bakal tabrakan
        // id yang sama). /^\d+$/ pastikan cuma string angka murni yang di-parse.
        id: /^\d+$/.test(String(row.id || '').trim()) ? parseInt(row.id) : String(row.id || '').trim(),
        name: row.name || '',
        phone: row.phone || '',
        status: row.status || 'active',
        created_date: row.created_date || '',
        password: row.password || '',
        rt: row.rt || '',
        blok: row.blok || '',
        no: row.no || '',
        sapi: parseInt(row.sapi) || 0,
        urutan: parseInt(row.urutan) || 0,
        // 'role' dari kolom Members!role di Google Sheet - 'admin' atau 'member'
        // (kosong/lainnya dianggap 'member'). Ini sumber kebenaran satu-satunya
        // untuk status admin, MENGGANTIKAN cara lama yang hardcode id===1 -
        // supaya bisa ada admin lebih dari satu orang.
        role: (row.role || '').toString().trim().toLowerCase() === 'admin' ? 'admin' : 'member'
    })).filter(m => m.id && m.name);

    // Members selesai duluan (paling sering dibutuhkan cepat - login) baru
    // kasih jeda ke browser sebelum lanjut parse sheet lain.
    await yieldToMain();

    // Parse Savings
    appData.savings = savingsRows.map(row => ({
        id: parseInt(row.id) || 0,
        memberId: parseInt(row.memberId) || 0,
        amount: parseInt(row.amount) || 0,
        transferDate: row.transferDate || '',
        bankSource: row.bankSource || '',
        accountName: row.accountName || '',
        fileUrl: row.fileUrl || '',
        // fileData (base64 foto) SENGAJA tidak dikirim di load biasa - terlalu berat
        // kalau dikirim tiap kali refresh. Server balikin flag hasFile saja; isi foto
        // baru diambil on-demand via fetchSavingFileData() saat admin klik "Lihat Bukti".
        fileData: row.fileData || '',
        hasFile: !!row.hasFile,
        status: row.status || 'PENDING',
        uploadedAt: row.uploadedAt || '',
        approvedAt: row.approvedAt || '',
        approvedBy: row.approvedBy || '',
        notes: row.notes || ''
    })).filter(s => s.id);

    // Parse Verifications (jejak audit approve/reject)
    appData.verifications = verificationsRows.map(row => ({
        id: parseInt(row.id) || 0,
        savingsId: parseInt(row.savingsId) || 0,
        adminId: row.adminId || '',
        action: row.action || '',
        reason: row.reason || '',
        timestamp: row.timestamp || ''
    })).filter(v => v.id);

    // Parse Pesan (broadcast history & schedule)
    appData.messages = messagesRows.map(row => ({
        id: parseInt(row.id) || 0,
        type: row.type || 'BROADCAST',
        recipients: row.recipients || 'ALL',
        title: row.title || '',
        message: row.message || '',
        scheduledTime: row.scheduledTime || '',
        status: row.status || '',
        sentAt: row.sentAt || '',
        createdBy: row.createdBy || '',
        notes: row.notes || ''
    })).filter(m => m.id);

    // Parse Pendaftaran (new member applications)
    appData.pendaftaran = pendaftaranRows.map(row => ({
        id: parseInt(row.id) || 0,
        name: row.name || '',
        rt: row.rt || '',
        blok: row.blok || '',
        no: row.no || '',
        phone: row.phone || '',
        reason: row.reason || '',
        password: row.password || '',
        status: row.status || 'PENDING',
        applied_at: row.applied_at || '',
        approved_at: row.approved_at || '',
        approved_by: row.approved_by || ''
    })).filter(p => p.id);

    // Parse Templates (override/tambahan untuk MESSAGE_TEMPLATES bawaan kode -
    // lihat getTemplates(). Kalau sheet "Templates" belum dibuat user, ini
    // akan kosong dan template bawaan tetap dipakai seperti biasa.)
    appData.templates = templatesRows.map(row => ({
        key: String(row.key || '').trim(),
        title: row.title || '',
        message: row.message || ''
    })).filter(t => t.key);

    // Parse LoginLog (jejak setiap kali anggota/admin berhasil login - dasar
    // buat menu "Log Aktivitas Anggota". Kalau sheet "LoginLog" belum dibuat
    // user, ini otomatis kosong dan menu log cuma nampilin "belum ada data".)
    appData.loginLogs = loginLogRows.map(row => ({
        id: parseInt(row.id) || 0,
        memberId: parseInt(row.memberId) || 0,
        memberName: row.memberName || '',
        role: row.role || 'member',
        loginAt: row.loginAt || ''
    })).filter(l => l.id);

    await yieldToMain();

    // Parse SurveySapi. Kolom foto1..foto5 (base64) SENGAJA tidak dikirim di
    // load biasa (sama alasannya dengan Savings.fileData) - server balikin
    // flag hasFoto1..hasFoto5 saja, isi foto diambil on-demand lewat
    // fetchSurveyFotoData() saat admin klik "Lihat Foto".
    appData.surveySapi = surveySapiRows.map(row => ({
        id: parseInt(row.id) || 0,
        tanggal: row.tanggal || '',
        supplier: row.supplier || '',
        latitude: row.latitude || '',
        longitude: row.longitude || '',
        alamat: row.alamat || '',
        jenisSapi: row.jenisSapi || '',
        berat: parseInt(row.berat) || 0,
        harga: parseInt(row.harga) || 0,
        biayaPengolahan: parseInt(row.biayaPengolahan) || 0,
        hasFoto1: !!row.hasFoto1,
        hasFoto2: !!row.hasFoto2,
        hasFoto3: !!row.hasFoto3,
        hasFoto4: !!row.hasFoto4,
        hasFoto5: !!row.hasFoto5,
        createdBy: row.createdBy || '',
        created_date: row.created_date || ''
    })).filter(s => s.id).sort((a, b) => b.id - a.id);

    // Parse SurveyPeserta (siapa saja anggota yang klik "Ikut" di sebuah
    // survey sapi) - dipakai loadSurveySapiMemberList() buat nampilin list
    // peserta di bawah tiap kartu survey.
    appData.surveyPeserta = surveyPesertaRows.map(row => ({
        id: parseInt(row.id) || 0,
        surveyId: parseInt(row.surveyId) || 0,
        memberId: parseInt(row.memberId) || 0,
        memberName: row.memberName || '',
        phone: row.phone || '',
        // Kosong (baris lama sebelum kolom status ada) dianggap 'aktif'.
        status: row.status || 'aktif',
        created_date: row.created_date || '',
        // "alamat" & "tipe" - fitur "Daftar Langsung" (Qurban Instan, lihat
        // submitInstantJoin()). Baris lama (sebelum kolom ini ada) otomatis
        // dianggap tipe 'tabungan' - peserta biasa hasil joinSurveySapi().
        alamat: row.alamat || '',
        tipe: (row.tipe || '').toString().trim().toLowerCase() === 'instan' ? 'instan' : 'tabungan',
        // Opsional, khusus tipe 'instan' - lihat komentar TENANT_SHEET_TEMPLATE
        // di public/api/sheets.js.
        atasNama: row.atasNama || '',
        // Status pembayaran khusus tipe 'instan', ditoggle admin manual (lihat
        // togglePembayaranInstan()). Kosong/baris lama dianggap 'belum'.
        statusBayar: (row.statusBayar || '').toString().trim().toLowerCase() === 'lunas' ? 'lunas' : 'belum',
        // Flag saja (bukan isi foto) - fileData sebenarnya (buktiBayar) sudah
        // dibuang sama server (lihat stripBuktiBayarInstan() di sheets.js),
        // diganti flag hasBuktiBayar ini. Isi fotonya baru diambil on-demand
        // lewat fetchSurveyPesertaBuktiData() saat admin klik "Lihat Bukti".
        hasBuktiBayar: !!row.hasBuktiBayar
    })).filter(p => p.id);

    // Parse SetoranInstan - cicilan pembayaran peserta tipe 'instan'. Beda
    // dari buktiBayar/statusBayar di atas (1 foto tunggal, pola manual lama):
    // 1 peserta instan sekarang bisa punya BANYAK baris SetoranInstan (mis.
    // bayar Rp 1jt dulu, pelunasan menyusul kemudian), masing2 baris punya
    // nominal & status verifikasi sendiri, dicek admin di tab Verifikasi
    // (sama alur dengan Savings/tabungan biasa) - lihat
    // pesertaInstanBayarSummary() & approveSetoranInstan()/rejectSetoranInstan().
    appData.setoranInstan = setoranInstanRows.map(row => ({
        id: parseInt(row.id) || 0,
        pesertaId: parseInt(row.pesertaId) || 0,
        nominal: Number(row.nominal) || 0,
        transferDate: row.transferDate || '',
        // Status pakai konvensi sama dengan Savings.status: PENDING (baru
        // diupload, nunggu verifikasi admin) / APPROVED (disetujui, ikut
        // dihitung sbg pembayaran sah) / REJECTED (ditolak, tidak dihitung).
        status: (row.status || 'PENDING').toString().trim().toUpperCase(),
        uploadedAt: row.uploadedAt || '',
        approvedAt: row.approvedAt || '',
        approvedBy: row.approvedBy || '',
        notes: row.notes || '',
        // Flag saja - fileData asli dibuang di server (stripSetoranInstanFoto()
        // di sheets.js), diambil on-demand lewat fetchSetoranInstanFileData().
        hasFile: !!row.hasFile
    })).filter(s => s.id);

    await yieldToMain();

    // Parse DistribusiDaging (rencana pembagian daging per alokasi PER SAPI -
    // dasar Work Order, dikaitkan via surveyId, diinput manual oleh admin) -
    // Total SENGAJA tidak disimpan di sheet, selalu dihitung ulang dari
    // berat x qty di sisi frontend supaya tidak pernah selisih kalau salah
    // satu diedit.
    appData.distribusiDaging = distribusiDagingRows.map(row => ({
        id: parseInt(row.id) || 0,
        surveyId: parseInt(row.surveyId) || 0,
        alokasi: row.alokasi || '',
        berat: parseFloat(row.berat) || 0,
        qty: parseFloat(row.qty) || 0,
        status: row.status || 'aktif',
        created_date: row.created_date || ''
    })).filter(d => d.id);

    // Parse RencanaDistribusi (versi GLOBAL/kasar, TIDAK terikat 1 sapi -
    // estimasi awal sebelum dirinci ke Work Order per sapi). Kolom "wo"
    // ('ya'/'tidak' di sheet) menandakan baris ini sudah dimasukkan ke Work
    // Order atau belum.
    appData.rencanaDistribusi = rencanaDistribusiRows.map(row => ({
        id: parseInt(row.id) || 0,
        alokasi: row.alokasi || '',
        berat: parseFloat(row.berat) || 0,
        qty: parseFloat(row.qty) || 0,
        wo: (row.wo || '').toString().trim().toLowerCase() === 'ya',
        status: row.status || 'aktif',
        created_date: row.created_date || ''
    })).filter(d => d.id);

    // Parse RencanaDistribusiLain (Tulang/Jeroan/Kepala/Kaki/Buntut -
    // akumulasi TOTAL semua survey, tidak dirinci per sapi & tidak ada Work
    // Order/kolom "wo" spt RencanaDistribusi daging). "jenis" default
    // 'tulang' kalau kosong/nilai tidak dikenal.
    appData.rencanaDistribusiLain = rencanaDistribusiLainRows.map(row => {
        const jenisRaw = (row.jenis || '').toString().trim().toLowerCase();
        const jenisValid = ['tulang', 'jeroan', 'kepala', 'kaki', 'buntut'];
        return {
        id: parseInt(row.id) || 0,
        jenis: jenisValid.includes(jenisRaw) ? jenisRaw : 'tulang',
        alokasi: row.alokasi || '',
        berat: parseFloat(row.berat) || 0,
        qty: parseFloat(row.qty) || 0,
        status: row.status || 'aktif',
        created_date: row.created_date || ''
        };
    }).filter(d => d.id);

    // Parse DistribusiBagianLain (realisasi Work Order Sapi utk bagian
    // NON-DAGING - Tulang/Jeroan/Kepala/Kaki/Buntut - per sapi, dicocokkan ke
    // RencanaDistribusiLain via jenis+alokasi. Skema paralel ke
    // appData.distribusiDaging, lihat komentar TENANT_SHEET_TEMPLATE di
    // public/api/sheets.js).
    appData.distribusiBagianLain = distribusiBagianLainRows.map(row => {
        const jenisRaw = (row.jenis || '').toString().trim().toLowerCase();
        const jenisValid = ['tulang', 'jeroan', 'kepala', 'kaki', 'buntut'];
        return {
            id: parseInt(row.id) || 0,
            surveyId: parseInt(row.surveyId) || 0,
            jenis: jenisValid.includes(jenisRaw) ? jenisRaw : 'tulang',
            alokasi: row.alokasi || '',
            berat: parseFloat(row.berat) || 0,
            qty: parseFloat(row.qty) || 0,
            status: row.status || 'aktif',
            created_date: row.created_date || ''
        };
    }).filter(d => d.id);

    // Parse WorkOrderAktual (angka AKTUAL hari pelaksanaan, skema sama
    // dengan DistribusiDaging tapi sheet terpisah - Qty di sini SENGAJA
    // tidak dibatasi kuota, karena kenyataan di lapangan sering tidak
    // persis sama dengan rencana).
    appData.workOrderAktual = workOrderAktualRows.map(row => ({
        id: parseInt(row.id) || 0,
        surveyId: parseInt(row.surveyId) || 0,
        alokasi: row.alokasi || '',
        berat: parseFloat(row.berat) || 0,
        qty: parseFloat(row.qty) || 0,
        status: row.status || 'aktif',
        created_date: row.created_date || ''
    })).filter(d => d.id);

    await yieldToMain();

    // Parse PenerimaQR (daftar penerima BERNAMA per alokasi, buat e-tiket QR
    // & check-in hari pelaksanaan - lihat komentar SHEET_NAMES di
    // public/api/sheets.js utk skema kolom lengkap).
    appData.penerimaQR = penerimaQRRows.map(row => ({
        id: parseInt(row.id) || 0,
        alokasi: row.alokasi || '',
        nama: row.nama || '',
        noHp: row.noHp || '',
        alamat: row.alamat || '',
        kodeTiket: row.kodeTiket || '',
        status: row.status || 'aktif',
        diambil: (row.diambil || '').toString().trim().toLowerCase() === 'ya',
        waktuAmbil: row.waktuAmbil || '',
        lokasiLat: (row.lokasiLat !== undefined && row.lokasiLat !== '') ? parseFloat(row.lokasiLat) : null,
        lokasiLng: (row.lokasiLng !== undefined && row.lokasiLng !== '') ? parseFloat(row.lokasiLng) : null,
        hasFotoAmbil: !!row.hasFotoAmbil,
        // Baris lama (sebelum fitur Kupon Mudhohi ada) tidak punya kolom-kolom
        // ini di sheet - kosong dianggap kategori 'umum' (penerima biasa lewat
        // alokasi Rencana Distribusi), BUKAN 'mudhohi'. sourcePesertaId
        // mengaitkan baris ini ke 1 baris SurveyPeserta tertentu, dipakai
        // generateKuponMudhohi() buat cegah bikin kupon dobel kalau tombol
        // generate diklik berkali-kali.
        kategori: row.kategori || 'umum',
        berat: (row.berat !== undefined && row.berat !== '') ? parseFloat(row.berat) : null,
        kelompokSapi: row.kelompokSapi || '',
        sourcePesertaId: parseInt(row.sourcePesertaId) || 0,
        // "itemTambahan" - jatah bagian NON-DAGING (Tulang/Jeroan/Kepala/Kaki/
        // Buntut) yang dititipkan ke penerima ini, opsional, disimpan sbg JSON
        // string di sheet - lihat komentar TENANT_SHEET_TEMPLATE.PenerimaQR di
        // public/api/sheets.js. Baris lama/kosong/JSON rusak dianggap {}.
        itemTambahan: (() => {
            try {
                const parsed = row.itemTambahan ? JSON.parse(row.itemTambahan) : {};
                return (parsed && typeof parsed === 'object') ? parsed : {};
            } catch (e) {
                return {};
            }
        })(),
        created_date: row.created_date || ''
    })).filter(d => d.id);

    await yieldToMain();

    // Parse PosBudget (pos anggaran modul Keuangan - tiap pos punya jenis
    // 'pemasukan' atau 'pengeluaran' supaya Anggaran vs Realisasi konsisten
    // maknanya per pos, lihat renderKeuanganPos()).
    appData.posBudget = posBudgetRows.map(row => ({
        id: parseInt(row.id) || 0,
        nama: row.nama || '',
        jenisPos: (row.jenisPos || '').toString().trim().toLowerCase() === 'pemasukan' ? 'pemasukan' : 'pengeluaran',
        jumlahAnggaran: parseInt(row.jumlahAnggaran) || 0,
        keterangan: row.keterangan || '',
        status: row.status || 'aktif',
        created_date: row.created_date || ''
    })).filter(d => d.id);

    // Parse TransaksiKeuangan (catatan arus kas harian per Pos Budget - kolom
    // "bukti" (base64 foto nota, opsional) SENGAJA tidak dikirim di load
    // biasa, sama pola dgn PenerimaQR.fotoAmbil - server balikin flag
    // hasBukti, isi foto diambil on-demand lewat fetchBuktiTransaksiData().
    appData.transaksiKeuangan = transaksiKeuanganRows.map(row => ({
        id: parseInt(row.id) || 0,
        posId: parseInt(row.posId) || 0,
        tanggal: row.tanggal || '',
        jumlah: parseInt(row.jumlah) || 0,
        keterangan: row.keterangan || '',
        hasBukti: !!row.hasBukti,
        status: row.status || 'aktif',
        created_date: row.created_date || ''
    })).filter(d => d.id);

    await yieldToMain();

    // Parse KemasanInventaris (modul "Kemasan & Inventaris", 2 kategori):
    // - kategori 'kemasan': habis pakai yg skalanya otomatis dari rasioPerUnit
    //   x basis (Paket/Penerima, Kg Daging, atau - sejak fitur Item Tambahan &
    //   Kupon Mudhohi - Item Tambahan Tulang/Jeroan/kupon Mudhohi), lihat
    //   hitungKebutuhanKemasan().
    // - kategori 'inventaris': alat/perlengkapan, kebutuhan diisi MANUAL
    //   (kebutuhanManual), tidak ikut skala paket/kg.
    appData.kemasanInventaris = kemasanInventarisRows.map(row => ({
        id: parseInt(row.id) || 0,
        namaItem: row.namaItem || '',
        ukuran: row.ukuran || '',
        kategori: (row.kategori || '').toString().trim().toLowerCase() === 'inventaris' ? 'inventaris' : 'kemasan',
        basisHitung: (() => {
            const b = (row.basisHitung || '').toString().trim().toLowerCase();
            const VALID_BASIS = { kg: 'kg', rencanadaging: 'rencanaDaging', tulang: 'tulang', jeroan: 'jeroan', mudhohi: 'mudhohi', sapi: 'sapi', paket: 'paket' };
            return VALID_BASIS[b] || 'paket';
        })(),
        rasioPerUnit: parseFloat(row.rasioPerUnit) || 0,
        kebutuhanManual: parseFloat(row.kebutuhanManual) || 0,
        stokTersedia: parseFloat(row.stokTersedia) || 0,
        catatan: row.catatan || '',
        status: row.status || 'aktif',
        created_date: row.created_date || ''
    })).filter(d => d.id);

    // Parse LPJNarasi (satu baris config, id tetap 'lpj') - narasi/kata
    // pengantar yang bisa ditulis admin di tab LPJ. Kalau sheet belum ada
    // atau belum pernah diisi, appData.lpjNarasi tetap object kosong (lihat
    // definisi awal di atas) supaya tab LPJ tetap tampil normal (cuma narasi
    // kosong), bukan error.
    const lpjNarasiRow = lpjNarasiRows.find(r => String(r.id || '').trim() === 'lpj') || lpjNarasiRows[0] || null;
    appData.lpjNarasi = {
        narasi: lpjNarasiRow ? (lpjNarasiRow.narasi || '') : '',
        updatedBy: lpjNarasiRow ? (lpjNarasiRow.updatedBy || '') : '',
        updatedDate: lpjNarasiRow ? (lpjNarasiRow.updatedDate || '') : ''
    };

    lastDataLoadTime = Date.now();

    console.log('Members loaded:', appData.members);
    console.log('Savings loaded:', appData.savings);
    console.log('Messages loaded:', appData.messages);
    console.log('Pendaftaran loaded:', appData.pendaftaran);
}

// ===== LOGIN TAB SWITCHING =====
function switchLoginTab(tabName, btn) {
    ['loginTab', 'guestTab', 'registerTab'].forEach(tab => {
        const el = document.getElementById(tab);
        if (el) el.style.display = 'none';
    });
    document.getElementById(tabName + 'Tab').style.display = 'block';

    document.querySelectorAll('.login-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// ===== GUEST LOGIN =====
async function handleGuestLogin() {
    showAlert('Memuat data tabungan...', 'info');
    
    currentUser = {
        id: 0,
        name: 'Pengunjung',
        role: 'guest',
        phone: ''
    };
    saveSession(currentUser);

    appData.members = [];
    appData.savings = [];
    appData.messages = [];
    appData.verifications = [];
    appData.pendaftaran = [];

    // Muat data dari Sheets untuk guest view
    await loadDataFromSheets();
    showApp();
    switchTab('dashboard');
    
    showAlert('Selamat datang! Anda bisa lihat Dashboard dan Laporan.', 'success');
}

// ===== GENERATE PASSWORD =====
function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pwd = '';
    for (let i = 0; i < 6; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
}

// ===== AUTO ID GENERATION (PER SAPI) =====
function generateAutoID() {
    // Max 7 anggota per sapi
    const membersPerSapi = 7;
    
    // ✅ PERBAIKAN: Hitung berdasarkan jumlah member yang sudah ada
    // Filter hanya member dengan urutan yang valid (ada field 'urutan')
    const approvedMembers = appData.members.filter(m => m.urutan && m.urutan > 0).length;
    const nextSequence = approvedMembers + 1;
    
    // Hitung sapi number dan urutan dalam sapi
    const sapiNumber = Math.ceil(nextSequence / membersPerSapi);
    const urutanInSapi = ((nextSequence - 1) % membersPerSapi) + 1;
    
    // Generate ID: sapiNumber + urutanInSapi
    // Contoh: Sapi 1 No 1 = 11, Sapi 1 No 2 = 12, Sapi 2 No 1 = 21
    const autoID = parseInt(`${sapiNumber}${urutanInSapi}`);
    
    return {
        id: autoID,
        sapi: sapiNumber,
        urutan: urutanInSapi
    };
}

// ===== REGISTRATION =====
async function handleRegistration() {
    const name = document.getElementById('regName').value.trim();
    const rt = document.getElementById('regRT').value.trim();
    const blok = document.getElementById('regBlok').value.trim();
    const no = document.getElementById('regNo').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const reason = document.getElementById('regReason').value.trim();

    if (!name || !rt || !blok || !no || !phone) {
        showAlert('Nama, RT, Blok, No, dan nomor WhatsApp harus diisi', 'error');
        return;
    }

    if (!phone.startsWith('08')) {
        showAlert('Nomor WhatsApp harus dimulai dengan 08', 'error');
        return;
    }

    if (!reason) {
        showAlert('Alasan mendaftar harus diisi', 'error');
        return;
    }

    // Generate password dari 4 digit terakhir no hape
    const password = phone.slice(-4);

    // ===== Notif WA ke Bendahara: SEBELUM await apapun kalau bisa =====
    // Kalau appData.members sudah ke-cache (biasanya sudah, hasil prefetch
    // pas halaman dibuka), nomor Bendahara sudah diketahui SEKARANG - buka
    // WA langsung di sini, sinkron, supaya tidak diblokir browser mobile.
    const adminMsgFor = () => `Assalamu'alaikum Bendahara, ada calon anggota baru mendaftar! 👤

Nama: ${name}
Alamat: RT ${rt}, Blok ${blok}, No ${no}
WhatsApp: ${phone}
Alasan: ${reason}

Periksa menu "Approval Anggota Baru" di aplikasi untuk proses lebih lanjut.
🔗 ${APP_CONFIG.appUrl}`;
    let bendaharaPhone = (appData.members && appData.members.length > 0)
        ? findOfficerPhone(appData.members, ['bendum2', 'ketua1'])
        : '';
    if (bendaharaPhone) openWaTo(bendaharaPhone, adminMsgFor());

    // Ambil data pendaftaran & member TERBARU langsung dari sheet.
    // Jangan andalkan appData.pendaftaran/appData.members: kalau form ini
    // dibuka tanpa login (guest), array itu masih kosong/belum ke-load,
    // sehingga id selalu jadi 1 (bug lama).
    const existingPendaftaran = await fetchSheetDBTable('Pendaftaran');
    const existingMembers = await fetchSheetDBTable('Members');

    const regId = existingPendaftaran.length > 0
        ? Math.max(...existingPendaftaran.map(p => parseInt(p.id) || 0)) + 1
        : 1;

    const registration = {
        id: regId,
        name: name,
        rt: rt,
        blok: blok,
        no: no,
        phone: phone,
        reason: reason,
        password: password,
        status: 'PENDING',
        applied_at: new Date().toISOString(),
        approved_at: '',
        approved_by: ''
    };

    // Save to Sheets
    const ok = await appendSheetDB('Pendaftaran', registration);
    if (!ok) {
        showAlert('Gagal menyimpan pendaftaran', 'error');
        return;
    }

    appData.pendaftaran = existingPendaftaran;
    appData.pendaftaran.push(registration);

    // Fallback: nomor Bendahara belum ke-cache di awal (jarang - mis. guest
    // yang baru buka halaman & belum ada prefetch). Coba lagi pakai data
    // yang baru saja di-fetch. window.open() di sini SUDAH lewat 3 await di
    // atas, jadi ADA KEMUNGKINAN diblokir browser (terutama mobile) - tapi
    // tetap dicoba drpd tidak sama sekali; pendaftaran sendiri tetap
    // tersimpan normal walau notifikasi WA ini gagal kebuka.
    if (!bendaharaPhone) {
        bendaharaPhone = findOfficerPhone(existingMembers, ['bendum2', 'ketua1']);
        if (bendaharaPhone) openWaTo(bendaharaPhone, adminMsgFor());
    }

    // Catatan: notif konfirmasi ke CALON pendaftar sendiri (dulu via Fonnte)
    // sengaja dihapus - membuka 2 tab WA sekaligus (1 ke Bendahara, 1 ke
    // calon) beresiko tab ke-2 diblokir browser sebagai popup ganda. Cukup
    // 1 notifikasi WA (ke Bendahara) + alert sukses di dalam aplikasi
    // (di bawah) sebagai konfirmasi ke pendaftar.

    // Bersihkan form & tampilkan notifikasi sukses di menu daftar (tidak pindah tab)
    document.getElementById('regName').value = '';
    document.getElementById('regRT').value = '';
    document.getElementById('regBlok').value = '';
    document.getElementById('regNo').value = '';
    document.getElementById('regPhone').value = '';
    document.getElementById('regReason').value = '';

    document.getElementById('regSuccessBox').style.display = 'block';
    showAlert(`Pendaftaran berhasil! Terima kasih ${name}. Tunggu approval admin.`, 'success');
}

// ===== LOGIN =====
async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!username || !password) {
        showAlert('Username dan password harus diisi', 'error');
        return;
    }

    // PENCOCOKAN PASSWORD SEKARANG DI SERVER, BUKAN DI SINI.
    // Dulu blok ini men-download seluruh sheet Members (ensureDataLoaded()
    // lebih dulu) lalu membandingkan m.password === password langsung di HP
    // pengguna. Konsekuensinya kolom password HARUS ikut dikirim ke browser,
    // dan karena endpoint /api/sheets itu publik tanpa pengecekan izin,
    // siapa pun yang tahu slug masjid bisa membuka
    // /api/sheets?tenant=<slug>&bootstrap=1 dan melihat password SEMUA
    // anggota - termasuk pengurus. Server sekarang membuang kolom password
    // (stripMemberSecret() di api/sheets.js) dan memverifikasi sendiri.
    showAlert('Memeriksa...', 'info');
    let result;
    try {
        const resp = await fetch(`${SHEETDB_CONFIG.ENDPOINT}?action=login${tenantParam()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ username, password })
        });
        result = await resp.json().catch(() => null);
        if (!resp.ok || !result || !result.ok) {
            showAlert((result && result.error) || 'Username/ID atau password salah', 'error');
            return;
        }
    } catch (err) {
        console.error('Login gagal:', err);
        showAlert('Tidak bisa terhubung ke server. Cek koneksi internet Anda.', 'error');
        return;
    }

    currentUser = result.user;
    // Password pengurus disimpan di MEMORI SAJA (variabel biasa), tidak
    // pernah ke localStorage - dipakai membuktikan ke server bahwa yang
    // minta dibuatkan link otomatis buat anggota memang benar pengurus
    // (lihat ensureAutoLoginTokens()). Hilang sendiri begitu halaman
    // di-reload; kalau begitu pengurus akan diminta ketik ulang sekali.
    if (currentUser.role === 'admin') adminPassInMemory = password;
    recordLogin(currentUser);
    saveSession(currentUser);
    await ensureDataLoaded();
    showApp();
    showAlert(`Selamat datang, ${currentUser.name}!`, 'success');
}

// ===== TOKEN LINK OTOMATIS (sisi admin) =====
// Cache token per anggota, cuma di memori selama halaman terbuka. Token
// dibuat SERVER (butuh rahasia penanda tangan), jadi tidak bisa dibikin
// sendiri di sini.
let adminPassInMemory = '';
let autoLoginTokenCache = {};

// Ambilkan token untuk sekumpulan anggota sekaligus (1 request, bukan
// per-orang). Dipanggil sebelum broadcast dikirim, supaya fillVariables()
// yang sinkron tinggal membaca hasilnya dari cache.
async function ensureAutoLoginTokens(memberIds) {
    if (!currentUser || currentUser.role !== 'admin') return false;
    const perlu = (memberIds || []).map(String).filter(id => !autoLoginTokenCache[id]);
    if (perlu.length === 0) return true;

    if (!adminPassInMemory) {
        const p = prompt('Untuk membuat link masuk otomatis, ketik ulang password pengurus Anda sekali:');
        if (!p) return false;
        adminPassInMemory = p;
    }

    try {
        const resp = await fetch(`${SHEETDB_CONFIG.ENDPOINT}?action=makeLoginTokens${tenantParam()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                adminId: String(currentUser.id),
                adminPassword: adminPassInMemory,
                memberIds: perlu
            })
        });
        const hasil = await resp.json().catch(() => null);
        if (!resp.ok || !hasil || !hasil.ok) {
            adminPassInMemory = ''; // password salah - minta lagi lain kali
            showAlert((hasil && hasil.error) || 'Gagal membuat link otomatis', 'error');
            return false;
        }
        Object.assign(autoLoginTokenCache, hasil.tokens || {});
        return true;
    } catch (err) {
        console.error('Gagal membuat token auto-login:', err);
        return false;
    }
}

// Link khusus 1 anggota. Kalau tokennya belum ada (mis. anggota itu ternyata
// pengurus, atau pembuatan token gagal), jatuh balik ke link biasa - anggota
// tetap bisa masuk, cuma perlu mengetik ID & password seperti biasa.
function autoLoginLinkFor(member) {
    if (!member) return APP_URL;
    const token = autoLoginTokenCache[String(member.id)];
    return token ? `${APP_URL}?t=${encodeURIComponent(token)}` : APP_URL;
}

// ===== LOGIN OTOMATIS DARI LINK WHATSAPP =====
// Admin bisa mengirim link berisi token (…/<slug>?t=…) lewat WhatsApp,
// supaya anggota tinggal klik tanpa mengetik ID/password. Token ditandatangani
// server, berlaku 30 hari, terikat ke satu masjid & satu anggota, dan TIDAK
// berlaku untuk akun pengurus (lihat action 'loginToken' di api/sheets.js).
//
// Ini menggantikan kebiasaan lama menempelkan "ID: … Password: …" apa adanya
// di badan pesan WhatsApp - password yang sekali terkirim berlaku selamanya
// dan bisa dipakai siapa saja yang membaca chat itu, sedangkan token ini
// kedaluwarsa sendiri dan bisa dibatalkan serentak dari sisi server.
async function tryAutoLoginFromLink() {
    let token = '';
    try {
        token = new URLSearchParams(window.location.search).get('t') || '';
    } catch (e) { /* URL aneh - abaikan, lanjut ke layar login biasa */ }
    if (!token) return false;

    // Bersihkan token dari address bar SEGERA, apa pun hasilnya nanti -
    // supaya tidak ikut ter-screenshot, ter-share, atau nyangkut di riwayat
    // browser HP yang dipakai bergantian.
    try {
        const bersih = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, bersih);
    } catch (e) { /* abaikan */ }

    try {
        const resp = await fetch(`${SHEETDB_CONFIG.ENDPOINT}?action=loginToken${tenantParam()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ token })
        });
        const result = await resp.json().catch(() => null);
        if (!resp.ok || !result || !result.ok) {
            showAlert((result && result.error) || 'Link sudah tidak berlaku. Silakan masuk seperti biasa.', 'warning');
            return false;
        }
        currentUser = result.user;
        recordLogin(currentUser);
        saveSession(currentUser);
        await ensureDataLoaded();
        showApp();
        showAlert(`Selamat datang, ${currentUser.name}!`, 'success');
        return true;
    } catch (err) {
        console.error('Auto-login gagal:', err);
        showAlert('Tidak bisa terhubung ke server. Silakan masuk seperti biasa.', 'warning');
        return false;
    }
}

// Catat jejak login ke sheet "LoginLog" - dasar buat menu "Log Aktivitas
// Anggota" supaya admin tahu siapa saja yang benar-benar aktif memakai
// aplikasi. Sengaja "fire-and-forget" (tidak di-await) supaya proses login
// tetap terasa instan buat user, dan kalau gagal tersimpan pun tidak
// mengganggu login itu sendiri (cukup dicatat di console).
function recordLogin(user) {
    if (!user || !user.id) return;
    appendSheetDB('LoginLog', {
        id: nextLoginLogId(),
        memberId: user.id,
        memberName: user.name,
        role: user.role || 'member',
        loginAt: new Date().toISOString()
    }).then(ok => {
        if (ok) {
            // Simpan juga ke state lokal supaya menu Log Aktivitas (kalau admin
            // langsung buka setelahnya) tidak perlu tunggu reload data.
            appData.loginLogs.push({
                id: 0, memberId: user.id, memberName: user.name,
                role: user.role || 'member', loginAt: new Date().toISOString()
            });
        }
    }).catch(err => console.error('Gagal mencatat login:', err));
}

function nextLoginLogId() {
    return appData.loginLogs.length > 0
        ? Math.max(...appData.loginLogs.map(l => parseInt(l.id) || 0)) + 1
        : 1;
}

function logout() {
    if (confirm('Yakin ingin keluar?')) {
        forceLogout();
    }
}

// Sama seperti logout(), tapi tanpa dialog konfirmasi - dipakai untuk logout
// OTOMATIS (mis. sesi tersimpan ternyata sudah tidak valid lagi), bukan aksi
// yang diminta user secara sadar lewat tombol "Keluar".
function forceLogout() {
    currentUser = null;
    clearSavedSession();
    document.getElementById('loginScreen').style.display = 'grid';
    document.getElementById('appContainer').classList.remove('active');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
}

// Coba pulihkan sesi login yang tersimpan (lihat catatan di dekat
// SESSION_STORAGE_KEY). Dipanggil sekali saat halaman pertama dibuka. Kalau
// ada sesi tersimpan, langsung tampilkan app (skip layar login) supaya reload
// dari pull-to-refresh atau app dibuka ulang tidak terasa seperti "logout".
async function restoreSession() {
    const saved = loadSavedSession();
    if (!saved || !saved.role) return;

    currentUser = saved;
    showApp();

    // Muat data terbaru (appData masih kosong di titik ini kalau ini benar-benar
    // reload halaman dari nol, bukan cuma balik dari background). Berlaku buat
    // semua role, termasuk guest, supaya Dashboard/Laporan tidak nyangkut kosong.
    await ensureDataLoaded();

    if (saved.role === 'member' || saved.role === 'admin') {
        // Sinkronkan ulang dari data terbaru (nama/telepon mungkin berubah
        // sejak login terakhir). Kalau member-nya ternyata sudah tidak ada
        // lagi (mis. dihapus admin), otomatis logout alih-alih membiarkan
        // sesi "hantu" nyangkut di app.
        const stillExists = appData.members.find(m => m.id === saved.id);
        if (!stillExists) {
            forceLogout();
            showAlert('Akun Anda sudah tidak terdaftar. Silakan hubungi admin.', 'error');
            return;
        }
        currentUser = {
            id: stillExists.id,
            name: stillExists.name,
            phone: stillExists.phone,
            role: stillExists.role === 'admin' ? 'admin' : 'member'
        };
        saveSession(currentUser);
    }

    // showApp() otomatis panggil updateDashboard() (dan switchTab('dashboard')
    // untuk admin/guest) di akhir, jadi tampilan Dashboard otomatis ikut
    // sinkron begitu data terbaru selesai dimuat - tidak perlu langkah tambahan.
    showApp();
}

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').classList.add('active');
    document.getElementById('userName').textContent = currentUser.name;
    
    // Set role text
    if (currentUser.role === 'admin') {
        document.getElementById('userRole').textContent = 'Administrator';
    } else if (currentUser.role === 'guest') {
        document.getElementById('userRole').textContent = 'Pengunjung';
    } else {
        document.getElementById('userRole').textContent = 'Anggota';
    }
    
    document.getElementById('avatarInitial').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('uploadName').value = currentUser.name;

    // Menu untuk Admin
    const verifyTabBtn = document.getElementById('verifyTabBtn');
    const broadcastTabBtn = document.getElementById('broadcastTabBtn');
    const approvalTabBtn = document.getElementById('approvalTabBtn');
    const activityLogTabBtn = document.getElementById('activityLogTabBtn');
    const surveySapiTabBtn = document.getElementById('surveySapiTabBtn');
    const distribusiDagingTabBtn = document.getElementById('distribusiDagingTabBtn');
    const woAktualTabBtn = document.getElementById('woAktualTabBtn');
    const penerimaTabBtn = document.getElementById('penerimaTabBtn');
    const keuanganTabBtn = document.getElementById('keuanganTabBtn');
    const kemasanTabBtn = document.getElementById('kemasanTabBtn');

    // Menu untuk Anggota
    const profileTabBtn = document.getElementById('profileTabBtn');
    const uploadTabBtn = document.getElementById('uploadTabBtn');
    const historyTabBtn = document.getElementById('historyTabBtn');
    const laporanTabBtn = document.getElementById('laporanTabBtn');
    const laporanIuranTabBtn = document.getElementById('laporanIuranTabBtn');
    const lpjTabBtn = document.getElementById('lpjTabBtn');

    // LPJ tampil utk SEMUA role (admin/anggota/guest) - lihat komentar di
    // atas tombolnya di sidebar. Di-set sekali di sini di luar cabang
    // role di bawah supaya tidak perlu diulang 3x & tidak gampang lupa
    // kalau nanti ada role baru.
    if (lpjTabBtn) lpjTabBtn.style.display = 'flex';

    if (currentUser.role === 'admin') {
        // Tampilkan menu admin
        verifyTabBtn.style.display = 'flex';
        broadcastTabBtn.style.display = 'flex';
        approvalTabBtn.style.display = 'flex';
        activityLogTabBtn.style.display = 'flex';
        surveySapiTabBtn.style.display = 'flex';
        distribusiDagingTabBtn.style.display = 'flex';
        woAktualTabBtn.style.display = 'flex';
        penerimaTabBtn.style.display = 'flex';
        keuanganTabBtn.style.display = 'flex';
        kemasanTabBtn.style.display = 'flex';
        laporanTabBtn.style.display = 'flex';  // Admin bisa lihat laporan
        laporanIuranTabBtn.style.display = 'flex';

        // Profil TETAP tampil untuk admin - dipakai buat ganti No. HP &
        // Password Khusus sendiri (menu Profil bukan cuma buat anggota).
        profileTabBtn.style.display = 'flex';
        uploadTabBtn.style.display = 'none';
        historyTabBtn.style.display = 'none';

        // Redirect ke dashboard
        switchTab('dashboard');
    } else if (currentUser.role === 'guest') {
        // Guest hanya bisa lihat Dashboard, Laporan, & Survey Sapi (versi
        // publik - lihat hasil survey + tombol "Daftar Langsung" utk yang mau
        // ikut qurban tanpa menabung, lihat loadSurveySapiMemberList()).
        profileTabBtn.style.display = 'none';
        uploadTabBtn.style.display = 'none';
        historyTabBtn.style.display = 'none';
        laporanTabBtn.style.display = 'flex';
        laporanIuranTabBtn.style.display = 'flex';
        surveySapiTabBtn.style.display = 'flex';

        // Hide menu admin
        verifyTabBtn.style.display = 'none';
        broadcastTabBtn.style.display = 'none';
        approvalTabBtn.style.display = 'none';
        activityLogTabBtn.style.display = 'none';
        distribusiDagingTabBtn.style.display = 'none';
        woAktualTabBtn.style.display = 'none';
        penerimaTabBtn.style.display = 'none';
        keuanganTabBtn.style.display = 'none';
        kemasanTabBtn.style.display = 'none';

        // Redirect ke dashboard
        switchTab('dashboard');
    } else {
        // Member: Tampilkan semua menu anggota + profil
        profileTabBtn.style.display = 'flex';
        uploadTabBtn.style.display = 'flex';
        historyTabBtn.style.display = 'flex';
        laporanTabBtn.style.display = 'flex';
        laporanIuranTabBtn.style.display = 'flex';

        // Hide menu admin
        verifyTabBtn.style.display = 'none';
        broadcastTabBtn.style.display = 'none';
        approvalTabBtn.style.display = 'none';
        activityLogTabBtn.style.display = 'none';
        // Survey Sapi TETAP ditampilkan untuk Anggota, tapi isinya versi
        // read-only + tombol Ikut (lihat surveySapiMemberSection & switchTab()).
        surveySapiTabBtn.style.display = 'flex';
        distribusiDagingTabBtn.style.display = 'flex';
        // WO Aktual & Penerima/Tiket (khusus hari pelaksanaan) - khusus
        // Admin/panitia, Anggota tidak perlu isi ini.
        woAktualTabBtn.style.display = 'none';
        penerimaTabBtn.style.display = 'none';
        keuanganTabBtn.style.display = 'none';
        kemasanTabBtn.style.display = 'none';
    }

    // Sinkronkan label grup nav (Tabungan/Operasional Qurban/Keuangan/
    // Lainnya) - tampil kalau minimal 1 tombol di grupnya lagi tampil,
    // sembunyi kalau semua tombol grupnya tersembunyi (mis. saat member/
    // guest login). Dihitung sekali di sini stlh semua display tombol di
    // atas final, jadi tidak perlu di-set manual per cabang role.
    syncNavGroupLabels();

    updateDashboard();
}

// Lihat catatan panjang di showApp() - dipanggil tiap kali visibilitas tab
// berubah supaya label section nav selalu sinkron dgn tombol di bawahnya.
function syncNavGroupLabels() {
    document.querySelectorAll('.nav-section-label').forEach(label => {
        const group = label.dataset.group;
        const anyVisible = Array.from(document.querySelectorAll(`.tab-btn[data-group="${group}"]`))
            .some(btn => btn.style.display !== 'none');
        label.style.display = anyVisible ? 'block' : 'none';
    });
}

function toggleSidebar(){
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
}

// ===== TAB SWITCHING =====
const TAB_META = {
    dashboard: { title: 'Dashboard', crumb: 'Ringkasan' },
    upload: { title: 'Upload Bukti', crumb: 'Tabungan' },
    profile: { title: 'Data Pribadi', crumb: 'Profil' },
    verify: { title: 'Verifikasi Tabungan', crumb: 'Admin' },
    broadcast: { title: 'Broadcast WhatsApp', crumb: 'Admin' },
    approval: { title: 'Approval Anggota Baru', crumb: 'Admin' },
    activityLog: { title: 'Log Aktivitas Anggota', crumb: 'Admin' },
    surveySapi: { title: 'Survey Sapi', crumb: 'Qurban' },
    distribusiDaging: { title: 'Distribusi Daging', crumb: 'Qurban' },
    woAktual: { title: 'Work Order Aktual', crumb: 'Pelaksanaan' },
    penerima: { title: 'Penerima & Tiket', crumb: 'Pelaksanaan' },
    keuangan: { title: 'Keuangan', crumb: 'Keuangan' },
    kemasan: { title: 'Kemasan & Inventaris', crumb: 'Pelaksanaan' },
    history: { title: 'Riwayat', crumb: 'Tabungan' },
    laporan: { title: 'Laporan Tabungan', crumb: 'Tabungan' },
    laporanIuran: { title: 'Laporan Iuran Qurban', crumb: 'Qurban' },
    lpj: { title: 'Laporan Pertanggungjawaban (LPJ)', crumb: 'Transparansi' }
};

async function switchTab(tabName) {
    // Kalau lagi pindah KELUAR dari tab Penerima & Tiket sementara kamera
    // scan QR masih nyala, matikan dulu - supaya kamera tidak terus jalan
    // di background pas admin pindah ke tab lain.
    const wasPenerimaActive = document.getElementById('penerima')?.classList.contains('active');
    if (wasPenerimaActive && tabName !== 'penerima' && typeof stopQrScanner === 'function') {
        stopQrScanner();
    }

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav .tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabName).classList.add('active');

    // Highlight tombol yang aktif
    const activeBtn = document.querySelector(`.sidebar-nav .tab-btn[onclick*="'${tabName}'"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const meta = TAB_META[tabName];
    if (meta) {
        document.getElementById('pageTitle').textContent = meta.title;
        document.getElementById('pageCrumb').textContent = meta.crumb;
    }

    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');

    // Tab-tab ini menampilkan data yang bisa berubah dari sisi lain (anggota lain
    // upload tabungan, daftar baru, dsb). ensureDataLoaded() otomatis skip fetch
    // kalau data masih segar (<5 detik) atau kalau ada fetch lain yang sedang
    // berjalan (dipakai bareng, tidak dobel request) - jadi terasa instan.
    const needsFreshData = ['dashboard', 'verify', 'approval', 'activityLog', 'history', 'laporan', 'laporanIuran', 'surveySapi', 'distribusiDaging', 'woAktual', 'penerima', 'keuangan', 'kemasan', 'lpj'];
    if (needsFreshData.includes(tabName)) {
        await ensureDataLoaded();
    }

    runTabDataLoaders(tabName);
}

// Dipisah dari switchTab() supaya bisa dipanggil ulang oleh pull-to-refresh
// (refreshCurrentTabData()) tanpa perlu mengulang logika ganti-tab/highlight
// menu - cuma perlu muat ulang data buat tab yang lagi aktif.
function runTabDataLoaders(tabName) {
    if (tabName === 'dashboard') updateDashboard();
    if (tabName === 'profile') loadProfileData();
    if (tabName === 'verify') { loadVerifyData(); loadSetoranInstanVerifyData(); }
    if (tabName === 'approval') loadApprovalData();
    if (tabName === 'activityLog') loadActivityLog();
    if (tabName === 'history') loadHistory();
    if (tabName === 'laporan') loadLaporan();
    if (tabName === 'laporanIuran') loadLaporanIuran();
    if (tabName === 'lpj') loadLPJ();
    if (tabName === 'surveySapi') {
        // Admin lihat form input + tabel riwayat lengkap; Anggota lihat versi
        // read-only + tombol Ikut (lihat surveySapiAdminSection/MemberSection).
        const isAdminView = currentUser && currentUser.role === 'admin';
        const adminSection = document.getElementById('surveySapiAdminSection');
        const memberSection = document.getElementById('surveySapiMemberSection');
        if (adminSection) adminSection.style.display = isAdminView ? '' : 'none';
        if (memberSection) memberSection.style.display = isAdminView ? 'none' : '';
        if (isAdminView) {
            initSurveyForm();
            loadSurveySapiTable();
            loadSurveySapiResume();
        } else {
            const guestInfo = document.getElementById('surveySapiGuestInfo');
            const isGuestView = !(currentUser && currentUser.role === 'member');
            if (guestInfo) guestInfo.style.display = isGuestView ? 'flex' : 'none';
            const uploadBuktiBtn = document.getElementById('surveySapiUploadBuktiBtn');
            if (uploadBuktiBtn) uploadBuktiBtn.style.display = isGuestView ? 'inline-flex' : 'none';
            loadSurveySapiMemberList();
        }
        renderSurveyHero();
    }
    if (tabName === 'distribusiDaging') {
        // Estimasi Distribusi Daging, Rencana Distribusi Daging (Umum), dan
        // Work Order Sapi - dulu bagian dari tab Survey Sapi, sekarang tab
        // sendiri supaya tidak terlalu panjang. Sama-sama admin/anggota.
        const isAdminView = currentUser && currentUser.role === 'admin';
        const adminSection = document.getElementById('distribusiDagingAdminSection');
        const memberSection = document.getElementById('distribusiDagingMemberSection');
        if (adminSection) adminSection.style.display = isAdminView ? '' : 'none';
        if (memberSection) memberSection.style.display = isAdminView ? 'none' : '';
        if (isAdminView) {
            loadSurveySapiDistribusi();
            loadSurveySapiBagianLain();
            loadRencanaDistribusiGlobal('rencanaDistribusiBody', 'rencanaDistribusiFoot', true);
            loadRencanaDistribusiLain('rencanaLainBody', 'rencanaLainFoot', 'rencanaBagianLainSummary', true);
            loadWorkOrderList('workOrderListAdmin', true);
        } else {
            loadSurveySapiDistribusi('surveySapiDistribusiBodyMember', 'surveySapiDistribusiFootMember');
            loadSurveySapiBagianLain('surveyBagianLainBodyMember', 'surveyBagianLainFootMember');
            loadRencanaDistribusiGlobal('rencanaDistribusiBodyMember', 'rencanaDistribusiFootMember', false);
            loadRencanaDistribusiLain('rencanaLainBodyMember', 'rencanaLainFootMember', 'rencanaBagianLainSummaryMember', false);
            loadWorkOrderList('workOrderListMember', false);
        }
        renderDistribusiHero();
    }
    if (tabName === 'woAktual') {
        loadWoAktualList('woAktualList');
            renderWoAktualResume('woAktualResume');
    }
    if (tabName === 'penerima') {
        populatePenerimaAlokasiSelect();
        loadPenerimaList();
        loadKuponMudhohiList();
    }
    if (tabName === 'keuangan') {
        const tanggalInput = document.getElementById('transaksiTanggal');
        if (tanggalInput && !tanggalInput.value) tanggalInput.value = new Date().toISOString().slice(0, 10);
        populateKeuanganPosSelect();
        loadPosBudgetList();
        loadTransaksiKeuanganList();
    }
    if (tabName === 'kemasan') {
        refreshKemasanInventaris();
    }
    if (tabName === 'broadcast') {
        populateSapiOptions();
        updateRecipientCount();
        loadTemplates();
        loadFonnteStatus();
    }
}

// ===== PULL-TO-REFRESH (custom) =====
// Browser HP punya pull-to-refresh bawaan yang me-reload SELURUH halaman
// kalau ditarik ke bawah di posisi paling atas - itu menghapus semua state
// JS (termasuk sesi login kalau localStorage belum sempat dibaca ulang) dan
// terasa seperti "logout paksa". CSS overscroll-behavior-y di atas mematikan
// perilaku bawaan itu; gesture ini gantinya - hasil akhirnya sama-sama
// "data ter-refresh", tapi tanpa reload halaman.
let ptrStartY = null;
let ptrTracking = false;
let ptrRefreshing = false;
const PTR_THRESHOLD = 68; // jarak tarik (setelah resistance) buat memicu refresh

function initPullToRefresh() {
    const indicator = document.getElementById('ptrIndicator');
    if (!indicator) return;

    // SEMUA listener di sini {passive:true} DAN TIDAK PERNAH panggil
    // e.preventDefault() - ini persis "logika landing page" (public/index.html)
    // yang sama sekali tidak punya listener touch custom dan selalu terasa
    // ringan. Versi sebelumnya sempat pakai touchmove {passive:false} (baik
    // permanen maupun di-attach/lepas dinamis) supaya bisa preventDefault()
    // pas nge-drag dari atas - ternyata tetap berpotensi bikin scroll di
    // dalam menu (yang isinya banyak tabel/strip horizontal) terasa berat di
    // sebagian HP Android, krn browser tetap harus menunggu keputusan JS di
    // momen listener itu aktif. Sekarang preventDefault() DIHAPUS TOTAL -
    // pencegahan reload/rubber-band bawaan browser saat pull-to-refresh
    // cukup diserahkan ke CSS overscroll-behavior-y (lihat komentar di
    // bagian atas <style>), bukan lagi tugas JS. Konsekuensinya: animasi
    // indikator custom ini murni kosmetik (mengikuti jari lewat perhitungan
    // deltaY seperti biasa), tapi TIDAK PERNAH memblokir apapun - jadi
    // browser bebas scroll instan tanpa nunggu JS sama sekali, di semua
    // gesture, di semua menu, sama seperti landing page.
    document.addEventListener('touchstart', (e) => {
        const appActive = document.getElementById('appContainer')?.classList.contains('active');
        if (!appActive || ptrRefreshing || window.scrollY > 0) { ptrTracking = false; return; }
        ptrStartY = e.touches[0].clientY;
        ptrTracking = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!ptrTracking || ptrRefreshing) return;
        const deltaY = e.touches[0].clientY - ptrStartY;
        if (deltaY <= 0 || window.scrollY > 0) {
            indicator.classList.remove('visible', 'ready');
            indicator.style.transform = 'translate(-50%, -60px)';
            ptrTracking = false;
            return;
        }

        // Resistance supaya tidak langsung "nempel" ke jari - kesan lebih alami.
        const pulled = Math.min(deltaY * 0.45, 90);

        indicator.classList.add('visible');
        indicator.style.transform = `translate(-50%, ${pulled - 60}px)`;

        const ready = pulled >= PTR_THRESHOLD;
        indicator.classList.toggle('ready', ready);
        document.getElementById('ptrText').textContent = ready ? 'Lepas untuk refresh' : 'Tarik untuk refresh';
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (!ptrTracking) return;
        ptrTracking = false;

        if (indicator.classList.contains('ready')) {
            triggerPullRefresh(indicator);
        } else {
            indicator.classList.remove('visible', 'ready');
            indicator.style.transform = 'translate(-50%, -60px)';
        }
    }, { passive: true });
}

async function triggerPullRefresh(indicator) {
    ptrRefreshing = true;
    indicator.classList.add('spinning');
    indicator.style.transform = 'translate(-50%, 14px)';
    document.getElementById('ptrText').textContent = 'Memperbarui…';

    try {
        await ensureDataLoaded(true);
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) runTabDataLoaders(activeTab.id);
        await loadPrayerTimes();
        document.getElementById('ptrText').textContent = 'Data terbaru dimuat';
    } catch (err) {
        console.error('Pull-to-refresh gagal:', err);
        document.getElementById('ptrText').textContent = 'Gagal memperbarui data';
    }

    setTimeout(() => {
        indicator.classList.remove('visible', 'ready', 'spinning');
        indicator.style.transform = 'translate(-50%, -60px)';
        ptrRefreshing = false;
    }, 700);
}

// ===== UPLOAD =====
let selectedFileData = null;

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function updateAmountHint() {
    const val = parseInt(document.getElementById('uploadAmount').value);
    const hint = document.getElementById('amountHint');
    hint.innerHTML = val > 0 ? 'Rp ' + val.toLocaleString('id-ID') : '&nbsp;';
    hint.style.color = 'var(--emerald-2)';
}

// Google Sheets punya batas KERAS 50.000 karakter per sel (bukan batas
// ukuran file, tapi batas produk Google Sheets sendiri - kalau dilewati,
// baris gagal tersimpan atau datanya kepotong diam-diam). Ini alasan utama
// kenapa upload bukti transfer "sering gagal" walau file kelihatan kecil
// (di bawah 1MB): begitu diubah ke base64 ukurannya naik ~33%, jadi file
// yang tampak kecil pun gampang melebihi 50.000 karakter itu, apalagi untuk
// foto dengan banyak detail/teks (screenshot struk transfer) atau PDF yang
// sama sekali tidak dikompres. Sisakan margin aman di bawah batas keras.
const SHEETS_CELL_SAFE_LIMIT = 45000;

function renderImageToJpeg(img, maxDim, quality) {
    let width = img.width;
    let height = img.height;
    if (width > height) {
        if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
    } else {
        if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
}

// Kompresi ADAPTIF: coba beberapa kombinasi ukuran/kualitas, turun bertahap,
// sampai hasil base64-nya muat di bawah SHEETS_CELL_SAFE_LIMIT. Ini beda
// dari versi lama yang cuma kompres SEKALI dengan setelan tetap (800px,
// quality 0.8) - untuk foto detail/resolusi tinggi (mis. screenshot struk
// transfer bank), hasil kompresi sekali itu masih sering kelewat besar.
function compressImage(base64Data, callback, onFail) {
    const img = new Image();
    img.onload = function () {
        const attempts = [
            { maxDim: 800, quality: 0.8 },
            { maxDim: 800, quality: 0.6 },
            { maxDim: 600, quality: 0.6 },
            { maxDim: 600, quality: 0.45 },
            { maxDim: 450, quality: 0.4 },
            { maxDim: 350, quality: 0.35 },
            { maxDim: 280, quality: 0.3 }
        ];

        let smallest = null;
        for (const attempt of attempts) {
            const candidate = renderImageToJpeg(img, attempt.maxDim, attempt.quality);
            if (!smallest || candidate.length < smallest.length) smallest = candidate;
            if (candidate.length <= SHEETS_CELL_SAFE_LIMIT) {
                callback(candidate);
                return;
            }
        }

        // Sudah dikompres habis-habisan tapi tetap kelewat besar - biarkan
        // pemanggil kasih tahu user, jangan dipaksa upload (nanti gagal
        // tersimpan tanpa pesan yang jelas).
        if (typeof onFail === 'function') onFail(smallest);
    };
    img.onerror = function () {
        if (typeof onFail === 'function') onFail(null);
    };
    img.src = base64Data;
}

function previewFile() {
    const input = document.getElementById('uploadFile');
    const file = input.files[0];
    const preview = document.getElementById('filePreview');
    const error = document.getElementById('fileError');

    error.textContent = '';
    preview.innerHTML = '';
    selectedFileData = null;

    if (!file) return;

    // Ini cuma filter kasar di awal (tolak file yang jelas kebesaran sebelum
    // buang waktu baca/proses). Untuk gambar, batas SEBENARNYA yang berlaku
    // adalah SHEETS_CELL_SAFE_LIMIT di atas (setelah dikompres). Untuk PDF,
    // batas itu dicek langsung di bawah karena PDF tidak dikompres.
    if (file.size > 8 * 1024 * 1024) {
        error.textContent = `File terlalu besar (${formatBytes(file.size)}). Maksimal sekitar 8 MB (foto akan otomatis dikompres).`;
        input.value = '';
        return;
    }

    const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
    if (!allowed.includes(file.type)) {
        error.textContent = 'Tipe file tidak didukung. Gunakan PNG, JPG, atau PDF.';
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Data = e.target.result;

        // Jika gambar, compress dulu secara adaptif sampai muat di batas
        // sel Google Sheets (lihat komentar SHEETS_CELL_SAFE_LIMIT di atas).
        if (file.type.startsWith('image/')) {
            compressImage(base64Data, function(compressedBase64) {
                selectedFileData = {
                    name: file.name,
                    type: 'image/jpeg',  // Ubah ke JPEG setelah compress
                    size: file.size,
                    data: compressedBase64  // Compressed Base64
                };

                const chip = `
                    <div class="file-chip">
                      <div class="meta">
                        <div class="fname">${file.name}</div>
                        <div class="fsize">${formatBytes(file.size)}</div>
                      </div>
                      <button class="file-remove" onclick="removeFile()" title="Hapus file">&times;</button>
                    </div>`;

                preview.innerHTML = chip + `<img src="${compressedBase64}" class="preview-image" alt="Pratinjau bukti transfer" style="margin-top:12px;">`;
            }, function() {
                // Sudah dikompres maksimal tapi tetap kelewat besar (jarang
                // terjadi, biasanya foto sangat detail/resolusi ekstrem).
                selectedFileData = null;
                error.textContent = 'Foto ini terlalu detail untuk disimpan walau sudah dikompres maksimal. Coba foto ulang lebih dekat/sederhana, atau kirim potongan bagian penting saja.';
                input.value = '';
            });
        } else {
            // PDF tidak bisa dikompres di browser, jadi base64-nya harus
            // sudah muat DARI AWAL. PDF hasil scan/print biasanya jauh lebih
            // besar dari foto dengan konten yang sama, jadi ini yang paling
            // sering jadi penyebab "upload gagal padahal file kecil".
            if (base64Data.length > SHEETS_CELL_SAFE_LIMIT) {
                selectedFileData = null;
                error.textContent = `File PDF ini terlalu besar untuk disimpan (perlu di bawah ~${formatBytes(Math.floor(SHEETS_CELL_SAFE_LIMIT * 3 / 4))} setelah encoding). Silakan screenshot/foto bukti transfernya saja lalu upload sebagai JPG/PNG - foto otomatis dikompres oleh aplikasi.`;
                input.value = '';
                return;
            }

            selectedFileData = {
                name: file.name,
                type: file.type,
                size: file.size,
                data: base64Data
            };

            const chip = `
                <div class="file-chip">
                  <div class="meta">
                    <div class="fname">${file.name}</div>
                    <div class="fsize">${formatBytes(file.size)}</div>
                  </div>
                  <button class="file-remove" onclick="removeFile()" title="Hapus file">&times;</button>
                </div>`;

            preview.innerHTML = chip;
        }
    };
    reader.readAsDataURL(file);
}

function removeFile() {
    document.getElementById('uploadFile').value = '';
    document.getElementById('filePreview').innerHTML = '';
    document.getElementById('fileError').textContent = '';
    selectedFileData = null;
}

function resetUploadForm() {
    document.getElementById('uploadAmount').value = '';
    document.getElementById('uploadDate').valueAsDate = new Date();
    document.getElementById('uploadBank').value = '';
    document.getElementById('uploadNotes').value = '';
    document.getElementById('amountHint').innerHTML = '&nbsp;';
    removeFile();
}

function initFileDropzone() {
    const drop = document.getElementById('fileDrop');
    if (!drop) return;

    ['dragenter', 'dragover'].forEach(evt =>
        drop.addEventListener(evt, e => {
            e.preventDefault();
            drop.classList.add('dragover');
        })
    );
    ['dragleave', 'drop'].forEach(evt =>
        drop.addEventListener(evt, e => {
            e.preventDefault();
            drop.classList.remove('dragover');
        })
    );
    drop.addEventListener('drop', e => {
        if (e.dataTransfer.files.length) {
            document.getElementById('uploadFile').files = e.dataTransfer.files;
            previewFile();
        }
    });
}

async function submitUpload() {
    const amount = parseInt(document.getElementById('uploadAmount').value);
    const date = document.getElementById('uploadDate').value;
    const bank = document.getElementById('uploadBank').value;
    const notes = document.getElementById('uploadNotes').value.trim();
    const btn = document.getElementById('submitUploadBtn');

    if (!amount || amount <= 0) {
        showAlert('Nominal transfer harus diisi', 'error');
        return;
    }
    if (!date) {
        showAlert('Tanggal transfer harus diisi', 'error');
        return;
    }
    if (!bank) {
        showAlert('Bank asal harus dipilih', 'error');
        return;
    }
    if (!selectedFileData) {
        showAlert('Bukti transfer harus diunggah', 'error');
        return;
    }

    // Notif WA ke Bendahara SEBELUM await simpan manapun (sinkron, lihat
    // catatan panjang di openWaTo()) - semua data pesan (nominal, tanggal,
    // bank, nama pengirim) sudah diketahui dari form ini, tidak perlu
    // nunggu server. Bendahara yang tekan Kirim sendiri di WhatsApp-nya.
    const bendaharaPhone = findOfficerPhone(appData.members, ['bendum2', 'ketua1']);
    if (bendaharaPhone) {
        const uploadMsg = `Assalamu'alaikum Bendahara, ada bukti transfer baru! 💰

Dari: ${currentUser.name}
Nominal: Rp ${amount.toLocaleString('id-ID')}
Tanggal transfer: ${date}
Bank: ${bank}

Periksa menu "Verifikasi Tabungan" di aplikasi untuk proses lebih lanjut.
🔗 ${APP_CONFIG.appUrl}`;
        openWaTo(bendaharaPhone, uploadMsg);
    }

    btn.disabled = true;
    btn.textContent = 'Mengirim…';

    const newId = appData.savings.length > 0
        ? Math.max(...appData.savings.map(s => s.id)) + 1
        : 1;

    const savingData = {
        id: newId,
        memberId: currentUser.id,
        amount: amount,
        transferDate: date,
        bankSource: bank,
        accountName: currentUser.name,
        fileUrl: selectedFileData.name,
        fileData: selectedFileData.data,  // Base64 data URL
        status: 'PENDING',
        uploadedAt: new Date().toISOString(),
        approvedAt: '',
        approvedBy: '',
        notes: notes
    };

    const success = await appendSheetDB('Savings', savingData);

    btn.disabled = false;
    btn.textContent = 'Kirim Bukti untuk Verifikasi';

    if (success) {
        appData.savings.push(savingData);

        // Notifikasi WA ke Bendahara sudah dibuka di atas (sebelum simpan) -
        // di sini cukup catatan kalau ternyata nomornya tidak ketemu sama
        // sekali (bukan error kirim, tapi memang belum ada Bendahara terdaftar).
        if (!bendaharaPhone) {
            console.warn('Nomor Bendahara/admin tidak ditemukan - notifikasi WA upload tidak terkirim');
        }

        showAlert(`Bukti transfer Rp ${amount.toLocaleString('id-ID')} berhasil dikirim untuk verifikasi`, 'success');
        resetUploadForm();
        updateDashboard();
    }
}

// ===== SURVEY SAPI =====
// State foto (base64, sudah dikompres) untuk 5 slot - index 0..4 = foto1..foto5.
// Dipakai bareng compressImage()/renderImageToJpeg() yang sama dengan upload
// bukti transfer, supaya tiap foto tetap muat di batas sel Google Sheets
// (lihat komentar SHEETS_CELL_SAFE_LIMIT di atas).
let selectedSurveyFotos = [null, null, null, null, null];
let surveyLocationData = { latitude: '', longitude: '', alamat: '' };
let surveyLocationLoading = false;

// Dipanggil tiap kali tab Survey Sapi dibuka. Set tanggal default ke hari ini
// (kalau kosong) dan otomatis ambil lokasi GPS sekali per kunjungan tab -
// tidak diulang tiap kali kalau lokasi sudah berhasil didapat sebelumnya,
// supaya tidak minta izin lokasi berkali-kali ke user.
function initSurveyForm() {
    const dateInput = document.getElementById('surveyDate');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
    }
    if (!surveyLocationData.latitude && !surveyLocationLoading) {
        captureSurveyLocation();
    }
    updateSurveyKalkulasi();
}

// Ambil koordinat GPS perangkat lewat Geolocation API browser, lalu reverse-
// geocode ke alamat yang bisa dibaca manusia lewat OpenStreetMap Nominatim
// (gratis, tanpa API key - sama semangatnya dengan pemilihan api.myquran.com
// buat jadwal sholat). Kalau reverse geocode gagal (mis. tidak ada koneksi
// atau limit rate), tetap simpan koordinat mentahnya - itu yang terpenting.
function captureSurveyLocation() {
    const statusEl = document.getElementById('surveyLocationStatus');
    const coordsEl = document.getElementById('surveyLocationCoords');
    const addressEl = document.getElementById('surveyLocationAddress');
    if (!statusEl) return;

    if (!navigator.geolocation) {
        statusEl.textContent = 'Perangkat/browser ini tidak mendukung GPS';
        return;
    }

    surveyLocationLoading = true;
    statusEl.textContent = 'Mengambil lokasi…';
    coordsEl.textContent = '—';
    addressEl.textContent = '—';

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            surveyLocationData.latitude = lat;
            surveyLocationData.longitude = lon;
            coordsEl.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
            statusEl.textContent = '✅ Lokasi didapat';

            try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=0`);
                const data = await resp.json();
                surveyLocationData.alamat = data && data.display_name ? data.display_name : '';
                addressEl.textContent = surveyLocationData.alamat || '(alamat tidak ditemukan, koordinat tetap tersimpan)';
            } catch (e) {
                console.warn('Reverse geocode gagal, pakai koordinat saja:', e);
                addressEl.textContent = '(gagal ambil nama alamat, koordinat tetap tersimpan)';
            }
            surveyLocationLoading = false;
        },
        (err) => {
            surveyLocationLoading = false;
            statusEl.textContent = `❌ Gagal ambil lokasi (${err.message || 'izin ditolak'})`;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
}

// Rumus pembagian qurban 1 ekor sapi = 7 bagian/peserta. DIPAKAI BERSAMA oleh
// form input (live preview), tabel admin, dan kartu anggota - supaya kalau
// rumus berubah, cukup edit di satu tempat ini saja.
//   Iuran per peserta   = (Harga / 7) + Biaya Pengolahan
//   Estimasi Daging     = Berat sapi x 0,5 (karkas) x 0,6 (daging dari karkas)
//   Hak Mudhohi         = (Estimasi Daging / 3) / 7   -> per 1/7 bagian
//   Share Warga         = (Estimasi Daging / 3) x 2
//
// Estimasi bagian LAIN (non-daging) - "kalkulator distribusi bagian sapi".
// Persentase dari BERAT HIDUP sapi, dirujuk dari sumber Dinas Pertanian
// (dispertan.bantenprov.go.id, "Cara Praktis Menghitung Daging Qurban") utk
// tulang/jeroan/kepala/buntut, dan estimasi umum industri utk kulit (tidak
// ada rujukan qurban spesifik). SEMUA ini estimasi kasar (bukan hasil
// timbang aktual) - dipakai sbg perkiraan perencanaan panitia, sama
// semangatnya dgn Estimasi Daging di atas yang juga rumus perkiraan, BUKAN
// diubah/dikurangi dari Estimasi Daging yang sudah ada (tetap dihitung
// terpisah/independen, sesuai permintaan "daging tetep seperti sekarang").
//   Tulang   = Berat sapi x 0,15  (karkas 50% - daging resmi 35% = tulang 15%)
//   Jeroan   = Berat sapi x 0,05  (10% dari karkas 50%)
//   Kulit    = Berat sapi x 0,07  (estimasi umum industri kulit sapi 6-8%)
//   Kepala   = Berat sapi x 0,04
//   Kaki     = Berat sapi x 0,013 (4 kaki, ~4,5kg utk sapi 350kg)
//   Buntut   = Berat sapi x 0,007
function computeSurveyKalkulasi(berat, harga, biayaPengolahan) {
    const b = Number(berat) || 0;
    const h = Number(harga) || 0;
    const bp = Number(biayaPengolahan) || 0;
    const iuran = (h / 7) + bp;
    const estimasiDaging = b * 0.5 * 0.6;
    const hakMudhohi = (estimasiDaging / 3) / 7;
    const shareWarga = (estimasiDaging / 3) * 2;
    const estimasiTulang = b * 0.15;
    const estimasiJeroan = b * 0.05;
    const estimasiKulit = b * 0.07;
    const estimasiKepala = b * 0.04;
    const estimasiKaki = b * 0.013;
    const estimasiBuntut = b * 0.007;
    return {
        iuran, estimasiDaging, hakMudhohi, shareWarga,
        estimasiTulang, estimasiJeroan, estimasiKulit, estimasiKepala, estimasiKaki, estimasiBuntut
    };
}

function formatKg(n) {
    return (Math.round(n * 10) / 10).toLocaleString('id-ID') + ' kg';
}

// Rekap status pembayaran peserta "Daftar Langsung" (Qurban Instan),
// menggabungkan 2 sumber kebenaran secara OR supaya data lama tetap valid:
//  1) statusBayar === 'lunas' - flag manual lama, ditoggle admin sebelum
//     fitur cicilan ada (togglePembayaranInstan()). Dibiarkan tetap berlaku
//     apa adanya (peserta lama yg sudah ditandai Lunas TIDAK berubah jadi
//     "belum lunas" gara2 fitur ini).
//  2) total setoran SetoranInstan berstatus APPROVED >= total iuran - jalur
//     BARU, dari 1+ cicilan yg diverifikasi admin di tab Verifikasi.
// iuranOverride opsional (kalau pemanggil sudah pernah hitung computeSurveyKalkulasi
// utk survey yg sama, hindari hitung ulang).
function pesertaInstanBayarSummary(peserta, iuranOverride) {
    let totalIuran = iuranOverride;
    if (totalIuran === undefined || totalIuran === null) {
        const survey = appData.surveySapi.find(s => s.id === peserta.surveyId);
        const k = survey ? computeSurveyKalkulasi(survey.berat, survey.harga, survey.biayaPengolahan) : null;
        totalIuran = k ? Math.round(k.iuran) : 0;
    }
    const setoran = (appData.setoranInstan || []).filter(s => s.pesertaId === peserta.id);
    const totalApproved = setoran.filter(s => s.status === 'APPROVED').reduce((sum, s) => sum + (Number(s.nominal) || 0), 0);
    const totalPending = setoran.filter(s => s.status === 'PENDING').reduce((sum, s) => sum + (Number(s.nominal) || 0), 0);
    const lunasManual = peserta.statusBayar === 'lunas';
    const lunasCicilan = totalIuran > 0 && totalApproved >= totalIuran;
    const lunas = lunasManual || lunasCicilan;
    const sisa = Math.max(totalIuran - totalApproved, 0);
    return { totalIuran, totalApproved, totalPending, lunas, lunasManual, lunasCicilan, sisa, setoran };
}

function updateSurveyKalkulasi() {
    const hargaVal = parseInt(document.getElementById('surveyHarga').value) || 0;
    const beratVal = parseInt(document.getElementById('surveyBerat').value) || 0;
    const biayaVal = parseInt(document.getElementById('surveyBiayaPengolahan').value) || 0;

    const hint = document.getElementById('surveyHargaHint');
    hint.innerHTML = hargaVal > 0 ? 'Rp ' + hargaVal.toLocaleString('id-ID') : '&nbsp;';
    hint.style.color = 'var(--emerald-2)';

    const k = computeSurveyKalkulasi(beratVal, hargaVal, biayaVal);
    document.getElementById('surveyKalkIuran').textContent = 'Rp ' + Math.round(k.iuran).toLocaleString('id-ID');
    document.getElementById('surveyKalkDaging').textContent = formatKg(k.estimasiDaging);
    document.getElementById('surveyKalkMudhohi').textContent = formatKg(k.hakMudhohi);
    document.getElementById('surveyKalkWarga').textContent = formatKg(k.shareWarga);
}

function surveyFotoSlotEmptyHtml(idx) {
    return `
        <div class="slot-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg>
          <span>Foto ${idx}</span>
        </div>`;
}

// Pakai ulang compressImage() yang sama dengan upload bukti transfer supaya
// tiap foto otomatis dikompres adaptif sampai muat di bawah batas sel Sheets.
function previewSurveyFoto(idx) {
    const input = document.getElementById('surveyFoto' + idx);
    const slot = document.getElementById('surveyFotoSlot' + idx);
    const error = document.getElementById('surveyFotoError');
    const file = input.files[0];
    if (!file) return;

    error.textContent = '';

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
        error.textContent = 'Foto harus PNG atau JPG.';
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        compressImage(e.target.result, function (compressedBase64) {
            selectedSurveyFotos[idx - 1] = compressedBase64;
            slot.innerHTML = `
                <input type="file" id="surveyFoto${idx}" accept="image/png,image/jpeg" capture="environment" onchange="previewSurveyFoto(${idx})">
                <img src="${compressedBase64}" alt="Foto sapi ${idx}">
                <button type="button" class="slot-remove" onclick="removeSurveyFoto(event, ${idx})" title="Hapus foto">&times;</button>`;
        }, function () {
            error.textContent = `Foto ${idx} terlalu detail untuk disimpan walau sudah dikompres maksimal. Coba foto ulang lebih sederhana.`;
            input.value = '';
        });
    };
    reader.readAsDataURL(file);
}

function removeSurveyFoto(evt, idx) {
    if (evt) evt.stopPropagation();
    selectedSurveyFotos[idx - 1] = null;
    const slot = document.getElementById('surveyFotoSlot' + idx);
    slot.innerHTML = `
        <input type="file" id="surveyFoto${idx}" accept="image/png,image/jpeg" capture="environment" onchange="previewSurveyFoto(${idx})">
        ${surveyFotoSlotEmptyHtml(idx)}`;
}

async function submitSurveySapi() {
    const tanggal = document.getElementById('surveyDate').value;
    const supplier = document.getElementById('surveySupplier').value.trim();
    const jenis = document.getElementById('surveyJenis').value;
    const berat = parseInt(document.getElementById('surveyBerat').value);
    const harga = parseInt(document.getElementById('surveyHarga').value);
    const biayaPengolahan = parseInt(document.getElementById('surveyBiayaPengolahan').value) || 0;
    const btn = document.getElementById('submitSurveyBtn');

    if (!tanggal) { showAlert('Tanggal survey harus diisi', 'error'); return; }
    if (!supplier) { showAlert('Nama supplier harus diisi', 'error'); return; }
    if (!jenis) { showAlert('Jenis sapi harus dipilih', 'error'); return; }
    if (!berat || berat <= 0) { showAlert('Berat sapi harus diisi', 'error'); return; }
    if (!harga || harga <= 0) { showAlert('Harga harus diisi', 'error'); return; }
    if (!selectedSurveyFotos.some(f => f)) { showAlert('Minimal 1 foto sapi harus diunggah', 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'Menyimpan…';

    const newId = appData.surveySapi.length > 0
        ? Math.max(...appData.surveySapi.map(s => s.id)) + 1
        : 1;

    const record = {
        id: newId,
        tanggal: tanggal,
        supplier: supplier,
        latitude: surveyLocationData.latitude || '',
        longitude: surveyLocationData.longitude || '',
        alamat: surveyLocationData.alamat || '',
        jenisSapi: jenis,
        berat: berat,
        harga: harga,
        biayaPengolahan: biayaPengolahan,
        foto1: selectedSurveyFotos[0] || '',
        foto2: selectedSurveyFotos[1] || '',
        foto3: selectedSurveyFotos[2] || '',
        foto4: selectedSurveyFotos[3] || '',
        foto5: selectedSurveyFotos[4] || '',
        createdBy: currentUser ? currentUser.name : '',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('SurveySapi', record);

    btn.disabled = false;
    btn.textContent = 'Simpan Survey';

    if (success) {
        appData.surveySapi.unshift({
            id: newId,
            tanggal: record.tanggal,
            supplier: record.supplier,
            latitude: record.latitude,
            longitude: record.longitude,
            alamat: record.alamat,
            jenisSapi: record.jenisSapi,
            berat: record.berat,
            harga: record.harga,
            biayaPengolahan: record.biayaPengolahan,
            hasFoto1: !!record.foto1,
            hasFoto2: !!record.foto2,
            hasFoto3: !!record.foto3,
            hasFoto4: !!record.foto4,
            hasFoto5: !!record.foto5,
            createdBy: record.createdBy,
            created_date: record.created_date
        });
        showAlert('Survey sapi berhasil disimpan', 'success');
        resetSurveyForm();
        loadSurveySapiTable();
    }
}

function resetSurveyForm() {
    document.getElementById('surveySupplier').value = '';
    document.getElementById('surveyJenis').value = '';
    document.getElementById('surveyBerat').value = '';
    document.getElementById('surveyHarga').value = '';
    document.getElementById('surveyBiayaPengolahan').value = '';
    updateSurveyKalkulasi();
    document.getElementById('surveyFotoError').textContent = '';
    selectedSurveyFotos = [null, null, null, null, null];
    for (let i = 1; i <= 5; i++) {
        const slot = document.getElementById('surveyFotoSlot' + i);
        if (slot) {
            slot.innerHTML = `
                <input type="file" id="surveyFoto${i}" accept="image/png,image/jpeg" capture="environment" onchange="previewSurveyFoto(${i})">
                ${surveyFotoSlotEmptyHtml(i)}`;
        }
    }
    // Tanggal & lokasi SENGAJA tidak direset - survey berikutnya biasanya
    // masih di hari & lokasi yang sama (satu kali kunjungan ke supplier bisa
    // survey beberapa ekor sapi sekaligus).
}

function jenisSapiLabel(jenis) {
    const map = { 'Bali': 'Bali', 'Limousin': 'Limousin', 'PO': 'PO (Peranakan Ongole)', 'Brahman': 'Brahman' };
    return map[jenis] || jenis || '—';
}

// Identitas ringkas tiap survey buat dipakai di tabel admin, kartu anggota,
// judul modal foto, dan resume peserta - pakai ID langsung (stabil, unik)
// bukan nomor urut tampilan supaya tidak berubah kalau urutan list berubah.
function surveyKode(s) {
    return 'Survey#' + s.id;
}

// 1 ekor sapi qurban = 7 bagian/peserta (sama patokannya dengan rumus Iuran =
// Harga/7) - dipakai buat batasi jumlah "Ikut" per grup sapi.
const SURVEY_MAX_PESERTA = 7;

// Pindah antar sub-tab (Tambah Survey/Riwayat Survey/Resume Peserta) di tab
// Survey Sapi - sama pola dengan switchKeuanganTab()/switchDistribusiTab().
// Cuma admin yang punya pill-tabs (anggota cuma 1 konten, tidak perlu tab).
const SURVEY_TAB_PANEL_IDS = { form: 'surveyFormTab', riwayat: 'surveyRiwayatTab', resume: 'surveyResumeTab' };
function switchSurveyTab(tabName, btn) {
    const container = document.getElementById('surveySapiAdminSection');
    if (!container) return;

    container.querySelectorAll('.sub-tab-content').forEach(tab => tab.style.display = 'none');
    const panelId = SURVEY_TAB_PANEL_IDS[tabName];
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel) panel.style.display = 'block';

    container.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// Angka hero card (Jumlah Sapi/Total Berat/Peserta Terdaftar/Sisa Kuota) -
// dihitung sekali, dipakai buat isi hero admin & anggota sekaligus (angkanya
// sama, cuma beda tempat tampil).
function renderSurveyHero() {
    const heroTotal = document.getElementById('surveyHeroTotal');
    if (!heroTotal) return;

    const jumlahSapi = appData.surveySapi.length;
    const totalBerat = appData.surveySapi.reduce((sum, s) => sum + (s.berat || 0), 0);
    const totalPeserta = appData.surveyPeserta.filter(p => p.status !== 'batal').length;
    const kuotaMax = jumlahSapi * SURVEY_MAX_PESERTA;
    const sisaKuota = Math.max(0, kuotaMax - totalPeserta);

    ['', 'Member'].forEach(suffix => {
        const totalEl = document.getElementById('surveyHeroTotal' + suffix);
        if (!totalEl) return;
        totalEl.textContent = `${jumlahSapi.toLocaleString('id-ID')} Sapi`;
        document.getElementById('surveyHeroBerat' + suffix).textContent = `${totalBerat.toLocaleString('id-ID')} kg`;
        document.getElementById('surveyHeroPeserta' + suffix).textContent = `${totalPeserta.toLocaleString('id-ID')} / ${kuotaMax.toLocaleString('id-ID')}`;
        document.getElementById('surveyHeroSisaKuota' + suffix).textContent = `${sisaKuota.toLocaleString('id-ID')} slot`;
    });
}

// Tabungan yang "sudah disetor" = total Savings berstatus APPROVED milik
// anggota tsb - sama definisinya dipakai di Laporan/Verifikasi (savings
// PENDING belum dihitung karena belum diverifikasi admin). Dipakai bersama
// oleh resume admin & kartu anggota supaya angkanya selalu konsisten.
function memberApprovedSavings(memberId) {
    return appData.savings
        .filter(sv => sv.memberId === memberId && sv.status === 'APPROVED')
        .reduce((sum, sv) => sum + sv.amount, 0);
}

function loadSurveySapiTable() {
    const tbody = document.getElementById('surveySapiTableBody');
    if (!tbody) return;

    if (appData.surveySapi.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Belum ada data survey</td></tr>';
        return;
    }

    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');

    tbody.innerHTML = appData.surveySapi.map(s => {
        const fotoCount = [s.hasFoto1, s.hasFoto2, s.hasFoto3, s.hasFoto4, s.hasFoto5].filter(Boolean).length;
        const lokasiCell = s.latitude && s.longitude
            ? `<a href="https://www.google.com/maps?q=${s.latitude},${s.longitude}" target="_blank" rel="noopener" style="color:var(--emerald-2);">📍 Lihat Peta</a>`
            : '<span style="color:var(--ink-faint);">—</span>';
        const fotoCell = fotoCount > 0
            ? `<button class="btn btn-ghost btn-small" onclick="viewSurveyFotos(${s.id})">🖼️ ${fotoCount} foto</button>`
            : '<span style="color:var(--ink-faint);">—</span>';
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        const jumlahPeserta = activePeserta.filter(p => p.surveyId === s.id).length;
        const pesertaColor = jumlahPeserta >= SURVEY_MAX_PESERTA ? 'var(--brick)' : 'var(--emerald-2)';
        return `
            <tr>
              <td><strong>${surveyKode(s)}</strong></td>
              <td>${s.tanggal || '—'}</td>
              <td>${s.supplier || '—'}</td>
              <td>${jenisSapiLabel(s.jenisSapi)}</td>
              <td>${s.berat ? s.berat + ' kg' : '—'}</td>
              <td>${s.harga ? 'Rp ' + s.harga.toLocaleString('id-ID') : '—'}</td>
              <td>${s.biayaPengolahan ? 'Rp ' + s.biayaPengolahan.toLocaleString('id-ID') : '—'}</td>
              <td>Rp ${Math.round(k.iuran).toLocaleString('id-ID')}</td>
              <td style="color:${pesertaColor}; font-weight:600;">${jumlahPeserta}/${SURVEY_MAX_PESERTA}</td>
              <td>${lokasiCell}</td>
              <td>${fotoCell}</td>
            </tr>`;
    }).join('');
}

// Ringkasan admin: tiap grup sapi + daftar nama peserta yang sudah "Ikut" -
// dipakai buat lihat sekilas grup mana yang sudah penuh/butuh diisi lagi,
// mirip semangatnya dengan ringkasan per-anggota di menu Laporan (tabungan).
function loadSurveySapiResume() {
    const container = document.getElementById('surveySapiResumeList');
    if (!container) return;

    if (appData.surveySapi.length === 0) {
        container.innerHTML = '<p style="color:var(--ink-faint);">Belum ada data survey sapi.</p>';
        return;
    }

    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');

    container.innerHTML = appData.surveySapi.map(s => {
        const peserta = activePeserta.filter(p => p.surveyId === s.id);
        const penuh = peserta.length >= SURVEY_MAX_PESERTA;
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        const iuranPerOrang = Math.round(k.iuran);

        const rows = peserta.map(p => {
            // Peserta 'instan' (Daftar Langsung, tanpa menabung) tidak punya
            // riwayat Tabungan sama sekali - kolom Tabungan/Kekurangan tidak
            // relevan (bukan berarti "kurang bayar" krn memang bayarnya
            // langsung penuh belakangan, bukan dicicil). Tampilkan status +
            // tombol WA follow-up sbg gantinya.
            if (p.tipe === 'instan') {
                // Status gabungan manual-lama + cicilan-baru, lihat
                // pesertaInstanBayarSummary(). "Sebagian" (cicilan berjalan,
                // belum lunas) adalah status BARU yang tidak ada sebelum
                // fitur ini - dulu cuma biner Lunas/Belum.
                const sum = pesertaInstanBayarSummary(p, iuranPerOrang);
                const lunas = sum.lunas;
                const statusLabel = lunas
                    ? '✓ Lunas'
                    : (sum.totalApproved > 0
                        ? `Cicilan Rp ${sum.totalApproved.toLocaleString('id-ID')} · Sisa Rp ${sum.sisa.toLocaleString('id-ID')}`
                        : 'Belum dikonfirmasi');
                return `
                    <tr>
                      <td>${p.atasNama || p.memberName} <span class="badge-instan" title="Daftar langsung, tanpa menabung">Langsung</span>
                        <div style="font-size:11px;color:var(--ink-faint);font-weight:400;">
                          ${p.atasNama ? `Pendaftar: ${p.memberName} · ` : ''}${p.alamat || ''}
                        </div>
                      </td>
                      <td colspan="2">
                        Total iuran Rp ${iuranPerOrang.toLocaleString('id-ID')}
                        <div style="margin-top:2px;color:${lunas ? 'var(--emerald-2)' : 'var(--brick)'}; font-weight:600;">${statusLabel}</div>
                        ${sum.totalPending > 0 ? `<div style="margin-top:2px;color:var(--gold);font-weight:600;">⏳ Menunggu verifikasi Rp ${sum.totalPending.toLocaleString('id-ID')}</div>` : ''}
                      </td>
                      <td style="white-space:nowrap;">
                        <button class="btn btn-ghost btn-small" onclick="waFollowUpInstan(${p.id})" title="Hubungi via WhatsApp">💬 WA</button>
                        ${sum.setoran.length > 0 ? `<button class="btn btn-ghost btn-small" onclick="lihatRiwayatCicilanInstan(${p.id})" style="margin-left:4px;" title="Lihat riwayat cicilan">📋 Cicilan (${sum.setoran.length})</button>` : ''}
                        ${p.hasBuktiBayar ? `<button class="btn btn-ghost btn-small" onclick="showBuktiBayarInstan(${p.id})" style="margin-left:4px;" title="Lihat foto bukti transfer (lama)">🖼 Bukti Lama</button>` : ''}
                        <button class="btn btn-small ${lunas ? 'btn-ghost' : 'btn-success'}" onclick="togglePembayaranInstan(${p.id})" style="margin-left:4px;" title="Override manual, di luar cicilan">${lunas ? 'Batalkan Lunas' : 'Tandai Lunas'}</button>
                      </td>
                    </tr>`;
            }
            const tabungan = memberApprovedSavings(p.memberId);
            const kurang = Math.max(iuranPerOrang - tabungan, 0);
            const lunas = kurang === 0;
            return `
                <tr>
                  <td>${p.memberName}</td>
                  <td>Rp ${tabungan.toLocaleString('id-ID')}</td>
                  <td>Rp ${iuranPerOrang.toLocaleString('id-ID')}</td>
                  <td style="color:${lunas ? 'var(--emerald-2)' : 'var(--brick)'}; font-weight:600;">${lunas ? '✓ Lunas' : 'Rp ' + kurang.toLocaleString('id-ID')}</td>
                </tr>`;
        }).join('');

        // Total tabungan/kekurangan cuma dihitung dari peserta tipe 'tabungan'
        // - peserta 'instan' sengaja tidak ikut dijumlah di sini (mereka bayar
        // penuh terpisah, belum tentu lewat sheet Savings sama sekali).
        const pesertaTabungan = peserta.filter(p => p.tipe !== 'instan');
        const totalTerkumpul = pesertaTabungan.reduce((sum, p) => sum + memberApprovedSavings(p.memberId), 0);
        const totalKebutuhan = iuranPerOrang * pesertaTabungan.length;
        const totalKurang = Math.max(totalKebutuhan - totalTerkumpul, 0);
        const pesertaInstan = peserta.filter(p => p.tipe === 'instan');
        const jumlahInstan = pesertaInstan.length;
        const jumlahInstanLunas = pesertaInstan.filter(p => pesertaInstanBayarSummary(p, iuranPerOrang).lunas).length;

        const tableOrEmpty = peserta.length > 0
            ? `<div class="table-container" style="margin-top:10px;">
                 <table>
                   <thead><tr><th>Nama</th><th>Tabungan Disetor</th><th>Iuran</th><th>Kekurangan</th></tr></thead>
                   <tbody>${rows}</tbody>
                 </table>
               </div>`
            : '<p style="color:var(--ink-faint); font-size:12.5px; margin-top:10px;">Belum ada yang ikut.</p>';

        return `
            <div class="survey-member-card">
              <div class="survey-member-card-head">
                <div>
                  <div class="survey-member-card-title">${surveyKode(s)} · ${s.supplier || '—'} · ${jenisSapiLabel(s.jenisSapi)}</div>
                  <div class="survey-member-card-sub">Survey ${s.tanggal || '—'} · Iuran Rp ${iuranPerOrang.toLocaleString('id-ID')}/peserta</div>
                </div>
                <span class="survey-participant-chip" style="background:${penuh ? 'var(--gold-tint)' : 'var(--emerald-tint)'}; color:${penuh ? 'var(--gold)' : 'var(--emerald-2)'};">
                  ${penuh ? '✓ Penuh' : ''} ${peserta.length}/${SURVEY_MAX_PESERTA} peserta
                </span>
              </div>
              <div class="survey-participants" style="border-top:none; margin-top:12px; padding-top:0;">
                <div class="survey-participants-title">
                  Tabungan terkumpul Rp ${totalTerkumpul.toLocaleString('id-ID')} dari kebutuhan Rp ${totalKebutuhan.toLocaleString('id-ID')}
                  ${totalKurang > 0 ? ` · Kurang Rp ${totalKurang.toLocaleString('id-ID')}` : ' · ✓ Lunas semua'}
                  ${jumlahInstan > 0 ? ` · ${jumlahInstan} peserta Daftar Langsung (${jumlahInstanLunas} lunas)` : ''}
                </div>
                ${tableOrEmpty}
              </div>
            </div>`;
    }).join('');
}

// Tombol "💬 WA" di resume admin (peserta tipe 'instan') - buka WhatsApp ke
// NOMOR PESERTA (kebalikan dari openWaTo() di submitInstantJoin() yang
// nge-notif ke pengurus) supaya admin gampang follow-up pembayaran. Aksi ini
// dipicu langsung dari klik tombol (fresh user gesture), jadi aman dari
// blokir popup tanpa perlu pola sinkron-sebelum-await.
function waFollowUpInstan(pesertaId) {
    const p = appData.surveyPeserta.find(x => x.id === pesertaId);
    if (!p) return;
    const survey = appData.surveySapi.find(s => s.id === p.surveyId);
    const k = survey ? computeSurveyKalkulasi(survey.berat, survey.harga, survey.biayaPengolahan) : null;
    const iuran = k ? Math.round(k.iuran) : 0;
    const msg = `Assalamu'alaikum ${p.memberName}, terima kasih sudah mendaftar Daftar Langsung ikut Qurban${survey ? ' (' + surveyKode(survey) + ')' : ''} di ${APP_CONFIG.mosqueName}.
${p.atasNama ? `\nQurban atas nama: ${p.atasNama}\n` : ''}
Total yang perlu dibayar: Rp ${iuran.toLocaleString('id-ID')}
Transfer ke:
${APP_CONFIG.bankName} ${APP_CONFIG.bankAccountNumberDisplay}
a.n. ${APP_CONFIG.bankAccountHolder}

Mohon kirim bukti transfer setelah pembayaran ya. Jazakallahu khairan.
🔗 ${APP_CONFIG.appUrl}`;
    if (!openWaTo(p.phone, msg)) showAlert('Nomor HP peserta tidak valid.', 'error');
}

// Toggle status pembayaran peserta 'instan' (Belum Bayar <-> Lunas) - dipicu
// manual oleh admin setelah dikonfirmasi transfer/tunai (tidak ada verifikasi
// otomatis krn tidak ada bukti transfer yang diupload di jalur Daftar
// Langsung, sesuai keputusan awal fitur ini).
async function togglePembayaranInstan(pesertaId) {
    const p = appData.surveyPeserta.find(x => x.id === pesertaId);
    if (!p) return;

    const statusBaru = p.statusBayar === 'lunas' ? 'belum' : 'lunas';
    const ok = await updateSheetDB('SurveyPeserta', 'id', pesertaId, { statusBayar: statusBaru });
    if (!ok) {
        showAlert('Gagal mengubah status pembayaran, coba lagi.', 'error');
        return;
    }
    p.statusBayar = statusBaru;
    showAlert(statusBaru === 'lunas' ? 'Ditandai Lunas.' : 'Ditandai Belum Bayar.', 'success');
    loadSurveySapiResume();
}

// Ambil foto bukti transfer peserta instan on-demand (fileData sebenarnya
// dibuang dari bootstrap/list, lihat stripBuktiBayarInstan() di sheets.js) -
// sama pola dgn fetchSavingFileData() utk Savings.fileData.
async function fetchSurveyPesertaBuktiData(pesertaId) {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?sheet=SurveyPeserta&getFile=${pesertaId}${tenantParam()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.fileData || '';
    } catch (error) {
        console.error('Error fetching bukti bayar instan:', error);
        return '';
    }
}

// Tombol "🖼 Lihat Bukti" di resume admin (peserta instan) - reuse
// #previewModal yang sama dgn showPreview() (Savings), cuma sumber datanya
// beda sheet/kolom.
async function showBuktiBayarInstan(pesertaId) {
    const p = appData.surveyPeserta.find(x => x.id === pesertaId);
    if (!p) return;

    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const body = document.getElementById('previewBody');

    title.textContent = `Bukti Transfer - ${p.atasNama || p.memberName}`;

    if (!p.hasBuktiBayar) {
        body.innerHTML = '<div class="preview-pdf"><p>📄 Tidak ada bukti file tersimpan</p></div>';
        modal.classList.add('show');
        return;
    }

    body.innerHTML = '<div class="preview-pdf"><p>⏳ Memuat bukti...</p></div>';
    modal.classList.add('show');

    const fileData = await fetchSurveyPesertaBuktiData(pesertaId);

    if (!fileData) {
        body.innerHTML = '<div class="preview-pdf"><p>📄 Gagal memuat bukti file</p></div>';
        return;
    }

    body.innerHTML = `<img src="${fileData}" class="preview-full-image" alt="Bukti transfer">`;
}

// Tombol "📋 Cicilan" di resume admin (peserta instan) - reuse #previewModal
// utk daftar riwayat SetoranInstan milik 1 peserta (bukan foto tunggal spt
// showBuktiBayarInstan()). Foto masing2 cicilan diambil on-demand dgn klik
// terpisah ("Lihat Foto") supaya daftar tetap ringan kalau cicilannya banyak.
function lihatRiwayatCicilanInstan(pesertaId) {
    const p = appData.surveyPeserta.find(x => x.id === pesertaId);
    if (!p) return;
    const survey = appData.surveySapi.find(s => s.id === p.surveyId);
    const k = survey ? computeSurveyKalkulasi(survey.berat, survey.harga, survey.biayaPengolahan) : null;
    const iuranPerOrang = k ? Math.round(k.iuran) : undefined;
    const sum = pesertaInstanBayarSummary(p, iuranPerOrang);

    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const body = document.getElementById('previewBody');
    title.textContent = `Riwayat Cicilan - ${p.atasNama || p.memberName}`;

    const statusBadge = st => {
        const map = { APPROVED: ['✓ Disetujui', 'var(--emerald-2)'], PENDING: ['⏳ Menunggu', 'var(--gold)'], REJECTED: ['✕ Ditolak', 'var(--brick)'] };
        const [label, color] = map[st] || [st, 'var(--ink-faint)'];
        return `<span style="color:${color};font-weight:600;">${label}</span>`;
    };

    const rows = sum.setoran.slice().sort((a, b) => (a.uploadedAt || '').localeCompare(b.uploadedAt || '')).map(s => `
        <tr>
          <td>${s.transferDate || '—'}</td>
          <td>Rp ${(s.nominal || 0).toLocaleString('id-ID')}</td>
          <td>${statusBadge(s.status)}</td>
          <td>${s.hasFile ? `<button class="btn btn-ghost btn-small" onclick="previewSetoranInstanFoto(${s.id})">🖼 Foto</button>` : '—'}</td>
        </tr>`).join('');

    body.innerHTML = `
        <div style="padding:4px 2px 12px;font-size:13px;">
          Total iuran <strong>Rp ${(sum.totalIuran || 0).toLocaleString('id-ID')}</strong> ·
          Terverifikasi <strong style="color:var(--emerald-2);">Rp ${sum.totalApproved.toLocaleString('id-ID')}</strong> ·
          Sisa <strong style="color:${sum.sisa > 0 ? 'var(--brick)' : 'var(--emerald-2)'};">Rp ${sum.sisa.toLocaleString('id-ID')}</strong>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>Tanggal</th><th>Nominal</th><th>Status</th><th>Foto</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" style="color:var(--ink-faint);">Belum ada cicilan.</td></tr>'}</tbody>
          </table>
        </div>`;
    modal.classList.add('show');
}

// Estimasi pembagian daging per sapi buat rencana hari H - "Hak Mudhohi" per
// rumus computeSurveyKalkulasi() adalah per 1/7 bagian; totalnya dikali
// jumlah peserta yang BENERAN terdaftar (bisa kurang dari 7 kalau grup belum
// penuh), bukan selalu dikali 7.
// tbodyId/tfootId dibuat parameterisasi supaya fungsi yang sama bisa dipakai
// ulang buat render ke tabel versi Admin DAN versi Anggota (tabel beda DOM id,
// datanya sama - tidak ada info sensitif di tabel ini, aman dilihat anggota).
function loadSurveySapiDistribusi(tbodyId, tfootId) {
    const tbody = document.getElementById(tbodyId || 'surveySapiDistribusiBody');
    const tfoot = document.getElementById(tfootId || 'surveySapiDistribusiFoot');
    if (!tbody) return;

    if (appData.surveySapi.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Belum ada data survey</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');

    // Dikumpulkan sekalian buat baris total di bawah tabel.
    let totalBerat = 0, totalDaging = 0, totalPeserta = 0, totalShareWarga = 0, sumHakMudhohi = 0;

    tbody.innerHTML = appData.surveySapi.map(s => {
        const jumlahPeserta = activePeserta.filter(p => p.surveyId === s.id).length;
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        const totalMudhohi = k.hakMudhohi * jumlahPeserta;
        const pesertaColor = jumlahPeserta >= SURVEY_MAX_PESERTA ? 'var(--emerald-2)' : 'var(--brick)';

        totalBerat += s.berat || 0;
        totalDaging += k.estimasiDaging;
        totalPeserta += jumlahPeserta;
        totalShareWarga += k.shareWarga;
        sumHakMudhohi += k.hakMudhohi;

        return `
            <tr>
              <td><strong>${surveyKode(s)}</strong></td>
              <td>${s.berat ? s.berat + ' kg' : '—'}</td>
              <td>${formatKg(k.estimasiDaging)}</td>
              <td style="color:${pesertaColor}; font-weight:600;">${jumlahPeserta}/${SURVEY_MAX_PESERTA}</td>
              <td>${formatKg(totalMudhohi)} <span style="color:var(--ink-faint); font-size:12px;">(${jumlahPeserta} × ${formatKg(k.hakMudhohi)})</span></td>
              <td>${formatKg(k.shareWarga)}</td>
            </tr>`;
    }).join('');

    if (tfoot) {
        const jumlahSurvey = appData.surveySapi.length;
        // Semua kolom dijumlahkan (total riil buat rencana logistik), KECUALI
        // Hak Mudhohi - itu rata-rata per 1/7 bagian antar sapi (rumus rata-
        // rata sesuai permintaan), bukan dijumlah, karena bukan angka
        // kumulatif yang dibagikan tapi patokan "kira-kira dapat berapa".
        const rataMudhohi = jumlahSurvey > 0 ? sumHakMudhohi / jumlahSurvey : 0;
        tfoot.innerHTML = `
            <tr style="background:var(--sand); font-weight:700;">
              <td>Total (${jumlahSurvey} sapi)</td>
              <td>${totalBerat.toLocaleString('id-ID')} kg</td>
              <td>${formatKg(totalDaging)}</td>
              <td>${totalPeserta} peserta</td>
              <td>Rata-rata ${formatKg(rataMudhohi)}</td>
              <td>${formatKg(totalShareWarga)}</td>
            </tr>`;
    }
}

// Estimasi bagian LAIN (non-daging): Tulang/Jeroan/Kulit/Kepala/Kaki/Buntut
// per sapi hasil survey - "kalkulator distribusi bagian sapi", pelengkap
// Estimasi Daging di atas (yang TIDAK diubah, tetap rumus lama). Sama pola
// parameterisasi tbodyId/tfootId dgn loadSurveySapiDistribusi() supaya bisa
// dipakai ulang di tabel versi Admin & versi Anggota.
function loadSurveySapiBagianLain(tbodyId, tfootId) {
    const tbody = document.getElementById(tbodyId || 'surveyBagianLainBody');
    const tfoot = document.getElementById(tfootId || 'surveyBagianLainFoot');
    if (!tbody) return;

    if (appData.surveySapi.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Belum ada data survey</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let totalTulang = 0, totalJeroan = 0, totalKulit = 0, totalKepala = 0, totalKaki = 0, totalBuntut = 0;

    tbody.innerHTML = appData.surveySapi.map(s => {
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);

        totalTulang += k.estimasiTulang;
        totalJeroan += k.estimasiJeroan;
        totalKulit += k.estimasiKulit;
        totalKepala += k.estimasiKepala;
        totalKaki += k.estimasiKaki;
        totalBuntut += k.estimasiBuntut;

        return `
            <tr>
              <td><strong>${surveyKode(s)}</strong></td>
              <td>${s.berat ? s.berat + ' kg' : '—'}</td>
              <td>${formatKg(k.estimasiTulang)}</td>
              <td>${formatKg(k.estimasiJeroan)}</td>
              <td>${formatKg(k.estimasiKulit)}</td>
              <td>${formatKg(k.estimasiKepala)}</td>
              <td>${formatKg(k.estimasiKaki)}</td>
              <td>${formatKg(k.estimasiBuntut)}</td>
            </tr>`;
    }).join('');

    if (tfoot) {
        const jumlahSurvey = appData.surveySapi.length;
        tfoot.innerHTML = `
            <tr style="background:var(--sand); font-weight:700;">
              <td>Total (${jumlahSurvey} sapi)</td>
              <td>—</td>
              <td>${formatKg(totalTulang)}</td>
              <td>${formatKg(totalJeroan)}</td>
              <td>${formatKg(totalKulit)}</td>
              <td>${formatKg(totalKepala)}</td>
              <td>${formatKg(totalKaki)}</td>
              <td>${formatKg(totalBuntut)}</td>
            </tr>`;
    }
}

// Total Share Warga dari SEMUA survey (rumus otomatis) - dipakai buat
// bandingkan "share warga yang tersedia" vs "yang sudah direncanakan" di
// ringkasan Rencana Distribusi Daging (Umum) di bawah. Sengaja pakai Share
// Warga, BUKAN total Estimasi Daging - karena Rencana Distribusi Umum
// (Warga/RT/Panitia/dll) cuma bagi porsi Share Warga, bukan porsi Hak
// Mudhohi (punya masing-masing peserta, tidak masuk daftar distribusi umum).
function totalShareWargaSemuaSurvey() {
    return appData.surveySapi.reduce((sum, s) => {
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        return sum + k.shareWarga;
    }, 0);
}

// Pindah antar sub-tab (Estimasi Distribusi/Rencana Umum/Work Order Sapi) di
// tab Distribusi Daging - sama pola dengan switchKeuanganTab()/switchLaporanTab().
// Dipisah per scope ('admin'/'member') karena admin & member section punya
// masing-masing set tombol+panel sendiri dalam 1 tab-content yang sama.
function switchDistribusiTab(tabName, btn, scope) {
    const suffix = scope === 'member' ? 'Member' : '';
    const containerId = scope === 'member' ? 'distribusiDagingMemberSection' : 'distribusiDagingAdminSection';
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.sub-tab-content').forEach(tab => tab.style.display = 'none');
    const panel = document.getElementById(tabName + 'Tab' + suffix);
    if (panel) panel.style.display = 'block';

    container.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// Pindah antar pill-tab di menu WO Aktual (Resume / Work Order). Pola sama
// dengan switchDistribusiTab() di atas, tapi tanpa varian member - menu WO
// Aktual memang khusus admin.
function switchWoAktualTab(tabName, btn) {
    const container = document.getElementById('woAktual');
    if (!container) return;

    container.querySelectorAll('.sub-tab-content').forEach(tab => tab.style.display = 'none');
    const panel = document.getElementById('woAktual' + tabName.charAt(0).toUpperCase() + tabName.slice(1) + 'Tab');
    if (panel) panel.style.display = 'block';

    container.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

// Angka hero card (Total Estimasi Daging/Share Warga/Rencana Distribusi/
// Jumlah Sapi) - dihitung sekali, dipakai buat isi hero admin & member
// sekaligus (angkanya sama, cuma beda tempat tampil).
function renderDistribusiHero() {
    const jumlahSapi = appData.surveySapi.length;
    let totalEstimasiDaging = 0;
    appData.surveySapi.forEach(s => {
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        totalEstimasiDaging += k.estimasiDaging;
    });
    const totalShareWarga = totalShareWargaSemuaSurvey();
    const totalRencana = appData.rencanaDistribusi
        .filter(d => d.status !== 'batal')
        .reduce((sum, d) => sum + d.berat * d.qty, 0);

    ['', 'Member'].forEach(suffix => {
        const totalEl = document.getElementById('distribusiHeroTotal' + suffix);
        if (!totalEl) return;
        totalEl.textContent = formatKg(totalEstimasiDaging);
        document.getElementById('distribusiHeroShareWarga' + suffix).textContent = formatKg(totalShareWarga);
        document.getElementById('distribusiHeroRencana' + suffix).textContent = formatKg(totalRencana);
        document.getElementById('distribusiHeroJumlahSapi' + suffix).textContent = jumlahSapi.toLocaleString('id-ID');
    });
}

// ===== RENCANA DISTRIBUSI DAGING (UMUM) - hitungan kasar, TIDAK terikat 1
// sapi tertentu. Beda dari Work Order (per-sapi, detail lapangan): ini buat
// estimasi awal cepat. Kolom "WO" & "B/L" dihitung otomatis (lihat
// totalWoBeratForAlokasi) - bukan input manual. =====
let editingRencanaId = null;

// Total berat (kg) yang sudah dimasukkan ke Work Order (DistribusiDaging,
// lintas semua sapi) untuk 1 nama alokasi tertentu. Dicocokkan by nama teks
// alokasi (trim + case-insensitive) karena DistribusiDaging menyimpan
// snapshot nama, bukan id referensi ke RencanaDistribusi.
function totalWoBeratForAlokasi(alokasiName) {
    const nama = (alokasiName || '').trim().toLowerCase();
    if (!nama) return 0;
    return appData.distribusiDaging
        .filter(d => d.status !== 'batal' && (d.alokasi || '').trim().toLowerCase() === nama)
        .reduce((sum, d) => sum + (d.berat * d.qty), 0);
}

function loadRencanaDistribusiGlobal(tbodyId, tfootId, isAdminView) {
    const tbody = document.getElementById(tbodyId || 'rencanaDistribusiBody');
    const tfoot = document.getElementById(tfootId || 'rencanaDistribusiFoot');
    if (!tbody) return;

    const summaryEl = document.getElementById(isAdminView ? 'rencanaDistribusiSummary' : 'rencanaDistribusiSummaryMember');

    const rows = appData.rencanaDistribusi.filter(d => d.status !== 'batal');
    const colspan = isAdminView ? 7 : 6;

    let totalKeseluruhan = 0;
    let totalWoKeseluruhan = 0;

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading">Belum ada rencana distribusi.${isAdminView ? ' Tambahkan lewat form di atas.' : ''}</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
    } else {
        tbody.innerHTML = rows.map(d => {
            const total = d.berat * d.qty;
            const woTotal = totalWoBeratForAlokasi(d.alokasi);
            const balance = total - woTotal;
            totalKeseluruhan += total;
            totalWoKeseluruhan += woTotal;

            let blColor;
            if (Math.abs(balance) <= 0.05) blColor = 'var(--emerald-2)';
            else if (balance > 0) blColor = 'var(--gold)';
            else blColor = 'var(--brick)';

            const aksiCell = isAdminView
                ? `<td style="white-space:nowrap;">
                     <button class="btn btn-ghost btn-small" onclick="editRencanaAlokasi(${d.id})" title="Edit">✏️</button>
                     <button class="btn btn-ghost btn-small" onclick="hapusRencanaAlokasi(${d.id})" title="Hapus">🗑️</button>
                   </td>`
                : '';

            return `
                <tr>
                  <td>${d.alokasi || '—'}</td>
                  <td>${d.berat.toLocaleString('id-ID')} kg</td>
                  <td>${d.qty.toLocaleString('id-ID')}</td>
                  <td><strong>${total.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg</strong></td>
                  <td>${formatKg(woTotal)}</td>
                  <td><span style="color:${blColor}; font-weight:600;">${formatKg(balance)}</span></td>
                  ${aksiCell}
                </tr>`;
        }).join('');

        if (tfoot) {
            const totalBalance = totalKeseluruhan - totalWoKeseluruhan;
            tfoot.innerHTML = `
                <tr style="background:var(--sand); font-weight:700;">
                  <td colspan="3">Total</td>
                  <td>${totalKeseluruhan.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg</td>
                  <td>${formatKg(totalWoKeseluruhan)}</td>
                  <td>${formatKg(totalBalance)}</td>
                  ${isAdminView ? '<td></td>' : ''}
                </tr>`;
        }
    }

    // Balance: total Share Warga (dari semua survey) vs Total Rencana
    // Distribusi (dari tabel di atas). Pakai Share Warga karena Rencana
    // Distribusi Umum cuma bagi porsi warga - Hak Mudhohi tidak ikut di
    // sini. Toleransi 0.05kg buat jaga-jaga pembulatan desimal.
    if (summaryEl) {
        const totalShareWarga = totalShareWargaSemuaSurvey();
        const selisih = totalShareWarga - totalKeseluruhan;
        let statusHtml;
        if (Math.abs(selisih) <= 0.05) {
            statusHtml = `<span style="color:var(--emerald-2); font-weight:600;">✓ Pas, Share Warga sudah direncanakan semua</span>`;
        } else if (selisih > 0) {
            statusHtml = `<span style="color:var(--gold); font-weight:600;">Belum dialokasikan: ${formatKg(selisih)}</span>`;
        } else {
            statusHtml = `<span style="color:var(--brick); font-weight:600;">⚠️ Rencana melebihi Share Warga: ${formatKg(-selisih)}</span>`;
        }

        summaryEl.innerHTML = `
            <div class="rek-box" style="margin-bottom:0;">
              <div class="rek-row"><span>Total Share Warga (semua survey)</span><span>${formatKg(totalShareWarga)}</span></div>
              <div class="rek-row"><span>Total Rencana Distribusi</span><span>${formatKg(totalKeseluruhan)}</span></div>
              <div class="rek-row"><span>Status</span>${statusHtml}</div>
            </div>`;
    }
}

async function simpanRencanaAlokasi() {
    const alokasi = document.getElementById('rencanaAlokasi').value.trim();
    const berat = parseFloat(document.getElementById('rencanaBerat').value);
    const qty = parseFloat(document.getElementById('rencanaQty').value);

    if (!alokasi) { showAlert('Nama alokasi harus diisi', 'error'); return; }
    if (!berat || berat <= 0) { showAlert('Berat per unit harus diisi', 'error'); return; }
    if (!qty || qty <= 0) { showAlert('Qty harus diisi', 'error'); return; }

    if (editingRencanaId) {
        const success = await updateSheetDB('RencanaDistribusi', 'id', editingRencanaId, { alokasi, berat, qty });
        if (success) {
            const item = appData.rencanaDistribusi.find(d => d.id === editingRencanaId);
            if (item) { item.alokasi = alokasi; item.berat = berat; item.qty = qty; }
            showAlert('Alokasi berhasil diperbarui', 'success');
            batalEditRencanaAlokasi();
            loadRencanaDistribusiGlobal('rencanaDistribusiBody', 'rencanaDistribusiFoot', true);
        } else {
            showAlert('Gagal menyimpan perubahan, coba lagi.', 'error');
        }
        return;
    }

    const newId = appData.rencanaDistribusi.length > 0
        ? Math.max(...appData.rencanaDistribusi.map(d => d.id)) + 1
        : 1;

    const record = {
        id: newId,
        alokasi: alokasi,
        berat: berat,
        qty: qty,
        wo: 'tidak',
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('RencanaDistribusi', record);
    if (success) {
        appData.rencanaDistribusi.push({ ...record, wo: false });
        showAlert('Alokasi berhasil ditambahkan', 'success');
        document.getElementById('rencanaAlokasi').value = '';
        document.getElementById('rencanaBerat').value = '';
        document.getElementById('rencanaQty').value = '';
        loadRencanaDistribusiGlobal('rencanaDistribusiBody', 'rencanaDistribusiFoot', true);
    }
}

function editRencanaAlokasi(id) {
    const item = appData.rencanaDistribusi.find(d => d.id === id);
    if (!item) return;

    editingRencanaId = id;
    document.getElementById('rencanaAlokasi').value = item.alokasi;
    document.getElementById('rencanaBerat').value = item.berat;
    document.getElementById('rencanaQty').value = item.qty;

    const btn = document.getElementById('rencanaSubmitBtn');
    if (btn) btn.textContent = '💾 Simpan Perubahan';
    const cancelBtn = document.getElementById('rencanaCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    document.getElementById('rencanaAlokasi').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function batalEditRencanaAlokasi() {
    editingRencanaId = null;
    document.getElementById('rencanaAlokasi').value = '';
    document.getElementById('rencanaBerat').value = '';
    document.getElementById('rencanaQty').value = '';

    const btn = document.getElementById('rencanaSubmitBtn');
    if (btn) btn.textContent = '+ Tambah Alokasi';
    const cancelBtn = document.getElementById('rencanaCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

// Soft-delete (status='batal') - bukan dihapus dari sheet, sama pola dengan
// SurveyPeserta/DistribusiDaging.
async function hapusRencanaAlokasi(id) {
    const item = appData.rencanaDistribusi.find(d => d.id === id);
    if (!item) return;
    if (!confirm(`Hapus alokasi "${item.alokasi}" dari rencana distribusi umum?`)) return;

    const success = await updateSheetDB('RencanaDistribusi', 'id', id, { status: 'batal' });
    if (success) {
        item.status = 'batal';
        showAlert('Alokasi dihapus', 'success');
        if (editingRencanaId === id) batalEditRencanaAlokasi();
        loadRencanaDistribusiGlobal('rencanaDistribusiBody', 'rencanaDistribusiFoot', true);
    } else {
        showAlert('Gagal menghapus alokasi, coba lagi.', 'error');
    }
}

// ===== RENCANA DISTRIBUSI BAGIAN LAIN (Tulang/Jeroan/Kepala/Kaki/Buntut) =====
// Sama semangat dgn Rencana Distribusi Daging (Umum) di atas - alokasi
// manual dibanding thd total "budget" - tapi budget-nya total akumulasi
// bagian LAIN dari SEMUA sapi (bukan Share Warga), dan SENGAJA TIDAK ada
// kolom WO/B/L krn bagian ini tidak melalui Work Order per sapi (WO Aktual
// cuma soal daging).
// Tulang/Jeroan satuannya KG (ditimbang, dibagi berdasarkan berat -
// computeSurveyKalkulasi()). Kepala/Kaki/Buntut satuannya PCS (dihitung per
// UNIT FISIK per ekor sapi - 1 kepala, 4 kaki, 1 buntut per ekor - bukan
// ditimbang), jadi "budget"-nya dihitung dari JUMLAH SAPI, bukan berat.
const BAGIAN_LAIN_UNIT = { tulang: 'kg', jeroan: 'kg', kepala: 'pcs', kaki: 'pcs', buntut: 'pcs' };
const BAGIAN_LAIN_LABEL = { tulang: 'Tulang', jeroan: 'Jeroan', kepala: 'Kepala', kaki: 'Kaki', buntut: 'Buntut' };
const BAGIAN_LAIN_COLOR = { tulang: 'var(--sky)', jeroan: 'var(--gold)', kepala: 'var(--brick)', kaki: 'var(--sage)', buntut: 'var(--emerald-2)' };
// Jumlah unit fisik per ekor sapi, khusus jenis PCS.
const BAGIAN_LAIN_PCS_PER_SAPI = { kepala: 1, kaki: 4, buntut: 1 };

// ===== ITEM TAMBAHAN PENERIMA (Tulang/Jeroan/Kepala/Kaki/Buntut per orang)
// ===== Beda dari BAGIAN_LAIN_UNIT di atas (yang satuannya kg/pcs utk
// akumulasi TOTAL semua sapi) - di sini per PENERIMA perorangan, jadi
// Tulang/Jeroan dihitung "paket" (bundel siap-bawa-pulang, bukan kg
// presisi), Kepala/Kaki/Buntut tetap "pcs". Lihat komentar
// TENANT_SHEET_TEMPLATE.PenerimaQR di public/api/sheets.js.
const ITEM_TAMBAHAN_UNIT = { tulang: 'paket', jeroan: 'paket', kepala: 'pcs', kaki: 'pcs', buntut: 'pcs' };
const ITEM_TAMBAHAN_JENIS_LIST = ['tulang', 'jeroan', 'kepala', 'kaki', 'buntut'];

// Teks ringkas 1 baris, mis. "1 paket Tulang, 1 paket Jeroan, 1 pcs Kaki" -
// dipakai di tabel & tiket cetak (plain text, tanpa HTML/warna).
function formatItemTambahanText(itemObj) {
    if (!itemObj) return '';
    return ITEM_TAMBAHAN_JENIS_LIST
        .filter(j => (parseFloat(itemObj[j]) || 0) > 0)
        .map(j => `${itemObj[j]} ${ITEM_TAMBAHAN_UNIT[j]} ${BAGIAN_LAIN_LABEL[j]}`)
        .join(', ');
}

// Badge berwarna per jenis - dipakai di tabel Kelola Daftar Penerima & modal
// preview tiket (HTML, pakai warna BAGIAN_LAIN_COLOR yang sama spt di
// Rencana/Work Order Bagian Lain supaya konsisten).
function renderItemTambahanBadges(itemObj) {
    if (!itemObj) return '';
    const badges = ITEM_TAMBAHAN_JENIS_LIST
        .filter(j => (parseFloat(itemObj[j]) || 0) > 0)
        .map(j => `<span style="display:inline-block; margin:2px 4px 2px 0; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; color:#fff; background:${BAGIAN_LAIN_COLOR[j] || 'var(--ink-faint)'};">${itemObj[j]} ${ITEM_TAMBAHAN_UNIT[j]} ${BAGIAN_LAIN_LABEL[j]}</span>`);
    return badges.join('');
}

let editingRencanaLainId = null;

// Format angka sesuai satuan jenisnya - kg pakai formatKg() (1 desimal),
// pcs dibulatkan tanpa desimal + label "pcs".
function formatBagianLain(value, jenis) {
    if (BAGIAN_LAIN_UNIT[jenis] === 'pcs') {
        return `${Math.round(value).toLocaleString('id-ID')} pcs`;
    }
    return formatKg(value);
}

// Total akumulasi (semua survey sapi) utk 1 jenis bagian - dipakai sbg
// "budget" utk Rencana Distribusi Bagian Lain, sama semangatnya dgn
// totalShareWargaSemuaSurvey() utk daging. jenis: 'tulang'|'jeroan' (kg, dari
// computeSurveyKalkulasi) atau 'kepala'|'kaki'|'buntut' (pcs, dari jumlah
// sapi x BAGIAN_LAIN_PCS_PER_SAPI).
function totalBagianLainSemuaSurvey(jenis) {
    if (BAGIAN_LAIN_UNIT[jenis] === 'pcs') {
        return appData.surveySapi.length * (BAGIAN_LAIN_PCS_PER_SAPI[jenis] || 0);
    }
    const key = jenis === 'jeroan' ? 'estimasiJeroan' : 'estimasiTulang';
    return appData.surveySapi.reduce((sum, s) => {
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        return sum + k[key];
    }, 0);
}

// Update label form ("Berat per Unit (kg)" <-> "Jumlah per Unit (pcs)") tiap
// kali dropdown Jenis diganti - dipanggil via onchange di HTML.
function updateRencanaLainUnitLabel() {
    const jenisSelect = document.getElementById('rencanaLainJenis');
    const label = document.getElementById('rencanaLainBeratLabel');
    if (!jenisSelect || !label) return;
    const isPcs = BAGIAN_LAIN_UNIT[jenisSelect.value] === 'pcs';
    label.textContent = isPcs ? 'Jumlah per Unit (pcs)' : 'Berat per Unit (kg)';
    const beratInput = document.getElementById('rencanaLainBerat');
    if (beratInput) beratInput.placeholder = isPcs ? 'Contoh: 1' : 'Contoh: 5';
}

function loadRencanaDistribusiLain(tbodyId, tfootId, summaryId, isAdminView) {
    const tbody = document.getElementById(tbodyId || 'rencanaLainBody');
    const tfoot = document.getElementById(tfootId || 'rencanaLainFoot');
    if (!tbody) return;

    const summaryEl = document.getElementById(summaryId);
    const rows = appData.rencanaDistribusiLain.filter(d => d.status !== 'batal');
    const colspan = isAdminView ? 6 : 5;

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading">Belum ada rencana distribusi.${isAdminView ? ' Tambahkan lewat form di atas.' : ''}</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
    } else {
        tbody.innerHTML = rows.map(d => {
            const total = d.berat * d.qty;
            const unit = BAGIAN_LAIN_UNIT[d.jenis] || 'kg';

            const aksiCell = isAdminView
                ? `<td style="white-space:nowrap;">
                     <button class="btn btn-ghost btn-small" onclick="editRencanaAlokasiLain(${d.id})" title="Edit">✏️</button>
                     <button class="btn btn-ghost btn-small" onclick="hapusRencanaAlokasiLain(${d.id})" title="Hapus">🗑️</button>
                   </td>`
                : '';

            return `
                <tr>
                  <td><span style="color:${BAGIAN_LAIN_COLOR[d.jenis] || 'var(--ink)'}; font-weight:600;">${BAGIAN_LAIN_LABEL[d.jenis] || d.jenis}</span></td>
                  <td>${d.alokasi || '—'}</td>
                  <td>${d.berat.toLocaleString('id-ID')} ${unit}</td>
                  <td>${d.qty.toLocaleString('id-ID')}</td>
                  <td><strong>${formatBagianLain(total, d.jenis)}</strong></td>
                  ${aksiCell}
                </tr>`;
        }).join('');

        if (tfoot) {
            tfoot.innerHTML = `
                <tr style="background:var(--sand); font-weight:700;">
                  <td colspan="${colspan}">Total ${rows.length} alokasi aktif - lihat rincian per jenis di kotak ringkasan di atas.</td>
                </tr>`;
        }
    }

    if (summaryEl) {
        const jenisList = ['tulang', 'jeroan', 'kepala', 'kaki', 'buntut'];
        const boxFor = (jenis) => {
            const total = totalBagianLainSemuaSurvey(jenis);
            const alokasi = rows.filter(d => d.jenis === jenis).reduce((sum, d) => sum + d.berat * d.qty, 0);
            const selisih = total - alokasi;
            const tol = BAGIAN_LAIN_UNIT[jenis] === 'pcs' ? 0.5 : 0.05;
            let statusHtml;
            if (Math.abs(selisih) <= tol) statusHtml = `<span style="color:var(--emerald-2); font-weight:600;">✓ Pas, sudah direncanakan semua</span>`;
            else if (selisih > 0) statusHtml = `<span style="color:var(--gold); font-weight:600;">Belum dialokasikan: ${formatBagianLain(selisih, jenis)}</span>`;
            else statusHtml = `<span style="color:var(--brick); font-weight:600;">⚠️ Melebihi total: ${formatBagianLain(-selisih, jenis)}</span>`;
            return `
                <div class="rek-box" style="margin-bottom:10px;">
                  <div class="rek-row"><span>Total ${BAGIAN_LAIN_LABEL[jenis]} (semua survey)</span><span>${formatBagianLain(total, jenis)}</span></div>
                  <div class="rek-row"><span>Dialokasikan</span><span>${formatBagianLain(alokasi, jenis)}</span></div>
                  <div class="rek-row"><span>Status</span>${statusHtml}</div>
                </div>`;
        };

        summaryEl.innerHTML = jenisList.map(boxFor).join('');
    }
}

async function simpanRencanaAlokasiLain() {
    const jenisRaw = document.getElementById('rencanaLainJenis').value;
    const jenis = BAGIAN_LAIN_UNIT[jenisRaw] ? jenisRaw : 'tulang';
    const alokasi = document.getElementById('rencanaLainAlokasi').value.trim();
    const berat = parseFloat(document.getElementById('rencanaLainBerat').value);
    const qty = parseFloat(document.getElementById('rencanaLainQty').value);

    if (!alokasi) { showAlert('Nama alokasi harus diisi', 'error'); return; }
    if (!berat || berat <= 0) { showAlert(`${BAGIAN_LAIN_UNIT[jenis] === 'pcs' ? 'Jumlah' : 'Berat'} per unit harus diisi`, 'error'); return; }
    if (!qty || qty <= 0) { showAlert('Qty harus diisi', 'error'); return; }

    if (editingRencanaLainId) {
        const success = await updateSheetDB('RencanaDistribusiLain', 'id', editingRencanaLainId, { jenis, alokasi, berat, qty });
        if (success) {
            const item = appData.rencanaDistribusiLain.find(d => d.id === editingRencanaLainId);
            if (item) { item.jenis = jenis; item.alokasi = alokasi; item.berat = berat; item.qty = qty; }
            showAlert('Alokasi berhasil diperbarui', 'success');
            batalEditRencanaAlokasiLain();
            loadRencanaDistribusiLain('rencanaLainBody', 'rencanaLainFoot', 'rencanaBagianLainSummary', true);
        } else {
            showAlert('Gagal menyimpan perubahan, coba lagi.', 'error');
        }
        return;
    }

    const newId = appData.rencanaDistribusiLain.length > 0
        ? Math.max(...appData.rencanaDistribusiLain.map(d => d.id)) + 1
        : 1;

    const record = {
        id: newId,
        jenis: jenis,
        alokasi: alokasi,
        berat: berat,
        qty: qty,
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('RencanaDistribusiLain', record);
    if (success) {
        appData.rencanaDistribusiLain.push({ ...record });
        showAlert('Alokasi berhasil ditambahkan', 'success');
        document.getElementById('rencanaLainAlokasi').value = '';
        document.getElementById('rencanaLainBerat').value = '';
        document.getElementById('rencanaLainQty').value = '';
        loadRencanaDistribusiLain('rencanaLainBody', 'rencanaLainFoot', 'rencanaBagianLainSummary', true);
    }
}

function editRencanaAlokasiLain(id) {
    const item = appData.rencanaDistribusiLain.find(d => d.id === id);
    if (!item) return;

    editingRencanaLainId = id;
    document.getElementById('rencanaLainJenis').value = item.jenis;
    updateRencanaLainUnitLabel();
    document.getElementById('rencanaLainAlokasi').value = item.alokasi;
    document.getElementById('rencanaLainBerat').value = item.berat;
    document.getElementById('rencanaLainQty').value = item.qty;

    const btn = document.getElementById('rencanaLainSubmitBtn');
    if (btn) btn.textContent = '💾 Simpan Perubahan';
    const cancelBtn = document.getElementById('rencanaLainCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    document.getElementById('rencanaLainAlokasi').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function batalEditRencanaAlokasiLain() {
    editingRencanaLainId = null;
    document.getElementById('rencanaLainJenis').value = 'tulang';
    updateRencanaLainUnitLabel();
    document.getElementById('rencanaLainAlokasi').value = '';
    document.getElementById('rencanaLainBerat').value = '';
    document.getElementById('rencanaLainQty').value = '';

    const btn = document.getElementById('rencanaLainSubmitBtn');
    if (btn) btn.textContent = '+ Tambah Alokasi';
    const cancelBtn = document.getElementById('rencanaLainCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

async function hapusRencanaAlokasiLain(id) {
    const item = appData.rencanaDistribusiLain.find(d => d.id === id);
    if (!item) return;
    if (!confirm(`Hapus alokasi "${item.alokasi}" dari rencana distribusi bagian lain?`)) return;

    const success = await updateSheetDB('RencanaDistribusiLain', 'id', id, { status: 'batal' });
    if (success) {
        item.status = 'batal';
        showAlert('Alokasi dihapus', 'success');
        if (editingRencanaLainId === id) batalEditRencanaAlokasiLain();
        loadRencanaDistribusiLain('rencanaLainBody', 'rencanaLainFoot', 'rencanaBagianLainSummary', true);
    } else {
        showAlert('Gagal menghapus alokasi, coba lagi.', 'error');
    }
}

// ===== WORK ORDER SAPI (1 kartu per survey: header ringkas + daftar
// alokasi per sapi itu) =====
// Baris tabel SELALU mengikuti daftar alokasi aktif di Rencana Distribusi
// Daging (Umum) - alokasi & berat per unit otomatis ikut sana, admin di
// sini TIDAK perlu pilih dari dropdown lagi, tinggal isi/ubah Qty per
// alokasi lalu klik simpan (💾). Qty tersimpan dicari/dicocokkan ke baris
// DistribusiDaging via surveyId + nama alokasi (bukan id referensi).

// Render SEMUA Work Order (1 kartu per sapi hasil survey) ke satu container.
// Tiap kartu: header ringkas + ringkasan Share Daging vs Total Teralokasi +
// tabel alokasi (1 baris per item aktif di Rencana Distribusi Umum).
function loadWorkOrderList(containerId, isAdminView) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (appData.surveySapi.length === 0) {
        container.innerHTML = '<p style="color:var(--ink-faint);">Belum ada data survey sapi.</p>';
        return;
    }

    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');
    const rencanaAktif = appData.rencanaDistribusi.filter(r => r.status !== 'batal');

    const rencanaLainAktif = appData.rencanaDistribusiLain.filter(r => r.status !== 'batal');

    container.innerHTML = appData.surveySapi.map(s => {
        const jumlahPeserta = activePeserta.filter(p => p.surveyId === s.id).length;
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        const totalMudhohi = k.hakMudhohi * jumlahPeserta;

        const colspan = isAdminView ? 5 : 4;

        let totalAlokasi = 0;
        let tbodyHtml, tfootHtml;

        if (rencanaAktif.length === 0) {
            tbodyHtml = `<tr><td colspan="${colspan}" class="loading">Belum ada alokasi di "Rencana Distribusi Daging (Umum)" di atas - tambahkan dulu di sana.</td></tr>`;
            tfootHtml = '';
        } else {
            tbodyHtml = rencanaAktif.map(r => {
                const existing = appData.distribusiDaging.find(d =>
                    d.status !== 'batal' && d.surveyId === s.id &&
                    (d.alokasi || '').trim().toLowerCase() === (r.alokasi || '').trim().toLowerCase()
                );
                const qty = existing ? existing.qty : 0;
                const total = r.berat * qty;
                totalAlokasi += total;

                // Batasi Qty per baris supaya total Qty lintas SEMUA sapi utk
                // alokasi ini tidak melebihi Qty yang direncanakan di Rencana
                // Distribusi Daging (Umum). maxForRow = sisa kuota alokasi ini
                // TERMASUK yang sudah dipakai sapi ini sendiri (existing).
                const usedByOthers = totalWoQtyForAlokasiExcluding(r.alokasi, s.id);
                const maxForRow = r.qty - usedByOthers;
                const sisaDisplay = Math.max(maxForRow, 0);
                const kuotaPenuh = maxForRow <= 0 && qty <= 0;

                let qtyCell, aksiCell;
                if (isAdminView) {
                    if (kuotaPenuh) {
                        qtyCell = `<td><input type="number" value="0" disabled style="width:90px;" title="Kuota alokasi ini sudah penuh di sapi lain"></td>`;
                        aksiCell = `<td><span style="color:var(--brick); font-size:12px; font-weight:600;">Kuota penuh</span></td>`;
                    } else {
                        qtyCell = `<td>
                              <input type="number" id="woQty_${s.id}_${r.id}" value="${qty || ''}" placeholder="0" min="0" max="${maxForRow}" step="1" style="width:90px;" oninput="updateWoRowTotal(${s.id}, ${r.id}, ${r.berat})">
                              <div style="font-size:11px; color:var(--ink-faint); margin-top:2px;">maks ${sisaDisplay.toLocaleString('id-ID')}</div>
                            </td>`;
                        aksiCell = `<td><button class="btn btn-success btn-small" onclick="simpanWoQty(${s.id}, ${r.id})" title="Simpan Qty">💾</button></td>`;
                    }
                } else {
                    qtyCell = `<td>${qty.toLocaleString('id-ID')}</td>`;
                    aksiCell = '';
                }

                return `
                    <tr>
                      <td>${r.alokasi || '—'}</td>
                      <td>${r.berat.toLocaleString('id-ID')} kg</td>
                      ${qtyCell}
                      <td id="woRowTotal_${s.id}_${r.id}"><strong>${total.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg</strong></td>
                      ${aksiCell}
                    </tr>`;
            }).join('');
            tfootHtml = `
                <tr style="background:var(--sand); font-weight:700;">
                  <td colspan="3">Total</td>
                  <td>${totalAlokasi.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg</td>
                  ${isAdminView ? '<td></td>' : ''}
                </tr>`;
        }

        // Ringkasan: Share Daging (porsi warga, di luar Hak Mudhohi) yang
        // tersedia utk sapi ini vs yang sudah dialokasikan ke penerima.
        // Toleransi 0.05kg buat jaga-jaga pembulatan desimal.
        const selisih = k.shareWarga - totalAlokasi;
        let statusHtml;
        if (Math.abs(selisih) <= 0.05) {
            statusHtml = `<span style="color:var(--emerald-2); font-weight:600;">✓ Pas, Share Daging sudah teralokasikan semua</span>`;
        } else if (selisih > 0) {
            statusHtml = `<span style="color:var(--gold); font-weight:600;">Belum dialokasikan: ${formatKg(selisih)}</span>`;
        } else {
            statusHtml = `<span style="color:var(--brick); font-weight:600;">⚠️ Alokasi melebihi Share Daging: ${formatKg(-selisih)}</span>`;
        }

        // Tabel kedua: alokasi Bagian Lain (Tulang/Jeroan/Kepala/Kaki/Buntut)
        // utk sapi ini - skema paralel ke tabel daging di atas (dicocokkan
        // via jenis+alokasi ke rencanaDistribusiLain, kuota Qty dibatasi
        // lintas semua sapi), tapi TANPA rek-box budget krn "budget" bagian
        // lain adalah akumulasi total semua sapi (bukan per-sapi seperti
        // Share Daging) - lihat totalBagianLainSemuaSurvey().
        const colspanLain = isAdminView ? 6 : 5;
        let bagianLainTbodyHtml, bagianLainTfootHtml;
        if (rencanaLainAktif.length === 0) {
            bagianLainTbodyHtml = `<tr><td colspan="${colspanLain}" class="loading">Belum ada alokasi di "Rencana Distribusi Bagian Lain" di sub-tab Rencana (Umum) - tambahkan dulu di sana.</td></tr>`;
            bagianLainTfootHtml = '';
        } else {
            bagianLainTbodyHtml = rencanaLainAktif.map(r => {
                const existingLain = appData.distribusiBagianLain.find(d =>
                    d.status !== 'batal' && d.surveyId === s.id && d.jenis === r.jenis &&
                    (d.alokasi || '').trim().toLowerCase() === (r.alokasi || '').trim().toLowerCase()
                );
                const qtyLain = existingLain ? existingLain.qty : 0;
                const totalLain = r.berat * qtyLain;
                const unit = BAGIAN_LAIN_UNIT[r.jenis] || 'kg';

                const usedByOthersLain = totalWoLainQtyForAlokasiExcluding(r.jenis, r.alokasi, s.id);
                const maxForRowLain = r.qty - usedByOthersLain;
                const sisaDisplayLain = Math.max(maxForRowLain, 0);
                const kuotaPenuhLain = maxForRowLain <= 0 && qtyLain <= 0;

                let qtyCellLain, aksiCellLain;
                if (isAdminView) {
                    if (kuotaPenuhLain) {
                        qtyCellLain = `<td><input type="number" value="0" disabled style="width:90px;" title="Kuota alokasi ini sudah penuh di sapi lain"></td>`;
                        aksiCellLain = `<td><span style="color:var(--brick); font-size:12px; font-weight:600;">Kuota penuh</span></td>`;
                    } else {
                        qtyCellLain = `<td>
                              <input type="number" id="woLainQty_${s.id}_${r.id}" value="${qtyLain || ''}" placeholder="0" min="0" max="${maxForRowLain}" step="1" style="width:90px;" oninput="updateWoLainRowTotal(${s.id}, ${r.id}, ${r.berat}, '${r.jenis}')">
                              <div style="font-size:11px; color:var(--ink-faint); margin-top:2px;">maks ${sisaDisplayLain.toLocaleString('id-ID')}</div>
                            </td>`;
                        aksiCellLain = `<td><button class="btn btn-success btn-small" onclick="simpanWoQtyLain(${s.id}, ${r.id})" title="Simpan Qty">💾</button></td>`;
                    }
                } else {
                    qtyCellLain = `<td>${qtyLain.toLocaleString('id-ID')}</td>`;
                    aksiCellLain = '';
                }

                return `
                    <tr>
                      <td><span style="color:${BAGIAN_LAIN_COLOR[r.jenis] || 'var(--ink)'}; font-weight:600;">${BAGIAN_LAIN_LABEL[r.jenis] || r.jenis}</span></td>
                      <td>${r.alokasi || '—'}</td>
                      <td>${r.berat.toLocaleString('id-ID')} ${unit}</td>
                      ${qtyCellLain}
                      <td id="woLainRowTotal_${s.id}_${r.id}"><strong>${formatBagianLain(totalLain, r.jenis)}</strong></td>
                      ${aksiCellLain}
                    </tr>`;
            }).join('');
            bagianLainTfootHtml = `
                <tr style="background:var(--sand); font-weight:700;">
                  <td colspan="${colspanLain}">Total ${rencanaLainAktif.length} alokasi aktif - satuan campuran (kg utk Tulang/Jeroan, pcs utk Kepala/Kaki/Buntut).</td>
                </tr>`;
        }

        return `
            <div class="card" style="max-width:820px; margin-top:20px;">
              <h3 style="margin-top:0;">Work Order - ${surveyKode(s)} · ${s.supplier || '—'}</h3>
              <div class="survey-member-meta" style="margin:0 0 16px;">
                <div><span class="label">Supplier</span>${s.supplier || '—'}</div>
                <div><span class="label">Berat Sapi</span>${s.berat ? s.berat + ' kg' : '—'}</div>
                <div><span class="label">Estimasi Berat Daging</span>${formatKg(k.estimasiDaging)}</div>
                <div><span class="label">Hak Mudhohi</span>${formatKg(totalMudhohi)} <span style="color:var(--ink-faint); font-size:12px;">(${jumlahPeserta} peserta)</span></div>
                <div><span class="label">Share Daging</span>${formatKg(k.shareWarga)}</div>
              </div>
              <div class="rek-box" style="margin-bottom:18px;">
                <div class="rek-row"><span>Share Daging Tersedia</span><span>${formatKg(k.shareWarga)}</span></div>
                <div class="rek-row"><span>Total Teralokasi</span><span>${formatKg(totalAlokasi)}</span></div>
                <div class="rek-row"><span>Status</span>${statusHtml}</div>
              </div>
              <div class="table-container">
                <table>
                  <thead><tr><th>Alokasi</th><th>Berat</th><th>Qty</th><th>Total</th>${isAdminView ? '<th></th>' : ''}</tr></thead>
                  <tbody>${tbodyHtml}</tbody>
                  <tfoot>${tfootHtml}</tfoot>
                </table>
              </div>

              <h4 style="margin:22px 0 10px; font-size:14px; color:var(--ink-soft);">Alokasi Bagian Lain (Tulang/Jeroan/Kepala/Kaki/Buntut)</h4>
              <div class="table-container">
                <table>
                  <thead><tr><th>Jenis</th><th>Alokasi</th><th>Berat/Jml</th><th>Qty</th><th>Total</th>${isAdminView ? '<th></th>' : ''}</tr></thead>
                  <tbody>${bagianLainTbodyHtml}</tbody>
                  <tfoot>${bagianLainTfootHtml}</tfoot>
                </table>
              </div>
            </div>`;
    }).join('');
}

// Total Qty (bukan berat) yang sudah dipakai sapi LAIN (di luar
// excludeSurveyId) utk 1 nama alokasi - dipakai buat hitung sisa kuota
// maksimal yang boleh diisi di sapi ini, supaya total Qty lintas semua
// Work Order tidak melebihi Qty yang direncanakan di Rencana Distribusi
// Daging (Umum). Ini yang mencegah over-kuantitas di 1 item alokasi.
function totalWoQtyForAlokasiExcluding(alokasiName, excludeSurveyId) {
    const nama = (alokasiName || '').trim().toLowerCase();
    if (!nama) return 0;
    return appData.distribusiDaging
        .filter(d => d.status !== 'batal' && d.surveyId !== excludeSurveyId && (d.alokasi || '').trim().toLowerCase() === nama)
        .reduce((sum, d) => sum + d.qty, 0);
}

// Update tampilan "Total" 1 baris (live, belum tersimpan) tiap kali admin
// ngetik ulang Qty - supaya kelihatan hasilnya sebelum klik simpan.
function updateWoRowTotal(surveyId, rencanaId, beratPerUnit) {
    const input = document.getElementById(`woQty_${surveyId}_${rencanaId}`);
    const totalCell = document.getElementById(`woRowTotal_${surveyId}_${rencanaId}`);
    if (!input || !totalCell) return;
    const qty = parseFloat(input.value) || 0;
    const total = beratPerUnit * qty;
    totalCell.innerHTML = `<strong>${total.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg</strong>`;
}

// Simpan Qty 1 baris alokasi utk 1 sapi. Kalau baris DistribusiDaging utk
// (surveyId + nama alokasi ini) sudah ada, update qty-nya (+ sinkronkan
// berat/nama terbaru dari Rencana Distribusi). Kalau belum ada dan Qty > 0,
// buat baris baru. Qty 0 pada baris yang belum pernah ada tidak perlu
// disimpan (tidak ada apa-apa buat disimpan).
async function simpanWoQty(surveyId, rencanaId) {
    const r = appData.rencanaDistribusi.find(x => x.id === rencanaId);
    if (!r) return;
    const input = document.getElementById(`woQty_${surveyId}_${rencanaId}`);
    if (!input) return;

    const qty = input.value === '' ? 0 : parseFloat(input.value);
    if (isNaN(qty) || qty < 0) { showAlert('Qty tidak valid', 'error'); return; }

    // Cegah over-kuantitas: total Qty lintas semua sapi utk alokasi ini
    // tidak boleh melebihi Qty yang direncanakan di Rencana Distribusi
    // Daging (Umum).
    const usedByOthers = totalWoQtyForAlokasiExcluding(r.alokasi, surveyId);
    const maxForRow = r.qty - usedByOthers;
    if (qty > maxForRow) {
        showAlert(`Kuantitas "${r.alokasi}" melebihi rencana. Sisa maksimal yang bisa diisi: ${Math.max(maxForRow, 0).toLocaleString('id-ID')}`, 'error');
        return;
    }

    const existing = appData.distribusiDaging.find(d =>
        d.status !== 'batal' && d.surveyId === surveyId &&
        (d.alokasi || '').trim().toLowerCase() === (r.alokasi || '').trim().toLowerCase()
    );

    if (existing) {
        const success = await updateSheetDB('DistribusiDaging', 'id', existing.id, { qty, berat: r.berat, alokasi: r.alokasi });
        if (success) {
            existing.qty = qty;
            existing.berat = r.berat;
            existing.alokasi = r.alokasi;
            showAlert(`Qty "${r.alokasi}" disimpan`, 'success');
            loadWorkOrderList('workOrderListAdmin', true);
            loadRencanaDistribusiGlobal('rencanaDistribusiBody', 'rencanaDistribusiFoot', true);
        } else {
            showAlert('Gagal menyimpan, coba lagi.', 'error');
        }
        return;
    }

    if (qty <= 0) {
        showAlert('Qty masih 0, tidak ada yang disimpan', 'info');
        return;
    }

    const newId = appData.distribusiDaging.length > 0
        ? Math.max(...appData.distribusiDaging.map(d => d.id)) + 1
        : 1;

    const record = {
        id: newId,
        surveyId: surveyId,
        alokasi: r.alokasi,
        berat: r.berat,
        qty: qty,
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('DistribusiDaging', record);
    if (success) {
        appData.distribusiDaging.push(record);
        showAlert(`Qty "${r.alokasi}" disimpan`, 'success');
        loadWorkOrderList('workOrderListAdmin', true);
        loadRencanaDistribusiGlobal('rencanaDistribusiBody', 'rencanaDistribusiFoot', true);
    } else {
        showAlert('Gagal menyimpan, coba lagi.', 'error');
    }
}

// ===== WORK ORDER SAPI - ALOKASI BAGIAN LAIN (Tulang/Jeroan/Kepala/Kaki/
// Buntut) ===== Skema paralel persis ke totalWoQtyForAlokasiExcluding/
// updateWoRowTotal/simpanWoQty di atas (utk daging), bedanya: (1) sumber
// rencana dari appData.rencanaDistribusiLain bukan rencanaDistribusi, (2)
// dicocokkan via (jenis + alokasi) bukan cuma alokasi, (3) simpan ke sheet
// DistribusiBagianLain bukan DistribusiDaging, (4) format Total unit-aware
// (kg utk tulang/jeroan, pcs utk kepala/kaki/buntut) via formatBagianLain().

// Total Qty yang sudah dipakai sapi LAIN utk 1 (jenis + alokasi) - dipakai
// buat hitung sisa kuota maksimal yang boleh diisi sapi ini.
function totalWoLainQtyForAlokasiExcluding(jenis, alokasiName, excludeSurveyId) {
    const nama = (alokasiName || '').trim().toLowerCase();
    if (!nama) return 0;
    return appData.distribusiBagianLain
        .filter(d => d.status !== 'batal' && d.surveyId !== excludeSurveyId && d.jenis === jenis && (d.alokasi || '').trim().toLowerCase() === nama)
        .reduce((sum, d) => sum + d.qty, 0);
}

// Update tampilan "Total" 1 baris bagian lain (live, belum tersimpan).
function updateWoLainRowTotal(surveyId, rencanaLainId, beratPerUnit, jenis) {
    const input = document.getElementById(`woLainQty_${surveyId}_${rencanaLainId}`);
    const totalCell = document.getElementById(`woLainRowTotal_${surveyId}_${rencanaLainId}`);
    if (!input || !totalCell) return;
    const qty = parseFloat(input.value) || 0;
    const total = beratPerUnit * qty;
    totalCell.innerHTML = `<strong>${formatBagianLain(total, jenis)}</strong>`;
}

// Simpan Qty 1 baris alokasi bagian lain utk 1 sapi ke sheet
// DistribusiBagianLain (update kalau sudah ada baris matching jenis+alokasi
// utk sapi ini, insert baru kalau belum & Qty > 0).
async function simpanWoQtyLain(surveyId, rencanaLainId) {
    const r = appData.rencanaDistribusiLain.find(x => x.id === rencanaLainId);
    if (!r) return;
    const input = document.getElementById(`woLainQty_${surveyId}_${rencanaLainId}`);
    if (!input) return;

    const qty = input.value === '' ? 0 : parseFloat(input.value);
    if (isNaN(qty) || qty < 0) { showAlert('Qty tidak valid', 'error'); return; }

    const usedByOthers = totalWoLainQtyForAlokasiExcluding(r.jenis, r.alokasi, surveyId);
    const maxForRow = r.qty - usedByOthers;
    if (qty > maxForRow) {
        showAlert(`Kuantitas "${r.alokasi}" (${BAGIAN_LAIN_LABEL[r.jenis]}) melebihi rencana. Sisa maksimal yang bisa diisi: ${Math.max(maxForRow, 0).toLocaleString('id-ID')}`, 'error');
        return;
    }

    const existing = appData.distribusiBagianLain.find(d =>
        d.status !== 'batal' && d.surveyId === surveyId && d.jenis === r.jenis &&
        (d.alokasi || '').trim().toLowerCase() === (r.alokasi || '').trim().toLowerCase()
    );

    if (existing) {
        const success = await updateSheetDB('DistribusiBagianLain', 'id', existing.id, { qty, berat: r.berat, alokasi: r.alokasi, jenis: r.jenis });
        if (success) {
            existing.qty = qty;
            existing.berat = r.berat;
            existing.alokasi = r.alokasi;
            showAlert(`Qty "${r.alokasi}" (${BAGIAN_LAIN_LABEL[r.jenis]}) disimpan`, 'success');
            loadWorkOrderList('workOrderListAdmin', true);
        } else {
            showAlert('Gagal menyimpan, coba lagi.', 'error');
        }
        return;
    }

    if (qty <= 0) {
        showAlert('Qty masih 0, tidak ada yang disimpan', 'info');
        return;
    }

    const newId = appData.distribusiBagianLain.length > 0
        ? Math.max(...appData.distribusiBagianLain.map(d => d.id)) + 1
        : 1;

    const record = {
        id: newId,
        surveyId: surveyId,
        jenis: r.jenis,
        alokasi: r.alokasi,
        berat: r.berat,
        qty: qty,
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('DistribusiBagianLain', record);
    if (success) {
        appData.distribusiBagianLain.push(record);
        showAlert(`Qty "${r.alokasi}" (${BAGIAN_LAIN_LABEL[r.jenis]}) disimpan`, 'success');
        loadWorkOrderList('workOrderListAdmin', true);
    } else {
        showAlert('Gagal menyimpan, coba lagi.', 'error');
    }
}

// ===== WORK ORDER AKTUAL (input hari pelaksanaan, tab TERPISAH dari Survey
// Sapi) ===== Skema baris = 1 alokasi aktif di Rencana Distribusi Umum,
// sama seperti Work Order rencana - bedanya: (1) simpan ke sheet
// WorkOrderAktual sendiri (bukan DistribusiDaging), (2) Qty BEBAS/tidak
// dibatasi kuota (di lapangan sering tidak persis sesuai rencana), (3) Qty
// Rencana (WO) ikut ditampilkan sebagai pembanding + kolom Selisih.
// Baris PALING ATAS selalu "Mudhohi" (baris khusus, TIDAK berasal dari
// Rencana Distribusi Umum - itu cuma utk porsi Share Warga): Berat diisi
// manual (hasil timbang aktual per porsi), Qty tetap 7 (1 sapi = 7 mudhohi),
// Selisih pakai formula khusus = Estimasi Hak Mudhohi (asumsi penuh 7 orang)
// - Aktual Penimbangan (Berat manual x 7).
function loadWoAktualList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (appData.surveySapi.length === 0) {
        container.innerHTML = '<p style="color:var(--ink-faint);">Belum ada data survey sapi.</p>';
        return;
    }

    const rencanaAktif = appData.rencanaDistribusi.filter(r => r.status !== 'batal');

    container.innerHTML = appData.surveySapi.map(s => {
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);

        let totalAktual = 0;

        // Baris khusus "Mudhohi" - selalu ada, tidak tergantung Rencana
        // Distribusi Umum. MUDHOHI_QTY_FIX = 7 (1 sapi = 7 bagian mudhohi).
        const existingMudhohi = appData.workOrderAktual.find(d =>
            d.status !== 'batal' && d.surveyId === s.id &&
            (d.alokasi || '').trim().toLowerCase() === 'mudhohi'
        );
        const beratMudhohi = existingMudhohi ? existingMudhohi.berat : 0;
        const totalMudhohiAktual = beratMudhohi * 7;
        totalAktual += totalMudhohiAktual;
        const estimasiMudhohiFull = k.hakMudhohi * 7; // = estimasiDaging / 3 (asumsi penuh 7 orang)
        const selisihMudhohi = estimasiMudhohiFull - totalMudhohiAktual;
        // Performa = Berat Aktual / Berat Hitungan (acuan) x 100% - seberapa
        // dekat hasil timbang aktual dengan hasil hitungan/estimasi.
        const performaMudhohi = k.hakMudhohi > 0 ? (beratMudhohi / k.hakMudhohi * 100) : null;
        const performaMudhohiText = performaMudhohi === null ? '—' : (Math.round(performaMudhohi * 10) / 10).toLocaleString('id-ID') + '%';

        let selisihMudhohiHtml;
        if (!existingMudhohi) {
            selisihMudhohiHtml = '<span style="color:var(--ink-faint);">—</span>';
        } else if (Math.abs(selisihMudhohi) <= 0.05) {
            selisihMudhohiHtml = `<span style="color:var(--emerald-2); font-weight:600;">Pas</span>`;
        } else if (selisihMudhohi > 0) {
            selisihMudhohiHtml = `<span style="color:var(--gold); font-weight:600;">+${formatKg(selisihMudhohi)}</span>`;
        } else {
            selisihMudhohiHtml = `<span style="color:var(--brick); font-weight:600;">${formatKg(selisihMudhohi)}</span>`;
        }

        const mudhohiRowHtml = `
            <tr style="background:var(--emerald-tint);">
              <td><strong>Mudhohi</strong></td>
              <td>
                <input type="number" id="woAktualMudhohiBerat_${s.id}" value="${beratMudhohi || ''}" placeholder="${k.hakMudhohi.toFixed(2)}" min="0" step="0.01" style="width:90px;" oninput="updateWoAktualMudhohiTotal(${s.id})">
                <div style="font-size:11px; color:var(--ink-faint); margin-top:2px;">acuan ${formatKg(k.hakMudhohi)}</div>
                <div id="woAktualMudhohiPerforma_${s.id}" style="font-size:11px; color:var(--ink-faint); margin-top:2px;">performa ${performaMudhohiText}</div>
              </td>
              <td>—</td>
              <td>7 (tetap)</td>
              <td id="woAktualMudhohiSelisih_${s.id}">${selisihMudhohiHtml}</td>
              <td id="woAktualMudhohiTotal_${s.id}"><strong>${formatKg(totalMudhohiAktual)}</strong></td>
              <td><button class="btn btn-success btn-small" onclick="simpanWoAktualMudhohi(${s.id})" title="Simpan Berat Mudhohi">💾</button></td>
            </tr>`;

        let restRowsHtml, tfootHtml;

        if (rencanaAktif.length === 0) {
            restRowsHtml = `<tr><td colspan="7" class="loading">Belum ada alokasi lain di "Rencana Distribusi Daging (Umum)" - tambahkan dulu di tab Survey Sapi.</td></tr>`;
        } else {
            restRowsHtml = rencanaAktif.map(r => {
                const rencanaWO = appData.distribusiDaging.find(d =>
                    d.status !== 'batal' && d.surveyId === s.id &&
                    (d.alokasi || '').trim().toLowerCase() === (r.alokasi || '').trim().toLowerCase()
                );
                const qtyRencana = rencanaWO ? rencanaWO.qty : 0;

                const existingAktual = appData.workOrderAktual.find(d =>
                    d.status !== 'batal' && d.surveyId === s.id &&
                    (d.alokasi || '').trim().toLowerCase() === (r.alokasi || '').trim().toLowerCase()
                );
                const qtyAktual = existingAktual ? existingAktual.qty : 0;
                const total = r.berat * qtyAktual;
                totalAktual += total;

                const selisih = qtyAktual - qtyRencana;
                let selisihHtml;
                if (!existingAktual) {
                    selisihHtml = '<span style="color:var(--ink-faint);">—</span>';
                } else if (selisih === 0) {
                    selisihHtml = `<span style="color:var(--emerald-2); font-weight:600;">Pas</span>`;
                } else if (selisih > 0) {
                    selisihHtml = `<span style="color:var(--gold); font-weight:600;">+${selisih.toLocaleString('id-ID')}</span>`;
                } else {
                    selisihHtml = `<span style="color:var(--brick); font-weight:600;">${selisih.toLocaleString('id-ID')}</span>`;
                }

                return `
                    <tr>
                      <td>${r.alokasi || '—'}</td>
                      <td>${r.berat.toLocaleString('id-ID')} kg</td>
                      <td>${qtyRencana.toLocaleString('id-ID')}</td>
                      <td><input type="number" id="woAktualQty_${s.id}_${r.id}" data-berat="${r.berat}" value="${qtyAktual || ''}" placeholder="0" min="0" step="1" style="width:90px;" oninput="updateWoAktualRowTotal(${s.id}, ${r.id}, ${r.berat})"></td>
                      <td>${selisihHtml}</td>
                      <td id="woAktualRowTotal_${s.id}_${r.id}"><strong>${total.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg</strong></td>
                      <td><button class="btn btn-success btn-small" onclick="simpanWoAktualQty(${s.id}, ${r.id})" title="Simpan Qty Aktual">💾</button></td>
                    </tr>`;
            }).join('');
        }

        tfootHtml = `
            <tr style="background:var(--sand); font-weight:700;">
              <td colspan="5">Total Aktual (termasuk Mudhohi)</td>
              <td id="woAktualTotalAll_${s.id}">${totalAktual.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg</td>
              <td></td>
            </tr>`;

        const tbodyHtml = mudhohiRowHtml + restRowsHtml;

        return `
            <div class="card" style="max-width:820px; margin-top:20px;">
              <h3 style="margin-top:0;">WO Aktual - ${surveyKode(s)} · ${s.supplier || '—'}</h3>
              <div class="survey-member-meta" style="margin:0 0 16px;">
                <div><span class="label">Supplier</span>${s.supplier || '—'}</div>
                <div><span class="label">Berat Sapi</span>${s.berat ? s.berat + ' kg' : '—'}</div>
                <div><span class="label">Estimasi Berat Daging</span>${formatKg(k.estimasiDaging)}</div>
                <div><span class="label">Total Hak Mudhohi</span>${formatKg(estimasiMudhohiFull)} <span style="color:var(--ink-faint); font-size:12px;">(7 orang)</span></div>
                <div><span class="label">Share Daging</span>${formatKg(k.shareWarga)}</div>
              </div>
              <div class="table-container">
                <table>
                  <thead><tr><th>Alokasi</th><th>Berat</th><th>Qty Rencana (WO)</th><th>Qty Aktual</th><th>Selisih</th><th>Total Aktual</th><th></th></tr></thead>
                  <tbody>${tbodyHtml}</tbody>
                  <tfoot>${tfootHtml}</tfoot>
                </table>
              </div>
              ${woAktualSeharusnyaHtml(s.id, totalAktual, beratMudhohi)}
            </div>`;
    }).join('');
}

// ── "Berat daging untuk Mudhohi seharusnya" ──────────────────────────────
// Acuan di baris Mudhohi (k.hakMudhohi) dihitung dari ESTIMASI berat daging
// waktu survey (estimasiDaging / 3 / 7 = estimasiDaging / 21). Masalahnya,
// setelah semua alokasi ditimbang & diinput, hasil AKTUAL sering meleset
// dari estimasi itu - biasanya lebih ringan. Kalau panitia tetap memakai
// acuan lama, jatah mudhohi jadi tidak sinkron dgn daging yang benar-benar
// ada di tangan.
//
// Baris ini menghitung ulang jatah mudhohi memakai pola yang SAMA
// (dibagi 21 = sepertiga bagian mudhohi, lalu dibagi 7 orang) tapi dari
// TOTAL AKTUAL, bukan dari estimasi.
// Catatan selisih ringkas: (+ 0,25 kg) kalau isian sekarang KELEBIHAN,
// (- 0,5 kg) kalau KEKURANGAN, dibanding angka seharusnya. Dipakai bareng
// oleh render awal & perhitungan ulang live supaya tidak beda bentuk.
function _woAktualCatatanHtml(beratMudhohi, seharusnya) {
    if (!beratMudhohi || beratMudhohi <= 0) return '';
    const selisih = beratMudhohi - seharusnya;
    if (Math.abs(selisih) <= 0.05) {
        return ` <span style="color:var(--emerald-2);">(pas)</span>`;
    }
    const warna = selisih > 0 ? 'var(--brick)' : 'var(--gold)';
    const tanda = selisih > 0 ? '+' : '-';
    return ` <span style="color:${warna};">(${tanda} ${formatKg(Math.abs(selisih))})</span>`;
}

function woAktualSeharusnyaHtml(surveyId, totalAktual, beratMudhohiSaatIni) {
    const seharusnya = totalAktual > 0 ? totalAktual / 21 : 0;
    const catatan = _woAktualCatatanHtml(beratMudhohiSaatIni, seharusnya);
    // Sengaja SATU baris saja - pakai <b>, BUKAN <strong>, karena CSS
    // .info-box strong{display:block} bikin catatan selisih terlempar ke
    // baris berikutnya sehingga kotaknya terlihat panjang.
    return `
        <div class="info-box" style="margin-top:14px;">
          Berat daging untuk Mudhohi seharusnya: <b id="woAktualSeharusnya_${surveyId}">${formatKg(seharusnya)}</b> per orang<span id="woAktualSeharusnyaCatatan_${surveyId}">${catatan}</span>
        </div>`;
}

// Hitung ulang Total Aktual + "seharusnya" LIVE dari semua kotak isian yang
// sedang tampil (belum tersimpan) - dipanggil tiap kali admin mengetik.
// Tanpa ini, angka "seharusnya" akan basi & menyesatkan sampai halaman
// dimuat ulang, padahal justru dipakai SAAT sedang menginput.
function updateWoAktualRingkasan(surveyId) {
    let total = 0;
    // Selektor pakai garis bawah di ujung ("woAktualQty_1_") supaya sapi id 1
    // tidak ikut menangkap kotak isian milik sapi id 12, 13, dst.
    document.querySelectorAll(`input[id^="woAktualQty_${surveyId}_"]`).forEach(inp => {
        total += (parseFloat(inp.dataset.berat) || 0) * (parseFloat(inp.value) || 0);
    });
    const inputMudhohi = document.getElementById(`woAktualMudhohiBerat_${surveyId}`);
    const beratMudhohi = inputMudhohi ? (parseFloat(inputMudhohi.value) || 0) : 0;
    total += beratMudhohi * 7;

    const selTotal = document.getElementById(`woAktualTotalAll_${surveyId}`);
    if (selTotal) selTotal.textContent = `${total.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg`;

    const seharusnya = total > 0 ? total / 21 : 0;
    const selSeharusnya = document.getElementById(`woAktualSeharusnya_${surveyId}`);
    if (selSeharusnya) selSeharusnya.textContent = formatKg(seharusnya);

    const selCatatan = document.getElementById(`woAktualSeharusnyaCatatan_${surveyId}`);
    if (selCatatan) selCatatan.innerHTML = _woAktualCatatanHtml(beratMudhohi, seharusnya);
}

// Update tampilan "Total Aktual" 1 baris (live, belum tersimpan) tiap kali
// admin ngetik ulang Qty Aktual.
// Resume/ringkasan Work Order Aktual - digabung 1 tabel supaya admin tidak
// perlu buka kartu per sapi satu-satu. Baris Mudhohi diberi nomor urut
// mengikuti jumlah sapi (Mudhohi #1, #2, #3, ...) karena tiap sapi punya
// hasil timbang mudhohi sendiri-sendiri; baris alokasi lain (RT 1, Panitia,
// dst) dijumlahkan Aktual-nya dari SEMUA sapi karena nama alokasinya sama.
// Ada kolom Plan/Aktual/Balance (konsisten dgn konvensi B/L di tabel Rencana
// Distribusi Umum: Balance = Plan - Aktual) supaya beda-nya langsung kelihatan.
function woAktualBalanceHtml(balance, hasData) {
    if (!hasData) return '<span style="color:var(--ink-faint);">—</span>';
    let color;
    if (Math.abs(balance) <= 0.05) color = 'var(--emerald-2)';
    else if (balance > 0) color = 'var(--gold)';
    else color = 'var(--brick)';
    return `<span style="color:${color}; font-weight:600;">${formatKg(balance)}</span>`;
}

function renderWoAktualResume(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (appData.surveySapi.length === 0) {
        container.innerHTML = '';
        return;
    }

    const rencanaAktif = appData.rencanaDistribusi.filter(r => r.status !== 'batal');
    let grandPlan = 0;
    let grandAktual = 0;

    const mudhohiRowsHtml = appData.surveySapi.map((s, idx) => {
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        const existingMudhohi = appData.workOrderAktual.find(d =>
            d.status !== 'batal' && d.surveyId === s.id &&
            (d.alokasi || '').trim().toLowerCase() === 'mudhohi'
        );
        const beratMudhohi = existingMudhohi ? existingMudhohi.berat : 0;
        const totalMudhohiAktual = beratMudhohi * 7;
        const estimasiMudhohiFull = k.hakMudhohi * 7;
        const balance = estimasiMudhohiFull - totalMudhohiAktual;
        grandPlan += estimasiMudhohiFull;
        grandAktual += totalMudhohiAktual;

        return `
            <tr style="background:var(--emerald-tint);">
              <td><strong>Mudhohi #${idx + 1}</strong><div style="font-size:11px; color:var(--ink-faint);">${surveyKode(s)} · ${s.supplier || '—'}</div></td>
              <td>${formatKg(estimasiMudhohiFull)}<div style="font-size:11px; color:var(--ink-faint);">7 orang</div></td>
              <td>${existingMudhohi ? formatKg(totalMudhohiAktual) : '<span style="color:var(--ink-faint);">Belum ditimbang</span>'}</td>
              <td>${woAktualBalanceHtml(balance, !!existingMudhohi)}</td>
            </tr>`;
    }).join('');

    let alokasiRowsHtml = '';
    if (rencanaAktif.length > 0) {
        alokasiRowsHtml = rencanaAktif.map(r => {
            const namaLower = (r.alokasi || '').trim().toLowerCase();
            let totalQtyAktual = 0;
            let adaAktual = false;
            appData.surveySapi.forEach(s => {
                const existingAktual = appData.workOrderAktual.find(d =>
                    d.status !== 'batal' && d.surveyId === s.id &&
                    (d.alokasi || '').trim().toLowerCase() === namaLower
                );
                if (existingAktual) adaAktual = true;
                totalQtyAktual += existingAktual ? existingAktual.qty : 0;
            });
            const planTotal = r.berat * r.qty;
            const aktualTotal = r.berat * totalQtyAktual;
            const balance = planTotal - aktualTotal;
            grandPlan += planTotal;
            grandAktual += aktualTotal;

            return `
                <tr>
                  <td>${r.alokasi || '—'}<div style="font-size:11px; color:var(--ink-faint);">${r.berat.toLocaleString('id-ID')} kg/unit</div></td>
                  <td>${formatKg(planTotal)}<div style="font-size:11px; color:var(--ink-faint);">qty ${r.qty.toLocaleString('id-ID')}</div></td>
                  <td>${adaAktual ? formatKg(aktualTotal) : '<span style="color:var(--ink-faint);">Belum diisi</span>'}<div style="font-size:11px; color:var(--ink-faint);">${adaAktual ? 'qty ' + totalQtyAktual.toLocaleString('id-ID') : ''}</div></td>
                  <td>${woAktualBalanceHtml(balance, adaAktual)}</td>
                </tr>`;
        }).join('');
    }

    const grandBalance = grandPlan - grandAktual;
    // Performa keseluruhan = Aktual / Plan x 100% - seberapa dekat realisasi
    // hari pelaksanaan dengan rencana, digabung jadi 1 angka di baris Total.
    const grandPerforma = grandPlan > 0 ? (grandAktual / grandPlan * 100) : null;
    const grandPerformaText = grandPerforma === null ? '—' : (Math.round(grandPerforma * 10) / 10).toLocaleString('id-ID') + '%';
    let grandPerformaColor = 'var(--ink-faint)';
    if (grandPerforma !== null) {
        if (Math.abs(grandPerforma - 100) <= 1) grandPerformaColor = 'var(--emerald-2)';
        else if (grandPerforma < 100) grandPerformaColor = 'var(--gold)';
        else grandPerformaColor = 'var(--brick)';
    }

    container.innerHTML = `
        <div class="card" style="max-width:820px; margin-top:20px;">
          <h3 style="margin-top:0;">Resume Work Order Aktual</h3>
          <p style="color:var(--ink-soft); font-size:13px; margin-top:-8px;">Ringkasan seluruh sapi (${appData.surveySapi.length} sapi) dalam satu tabel. Baris Mudhohi bernomor per sapi; baris alokasi lain dijumlahkan dari semua sapi. Balance = Plan − Aktual.</p>
          <div class="table-container">
            <table>
              <thead><tr><th>Alokasi</th><th>Plan</th><th>Aktual</th><th>Balance</th></tr></thead>
              <tbody>${mudhohiRowsHtml}${alokasiRowsHtml}</tbody>
              <tfoot>
                <tr style="background:var(--sand); font-weight:700;">
                  <td>Total</td>
                  <td>${formatKg(grandPlan)}</td>
                  <td>${formatKg(grandAktual)}</td>
                  <td>${woAktualBalanceHtml(grandBalance, true)}</td>
                </tr>
                <tr style="background:var(--sand); font-weight:700;">
                  <td colspan="3">Performa Keseluruhan (Aktual / Plan)</td>
                  <td><span style="color:${grandPerformaColor};">${grandPerformaText}</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>`;
}

function updateWoAktualRowTotal(surveyId, rencanaId, beratPerUnit) {
    const input = document.getElementById(`woAktualQty_${surveyId}_${rencanaId}`);
    const totalCell = document.getElementById(`woAktualRowTotal_${surveyId}_${rencanaId}`);
    if (!input || !totalCell) return;
    const qty = parseFloat(input.value) || 0;
    const total = beratPerUnit * qty;
    totalCell.innerHTML = `<strong>${total.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg</strong>`;
    updateWoAktualRingkasan(surveyId);
}

// Update tampilan Total & Selisih baris "Mudhohi" (live, belum tersimpan)
// tiap kali admin ngetik ulang Berat hasil timbang.
function updateWoAktualMudhohiTotal(surveyId) {
    const survey = appData.surveySapi.find(s => s.id === surveyId);
    if (!survey) return;
    const input = document.getElementById(`woAktualMudhohiBerat_${surveyId}`);
    const totalCell = document.getElementById(`woAktualMudhohiTotal_${surveyId}`);
    if (!input || !totalCell) return;

    const berat = parseFloat(input.value) || 0;
    const total = berat * 7;
    totalCell.innerHTML = `<strong>${formatKg(total)}</strong>`;

    const k = computeSurveyKalkulasi(survey.berat, survey.harga, survey.biayaPengolahan);

    const selisihCell = document.getElementById(`woAktualMudhohiSelisih_${surveyId}`);
    if (selisihCell) {
        const estimasi = k.hakMudhohi * 7;
        const selisih = estimasi - total;
        let html;
        if (Math.abs(selisih) <= 0.05) html = `<span style="color:var(--emerald-2); font-weight:600;">Pas</span>`;
        else if (selisih > 0) html = `<span style="color:var(--gold); font-weight:600;">+${formatKg(selisih)}</span>`;
        else html = `<span style="color:var(--brick); font-weight:600;">${formatKg(selisih)}</span>`;
        selisihCell.innerHTML = html;
    }

    // Performa = Berat Aktual / Berat Hitungan (acuan) x 100%.
    const performaCell = document.getElementById(`woAktualMudhohiPerforma_${surveyId}`);
    if (performaCell) {
        const performa = k.hakMudhohi > 0 ? (berat / k.hakMudhohi * 100) : null;
        const performaText = performa === null ? '—' : (Math.round(performa * 10) / 10).toLocaleString('id-ID') + '%';
        performaCell.textContent = `performa ${performaText}`;
    }

    updateWoAktualRingkasan(surveyId);
}

// Simpan Berat AKTUAL baris "Mudhohi" (Qty selalu dipaksa 7) ke sheet
// WorkOrderAktual, dengan nama alokasi tetap "Mudhohi" (dipakai buat
// mencocokkan baris ini tiap kali render ulang).
async function simpanWoAktualMudhohi(surveyId) {
    const input = document.getElementById(`woAktualMudhohiBerat_${surveyId}`);
    if (!input) return;

    const berat = input.value === '' ? 0 : parseFloat(input.value);
    if (isNaN(berat) || berat < 0) { showAlert('Berat tidak valid', 'error'); return; }

    const existing = appData.workOrderAktual.find(d =>
        d.status !== 'batal' && d.surveyId === surveyId &&
        (d.alokasi || '').trim().toLowerCase() === 'mudhohi'
    );

    if (existing) {
        const success = await updateSheetDB('WorkOrderAktual', 'id', existing.id, { berat, qty: 7, alokasi: 'Mudhohi' });
        if (success) {
            existing.berat = berat;
            existing.qty = 7;
            existing.alokasi = 'Mudhohi';
            showAlert('Berat Mudhohi disimpan', 'success');
            loadWoAktualList('woAktualList');
            renderWoAktualResume('woAktualResume');
        } else {
            showAlert('Gagal menyimpan, coba lagi.', 'error');
        }
        return;
    }

    if (berat <= 0) {
        showAlert('Berat masih 0, tidak ada yang disimpan', 'info');
        return;
    }

    const newId = appData.workOrderAktual.length > 0
        ? Math.max(...appData.workOrderAktual.map(d => d.id)) + 1
        : 1;

    const record = {
        id: newId,
        surveyId: surveyId,
        alokasi: 'Mudhohi',
        berat: berat,
        qty: 7,
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('WorkOrderAktual', record);
    if (success) {
        appData.workOrderAktual.push(record);
        showAlert('Berat Mudhohi disimpan', 'success');
        loadWoAktualList('woAktualList');
            renderWoAktualResume('woAktualResume');
    } else {
        showAlert('Gagal menyimpan, coba lagi.', 'error');
    }
}

// Simpan Qty AKTUAL 1 baris alokasi utk 1 sapi ke sheet WorkOrderAktual
// (terpisah dari DistribusiDaging/rencana). SENGAJA TIDAK ADA batas kuota -
// di hari pelaksanaan realitanya sering tidak persis sama dengan rencana.
async function simpanWoAktualQty(surveyId, rencanaId) {
    const r = appData.rencanaDistribusi.find(x => x.id === rencanaId);
    if (!r) return;
    const input = document.getElementById(`woAktualQty_${surveyId}_${rencanaId}`);
    if (!input) return;

    const qty = input.value === '' ? 0 : parseFloat(input.value);
    if (isNaN(qty) || qty < 0) { showAlert('Qty tidak valid', 'error'); return; }

    const existing = appData.workOrderAktual.find(d =>
        d.status !== 'batal' && d.surveyId === surveyId &&
        (d.alokasi || '').trim().toLowerCase() === (r.alokasi || '').trim().toLowerCase()
    );

    if (existing) {
        const success = await updateSheetDB('WorkOrderAktual', 'id', existing.id, { qty, berat: r.berat, alokasi: r.alokasi });
        if (success) {
            existing.qty = qty;
            existing.berat = r.berat;
            existing.alokasi = r.alokasi;
            showAlert(`Qty Aktual "${r.alokasi}" disimpan`, 'success');
            loadWoAktualList('woAktualList');
            renderWoAktualResume('woAktualResume');
        } else {
            showAlert('Gagal menyimpan, coba lagi.', 'error');
        }
        return;
    }

    if (qty <= 0) {
        showAlert('Qty masih 0, tidak ada yang disimpan', 'info');
        return;
    }

    const newId = appData.workOrderAktual.length > 0
        ? Math.max(...appData.workOrderAktual.map(d => d.id)) + 1
        : 1;

    const record = {
        id: newId,
        surveyId: surveyId,
        alokasi: r.alokasi,
        berat: r.berat,
        qty: qty,
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('WorkOrderAktual', record);
    if (success) {
        appData.workOrderAktual.push(record);
        showAlert(`Qty Aktual "${r.alokasi}" disimpan`, 'success');
        loadWoAktualList('woAktualList');
            renderWoAktualResume('woAktualResume');
    } else {
        showAlert('Gagal menyimpan, coba lagi.', 'error');
    }
}

// ===== PENERIMA & TIKET QR (daftar penerima BERNAMA per alokasi + e-tiket
// QR buat check-in hari pelaksanaan) =====
// Kuota per alokasi dihitung dari Qty di Rencana Distribusi Daging (Umum) -
// pola sama persis dengan totalWoQtyForAlokasiExcluding() di Work Order,
// bedanya di sini dihitung per NAMA (1 nama = 1 slot), bukan per sapi.
function countPenerimaAktifUntukAlokasi(alokasiName) {
    const nama = (alokasiName || '').trim().toLowerCase();
    if (!nama) return 0;
    return appData.penerimaQR.filter(p =>
        p.status !== 'batal' && (p.alokasi || '').trim().toLowerCase() === nama
    ).length;
}

// Kode tiket acak 6 karakter (huruf besar + angka, tanpa karakter ambigu
// I/O/0/1) diawali "TQ-", dicek dulu supaya tidak tabrakan sama kode yang
// sudah pernah dipakai (termasuk yang sudah dihapus/batal, biar tiket lama
// yang sudah tercetak tidak pernah dobel).
function generateKodeTiket() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let kode;
    do {
        let acak = '';
        for (let i = 0; i < 6; i++) acak += chars.charAt(Math.floor(Math.random() * chars.length));
        kode = 'TQ-' + acak;
    } while (appData.penerimaQR.some(p => p.kodeTiket === kode));
    return kode;
}

function populatePenerimaAlokasiSelect() {
    const select = document.getElementById('penerimaAlokasiSelect');
    if (!select) return;

    const rencanaAktif = appData.rencanaDistribusi.filter(r => r.status !== 'batal');
    if (rencanaAktif.length === 0) {
        select.innerHTML = '<option value="">Belum ada alokasi di Rencana Distribusi Daging (Umum)</option>';
        updatePenerimaKuotaInfo();
        return;
    }

    const currentValue = select.value;
    select.innerHTML = rencanaAktif.map(r => `<option value="${r.alokasi}">${r.alokasi} (kuota ${r.qty.toLocaleString('id-ID')})</option>`).join('');
    if (currentValue && rencanaAktif.some(r => r.alokasi === currentValue)) select.value = currentValue;

    updatePenerimaKuotaInfo();
}

function updatePenerimaKuotaInfo() {
    const select = document.getElementById('penerimaAlokasiSelect');
    const hint = document.getElementById('penerimaAlokasiSisaHint');
    if (!select) return;

    const alokasi = select.value;
    if (!alokasi) { if (hint) hint.innerHTML = ''; updatePenerimaItemKuotaInfo(); return; }

    const r = appData.rencanaDistribusi.find(x => x.status !== 'batal' && x.alokasi === alokasi);
    const kuota = r ? r.qty : 0;
    const terisi = countPenerimaAktifUntukAlokasi(alokasi);
    const sisa = kuota - terisi;

    // Tulisan kecil langsung di bawah kotak Alokasi - cukup ini saja, box
    // terpisah yang lebih panjang (penerimaKuotaInfo) sudah dihapus krn
    // dianggap redundan.
    if (hint) {
        hint.innerHTML = sisa <= 0
            ? `<span style="color:var(--brick); font-weight:600;">Kuota penuh (${terisi}/${kuota})</span>`
            : `<span style="color:var(--emerald-2); font-weight:600;">sisa ${sisa}</span>`;
    }

    updatePenerimaItemKuotaInfo();
}

// Total Item Tambahan (1 jenis) yang sudah "dijanjikan" ke SEMUA penerima
// AKTIF (bukan kategori mudhohi, lintas SEMUA alokasi) - dipakai buat hitung
// estimasi sisa kuota. SENGAJA lintas alokasi (bukan per-RT) krn stok
// fisiknya (Kepala/Kaki/Buntut/Tulang/Jeroan) memang 1 pool bersama utk
// seluruh sapi, bukan dijatah per alokasi daging.
function totalItemTambahanSemuaPenerima(jenis) {
    return appData.penerimaQR
        .filter(p => p.status !== 'batal' && p.kategori !== 'mudhohi')
        .reduce((sum, p) => sum + (parseFloat((p.itemTambahan || {})[jenis]) || 0), 0);
}

// Estimasi sisa kuota Item Tambahan (Tulang/Jeroan/Kepala/Kaki/Buntut) -
// SENGAJA otomatis dari totalBagianLainSemuaSurvey() (estimasi total dari
// SEMUA sapi hasil survey, sama sumbernya dgn tabel Estimasi Bagian Lain &
// Rencana Distribusi Bagian Lain) dikurangi yang sudah dititip ke penerima -
// TIDAK perlu admin bikin baris Rencana Distribusi Bagian Lain dulu spt
// versi awal, supaya info sisa selalu muncul tanpa langkah setup tambahan.
// Cuma informatif (bantu admin supaya tidak "over-janji" pas cetak kupon),
// TIDAK memblokir submit spt kuota alokasi daging utama - lihat komentar
// TENANT_SHEET_TEMPLATE.PenerimaQR. Utk Tulang/Jeroan angkanya kg (dari
// timbangan estimasi), sedangkan input Item Tambahan satuannya "paket" -
// dianggap 1 paket ≈ 1 kg buat keperluan estimasi kasar ini saja.
function updatePenerimaItemKuotaInfo() {
    const hintIds = { tulang: 'penerimaItemTulangHint', jeroan: 'penerimaItemJeroanHint', kepala: 'penerimaItemKepalaHint', kaki: 'penerimaItemKakiHint', buntut: 'penerimaItemBuntutHint' };

    ITEM_TAMBAHAN_JENIS_LIST.forEach(jenis => {
        const hintEl = document.getElementById(hintIds[jenis]);
        if (!hintEl) return;

        const kuota = totalBagianLainSemuaSurvey(jenis);
        const terisi = totalItemTambahanSemuaPenerima(jenis);
        const sisa = kuota - terisi;

        hintEl.innerHTML = sisa <= 0
            ? `<span style="color:var(--brick); font-weight:600;">habis (estimasi ${formatBagianLain(kuota, jenis)})</span>`
            : `<span style="color:var(--emerald-2); font-weight:600;">sisa ${formatBagianLain(sisa, jenis)}</span>`;
    });
}

// Baca 5 input Item Tambahan (Tulang/Jeroan/Kepala/Kaki/Buntut) dari form
// Kelola Daftar Penerima - cuma isikan key yang qty-nya > 0 supaya JSON yang
// disimpan ringkas & formatItemTambahanText()/renderItemTambahanBadges()
// (yang cuma nge-filter >0) tetap konsisten dgn hasilnya kosong {} kalau
// semua 0.
function bacaItemTambahanForm() {
    const ids = { tulang: 'penerimaItemTulang', jeroan: 'penerimaItemJeroan', kepala: 'penerimaItemKepala', kaki: 'penerimaItemKaki', buntut: 'penerimaItemBuntut' };
    const obj = {};
    ITEM_TAMBAHAN_JENIS_LIST.forEach(j => {
        const el = document.getElementById(ids[j]);
        const val = el ? (parseFloat(el.value) || 0) : 0;
        if (val > 0) obj[j] = val;
    });
    return obj;
}

function resetItemTambahanForm() {
    ['penerimaItemTulang', 'penerimaItemJeroan', 'penerimaItemKepala', 'penerimaItemKaki', 'penerimaItemBuntut'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function simpanPenerima() {
    const select = document.getElementById('penerimaAlokasiSelect');
    const namaInput = document.getElementById('penerimaNama');
    const noHpInput = document.getElementById('penerimaNoHp');
    const alamatInput = document.getElementById('penerimaAlamat');
    if (!select || !namaInput) return;

    const alokasi = select.value;
    const nama = namaInput.value.trim();
    const noHp = (noHpInput.value || '').trim();
    const alamat = (alamatInput.value || '').trim();
    const itemTambahanObj = bacaItemTambahanForm();

    if (!alokasi) { showAlert('Pilih alokasi dulu (tambahkan di Rencana Distribusi Daging Umum kalau belum ada)', 'error'); return; }
    if (!nama) { showAlert('Nama penerima harus diisi', 'error'); return; }

    const r = appData.rencanaDistribusi.find(x => x.status !== 'batal' && x.alokasi === alokasi);
    const kuota = r ? r.qty : 0;
    const terisi = countPenerimaAktifUntukAlokasi(alokasi);
    if (terisi >= kuota) {
        showAlert(`Kuota alokasi "${alokasi}" sudah penuh (${terisi}/${kuota}), tidak bisa tambah lagi.`, 'error');
        return;
    }

    const newId = appData.penerimaQR.length > 0
        ? Math.max(...appData.penerimaQR.map(d => d.id)) + 1
        : 1;

    const record = {
        id: newId,
        alokasi: alokasi,
        nama: nama,
        noHp: noHp,
        alamat: alamat,
        kodeTiket: generateKodeTiket(),
        status: 'aktif',
        diambil: 'tidak',
        waktuAmbil: '',
        itemTambahan: JSON.stringify(itemTambahanObj),
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('PenerimaQR', record);
    if (success) {
        appData.penerimaQR.push({ ...record, itemTambahan: itemTambahanObj, diambil: false, lokasiLat: null, lokasiLng: null, hasFotoAmbil: false });
        showAlert(`Penerima "${nama}" ditambahkan, tiket ${record.kodeTiket} siap dicetak`, 'success');
        namaInput.value = '';
        noHpInput.value = '';
        alamatInput.value = '';
        resetItemTambahanForm();
        updatePenerimaKuotaInfo();
        loadPenerimaList();
    } else {
        showAlert('Gagal menyimpan, coba lagi.', 'error');
    }
}

function loadPenerimaList() {
    const tbody = document.getElementById('penerimaListBody');
    if (!tbody) return;

    // kategori 'mudhohi' (lihat generateKuponMudhohi()) punya tabel & kartu
    // sendiri di bawah - jangan ikut dobel-tampil di sini.
    const rows = appData.penerimaQR
        .filter(p => p.status !== 'batal' && p.kategori !== 'mudhohi')
        .slice()
        .sort((a, b) => (a.alokasi || '').localeCompare(b.alokasi || '') || (a.id - b.id));

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Belum ada penerima. Tambahkan lewat form di atas.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(p => {
        const statusHtml = p.diambil
            ? `<span style="color:var(--brick); font-weight:600;">✓ Sudah diambil</span>${p.waktuAmbil ? `<div style="font-size:11px; color:var(--ink-faint);">${new Date(p.waktuAmbil).toLocaleString('id-ID')}</div>` : ''}`
            : `<span style="color:var(--emerald-2); font-weight:600;">Belum diambil</span>`;

        const itemTambahanBadges = renderItemTambahanBadges(p.itemTambahan);

        return `
            <tr>
              <td>${p.alokasi || '—'}</td>
              <td>${p.nama || '—'}</td>
              <td>${p.noHp || '—'}</td>
              <td>${p.alamat || '—'}</td>
              <td>${itemTambahanBadges || '<span style="color:var(--ink-faint);">—</span>'}</td>
              <td><code>${p.kodeTiket}</code></td>
              <td>${statusHtml}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-ghost btn-small" onclick="lihatQrPenerima(${p.id})" title="Lihat/Cetak QR">🔳</button>
                <button class="btn btn-ghost btn-small" onclick="kirimTiketWA(${p.id})" title="Kirim tiket lewat WhatsApp">📲</button>
                <button class="btn btn-ghost btn-small" onclick="hapusPenerima(${p.id})" title="Hapus">🗑️</button>
              </td>
            </tr>`;
    }).join('');
}

// ══ KUPON MUDHOHI (auto-generate dari peserta Survey Sapi) ══
// Beda dari "Penerima" biasa di atas (manual, satu-satu, terikat alokasi
// Rencana Distribusi Umum): Mudhohi itu peserta yang SUDAH terdaftar lewat
// tombol "Ikut" di Survey Sapi (appData.surveyPeserta) - jadi kupon-nya
// dibuat otomatis dari data yang sudah ada, tidak perlu input ulang nama
// satu-satu. 1 kupon = 1 peserta, isinya nama, kelompok sapi (Survey#...),
// dan jatah berat daging (Hak Mudhohi - rumus sama dengan tab Survey Sapi,
// lihat computeSurveyKalkulasi()). Disimpan di sheet PenerimaQR yang sama
// dengan Penerima biasa (kategori='mudhohi') supaya ikut kepakai infrastruktur
// QR/scan/check-in yang sama pas hari-H, tinggal dibedakan tampilannya saja.
function ringkasanKuponMudhohi() {
    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');
    const sudahAdaIds = new Set(
        appData.penerimaQR
            .filter(p => p.kategori === 'mudhohi' && p.status !== 'batal' && p.sourcePesertaId)
            .map(p => p.sourcePesertaId)
    );
    const belum = activePeserta.filter(p => !sudahAdaIds.has(p.id)).length;
    return { total: activePeserta.length, sudah: activePeserta.length - belum, belum };
}

function renderKuponMudhohiRingkasan() {
    const box = document.getElementById('kuponMudhohiRingkasan');
    if (!box) return;
    const r = ringkasanKuponMudhohi();
    if (r.total === 0) {
        box.innerHTML = '<span style="color:var(--ink-faint);">Belum ada peserta terdaftar di Survey Sapi.</span>';
        return;
    }
    box.innerHTML = r.belum > 0
        ? `<span style="color:var(--ink-soft);">${r.sudah} dari ${r.total} peserta sudah punya kupon <span style="color:var(--brick); font-weight:600;">(${r.belum} belum dibuat)</span></span>`
        : `<span style="color:var(--emerald-2); font-weight:600;">✓ Semua ${r.total} peserta sudah punya kupon</span>`;
}

async function generateKuponMudhohi() {
    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');
    const sudahAdaIds = new Set(
        appData.penerimaQR
            .filter(p => p.kategori === 'mudhohi' && p.status !== 'batal' && p.sourcePesertaId)
            .map(p => p.sourcePesertaId)
    );
    const belum = activePeserta.filter(p => !sudahAdaIds.has(p.id));

    if (belum.length === 0) {
        showAlert('Semua peserta sudah punya kupon Mudhohi.', 'info');
        return;
    }

    const btn = document.getElementById('kuponMudhohiGenerateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Membuat kupon…'; }

    let sukses = 0, gagal = 0;
    for (const p of belum) {
        const survey = appData.surveySapi.find(s => s.id === p.surveyId);
        if (!survey) { gagal++; continue; } // peserta yatim (grup sapinya sudah dihapus) - lewati

        const k = computeSurveyKalkulasi(survey.berat, survey.harga, survey.biayaPengolahan);
        const kelompokSapi = `${surveyKode(survey)} · ${jenisSapiLabel(survey.jenisSapi)}${survey.supplier ? ' · ' + survey.supplier : ''}`;

        const newId = appData.penerimaQR.length > 0
            ? Math.max(...appData.penerimaQR.map(d => d.id)) + 1
            : 1;

        const record = {
            id: newId,
            alokasi: '',
            // Peserta 'instan' (Daftar Langsung) bisa isi "Qurban Atas Nama"
            // yang beda dari nama pendaftar (mis. atas nama ortu yg sudah
            // wafat) - itu yang harus tercetak di e-tiket, bukan nama
            // pendaftar. Kosong -> fallback ke nama pendaftar sendiri (sama
            // seperti sebelumnya utk peserta tabungan biasa).
            nama: p.atasNama || p.memberName,
            noHp: p.phone || '',
            // Peserta 'instan' (Daftar Langsung) isi alamat sendiri saat
            // daftar - dibawa ke sini supaya e-tiketnya lengkap. Peserta
            // tabungan biasa tidak isi alamat di SurveyPeserta (datanya ada
            // di Members sendiri), jadi kosong seperti sebelumnya.
            alamat: p.alamat || '',
            kodeTiket: generateKodeTiket(),
            status: 'aktif',
            diambil: 'tidak',
            waktuAmbil: '',
            kategori: 'mudhohi',
            berat: Math.round(k.hakMudhohi * 100) / 100,
            kelompokSapi: kelompokSapi,
            sourcePesertaId: p.id,
            created_date: new Date().toISOString()
        };

        // Sengaja satu-satu berurutan (bukan Promise.all) - lebih aman utk
        // Google Sheets API (append banyak baris paralel rawan tabrakan) dan
        // supaya appData.penerimaQR (dipakai generateKodeTiket() buat cek kode
        // dobel) selalu update sebelum iterasi berikutnya.
        const success = await appendSheetDB('PenerimaQR', record);
        if (success) {
            appData.penerimaQR.push({ ...record, diambil: false, lokasiLat: null, lokasiLng: null, hasFotoAmbil: false });
            sukses++;
        } else {
            gagal++;
        }
    }

    if (btn) { btn.disabled = false; btn.textContent = '🎫 Generate Kupon Mudhohi'; }

    if (sukses > 0) {
        showAlert(`${sukses} kupon Mudhohi berhasil dibuat${gagal > 0 ? `, ${gagal} gagal (coba generate ulang)` : ''}.`, gagal > 0 ? 'warning' : 'success');
    } else {
        showAlert('Gagal membuat kupon, coba lagi.', 'error');
    }

    renderKuponMudhohiRingkasan();
    loadKuponMudhohiList();
}

function loadKuponMudhohiList() {
    const tbody = document.getElementById('kuponMudhohiListBody');
    if (!tbody) return;

    renderKuponMudhohiRingkasan();

    const rows = appData.penerimaQR
        .filter(p => p.kategori === 'mudhohi' && p.status !== 'batal')
        .slice()
        .sort((a, b) => (a.kelompokSapi || '').localeCompare(b.kelompokSapi || '') || (a.nama || '').localeCompare(b.nama || ''));

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Belum ada kupon. Klik "Generate Kupon Mudhohi" di atas.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(p => {
        const statusHtml = p.diambil
            ? `<span style="color:var(--brick); font-weight:600;">✓ Sudah diambil</span>${p.waktuAmbil ? `<div style="font-size:11px; color:var(--ink-faint);">${new Date(p.waktuAmbil).toLocaleString('id-ID')}</div>` : ''}`
            : `<span style="color:var(--emerald-2); font-weight:600;">Belum diambil</span>`;

        return `
            <tr>
              <td>${p.nama || '—'}</td>
              <td>${p.kelompokSapi || '—'}</td>
              <td>${p.berat != null ? formatKg(p.berat) : '—'}</td>
              <td><code>${p.kodeTiket}</code></td>
              <td>${statusHtml}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-ghost btn-small" onclick="lihatQrPenerima(${p.id})" title="Lihat/Cetak QR">🔳</button>
                <button class="btn btn-ghost btn-small" onclick="kirimTiketWA(${p.id})" title="Kirim tiket lewat WhatsApp">📲</button>
                <button class="btn btn-ghost btn-small" onclick="hapusPenerima(${p.id})" title="Hapus">🗑️</button>
              </td>
            </tr>`;
    }).join('');
}

// Soft-delete (status='batal') - sama pola dengan data lain di app ini.
async function hapusPenerima(id) {
    const p = appData.penerimaQR.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Hapus penerima "${p.nama}" (tiket ${p.kodeTiket})? Tiket yang sudah dicetak jadi tidak berlaku.`)) return;

    const success = await updateSheetDB('PenerimaQR', 'id', id, { status: 'batal' });
    if (success) {
        p.status = 'batal';
        showAlert('Penerima dihapus', 'success');
        updatePenerimaKuotaInfo();
        loadPenerimaList();
    } else {
        showAlert('Gagal menghapus, coba lagi.', 'error');
    }
}

// Tampilkan QR (pakai modal previewModal yang sama dengan preview bukti
// transfer/foto survey - lihat showPreview()/viewSurveyFotos()) + tombol
// cetak.
async function lihatQrPenerima(id) {
    const p = appData.penerimaQR.find(x => x.id === id);
    if (!p) return;

    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const body = document.getElementById('previewBody');

    const statusHtml = p.diambil
        ? `<div class="tiket-status diambil">✓ Sudah diambil</div>${p.waktuAmbil ? `<div class="tiket-waktu">${new Date(p.waktuAmbil).toLocaleString('id-ID')}</div>` : ''}`
        : `<div class="tiket-status belum">Belum diambil</div>`;

    // Bukti pengambilan (lokasi GPS + foto) - cuma ada kalau tiket sudah
    // diambil DAN sempat ditangkap otomatis saat konfirmasi (lihat
    // bukaKonfirmasiPengambilan/konfirmasiPengambilan).
    const buktiHtml = p.diambil ? `
        <div style="margin-top:18px; padding-top:16px; border-top:1px dashed var(--border); text-align:left; max-width:360px;">
          <div style="font-size:13px; color:var(--ink-faint); margin-bottom:8px;">Bukti Pengambilan</div>
          ${(p.lokasiLat && p.lokasiLng)
              ? `<div><a href="https://www.google.com/maps?q=${p.lokasiLat},${p.lokasiLng}" target="_blank" rel="noopener">📍 Lihat Lokasi di Google Maps</a></div>`
              : `<div style="color:var(--ink-faint); font-size:13px;">📍 Lokasi tidak tercatat</div>`}
          ${p.hasFotoAmbil
              ? `<div style="margin-top:10px;"><button class="btn btn-ghost btn-small" id="btnLihatFoto_${p.id}" onclick="lihatFotoPengambilan(${p.id})">📷 Lihat Foto Pengambilan</button><div id="fotoPengambilanPreview_${p.id}" style="margin-top:10px;"></div></div>`
              : `<div style="color:var(--ink-faint); font-size:13px; margin-top:6px;">📷 Tidak ada foto</div>`}
        </div>` : '';

    const isMudhohi = p.kategori === 'mudhohi';
    const mosqueNameSafe = (APP_CONFIG.mosqueName || 'Masjid').trim();
    // Kalau logoFile belum diisi (masjid baru/belum sempat upload logo),
    // pakai monogram huruf awal nama masjid - supaya kartu tetap lengkap,
    // bukan kotak gambar kosong/rusak (<img src=""> sering tidak render
    // apa-apa di sebagian browser).
    const logoHtml = APP_CONFIG.logoFile
        ? `<img src="${APP_CONFIG.logoFile}" alt="${mosqueNameSafe}" class="tiket-logo">`
        : `<div class="tiket-logo tiket-logo-fallback">${mosqueNameSafe.charAt(0).toUpperCase()}</div>`;
    title.textContent = `${isMudhohi ? 'Kupon Mudhohi' : 'E-Tiket'} - ${p.nama}`;
    body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center;">
          <div class="tiket-card">
            <div class="tiket-head">
              ${logoHtml}
              <div>
                <div class="tiket-masjid">${mosqueNameSafe}</div>
                <div class="tiket-kategori">${isMudhohi ? 'Kupon Mudhohi' : 'E-Tiket Penerima'}</div>
              </div>
            </div>

            <div class="tiket-nama">${p.nama}</div>
            <div class="tiket-stats">
              ${isMudhohi ? `
                <div class="tiket-stat"><span class="ts-label">Kelompok Sapi</span><span class="ts-val">${p.kelompokSapi || '—'}</span></div>
                <div class="tiket-stat"><span class="ts-label">Jatah Daging</span><span class="ts-val">${p.berat != null ? formatKg(p.berat) : '—'}</span></div>
              ` : `
                <div class="tiket-stat"><span class="ts-label">Alokasi</span><span class="ts-val">${p.alokasi || '—'}</span></div>
                ${p.noHp ? `<div class="tiket-stat"><span class="ts-label">No. HP</span><span class="ts-val">${p.noHp}</span></div>` : ''}
              `}
            </div>
            ${(!isMudhohi && p.alamat) ? `<div class="tiket-alamat">${p.alamat}</div>` : ''}
            ${(!isMudhohi && p.itemTambahan && Object.keys(p.itemTambahan).length > 0) ? `
              <div style="margin-top:10px; text-align:center;">
                <div style="font-size:11px; color:var(--ink-faint); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">Item Tambahan</div>
                ${renderItemTambahanBadges(p.itemTambahan)}
              </div>` : ''}

            <div class="tiket-perforasi">
              <span class="notch left"></span><span class="dash-line"></span><span class="notch right"></span>
            </div>

            <div class="tiket-qr-wrap">
              <div id="qrCodeContainer" class="tiket-qr"></div>
              <div class="tiket-kode">${p.kodeTiket}</div>
              ${statusHtml}
            </div>
          </div>

          <div class="actions" style="justify-content:center; margin-top:20px;">
            <button class="btn btn-primary btn-small" onclick="cetakTiketPenerima(${p.id})">🖨️ Cetak Tiket</button>
            <button class="btn btn-secondary btn-small" onclick="kirimTiketWA(${p.id})">📲 Kirim WhatsApp</button>
          </div>
          ${buktiHtml}
        </div>`;
    modal.classList.add('show');

    const qrEl = document.getElementById('qrCodeContainer');
    qrEl.innerHTML = '';
    await ensureQRCodeLib();
    new QRCode(qrEl, {
        text: p.kodeTiket,
        width: 200,
        height: 200,
        colorDark: '#1E4A3B',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
}

// ══════════════════════════════════════════════════════════════
// ══ KIRIM TIKET LEWAT WHATSAPP (sebagai GAMBAR) ══
// ══════════════════════════════════════════════════════════════
// Kenapa digambar manual di <canvas>, bukan "memotret" kartu tiket yang
// sudah tampil di layar pakai html2canvas: pemotretan DOM sudah terbukti
// bermasalah di project ini waktu bikin PDF (layout grid/flex tidak
// terbaca benar, elemen ber-posisi khusus hilang) - lihat riwayat commit
// soal PDF. Menggambar sendiri memang lebih panjang kodenya, tapi hasilnya
// pasti sama di semua HP.
//
// SOAL LOGO MASJID:
// Menggambar gambar dari domain lain ke canvas bisa membuat canvas jadi
// "tercemar" (tainted) - dan canvas yang tercemar TIDAK BISA diubah jadi
// file gambar (canvas.toBlob() gagal), artinya tiketnya malah tidak bisa
// dikirim sama sekali. Karena itu logo tidak ditempel begitu saja:
//   1. Kalau logoFile berupa path lokal (mis. "logo-masjid.jpg", seperti
//      punya Dhafinul) - satu domain dgn aplikasi, aman, tidak ada isu.
//   2. Kalau berupa URL domain lain (Vercel Blob) - dimuat dengan
//      crossOrigin='anonymous' supaya browser meminta izin CORS lebih dulu.
//      Vercel Blob mengizinkan ini, jadi umumnya berhasil.
//   3. Apa pun hasilnya, dicek dulu lewat _muatLogoAman(): logo digambar ke
//      canvas uji 1x1 lalu dicoba dibaca. Kalau ternyata tetap tercemar
//      (atau gagal dimuat/kelamaan), otomatis kembali ke monogram huruf
//      awal. Jadi tiket SELALU bisa dikirim - logo cuma bonus, bukan syarat.

// Muat logo & pastikan aman dipakai di canvas. Balikin <img> kalau aman,
// null kalau tidak (pemanggil tinggal pakai monogram).
function _muatLogoAman(url) {
    return new Promise(resolve => {
        if (!url) return resolve(null);
        const img = new Image();
        let selesai = false;
        const beres = (hasil) => { if (!selesai) { selesai = true; resolve(hasil); } };
        // Jangan sampai pembuatan tiket menggantung cuma gara-gara logo
        // lambat/tidak bisa diakses.
        const timer = setTimeout(() => beres(null), 5000);
        img.onload = () => {
            clearTimeout(timer);
            try {
                const uji = document.createElement('canvas');
                uji.width = 1; uji.height = 1;
                const u = uji.getContext('2d');
                u.drawImage(img, 0, 0, 1, 1);
                u.getImageData(0, 0, 1, 1); // melempar error kalau tercemar
                beres(img);
            } catch (e) {
                console.warn('Logo tidak bisa dipakai di gambar tiket (izin lintas domain), pakai monogram:', e);
                beres(null);
            }
        };
        img.onerror = () => { clearTimeout(timer); beres(null); };
        // crossOrigin WAJIB diset SEBELUM src, kalau sesudah tidak berpengaruh.
        try {
            const absolut = new URL(url, window.location.href);
            if (absolut.origin !== window.location.origin) img.crossOrigin = 'anonymous';
            img.src = absolut.href;
        } catch (e) {
            img.src = url; // URL aneh - coba apa adanya
        }
    });
}
function _tulisTeksTerbungkus(ctx, teks, x, y, lebarMaks, tinggiBaris, maksBaris) {
    const kata = String(teks || '').split(' ');
    let baris = '', jml = 0;
    for (let i = 0; i < kata.length; i++) {
        const coba = baris ? baris + ' ' + kata[i] : kata[i];
        if (ctx.measureText(coba).width > lebarMaks && baris) {
            ctx.fillText(baris, x, y);
            y += tinggiBaris;
            baris = kata[i];
            if (++jml >= (maksBaris || 99) - 1) break;
        } else {
            baris = coba;
        }
    }
    if (baris) ctx.fillText(baris, x, y);
    return y + tinggiBaris;
}

// Hitung berapa baris sebuah teks akan memakan, TANPA menggambar - dipakai
// menghitung tinggi kartu dulu sebelum menggambar, supaya tidak ada ruang
// kosong menganga di bawah (tinggi canvas harus ditetapkan di awal).
function _hitungBaris(ctx, teks, lebarMaks, maksBaris) {
    const kata = String(teks == null ? '' : teks).split(' ').filter(Boolean);
    if (kata.length === 0) return 0;
    let baris = '', jml = 1;
    for (const k of kata) {
        const coba = baris ? baris + ' ' + k : k;
        if (ctx.measureText(coba).width > lebarMaks && baris) {
            if (++jml >= (maksBaris || 99)) return maksBaris || jml;
            baris = k;
        } else {
            baris = coba;
        }
    }
    return jml;
}

function _kotakMembulat(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Tulis teks dgn jarak antar huruf (letter-spacing) - dipakai utk kode tiket
// & label kecil, meniru CSS versi cetak. Canvas tidak punya letterSpacing di
// semua browser, jadi digambar per huruf.
function _tulisRenggang(ctx, teks, x, y, spasi, rata) {
    const s = String(teks == null ? '' : teks);
    let total = 0;
    for (const ch of s) total += ctx.measureText(ch).width + spasi;
    total -= spasi;
    let cx = rata === 'center' ? x - total / 2 : x;
    const rataLama = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const ch of s) {
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + spasi;
    }
    ctx.textAlign = rataLama;
    return total;
}

async function buatGambarTiket(p) {
    await ensureQRCodeLib();

    // QR digambar dulu ke elemen tersembunyi, lalu canvas-nya disalin ke
    // kartu. qrcodejs membuat <canvas> (dan <img> cadangan) di dalam
    // container yang diberikan.
    const wadah = document.createElement('div');
    wadah.style.cssText = 'position:fixed; left:-9999px; top:0;';
    document.body.appendChild(wadah);
    new QRCode(wadah, {
        text: p.kodeTiket, width: 420, height: 420,
        colorDark: '#0E3B34', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
    // Logo dimuat BARENGAN dgn jeda render QR (bukan berurutan) supaya
    // pembuatan tiket tidak terasa lebih lambat gara-gara nunggu logo.
    const [, logoImg] = await Promise.all([
        new Promise(r => setTimeout(r, 60)), // beri napas supaya QR selesai dirender
        _muatLogoAman(APP_CONFIG.logoFile)
    ]);
    const qrCanvas = wadah.querySelector('canvas');

    const isMudhohi = p.kategori === 'mudhohi';
    const namaMasjid = (APP_CONFIG.mosqueName || 'Masjid').trim();

    // ── Ukuran mengikuti versi CETAK (cetakTiketPenerima) ──
    // Kartu cetak lebarnya 330px; di sini digambar 720px supaya tajam saat
    // dilihat di HP. Semua ukuran font/jarak di bawah = ukuran CSS versi
    // cetak x S, jadi proporsinya benar-benar sama, bukan kira-kira.
    const S = 720 / 330;
    const W = 800;
    const KARTU_X = (W - 720) / 2, KARTU_W = 720;
    const PAD = Math.round(20 * S);          // .body padding kiri/kanan
    const ISI_W = KARTU_W - PAD * 2;

    // Baris rincian - SAMA PERSIS dgn statRows versi cetak (label kiri,
    // nilai kanan), termasuk No. HP & Item Tambahan yang di versi lama
    // sempat berbeda.
    const itemText = !isMudhohi ? formatItemTambahanText(p.itemTambahan) : '';
    const stats = isMudhohi
        ? [['Kelompok Sapi', p.kelompokSapi || '—'], ['Jatah Daging', p.berat != null ? formatKg(p.berat) : '—']]
        : [['Alokasi', p.alokasi || '—'],
           ...(p.noHp ? [['No. HP', p.noHp]] : []),
           ...(p.alamat ? [['Alamat', p.alamat]] : []),
           ...(itemText ? [['Item Tambahan', itemText]] : [])];

    // ── Pengukuran dulu, menggambar belakangan ──
    const ukur = document.createElement('canvas').getContext('2d');
    const F_NAMA = `bold ${Math.round(21 * S)}px Georgia, 'Times New Roman', serif`;
    const F_STAT = `${Math.round(12.5 * S)}px Georgia, 'Times New Roman', serif`;
    ukur.font = F_NAMA;
    const barisNama = Math.max(1, _hitungBaris(ukur, p.nama || '-', ISI_W, 2));
    ukur.font = F_STAT;
    const TINGGI_STAT = Math.round(19 * S);
    let tinggiStats = 0;
    const barisStat = stats.map(([label, nilai]) => {
        const lebarLabel = ukur.measureText(String(label)).width + 20;
        const n = Math.max(1, _hitungBaris(ukur, nilai, ISI_W - lebarLabel, 3));
        tinggiStats += n * TINGGI_STAT + Math.round(8 * S);
        return n;
    });

    const T_HEAD = Math.round(70 * S);
    const T_BODY = Math.round(22 * S) + barisNama * Math.round(27 * S) + Math.round(12 * S) + tinggiStats + Math.round(10 * S);
    const SISI_QR = Math.round(190 * S);
    const T_QR = Math.round(20 * S) + SISI_QR + Math.round(14 * S) + Math.round(20 * S) + Math.round(10 * S) + Math.round(16 * S) + Math.round(14 * S);
    const T_FOOT = Math.round(26 * S);
    const KARTU_H = T_HEAD + T_BODY + T_QR + T_FOOT;
    const MARGIN = Math.round(26 * S);
    const H = KARTU_H + MARGIN * 2;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Latar halaman (versi cetak: body putih)
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    const KARTU_Y = MARGIN, RADIUS = Math.round(14 * S);

    // Badan kartu + garis tepi emerald (versi cetak: border 1.5px #0E3B34)
    ctx.save();
    _kotakMembulat(ctx, KARTU_X, KARTU_Y, KARTU_W, KARTU_H, RADIUS);
    ctx.clip();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(KARTU_X, KARTU_Y, KARTU_W, KARTU_H);

    // ── KEPALA (emerald) ──
    ctx.fillStyle = '#0E3B34';
    ctx.fillRect(KARTU_X, KARTU_Y, KARTU_W, T_HEAD);

    const HPAD = Math.round(18 * S);
    const LOGO = Math.round(34 * S);
    const logoX = KARTU_X + HPAD, logoY = KARTU_Y + (T_HEAD - LOGO) / 2;
    const LOGO_R = Math.round(8 * S); // versi cetak: border-radius 8px (kotak membulat, BUKAN lingkaran)

    ctx.save();
    _kotakMembulat(ctx, logoX, logoY, LOGO, LOGO, LOGO_R);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(logoX, logoY, LOGO, LOGO);
    if (logoImg) {
        // object-fit: contain (versi cetak) - seluruh logo terlihat, tidak
        // terpotong, dgn sedikit padding spt CSS-nya.
        const pad = Math.round(3 * S);
        const muat = LOGO - pad * 2;
        const lw = logoImg.naturalWidth || muat, lh = logoImg.naturalHeight || muat;
        const skala = Math.min(muat / lw, muat / lh);
        const dw = lw * skala, dh = lh * skala;
        ctx.drawImage(logoImg, logoX + (LOGO - dw) / 2, logoY + (LOGO - dh) / 2, dw, dh);
    } else {
        ctx.fillStyle = '#DCBB79';
        ctx.font = `bold ${Math.round(15 * S)}px Georgia, serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(namaMasjid.charAt(0).toUpperCase(), logoX + LOGO / 2, logoY + LOGO / 2 + 1);
    }
    ctx.restore();

    const teksX = logoX + LOGO + Math.round(10 * S);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FBF8F1';
    ctx.font = `bold ${Math.round(14.5 * S)}px Georgia, 'Times New Roman', serif`;
    const namaY = KARTU_Y + T_HEAD / 2 - Math.round(2 * S);
    _tulisTeksTerbungkus(ctx, namaMasjid, teksX, namaY, KARTU_W - (teksX - KARTU_X) - HPAD, Math.round(18 * S), 2);
    ctx.fillStyle = '#DCBB79';
    ctx.font = `${Math.round(9 * S)}px Georgia, serif`;
    _tulisRenggang(ctx, (isMudhohi ? 'KUPON MUDHOHI' : 'E-TIKET PENERIMA'), teksX, namaY + Math.round(15 * S), Math.round(1.5 * S), 'left');

    // ── BADAN ──
    let y = KARTU_Y + T_HEAD + Math.round(22 * S) + Math.round(16 * S);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0E3B34';
    ctx.font = F_NAMA;
    y = _tulisTeksTerbungkus(ctx, p.nama || '-', KARTU_X + KARTU_W / 2, y, ISI_W, Math.round(27 * S), 2);
    y += Math.round(6 * S);

    // Baris rincian: label kiri abu-abu, nilai kanan emerald tebal
    stats.forEach(([label, nilai], i) => {
        ctx.font = F_STAT;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#777777';
        ctx.fillText(String(label), KARTU_X + PAD, y);
        const lebarLabel = ctx.measureText(String(label)).width + 20;

        ctx.textAlign = 'right';
        ctx.fillStyle = '#0E3B34';
        ctx.font = `bold ${Math.round(12.5 * S)}px Georgia, 'Times New Roman', serif`;
        const kananX = KARTU_X + KARTU_W - PAD;
        const lebarNilai = ISI_W - lebarLabel;
        // Nilai panjang (alamat/item tambahan) dibungkus ke bawah, tetap
        // rata kanan spt versi cetak.
        const kata = String(nilai).split(' ');
        let baris = '', barisTerkumpul = [];
        for (const k of kata) {
            const coba = baris ? baris + ' ' + k : k;
            if (ctx.measureText(coba).width > lebarNilai && baris) { barisTerkumpul.push(baris); baris = k; }
            else baris = coba;
        }
        if (baris) barisTerkumpul.push(baris);
        barisTerkumpul.slice(0, 3).forEach((b, bi) => {
            ctx.fillText(b, kananX, y + bi * TINGGI_STAT);
        });
        y += Math.max(1, Math.min(3, barisTerkumpul.length)) * TINGGI_STAT + Math.round(8 * S);
    });

    // ── PERFORASI (versi cetak: garis putus-putus EMAS, selebar kartu) ──
    y += Math.round(6 * S);
    ctx.strokeStyle = '#B6893A';
    ctx.lineWidth = Math.max(2, Math.round(1.5 * S));
    ctx.setLineDash([Math.round(6 * S), Math.round(5 * S)]);
    ctx.beginPath(); ctx.moveTo(KARTU_X, y); ctx.lineTo(KARTU_X + KARTU_W, y); ctx.stroke();
    ctx.setLineDash([]);

    // ── QR + KODE + STATUS ──
    y += Math.round(20 * S);
    if (qrCanvas) {
        ctx.drawImage(qrCanvas, KARTU_X + (KARTU_W - SISI_QR) / 2, y, SISI_QR, SISI_QR);
    }
    y += SISI_QR + Math.round(24 * S);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#8A6423';
    ctx.font = `bold ${Math.round(16 * S)}px 'Courier New', Courier, monospace`;
    _tulisRenggang(ctx, p.kodeTiket || '-', KARTU_X + KARTU_W / 2, y, Math.round(3 * S), 'center');
    y += Math.round(20 * S);

    ctx.fillStyle = '#0E3B34';
    ctx.font = `bold ${Math.round(11 * S)}px Georgia, serif`;
    _tulisRenggang(ctx, p.diambil ? '✓ SUDAH DIAMBIL' : 'BELUM DIAMBIL', KARTU_X + KARTU_W / 2, y, Math.round(.5 * S), 'center');

    // ── KAKI (versi cetak: pita krem) ──
    const footY = KARTU_Y + KARTU_H - T_FOOT;
    ctx.fillStyle = '#F0E9DA';
    ctx.fillRect(KARTU_X, footY, KARTU_W, T_FOOT);
    ctx.fillStyle = '#5C584F';
    ctx.font = `${Math.round(9 * S)}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    _tulisRenggang(ctx, 'ALUR QURBAN · TATA KELOLA QURBAN MASJID', KARTU_X + KARTU_W / 2, footY + T_FOOT / 2, Math.round(1 * S), 'center');
    ctx.textBaseline = 'alphabetic';

    ctx.restore(); // lepas clip kartu

    // Garis tepi kartu digambar TERAKHIR supaya tidak tertimpa isi
    ctx.strokeStyle = '#0E3B34';
    ctx.lineWidth = Math.max(2, Math.round(1.5 * S));
    _kotakMembulat(ctx, KARTU_X, KARTU_Y, KARTU_W, KARTU_H, RADIUS);
    ctx.stroke();

    document.body.removeChild(wadah);

    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    return blob;
}

// Teks pendamping gambar (jadi caption di WhatsApp).
function _teksTiket(p) {
    const isMudhohi = p.kategori === 'mudhohi';
    const baris = [
        `Assalamu'alaikum ${p.nama || ''},`.trim(),
        '',
        isMudhohi
            ? `Berikut kupon Mudhohi Anda dari ${APP_CONFIG.mosqueName}:`
            : `Berikut e-tiket pengambilan daging qurban dari ${APP_CONFIG.mosqueName}:`,
        '',
        isMudhohi ? `Kelompok Sapi: ${p.kelompokSapi || '-'}` : `Alokasi: ${p.alokasi || '-'}`,
        `Kode Tiket: ${p.kodeTiket}`,
        '',
        'Mohon tunjukkan tiket ini (gambar QR di atas) kepada panitia saat pengambilan.',
        '',
        `Panitia Qurban ${APP_CONFIG.mosqueName}`
    ];
    return baris.join('\n');
}

async function kirimTiketWA(id) {
    const p = appData.penerimaQR.find(x => x.id === id);
    if (!p) return;

    showAlert('Menyiapkan gambar tiket…', 'info');
    let blob;
    try {
        blob = await buatGambarTiket(p);
    } catch (err) {
        console.error('Gagal membuat gambar tiket:', err);
        showAlert('Gagal membuat gambar tiket.', 'error');
        return;
    }
    if (!blob) {
        showAlert('Gagal membuat gambar tiket.', 'error');
        return;
    }

    const namaFile = `tiket-${(p.nama || 'penerima').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${p.kodeTiket}.png`;
    const file = new File([blob], namaFile, { type: 'image/png' });
    const teks = _teksTiket(p);

    // ── URUTAN JALUR (penting, jangan dibalik) ─────────────────────────
    // MASALAH YANG DISELESAIKAN: dulu jalur pertama adalah menu "Bagikan"
    // bawaan HP. Gambarnya memang terkirim utuh, TAPI admin harus mencari
    // sendiri kontak tujuannya di dalam WhatsApp - padahal nomor calon
    // penerima tiket sering BELUM tersimpan di HP admin, jadi malah buntu.
    //
    // Padahal nomor penerima SUDAH ADA di aplikasi (kolom No. HP), dan
    // link wa.me bisa membuka chat ke nomor mana pun TANPA perlu disimpan
    // sebagai kontak lebih dulu. Yang tidak bisa lewat wa.me cuma
    // melampirkan gambar. Jadi sekarang: gambar disalin ke papan klip,
    // chat dibuka langsung ke nomor penerima, admin tinggal menempel.
    if (p.noHp) {
        let tersalin = false;
        try {
            if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                tersalin = true;
            }
        } catch (err) {
            // Umum terjadi kalau browser/HP tidak mengizinkan menyalin gambar
            // (sebagian Android lama, atau halaman kehilangan fokus).
            console.warn('Gagal menyalin gambar ke papan klip:', err);
        }

        // Gambar TETAP diunduh sebagai cadangan, walau penyalinan berhasil -
        // kalau ternyata tempel gagal di WhatsApp, admin masih punya
        // berkasnya untuk dilampirkan manual, tidak perlu ulang dari awal.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = namaFile;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        const link = waMeLink(p.noHp, teks);
        if (!link) {
            showAlert('Nomor HP penerima tidak valid. Perbaiki dulu di daftar penerima.', 'error');
            return;
        }
        // window.open sering DIBLOKIR browser kalau dipanggil setelah proses
        // async panjang (di sini: bikin gambar + salin ke papan klip), karena
        // dianggap tidak lagi berasal dari klik user. Kalau terblokir,
        // pindah halaman langsung - di HP ini tetap membuka aplikasi
        // WhatsApp seperti biasa, tinggal tekan Kembali untuk balik ke app.
        const jendela = window.open(link, '_blank', 'noopener');
        if (!jendela) window.location.href = link;
        showAlert(tersalin
            ? 'Chat WhatsApp ke penerima sudah dibuka. Tekan lama kolom pesan lalu pilih Tempel (Paste) untuk melampirkan gambar tiketnya.'
            : 'Chat WhatsApp ke penerima sudah dibuka. Gambar tiket sudah diunduh — lampirkan lewat ikon penjepit (📎).',
            tersalin ? 'success' : 'warning');
        return;
    }

    // ── Penerima BELUM punya nomor HP di data ──
    // Tidak ada tujuan yang bisa dibuka otomatis, jadi pakai menu "Bagikan"
    // bawaan HP: admin memilih sendiri tujuannya di situ.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: `E-Tiket ${p.nama}`, text: teks });
            return;
        } catch (err) {
            if (err && err.name === 'AbortError') return; // user membatalkan, wajar
            console.warn('navigator.share gagal, pakai cara cadangan:', err);
        }
    }

    const url2 = URL.createObjectURL(blob);
    const a2 = document.createElement('a');
    a2.href = url2; a2.download = namaFile;
    document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
    setTimeout(() => URL.revokeObjectURL(url2), 10000);
    showAlert('Gambar tiket sudah diunduh. Penerima ini belum ada nomor HP-nya di data, jadi kirim manual ya.', 'warning');
}

// Buka jendela baru minimalis khusus cetak (bukan print halaman utama) -
// supaya layout tiket tidak kecampur CSS sidebar/tab lain, sama alasannya
// dengan kenapa Laporan pakai jsPDF sendiri bukan window.print() langsung.
function cetakTiketPenerima(id) {
    const p = appData.penerimaQR.find(x => x.id === id);
    if (!p) return;

    const qrEl = document.getElementById('qrCodeContainer');
    const canvas = qrEl ? qrEl.querySelector('canvas') : null;
    const imgSrc = canvas ? canvas.toDataURL('image/png') : '';

    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) { showAlert('Popup diblokir browser, izinkan popup utk cetak tiket.', 'error'); return; }

    const isMudhohi = p.kategori === 'mudhohi';
    const mosqueNameSafe = (APP_CONFIG.mosqueName || 'Masjid').trim();
    // Kalau logoFile belum diisi, pakai monogram huruf awal nama masjid -
    // <img src=""> sering tidak render apa-apa sama sekali di sebagian
    // browser, jadi jangan pernah kirim src kosong.
    const logoHtml = APP_CONFIG.logoFile
        ? `<img src="${APP_CONFIG.logoFile}" alt="${mosqueNameSafe}">`
        : `<div class="logo-fallback">${mosqueNameSafe.charAt(0).toUpperCase()}</div>`;
    const itemTambahanText = !isMudhohi ? formatItemTambahanText(p.itemTambahan) : '';
    const statRows = isMudhohi
        ? `<div class="stat"><span>Kelompok Sapi</span><b>${p.kelompokSapi || '—'}</b></div>
           <div class="stat"><span>Jatah Daging</span><b>${p.berat != null ? formatKg(p.berat) : '—'}</b></div>`
        : `<div class="stat"><span>Alokasi</span><b>${p.alokasi || '—'}</b></div>
           ${p.noHp ? `<div class="stat"><span>No. HP</span><b>${p.noHp}</b></div>` : ''}
           ${p.alamat ? `<div class="stat"><span>Alamat</span><b>${p.alamat}</b></div>` : ''}
           ${itemTambahanText ? `<div class="stat"><span>Item Tambahan</span><b>${itemTambahanText}</b></div>` : ''}`;

    w.document.write(`
        <html>
        <head>
          <meta charset="utf-8">
          <title>${isMudhohi ? 'Kupon' : 'Tiket'} - ${p.nama}</title>
          <style>
            *{ box-sizing:border-box; }
            body{ font-family: Georgia, 'Times New Roman', serif; margin:0; padding:26px 16px; background:#fff; color:#1a1a1a; }
            .card{ max-width:330px; margin:0 auto; border:1.5px solid #0E3B34; border-radius:14px; overflow:hidden; }
            .head{ background:#0E3B34; color:#FBF8F1; padding:16px 18px; display:flex; align-items:center; gap:10px; min-height:38px; }
            .head img, .head .logo-fallback{ width:34px; height:34px; border-radius:8px; object-fit:contain; background:rgba(255,255,255,.12); padding:3px; flex-shrink:0; }
            .head .logo-fallback{ display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; color:#DCBB79; padding:0; }
            .head .masjid{ font-size:14.5px; font-weight:700; line-height:1.25; }
            .head .kategori{ font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:#DCBB79; margin-top:3px; }
            .body{ padding:22px 20px 4px; text-align:center; }
            .nama{ font-size:21px; font-weight:700; color:#0E3B34; margin-bottom:12px; }
            .stat{ display:flex; justify-content:space-between; gap:10px; font-size:12.5px; color:#444; padding:4px 2px; text-align:left; }
            .stat span{ color:#777; }
            .stat b{ color:#0E3B34; text-align:right; }
            .perforasi{ border-top:1.5px dashed #B6893A; margin:16px -20px 0; }
            .qrwrap{ padding:20px 18px 22px; text-align:center; }
            .kode{ font-family:'Courier New', monospace; font-size:16px; letter-spacing:3px; font-weight:700; color:#8A6423; margin-top:10px; }
            .status{ font-size:11px; font-weight:700; letter-spacing:.5px; margin-top:6px; color:#0E3B34; }
            .footer{ background:#F0E9DA; padding:9px; font-size:9px; letter-spacing:1px; text-transform:uppercase; color:#5C584F; text-align:center; }
            @media print{ body{ padding:0; } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="head">
              ${logoHtml}
              <div>
                <div class="masjid">${mosqueNameSafe}</div>
                <div class="kategori">${isMudhohi ? 'Kupon Mudhohi' : 'E-Tiket Penerima'}</div>
              </div>
            </div>
            <div class="body">
              <div class="nama">${p.nama}</div>
              ${statRows}
            </div>
            <div class="perforasi"></div>
            <div class="qrwrap">
              <img src="${imgSrc}" style="width:190px; height:190px;">
              <div class="kode">${p.kodeTiket}</div>
              <div class="status">${p.diambil ? '✓ SUDAH DIAMBIL' : 'BELUM DIAMBIL'}</div>
            </div>
            <div class="footer">Alur Qurban · Tata Kelola Qurban Masjid</div>
          </div>
          <script>window.onload = function(){ window.print(); };<\/script>
        </body>
        </html>`);
    w.document.close();
}

// Ambil foto bukti pengambilan (base64) on-demand dari server - sama pola
// dengan fetchSurveyFotoData()/fetchSavingFileData (base64 sengaja tidak
// ikut di load data biasa, lihat stripPenerimaFoto di public/api/sheets.js).
async function fetchPenerimaFotoData(id) {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?sheet=PenerimaQR&getFile=${id}${tenantParam()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.fileData || '';
    } catch (error) {
        console.error('Error fetching foto pengambilan:', error);
        return '';
    }
}

async function lihatFotoPengambilan(id) {
    const previewEl = document.getElementById(`fotoPengambilanPreview_${id}`);
    const btnEl = document.getElementById(`btnLihatFoto_${id}`);
    if (!previewEl) return;

    previewEl.innerHTML = '<p style="color:var(--ink-faint); font-size:13px;">⏳ Memuat foto…</p>';
    if (btnEl) btnEl.disabled = true;

    const fotoData = await fetchPenerimaFotoData(id);
    if (btnEl) btnEl.disabled = false;

    if (!fotoData) {
        previewEl.innerHTML = '<p style="color:var(--brick); font-size:13px;">Gagal memuat foto.</p>';
        return;
    }
    previewEl.innerHTML = `<img src="${fotoData}" class="preview-image" alt="Foto bukti pengambilan" style="max-width:260px; border-radius:8px;">`;
}

// ----- SCAN TIKET (check-in kamera pakai html5-qrcode) -----
let qrScannerInstance = null;
let qrScannerRunning = false;
let lastScannedCode = null;
let lastScannedAt = 0;
let scanLog = []; // in-memory saja, cuma feed visual sesi berjalan ini

async function startQrScanner() {
    const box = document.getElementById('qrReaderBox');
    if (!box) return;

    try {
        await ensureHtml5Qrcode();
    } catch (err) {
        showAlert('Library scanner QR gagal dimuat, cek koneksi internet lalu coba lagi.', 'error');
        return;
    }

    if (!qrScannerInstance) {
        box.innerHTML = '<div id="qrReaderInner"></div>';
        qrScannerInstance = new Html5Qrcode('qrReaderInner');
    }

    try {
        await qrScannerInstance.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: 230 },
            (decodedText) => {
                // Debounce: kode YANG SAMA yang ke-scan ulang dalam 4 detik
                // (karena QR masih di depan kamera) diabaikan, supaya tidak
                // spam proses/alert berkali-kali utk 1x scan yang sama.
                const now = Date.now();
                if (decodedText === lastScannedCode && (now - lastScannedAt) < 4000) return;
                lastScannedCode = decodedText;
                lastScannedAt = now;
                tandaiTiketDiambil(decodedText);
            },
            () => { /* frame tanpa QR terdeteksi - diabaikan, ini normal & sering terjadi */ }
        );
        qrScannerRunning = true;
        document.getElementById('scanStartBtn').style.display = 'none';
        document.getElementById('scanStopBtn').style.display = 'inline-flex';
    } catch (err) {
        console.error('Gagal mulai scanner:', err);
        showAlert('Gagal mengakses kamera. Pastikan izin kamera diberikan ke browser ini.', 'error');
    }
}

async function stopQrScanner() {
    if (qrScannerInstance && qrScannerRunning) {
        try {
            await qrScannerInstance.stop();
            qrScannerInstance.clear();
        } catch (err) {
            console.log('Scanner sudah berhenti/tidak sempat start:', err);
        }
    }
    qrScannerRunning = false;
    qrScannerInstance = null;
    const box = document.getElementById('qrReaderBox');
    if (box) box.innerHTML = '';
    const startBtn = document.getElementById('scanStartBtn');
    const stopBtn = document.getElementById('scanStopBtn');
    if (startBtn) startBtn.style.display = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
}

function cekKodeTiketManual() {
    const input = document.getElementById('manualKodeTiket');
    if (!input) return;
    const kode = input.value.trim().toUpperCase();
    if (!kode) { showAlert('Isi kode tiket dulu', 'error'); return; }
    tandaiTiketDiambil(kode);
    input.value = '';
}

// Cari penerima bebas (nama/no HP/alamat/kode tiket) - buat jaga-jaga pas
// hari pelaksanaan kalau QR fisiknya hilang/rusak/kamera tidak kebaca, admin
// masih bisa cari orangnya lalu tandai diambil langsung dari hasil cari,
// tanpa perlu tahu/ketik kode tiketnya persis.
function cariPenerima() {
    const input = document.getElementById('cariPenerimaInput');
    const resultBox = document.getElementById('cariPenerimaResult');
    if (!input || !resultBox) return;

    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
        resultBox.innerHTML = q.length === 0 ? '' : '<div style="color:var(--ink-faint); font-size:13px;">Ketik minimal 2 huruf…</div>';
        return;
    }

    const hasil = appData.penerimaQR
        .filter(p => p.status !== 'batal' && (
            (p.nama || '').toLowerCase().includes(q) ||
            (p.noHp || '').toLowerCase().includes(q) ||
            (p.alamat || '').toLowerCase().includes(q) ||
            (p.kodeTiket || '').toLowerCase().includes(q)
        ))
        .slice(0, 20);

    if (hasil.length === 0) {
        resultBox.innerHTML = '<div style="color:var(--ink-faint); font-size:13px;">Tidak ada penerima yang cocok.</div>';
        return;
    }

    resultBox.innerHTML = hasil.map(p => {
        const statusHtml = p.diambil
            ? `<span style="color:var(--brick); font-weight:600; font-size:12px;">✓ Sudah diambil${p.waktuAmbil ? ' · ' + new Date(p.waktuAmbil).toLocaleString('id-ID') : ''}</span>`
            : `<span style="color:var(--emerald-2); font-weight:600; font-size:12px;">Belum diambil</span>`;
        const aksiHtml = p.diambil
            ? ''
            : `<button class="btn btn-success btn-small" onclick="tandaiTiketDiambil('${p.kodeTiket}')">Tandai Diambil</button>`;

        return `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border); flex-wrap:wrap;">
              <div>
                <div style="font-weight:600;">${p.nama || '—'}</div>
                <div style="font-size:12px; color:var(--ink-soft);">${p.alokasi}${p.noHp ? ' · ' + p.noHp : ''}${p.alamat ? ' · ' + p.alamat : ''}</div>
                <div style="font-size:12px; font-family:monospace; color:var(--ink-faint);">${p.kodeTiket}</div>
                <div style="margin-top:2px;">${statusHtml}</div>
              </div>
              <div>${aksiHtml}</div>
            </div>`;
    }).join('');
}

// Logika inti check-in - dipakai bareng oleh scan kamera, input manual, &
// hasil "Cari Penerima". Tiket yang statusnya sudah "diambil" TIDAK ditandai
// ulang (supaya waktu pengambilan aslinya tidak tertimpa) - cuma dikasih
// peringatan. Kalau valid & belum diambil, BUKA panel konfirmasi dulu (lihat
// bukaKonfirmasiPengambilan) - bukan langsung ditandai - supaya sempat
// menangkap lokasi GPS & (opsional) foto bukti sebelum benar-benar disimpan.
async function tandaiTiketDiambil(kodeMentah) {
    const kode = (kodeMentah || '').trim().toUpperCase();
    const p = appData.penerimaQR.find(x => x.status !== 'batal' && x.kodeTiket === kode);

    if (!p) {
        renderScanResult('error', `❌ Kode tiket <code>${kode}</code> tidak ditemukan / tidak valid.`);
        return;
    }

    if (p.diambil) {
        const waktu = p.waktuAmbil ? new Date(p.waktuAmbil).toLocaleString('id-ID') : '-';
        renderScanResult('warning', `⚠️ Tiket <strong>${p.nama}</strong> (${p.alokasi}) SUDAH diambil sebelumnya pada ${waktu}.`);
        return;
    }

    bukaKonfirmasiPengambilan(p.id);
}

// ----- KONFIRMASI PENGAMBILAN (lokasi GPS otomatis + foto opsional) -----
// Bukti buat pelaporan/transparansi: begitu tiket valid ke-scan/ditemukan,
// aplikasi otomatis minta lokasi GPS browser (non-blocking - admin tetap
// bisa lanjut konfirmasi walau lokasi gagal/ditolak) dan kasih opsi
// lampirkan foto (dikompres otomatis, sama seperti upload bukti transfer -
// lihat compressImage()) SEBELUM benar-benar menandai tiket "diambil".
let pendingPengambilanId = null;
let pendingLokasiPengambilan = null;
let pendingFotoPengambilanData = null;

function bukaKonfirmasiPengambilan(id) {
    if (pendingPengambilanId === id) return; // sudah lagi dikonfirmasi, jangan reset progress yang ada

    const p = appData.penerimaQR.find(x => x.id === id);
    if (!p) return;

    pendingPengambilanId = id;
    pendingLokasiPengambilan = null;
    pendingFotoPengambilanData = null;

    // Jeda scanner kamera sementara supaya QR yang sama tidak terus-menerus
    // memicu ulang panel ini selama masih di depan kamera.
    if (qrScannerInstance && qrScannerRunning) {
        try { qrScannerInstance.pause(true); } catch (e) { /* abaikan */ }
    }

    const box = document.getElementById('scanResultBox');
    if (!box) return;
    box.innerHTML = `
        <div style="padding:16px; border-radius:var(--radius-md); background:var(--emerald-tint); border:1px solid var(--border);">
          <div style="font-weight:700; font-size:16px;">${p.nama}</div>
          <div style="color:var(--ink-soft); font-size:13px; margin-bottom:10px;">${p.alokasi}${p.noHp ? ' · ' + p.noHp : ''}${p.alamat ? ' · ' + p.alamat : ''}</div>
          <div id="konfirmasiLokasiStatus" style="font-size:13px; margin-bottom:12px; color:var(--ink-faint);">📍 Mengambil lokasi…</div>
          <div class="form-group" style="margin-bottom:10px;">
            <label>Foto Bukti Pengambilan (opsional, disarankan)</label>
            <input type="file" accept="image/*" capture="environment" id="fotoPengambilanInput" onchange="pilihFotoPengambilan(event)">
          </div>
          <div id="fotoPengambilanPreviewBox" style="margin-bottom:12px;"></div>
          <div class="actions">
            <button class="btn btn-success btn-small" onclick="konfirmasiPengambilan()">✓ Konfirmasi Pengambilan</button>
            <button class="btn btn-ghost btn-small" onclick="batalKonfirmasiPengambilan()">Batal</button>
          </div>
        </div>`;

    mintaLokasiUntukPengambilan();
}

// Non-blocking: kalau gagal/ditolak, admin tetap bisa lanjut konfirmasi
// tanpa lokasi - jangan sampai fitur ini malah menghambat proses pembagian.
function mintaLokasiUntukPengambilan() {
    const statusEl = document.getElementById('konfirmasiLokasiStatus');
    if (!navigator.geolocation) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--ink-faint);">📍 Perangkat/browser tidak mendukung lokasi</span>';
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            pendingLokasiPengambilan = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--emerald-2); font-weight:600;">📍 Lokasi tertangkap</span> <a href="https://www.google.com/maps?q=${pendingLokasiPengambilan.lat},${pendingLokasiPengambilan.lng}" target="_blank" rel="noopener" style="margin-left:6px;">(lihat di peta)</a>`;
        },
        () => {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold);">⚠️ Lokasi tidak tersedia (izin ditolak/GPS mati) - tetap bisa lanjut konfirmasi tanpa lokasi</span>';
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
}

function pilihFotoPengambilan(event) {
    const file = event.target.files[0];
    const previewBox = document.getElementById('fotoPengambilanPreviewBox');
    pendingFotoPengambilanData = null;
    if (previewBox) previewBox.innerHTML = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showAlert('File harus berupa foto (JPG/PNG)', 'error');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        // Kompresi adaptif sama persis dengan upload bukti transfer, supaya
        // tidak melebihi batas 50.000 karakter/sel Google Sheets.
        compressImage(e.target.result, function (compressed) {
            pendingFotoPengambilanData = compressed;
            if (previewBox) previewBox.innerHTML = `<img src="${compressed}" style="max-width:160px; border-radius:8px; border:1px solid var(--border);">`;
        }, function () {
            pendingFotoPengambilanData = null;
            showAlert('Foto terlalu detail buat disimpan, coba foto lain.', 'error');
            event.target.value = '';
        });
    };
    reader.readAsDataURL(file);
}

async function konfirmasiPengambilan() {
    const id = pendingPengambilanId;
    const p = appData.penerimaQR.find(x => x.id === id);
    if (!p) { batalKonfirmasiPengambilan(); return; }

    const waktuAmbil = new Date().toISOString();
    const updates = { diambil: 'ya', waktuAmbil };
    if (pendingLokasiPengambilan) {
        updates.lokasiLat = pendingLokasiPengambilan.lat;
        updates.lokasiLng = pendingLokasiPengambilan.lng;
    }
    if (pendingFotoPengambilanData) {
        updates.fotoAmbil = pendingFotoPengambilanData;
    }

    const success = await updateSheetDB('PenerimaQR', 'id', p.id, updates);
    if (success) {
        p.diambil = true;
        p.waktuAmbil = waktuAmbil;
        if (pendingLokasiPengambilan) { p.lokasiLat = pendingLokasiPengambilan.lat; p.lokasiLng = pendingLokasiPengambilan.lng; }
        if (pendingFotoPengambilanData) p.hasFotoAmbil = true;

        const keterangan = `${pendingLokasiPengambilan ? ' · lokasi tercatat' : ''}${pendingFotoPengambilanData ? ' · foto tersimpan' : ''}`;
        renderScanResult('success', `✓ Check-in berhasil: <strong>${p.nama}</strong> (${p.alokasi})${keterangan}`);
        loadPenerimaList();
        if (typeof cariPenerima === 'function') cariPenerima();
    } else {
        showAlert('Gagal menyimpan check-in, coba lagi.', 'error');
    }

    lepasKonfirmasiPengambilan();
}

function batalKonfirmasiPengambilan() {
    lepasKonfirmasiPengambilan();
    const box = document.getElementById('scanResultBox');
    if (box) box.innerHTML = '';
}

// Bersihkan state pending + lanjutkan scanner kamera kalau sempat dijeda.
function lepasKonfirmasiPengambilan() {
    pendingPengambilanId = null;
    pendingLokasiPengambilan = null;
    pendingFotoPengambilanData = null;
    if (qrScannerInstance && qrScannerRunning) {
        try { qrScannerInstance.resume(); } catch (e) { /* abaikan */ }
    }
}

function renderScanResult(type, html) {
    const box = document.getElementById('scanResultBox');
    if (box) {
        const colors = { success: 'var(--emerald-2)', error: 'var(--brick)', warning: 'var(--gold)' };
        const tints = { success: 'var(--emerald-tint)', error: 'var(--brick-tint)', warning: 'var(--gold-tint)' };
        box.innerHTML = `<div style="padding:14px 16px; border-radius:var(--radius-md); background:${tints[type]}; border-left:3px solid ${colors[type]}; color:${colors[type]}; font-weight:600;">${html}</div>`;
    }

    scanLog.unshift({ type, html, time: new Date().toLocaleTimeString('id-ID') });
    scanLog = scanLog.slice(0, 15);

    const logBox = document.getElementById('scanLogBox');
    if (logBox) {
        const colors = { success: 'var(--emerald-2)', error: 'var(--brick)', warning: 'var(--gold)' };
        logBox.innerHTML = scanLog.length === 0 ? '' : `
            <div style="font-size:13px; color:var(--ink-faint); margin-bottom:8px;">Riwayat scan sesi ini:</div>
            ${scanLog.map(entry => `<div style="padding:8px 0; border-bottom:1px solid var(--border); font-size:13px; color:${colors[entry.type]};">${entry.time} - ${entry.html}</div>`).join('')}`;
    }
}

// Ambil isi 1 foto (base64) on-demand dari server - lihat komentar
// SURVEY_FOTO_COLUMNS di public/api/sheets.js untuk alasannya (sama seperti
// fetchSavingFileData, base64 sengaja tidak ikut di load data biasa).
async function fetchSurveyFotoData(surveyId, col) {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?sheet=SurveySapi&getFile=${surveyId}&col=${col}${tenantParam()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.fileData || '';
    } catch (error) {
        console.error('Error fetching survey foto:', error);
        return '';
    }
}

// Reuse modal "previewModal" yang sama dengan preview bukti transfer (lihat
// showPreview()) - cukup ganti judul & isi body jadi galeri beberapa foto.
async function viewSurveyFotos(surveyId) {
    const survey = appData.surveySapi.find(s => s.id === surveyId);
    if (!survey) return;

    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const body = document.getElementById('previewBody');

    title.textContent = `${surveyKode(survey)} - Foto ${survey.supplier} (${jenisSapiLabel(survey.jenisSapi)})`;
    body.innerHTML = '<div class="preview-pdf"><p>⏳ Memuat foto...</p></div>';
    modal.classList.add('show');

    const cols = ['foto1', 'foto2', 'foto3', 'foto4', 'foto5'].filter((col, i) => survey['hasFoto' + (i + 1)]);
    if (cols.length === 0) {
        body.innerHTML = '<div class="preview-pdf"><p>📷 Tidak ada foto tersimpan</p></div>';
        return;
    }

    const results = await Promise.all(cols.map(col => fetchSurveyFotoData(surveyId, col)));
    const imgs = results.filter(Boolean);

    if (imgs.length === 0) {
        body.innerHTML = '<div class="preview-pdf"><p>📷 Gagal memuat foto</p></div>';
        return;
    }

    body.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
          ${imgs.map(src => `<img src="${src}" class="preview-image" alt="Foto survey sapi" style="max-height:none;">`).join('')}
        </div>`;
}

// ===== KEUANGAN (Pos Budget + arus kas harian) - modul admin-only, terpisah
// dari Tabungan (Savings). Pos Budget = kategori anggaran dengan jenis tetap
// 'pemasukan' atau 'pengeluaran'; Transaksi Harian dicatat per Pos, jenisnya
// otomatis ikut Pos yang dipilih (tidak ada input jenis terpisah, supaya
// datanya selalu konsisten). Realisasi & Balance selalu dihitung ulang dari
// TransaksiKeuangan aktif, sama pola dengan WO/B-L di Distribusi Daging. =====
let editingPosBudgetId = null;
let pendingBuktiTransaksiData = null;

// Format tampilan angka Rupiah pakai titik ribuan LIVE saat mengetik (mis.
// "1000000" -> "1.000.000") supaya admin tidak ragu-ragu hitung nol - input
// field-nya sengaja type="text" (bukan number) karena browser tidak izinkan
// karakter titik di input number. Angka asli (tanpa titik) diambil balik
// lewat parseRupiahInput() saat form disimpan.
function formatRupiahInput(el) {
    const digitsOnly = el.value.replace(/\D/g, '');
    el.value = digitsOnly ? parseInt(digitsOnly, 10).toLocaleString('id-ID') : '';
}

function parseRupiahInput(value) {
    return parseInt(String(value || '').replace(/\D/g, ''), 10) || 0;
}

function hitungRealisasiPos(posId) {
    return appData.transaksiKeuangan
        .filter(t => t.status !== 'batal' && t.posId === posId)
        .reduce((sum, t) => sum + t.jumlah, 0);
}

// Pos 'pengeluaran': balance = Anggaran - Realisasi -> negatif berarti LEWAT
// anggaran (bahaya, merah). Pos 'pemasukan': balance = Target - Realisasi ->
// negatif berarti realisasi SUDAH melebihi target (bagus, hijau) - kebalikan
// warnanya sengaja, karena "lebih dari target" itu kabar baik utk pemasukan.
function posBalanceColor(jenisPos, balance) {
    if (jenisPos === 'pengeluaran') {
        return balance >= 0 ? 'var(--emerald-2)' : 'var(--brick)';
    }
    return balance <= 0 ? 'var(--emerald-2)' : 'var(--gold)';
}

// Pindah antar sub-tab (Pos Budget/Catat Transaksi/Riwayat/Grafik) di dalam
// tab Keuangan - sama persis pola switchLaporanTab(), dipisah sendiri karena
// selector di switchLaporanTab() scoped ke "#laporan". Grafik baru benar-benar
// di-render pas sub-tab-nya kelihatan (lihat renderKeuanganChart()) supaya
// Chart.js tidak salah baca lebar canvas yang masih display:none.
function switchKeuanganTab(tabName, btn) {
    document.querySelectorAll('#keuangan .sub-tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabName + 'Tab').style.display = 'block';

    document.querySelectorAll('#keuangan .report-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (tabName === 'grafik') {
        setTimeout(() => renderKeuanganChart(), 50);
    }
}

function renderKeuanganRingkasan() {
    const heroSaldo = document.getElementById('keuanganSaldoHero');
    if (!heroSaldo) return;

    const posAktif = appData.posBudget.filter(p => p.status !== 'batal');
    let totalRealisasiMasuk = 0, totalRealisasiKeluar = 0;
    posAktif.forEach(pos => {
        const realisasi = hitungRealisasiPos(pos.id);
        if (pos.jenisPos === 'pemasukan') totalRealisasiMasuk += realisasi;
        else totalRealisasiKeluar += realisasi;
    });
    const saldoKas = totalRealisasiMasuk - totalRealisasiKeluar;

    // Hero card gelap (sama gaya dgn Laporan) - angka besar utk Saldo Kas
    // (yang paling penting), sub-stats Pemasukan/Pengeluaran/Pos Aktif.
    heroSaldo.textContent = `Rp ${saldoKas.toLocaleString('id-ID')}`;
    heroSaldo.style.color = saldoKas < 0 ? 'var(--gold-soft)' : '#fff';
    document.getElementById('keuanganMasukHero').textContent = `Rp ${totalRealisasiMasuk.toLocaleString('id-ID')}`;
    document.getElementById('keuanganKeluarHero').textContent = `Rp ${totalRealisasiKeluar.toLocaleString('id-ID')}`;
    document.getElementById('keuanganJumlahPosHero').textContent = posAktif.length.toLocaleString('id-ID');

    renderKeuanganChart();
}

// Grafik tren Pemasukan vs Pengeluaran per tanggal (Chart.js, sama library
// yg sudah dipakai di Laporan) - butuh minimal 2 tanggal berbeda supaya
// grafiknya bermakna, kalau belum cukup data tampilkan pesan saja. Cuma
// benar-benar dibangun kalau sub-tab "Grafik" sedang kelihatan, supaya
// Chart.js tidak salah ukur lebar canvas yang masih display:none.
let keuanganChart = null;

async function renderKeuanganChart() {
    const canvas = document.getElementById('keuanganChart');
    const emptyBox = document.getElementById('keuanganChartEmpty');
    if (!canvas) return;

    const tabEl = document.getElementById('grafikTab');
    if (tabEl && tabEl.style.display === 'none') return;

    const aktif = appData.transaksiKeuangan.filter(t => t.status !== 'batal');
    const byTanggal = {};
    aktif.forEach(t => {
        const pos = appData.posBudget.find(p => p.id === t.posId);
        const jenisPos = pos ? pos.jenisPos : 'pengeluaran';
        const key = t.tanggal || '—';
        if (!byTanggal[key]) byTanggal[key] = { masuk: 0, keluar: 0 };
        if (jenisPos === 'pemasukan') byTanggal[key].masuk += t.jumlah;
        else byTanggal[key].keluar += t.jumlah;
    });

    const tanggalList = Object.keys(byTanggal).sort();

    if (tanggalList.length < 2) {
        canvas.style.display = 'none';
        if (emptyBox) emptyBox.style.display = 'block';
        if (keuanganChart) { keuanganChart.destroy(); keuanganChart = null; }
        return;
    }

    canvas.style.display = 'block';
    if (emptyBox) emptyBox.style.display = 'none';

    const labels = tanggalList.map(t => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
    const dataMasuk = tanggalList.map(t => byTanggal[t].masuk);
    const dataKeluar = tanggalList.map(t => byTanggal[t].keluar);

    const ctx = canvas.getContext('2d');
    if (keuanganChart) keuanganChart.destroy();

    await ensureChartJsReady();
    keuanganChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Pemasukan', data: dataMasuk, backgroundColor: REPORT_COLORS.emerald2, borderRadius: 4 },
                { label: 'Pengeluaran', data: dataKeluar, backgroundColor: REPORT_COLORS.brick, borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: Rp ${ctx.parsed.y.toLocaleString('id-ID')}` } }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    grid: { color: REPORT_COLORS.border, drawBorder: false },
                    ticks: { callback: v => `${(v / 1000).toLocaleString('id-ID')}rb` }
                }
            }
        }
    });
}

function loadPosBudgetList() {
    const tbody = document.getElementById('posBudgetListBody');
    if (!tbody) return;

    const rows = appData.posBudget.filter(p => p.status !== 'batal');
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Belum ada Pos Budget. Tambahkan lewat form di atas.</td></tr>';
    } else {
        tbody.innerHTML = rows.map(pos => {
            const realisasi = hitungRealisasiPos(pos.id);
            const balance = pos.jumlahAnggaran - realisasi;
            const color = posBalanceColor(pos.jenisPos, balance);
            const jenisLabel = pos.jenisPos === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran';
            const jenisColor = pos.jenisPos === 'pemasukan' ? 'var(--emerald-2)' : 'var(--ink-soft)';
            let warningHtml = '';
            if (pos.jenisPos === 'pengeluaran' && balance < 0) {
                warningHtml = '<div style="color:var(--brick); font-size:11px; font-weight:600;">⚠️ Lewat anggaran</div>';
            } else if (pos.jenisPos === 'pemasukan' && balance <= 0) {
                warningHtml = '<div style="color:var(--emerald-2); font-size:11px; font-weight:600;">✓ Target tercapai</div>';
            }

            return `
                <tr>
                  <td>${pos.nama}${pos.keterangan ? `<div style="font-size:11px; color:var(--ink-faint);">${pos.keterangan}</div>` : ''}</td>
                  <td><span style="color:${jenisColor}; font-weight:600;">${jenisLabel}</span></td>
                  <td>Rp ${pos.jumlahAnggaran.toLocaleString('id-ID')}</td>
                  <td>Rp ${realisasi.toLocaleString('id-ID')}</td>
                  <td><span style="color:${color}; font-weight:600;">Rp ${balance.toLocaleString('id-ID')}</span>${warningHtml}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-ghost btn-small" onclick="editPosBudget(${pos.id})" title="Edit">✏️</button>
                    <button class="btn btn-ghost btn-small" onclick="hapusPosBudget(${pos.id})" title="Hapus">🗑️</button>
                  </td>
                </tr>`;
        }).join('');
    }

    renderKeuanganRingkasan();
}

// Isi dropdown Pos di form Transaksi & filter Riwayat - dipanggil ulang tiap
// kali Pos Budget berubah (tambah/edit/hapus) supaya selalu sinkron.
function populateKeuanganPosSelect() {
    const posAktif = appData.posBudget.filter(p => p.status !== 'batal');
    const selectTransaksi = document.getElementById('transaksiPosSelect');
    const selectFilter = document.getElementById('riwayatTransaksiFilter');

    const optionsHtml = posAktif.length === 0
        ? '<option value="">Belum ada Pos Budget</option>'
        : posAktif.map(p => `<option value="${p.id}">${p.nama} (${p.jenisPos === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'})</option>`).join('');

    if (selectTransaksi) {
        const prevValue = selectTransaksi.value;
        selectTransaksi.innerHTML = optionsHtml;
        if (posAktif.some(p => String(p.id) === prevValue)) selectTransaksi.value = prevValue;
    }
    if (selectFilter) {
        const prevValue = selectFilter.value;
        selectFilter.innerHTML = '<option value="">Semua Pos</option>' + optionsHtml;
        if (prevValue) selectFilter.value = prevValue;
    }
}

async function simpanPosBudget() {
    const nama = document.getElementById('posBudgetNama').value.trim();
    const jenisPos = document.getElementById('posBudgetJenis').value === 'pemasukan' ? 'pemasukan' : 'pengeluaran';
    const jumlahAnggaran = parseRupiahInput(document.getElementById('posBudgetJumlah').value);
    const keterangan = document.getElementById('posBudgetKeterangan').value.trim();

    if (!nama) { showAlert('Nama Pos harus diisi', 'error'); return; }
    if (jumlahAnggaran <= 0) { showAlert('Jumlah Anggaran harus diisi', 'error'); return; }

    if (editingPosBudgetId) {
        const success = await updateSheetDB('PosBudget', 'id', editingPosBudgetId, { nama, jenisPos, jumlahAnggaran, keterangan });
        if (success) {
            const item = appData.posBudget.find(p => p.id === editingPosBudgetId);
            if (item) { item.nama = nama; item.jenisPos = jenisPos; item.jumlahAnggaran = jumlahAnggaran; item.keterangan = keterangan; }
            showAlert('Pos Budget diperbarui', 'success');
            batalEditPosBudget();
            loadPosBudgetList();
            populateKeuanganPosSelect();
        } else {
            showAlert('Gagal menyimpan perubahan, coba lagi.', 'error');
        }
        return;
    }

    const newId = appData.posBudget.length > 0
        ? Math.max(...appData.posBudget.map(p => p.id)) + 1
        : 1;

    const record = {
        id: newId,
        nama,
        jenisPos,
        jumlahAnggaran,
        keterangan,
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('PosBudget', record);
    if (success) {
        appData.posBudget.push(record);
        showAlert('Pos Budget ditambahkan', 'success');
        document.getElementById('posBudgetNama').value = '';
        document.getElementById('posBudgetJumlah').value = '';
        document.getElementById('posBudgetKeterangan').value = '';
        document.getElementById('posBudgetJenis').value = 'pengeluaran';
        loadPosBudgetList();
        populateKeuanganPosSelect();
    } else {
        showAlert('Gagal menyimpan Pos Budget, coba lagi.', 'error');
    }
}

function editPosBudget(id) {
    const item = appData.posBudget.find(p => p.id === id);
    if (!item) return;

    editingPosBudgetId = id;
    document.getElementById('posBudgetNama').value = item.nama;
    document.getElementById('posBudgetJenis').value = item.jenisPos;
    document.getElementById('posBudgetJumlah').value = item.jumlahAnggaran.toLocaleString('id-ID');
    document.getElementById('posBudgetKeterangan').value = item.keterangan;
    document.getElementById('posBudgetEditId').value = id;

    const btn = document.getElementById('posBudgetSubmitBtn');
    if (btn) btn.textContent = '💾 Simpan Perubahan';
    const cancelBtn = document.getElementById('posBudgetCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    document.getElementById('posBudgetNama').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function batalEditPosBudget() {
    editingPosBudgetId = null;
    document.getElementById('posBudgetNama').value = '';
    document.getElementById('posBudgetJenis').value = 'pengeluaran';
    document.getElementById('posBudgetJumlah').value = '';
    document.getElementById('posBudgetKeterangan').value = '';
    document.getElementById('posBudgetEditId').value = '';

    const btn = document.getElementById('posBudgetSubmitBtn');
    if (btn) btn.textContent = '+ Tambah Pos';
    const cancelBtn = document.getElementById('posBudgetCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

// Soft-delete (status='batal') - transaksi yang sudah tercatat di pos ini
// TIDAK ikut terhapus (tetap ada di sheet buat jejak audit), cuma pos-nya
// saja yang disembunyikan dari daftar/dropdown.
async function hapusPosBudget(id) {
    const item = appData.posBudget.find(p => p.id === id);
    if (!item) return;
    if (!confirm(`Hapus Pos Budget "${item.nama}"? Transaksi yang sudah tercatat di pos ini tetap tersimpan, tapi pos-nya tidak akan muncul lagi di daftar.`)) return;

    const success = await updateSheetDB('PosBudget', 'id', id, { status: 'batal' });
    if (success) {
        item.status = 'batal';
        showAlert('Pos Budget dihapus', 'success');
        if (editingPosBudgetId === id) batalEditPosBudget();
        loadPosBudgetList();
        populateKeuanganPosSelect();
        loadTransaksiKeuanganList();
    } else {
        showAlert('Gagal menghapus Pos Budget, coba lagi.', 'error');
    }
}

// Foto bukti/nota (opsional) - kompresi adaptif sama persis dgn upload bukti
// transfer/foto pengambilan Penerima QR, supaya tidak lewat batas 50.000
// karakter/sel Google Sheets.
function pilihBuktiTransaksi(event) {
    const file = event.target.files[0];
    const previewBox = document.getElementById('buktiTransaksiPreviewBox');
    pendingBuktiTransaksiData = null;
    if (previewBox) previewBox.innerHTML = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showAlert('File harus berupa foto (JPG/PNG)', 'error');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        compressImage(e.target.result, function (compressed) {
            pendingBuktiTransaksiData = compressed;
            if (previewBox) previewBox.innerHTML = `<img src="${compressed}" style="max-width:160px; border-radius:8px; border:1px solid var(--border);">`;
        }, function () {
            pendingBuktiTransaksiData = null;
            showAlert('Foto terlalu detail buat disimpan, coba foto lain.', 'error');
            event.target.value = '';
        });
    };
    reader.readAsDataURL(file);
}

async function simpanTransaksiKeuangan() {
    const posId = parseInt(document.getElementById('transaksiPosSelect').value) || 0;
    const tanggal = document.getElementById('transaksiTanggal').value || new Date().toISOString().slice(0, 10);
    const jumlah = parseRupiahInput(document.getElementById('transaksiJumlah').value);
    const keterangan = document.getElementById('transaksiKeterangan').value.trim();

    const pos = appData.posBudget.find(p => p.id === posId && p.status !== 'batal');
    if (!pos) { showAlert('Pilih Pos Budget dulu', 'error'); return; }
    if (jumlah <= 0) { showAlert('Jumlah harus diisi', 'error'); return; }

    const newId = appData.transaksiKeuangan.length > 0
        ? Math.max(...appData.transaksiKeuangan.map(t => t.id)) + 1
        : 1;

    const record = {
        id: newId,
        posId: posId,
        tanggal: tanggal,
        jumlah: jumlah,
        keterangan: keterangan,
        status: 'aktif',
        created_date: new Date().toISOString()
    };
    if (pendingBuktiTransaksiData) record.bukti = pendingBuktiTransaksiData;

    const success = await appendSheetDB('TransaksiKeuangan', record);
    if (success) {
        appData.transaksiKeuangan.push({
            id: newId, posId, tanggal, jumlah, keterangan,
            hasBukti: !!pendingBuktiTransaksiData,
            status: 'aktif',
            created_date: record.created_date
        });
        showAlert(`Transaksi "${pos.nama}" tersimpan`, 'success');
        document.getElementById('transaksiJumlah').value = '';
        document.getElementById('transaksiKeterangan').value = '';
        pendingBuktiTransaksiData = null;
        const fileInput = document.querySelector('#keuangan input[type="file"]');
        if (fileInput) fileInput.value = '';
        const previewBox = document.getElementById('buktiTransaksiPreviewBox');
        if (previewBox) previewBox.innerHTML = '';
        loadPosBudgetList();
        loadTransaksiKeuanganList();
    } else {
        showAlert('Gagal menyimpan transaksi, coba lagi.', 'error');
    }
}

function loadTransaksiKeuanganList() {
    const tbody = document.getElementById('transaksiKeuanganListBody');
    if (!tbody) return;

    const filterPosId = parseInt(document.getElementById('riwayatTransaksiFilter')?.value) || 0;

    // Saldo Berjalan (gaya buku kas) SELALU dihitung dari SEMUA transaksi
    // aktif lintas Pos, diurutkan kronologis tanggal lama -> baru - supaya
    // angka saldo yg tampil = saldo kas KESELURUHAN pada saat transaksi itu
    // terjadi, walau tabelnya sedang difilter ke 1 Pos saja.
    const semuaAktif = appData.transaksiKeuangan.filter(t => t.status !== 'batal');
    const kronologis = semuaAktif.slice().sort((a, b) => {
        if (a.tanggal !== b.tanggal) return (a.tanggal || '').localeCompare(b.tanggal || '');
        return a.id - b.id;
    });
    const saldoMap = {};
    let saldoBerjalan = 0;
    kronologis.forEach(t => {
        const pos = appData.posBudget.find(p => p.id === t.posId);
        const jenisPos = pos ? pos.jenisPos : 'pengeluaran';
        saldoBerjalan += jenisPos === 'pemasukan' ? t.jumlah : -t.jumlah;
        saldoMap[t.id] = saldoBerjalan;
    });

    const rows = filterPosId ? kronologis.filter(t => t.posId === filterPosId) : kronologis;

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Belum ada transaksi.</td></tr>';
    } else {
        tbody.innerHTML = rows.map(t => {
            const pos = appData.posBudget.find(p => p.id === t.posId);
            const posNama = pos ? pos.nama : '(pos dihapus)';
            const jenisPos = pos ? pos.jenisPos : 'pengeluaran';
            const jenisLabel = jenisPos === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran';
            const jenisColor = jenisPos === 'pemasukan' ? 'var(--emerald-2)' : 'var(--ink-soft)';
            const tanggalFmt = t.tanggal ? new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            const saldo = saldoMap[t.id] || 0;
            const saldoColor = saldo >= 0 ? 'var(--emerald-2)' : 'var(--brick)';

            return `
                <tr>
                  <td>${tanggalFmt}</td>
                  <td>${posNama}</td>
                  <td><span style="color:${jenisColor}; font-weight:600;">${jenisLabel}</span></td>
                  <td>Rp ${t.jumlah.toLocaleString('id-ID')}</td>
                  <td><strong style="color:${saldoColor};">Rp ${saldo.toLocaleString('id-ID')}</strong></td>
                  <td>${t.keterangan || '—'}</td>
                  <td style="white-space:nowrap;">
                    ${t.hasBukti ? `<button class="btn btn-ghost btn-small" onclick="lihatBuktiTransaksi(${t.id})" title="Lihat Bukti">📷</button>` : ''}
                    <button class="btn btn-ghost btn-small" onclick="hapusTransaksiKeuangan(${t.id})" title="Hapus">🗑️</button>
                  </td>
                </tr>`;
        }).join('');
    }

    renderKeuanganRingkasan();
}

async function hapusTransaksiKeuangan(id) {
    const item = appData.transaksiKeuangan.find(t => t.id === id);
    if (!item) return;
    if (!confirm(`Hapus transaksi sebesar Rp ${item.jumlah.toLocaleString('id-ID')} ini?`)) return;

    const success = await updateSheetDB('TransaksiKeuangan', 'id', id, { status: 'batal' });
    if (success) {
        item.status = 'batal';
        showAlert('Transaksi dihapus', 'success');
        loadPosBudgetList();
        loadTransaksiKeuanganList();
    } else {
        showAlert('Gagal menghapus transaksi, coba lagi.', 'error');
    }
}

// Ambil foto bukti transaksi (base64) on-demand dari server - sama pola
// dengan fetchPenerimaFotoData()/fetchSurveyFotoData (base64 sengaja tidak
// ikut di load data biasa, lihat stripBuktiTransaksi di public/api/sheets.js).
async function fetchBuktiTransaksiData(id) {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?sheet=TransaksiKeuangan&getFile=${id}${tenantParam()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.fileData || '';
    } catch (error) {
        console.error('Error fetching bukti transaksi:', error);
        return '';
    }
}

// Reuse modal "previewModal" yang sama dengan preview bukti transfer/QR
// tiket - lihat showPreview()/lihatQrPenerima().
async function lihatBuktiTransaksi(id) {
    const t = appData.transaksiKeuangan.find(x => x.id === id);
    if (!t) return;
    const pos = appData.posBudget.find(p => p.id === t.posId);

    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const body = document.getElementById('previewBody');

    title.textContent = `Bukti Transaksi - ${pos ? pos.nama : ''} (Rp ${t.jumlah.toLocaleString('id-ID')})`;
    body.innerHTML = '<p style="color:var(--ink-faint); font-size:13px;">⏳ Memuat foto…</p>';
    modal.classList.add('show');

    const fotoData = await fetchBuktiTransaksiData(id);
    if (!fotoData) {
        body.innerHTML = '<p style="color:var(--brick); font-size:13px;">Gagal memuat foto.</p>';
        return;
    }
    body.innerHTML = `<div style="text-align:center;"><img src="${fotoData}" class="preview-image" alt="Bukti transaksi" style="max-width:100%; border-radius:8px;"></div>`;
}

// ===== KEMASAN & INVENTARIS - modul admin-only, 2 kategori terpisah:
// - 'kemasan': habis pakai yang kebutuhannya dihitung OTOMATIS dari
//   rasioPerUnit x basis (Total Paket/Penerima dari PenerimaQR, ATAU Total
//   Estimasi Kg Daging dari Survey Sapi - sama sumber angka dengan
//   renderDistribusiHero()).
// - 'inventaris': alat/perlengkapan, kebutuhannya diisi MANUAL
//   (kebutuhanManual), tidak ikut skala paket/kg.
// Keduanya dibandingkan dengan Stok Tersedia (checklist sederhana, tanpa
// histori in/out), disimpan di 1 sheet yang sama (KemasanInventaris). =====
let editingKemasanId = null;
let editingInventarisId = null;

// Total paket/penerima terdaftar (1 baris PenerimaQR = 1 paket) - sumber
// yang sama dipakai countPenerimaAktifUntukAlokasi() per alokasi, di sini
// dijumlah lintas semua alokasi.
function totalPaketPenerima() {
    return appData.penerimaQR.filter(p => p.status !== 'batal').length;
}

// Total estimasi daging (kg) dari semua Survey Sapi - persis sumber yang
// dipakai renderDistribusiHero() utk 'Total Estimasi Daging'.
function totalEstimasiKgDaging() {
    return appData.surveySapi.reduce((sum, s) => {
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        return sum + k.estimasiDaging;
    }, 0);
}

// Jumlah kupon Mudhohi AKTIF (kategori 'mudhohi' di PenerimaQR, lihat
// generateKuponMudhohi()) - basis hitung "Per Kupon Mudhohi".
function totalKuponMudhohiAktif() {
    return appData.penerimaQR.filter(p => p.status !== 'batal' && p.kategori === 'mudhohi').length;
}

// Total jumlah SAPI yang disurvey (appData.surveySapi.length) - basis
// hitung "Per Jumlah Sapi", dipakai utk item yang jumlahnya proporsional ke
// banyaknya sapi (bukan ke jumlah kupon/paket), mis. Kresek Mudhohi = Total
// Sapi x 7 (7 bagian mudhohi per sapi, rasioPerUnit=7).
function totalSapiSurvei() {
    return appData.surveySapi.length;
}

// Total Qty (RENCANA/target, BUKAN yang sudah benar-benar diisi ke
// Penerima & Tiket) di Rencana Distribusi Daging (Umum) - dijumlah lintas
// SEMUA alokasi (RT, Panitia, dst). Ini yang dipakai sbg basis default
// "jumlah total alokasi" utk item kemasan spt Kresek Sablon/Plastik Daging,
// supaya kebutuhan kemasan sudah bisa diperkirakan dari awal (pas rencana
// sudah disusun), tidak perlu nunggu semua penerima diinput satu-satu dulu.
function totalKuotaRencanaDaging() {
    return appData.rencanaDistribusi
        .filter(r => r.status !== 'batal')
        .reduce((sum, r) => sum + (r.qty || 0), 0);
}

// Total Qty (RENCANA) di Rencana Distribusi Bagian Lain utk 1 jenis
// (tulang/jeroan), dijumlah lintas SEMUA alokasi - basis default kemasan
// Plastik Jeroan/Plastik Tulang ("ikut rencana di bagian lain").
function totalKuotaRencanaBagianLain(jenis) {
    return appData.rencanaDistribusiLain
        .filter(r => r.status !== 'batal' && r.jenis === jenis)
        .reduce((sum, r) => sum + (r.qty || 0), 0);
}

// Kebutuhan dibulatkan ke atas (Math.ceil) - tidak mungkin beli/pakai
// setengah kantong plastik/alat. Item 'inventaris' pakai kebutuhanManual
// langsung (tidak ikut skala paket/kg). basisHitung: 'paket' (jumlah
// penerima yang SUDAH diinput di Penerima & Tiket), 'kg' (estimasi daging),
// 'rencanaDaging' (total Qty RENCANA - target - di Rencana Distribusi Daging
// Umum, lintas semua alokasi), 'tulang'/'jeroan' (total Qty RENCANA di
// Rencana Distribusi Bagian Lain utk jenis tsb), 'mudhohi' (jumlah kupon
// mudhohi aktif).
function hitungKebutuhanKemasan(item) {
    if (item.kategori === 'inventaris') {
        return Math.ceil(item.kebutuhanManual || 0);
    }
    let basisTotal;
    if (item.basisHitung === 'kg') basisTotal = totalEstimasiKgDaging();
    else if (item.basisHitung === 'rencanaDaging') basisTotal = totalKuotaRencanaDaging();
    else if (item.basisHitung === 'tulang') basisTotal = totalKuotaRencanaBagianLain('tulang');
    else if (item.basisHitung === 'jeroan') basisTotal = totalKuotaRencanaBagianLain('jeroan');
    else if (item.basisHitung === 'mudhohi') basisTotal = totalKuponMudhohiAktif();
    else if (item.basisHitung === 'sapi') basisTotal = totalSapiSurvei();
    else basisTotal = totalPaketPenerima();
    return Math.ceil((item.rasioPerUnit || 0) * basisTotal);
}

// Label tampilan utk tiap basisHitung - dipakai di loadKemasanList() &
// renderKemasanChecklist() supaya konsisten.
const KEMASAN_BASIS_LABEL = {
    paket: 'Per Paket/Penerima (aktual)',
    kg: 'Per Kg Daging',
    rencanaDaging: 'Per Total Alokasi Daging (Rencana)',
    tulang: 'Per Rencana Tulang (Bagian Lain)',
    jeroan: 'Per Rencana Jeroan (Bagian Lain)',
    mudhohi: 'Per Kupon Mudhohi',
    sapi: 'Per Jumlah Sapi'
};

function kemasanSelisihColor(selisih) {
    return selisih < 0 ? 'var(--brick)' : 'var(--emerald-2)';
}

// Pindah antar sub-tab (Kemasan/Inventaris/Checklist) di dalam tab Kemasan &
// Inventaris - sama pola dengan switchKeuanganTab().
function switchKemasanTab(tabName, btn) {
    document.querySelectorAll('#kemasan .sub-tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabName + 'Tab').style.display = 'block';

    document.querySelectorAll('#kemasan .report-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (tabName === 'checklist') renderKemasanChecklist();
}

// Dipanggil tiap ada perubahan (tambah/edit/hapus item, atau buka tab) -
// menyegarkan kedua tabel + hero + checklist sekaligus supaya selalu
// konsisten satu sama lain.
// Guard supaya auto-seed default plastik/timbangan (lihat
// refreshKemasanInventaris()) cuma dicoba SEKALI per sesi - kalau admin
// sengaja hapus semua item default, tidak otomatis muncul lagi
// berulang-ulang tiap buka tab.
let kemasanDefaultSeeded = false;
let inventarisDefaultSeeded = false;

function refreshKemasanInventaris() {
    loadKemasanList();
    loadInventarisList();
    renderKemasanHero();
    renderKemasanChecklist();

    // Auto-isi 6 item plastik default (Kresek Sablon, Plastik
    // Daging/Jeroan/Tulang/Laundry, Kresek Mudhohi) kalau tabel Kemasan masih
    // KOSONG SAMA SEKALI - supaya admin tidak perlu klik tombol "Isi Default
    // Plastik" manual pas pertama kali buka tab ini (lihat
    // isiDefaultKemasanPlastik()).
    const kemasanAktif = appData.kemasanInventaris.filter(i => i.status !== 'batal' && i.kategori === 'kemasan');
    if (kemasanAktif.length === 0 && !kemasanDefaultSeeded) {
        kemasanDefaultSeeded = true;
        isiDefaultKemasanPlastik(true);
    }

    // Auto-isi 2 item timbangan default (Timbangan Digital Besar/Kecil) kalau
    // tabel Inventaris masih KOSONG SAMA SEKALI (lihat isiDefaultInventaris()).
    const inventarisAktif = appData.kemasanInventaris.filter(i => i.status !== 'batal' && i.kategori === 'inventaris');
    if (inventarisAktif.length === 0 && !inventarisDefaultSeeded) {
        inventarisDefaultSeeded = true;
        isiDefaultInventaris(true);
    }
}

function renderKemasanHero() {
    const heroKurang = document.getElementById('kemasanHeroKurang');
    if (!heroKurang) return;

    const items = appData.kemasanInventaris.filter(i => i.status !== 'batal');
    const jumlahKurang = items.filter(i => (i.stokTersedia - hitungKebutuhanKemasan(i)) < 0).length;

    heroKurang.textContent = jumlahKurang.toLocaleString('id-ID');
    heroKurang.style.color = jumlahKurang > 0 ? 'var(--gold-soft)' : '#fff';
    document.getElementById('kemasanHeroJumlahItem').textContent = items.length.toLocaleString('id-ID');
    document.getElementById('kemasanHeroTotalPaket').textContent = totalPaketPenerima().toLocaleString('id-ID');
    document.getElementById('kemasanHeroTotalKg').textContent = `${formatKg(totalEstimasiKgDaging())} kg`;
}

function loadKemasanList() {
    const tbody = document.getElementById('kemasanListBody');
    if (!tbody) return;

    const rows = appData.kemasanInventaris.filter(i => i.status !== 'batal' && i.kategori !== 'inventaris');
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Belum ada item Kemasan. Tambahkan lewat form di atas.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(item => {
        const kebutuhan = hitungKebutuhanKemasan(item);
        const selisih = item.stokTersedia - kebutuhan;
        const basisLabel = KEMASAN_BASIS_LABEL[item.basisHitung] || 'Per Paket/Penerima';
        const color = kemasanSelisihColor(selisih);
        const warningHtml = selisih < 0
            ? `<div style="color:var(--brick); font-size:11px; font-weight:600;">⚠️ Kurang ${Math.abs(selisih).toLocaleString('id-ID')}</div>`
            : '<div style="color:var(--emerald-2); font-size:11px; font-weight:600;">✓ Cukup</div>';

        return `
            <tr>
              <td>${item.namaItem}${item.catatan ? `<div style="font-size:11px; color:var(--ink-faint);">${item.catatan}</div>` : ''}</td>
              <td>${item.ukuran || '—'}</td>
              <td><span style="color:var(--ink-soft);">${basisLabel}</span></td>
              <td>${item.rasioPerUnit.toLocaleString('id-ID')}</td>
              <td>${kebutuhan.toLocaleString('id-ID')}</td>
              <td>${item.stokTersedia.toLocaleString('id-ID')}</td>
              <td><span style="color:${color}; font-weight:600;">${selisih.toLocaleString('id-ID')}</span>${warningHtml}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-ghost btn-small" onclick="editKemasanItem(${item.id})" title="Edit">✏️</button>
                <button class="btn btn-ghost btn-small" onclick="hapusKemasanItem(${item.id})" title="Hapus">🗑️</button>
              </td>
            </tr>`;
    }).join('');
}

function loadInventarisList() {
    const tbody = document.getElementById('inventarisListBody');
    if (!tbody) return;

    const rows = appData.kemasanInventaris.filter(i => i.status !== 'batal' && i.kategori === 'inventaris');
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Belum ada item Inventaris. Tambahkan lewat form di atas.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(item => {
        const kebutuhan = hitungKebutuhanKemasan(item);
        const selisih = item.stokTersedia - kebutuhan;
        const color = kemasanSelisihColor(selisih);
        const warningHtml = selisih < 0
            ? `<div style="color:var(--brick); font-size:11px; font-weight:600;">⚠️ Kurang ${Math.abs(selisih).toLocaleString('id-ID')}</div>`
            : '<div style="color:var(--emerald-2); font-size:11px; font-weight:600;">✓ Cukup</div>';

        return `
            <tr>
              <td>${item.namaItem}${item.catatan ? `<div style="font-size:11px; color:var(--ink-faint);">${item.catatan}</div>` : ''}</td>
              <td>${kebutuhan.toLocaleString('id-ID')}</td>
              <td>${item.stokTersedia.toLocaleString('id-ID')}</td>
              <td><span style="color:${color}; font-weight:600;">${selisih.toLocaleString('id-ID')}</span>${warningHtml}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-ghost btn-small" onclick="editInventarisItem(${item.id})" title="Edit">✏️</button>
                <button class="btn btn-ghost btn-small" onclick="hapusKemasanItem(${item.id})" title="Hapus">🗑️</button>
              </td>
            </tr>`;
    }).join('');
}

// Checklist read-only buat tim logistik - dikelompokkan per kategori (Kemasan
// dulu, baru Inventaris), item yang masih KURANG ditampilkan lebih dulu di
// tiap kelompok supaya gampang dicek sebelum hari pelaksanaan.
function renderKemasanChecklist() {
    const box = document.getElementById('kemasanChecklistBox');
    if (!box) return;
    const tabEl = document.getElementById('checklistTab');
    if (tabEl && tabEl.style.display === 'none') return;

    const buildRows = kategori => appData.kemasanInventaris
        .filter(i => i.status !== 'batal' && (kategori === 'inventaris' ? i.kategori === 'inventaris' : i.kategori !== 'inventaris'))
        .map(item => {
            const kebutuhan = hitungKebutuhanKemasan(item);
            const selisih = item.stokTersedia - kebutuhan;
            return { item, kebutuhan, selisih };
        })
        .sort((a, b) => a.selisih - b.selisih);

    const renderGroup = (label, rows) => {
        if (rows.length === 0) return '';
        const itemsHtml = rows.map(({ item, kebutuhan, selisih }) => {
            const kurang = selisih < 0;
            const detail = item.kategori === 'inventaris'
                ? `Kebutuhan ${kebutuhan.toLocaleString('id-ID')} · Stok ${item.stokTersedia.toLocaleString('id-ID')}`
                : `Rasio ${item.rasioPerUnit.toLocaleString('id-ID')} ${(KEMASAN_BASIS_LABEL[item.basisHitung] || 'Per Paket/Penerima').toLowerCase()} · Kebutuhan ${kebutuhan.toLocaleString('id-ID')} · Stok ${item.stokTersedia.toLocaleString('id-ID')}`;
            return `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border:1px solid var(--border); border-radius:10px; margin-bottom:8px; background:${kurang ? 'rgba(155,70,50,0.06)' : 'transparent'};">
                  <div>
                    <div style="font-weight:600;">${kurang ? '⚠️' : '✅'} ${item.namaItem}</div>
                    <div style="font-size:12px; color:var(--ink-faint);">${detail}</div>
                  </div>
                  <div style="text-align:right; font-weight:700; color:${kemasanSelisihColor(selisih)};">
                    ${kurang ? `Kurang ${Math.abs(selisih).toLocaleString('id-ID')}` : `Lebih ${selisih.toLocaleString('id-ID')}`}
                  </div>
                </div>`;
        }).join('');
        return `<h4 style="margin:18px 0 8px;">${label}</h4>${itemsHtml}`;
    };

    const kemasanRows = buildRows('kemasan');
    const inventarisRows = buildRows('inventaris');

    if (kemasanRows.length === 0 && inventarisRows.length === 0) {
        box.innerHTML = '<p class="loading">Belum ada item Kemasan/Inventaris.</p>';
        return;
    }

    box.innerHTML = renderGroup('📦 Kemasan', kemasanRows) + renderGroup('🧰 Inventaris', inventarisRows);
}

async function simpanKemasanItem() {
    const namaItem = document.getElementById('kemasanNamaItem').value.trim();
    const ukuran = document.getElementById('kemasanUkuran').value.trim();
    const basisHitungRaw = document.getElementById('kemasanBasisHitung').value;
    const basisHitung = ['kg', 'rencanaDaging', 'tulang', 'jeroan', 'mudhohi', 'sapi'].includes(basisHitungRaw) ? basisHitungRaw : 'paket';
    const rasioPerUnit = parseFloat(document.getElementById('kemasanRasioPerUnit').value) || 0;
    const stokTersedia = parseFloat(document.getElementById('kemasanStokTersedia').value) || 0;
    const catatan = document.getElementById('kemasanCatatan').value.trim();

    if (!namaItem) { showAlert('Nama Item harus diisi', 'error'); return; }
    if (rasioPerUnit <= 0) { showAlert('Rasio per Unit harus diisi', 'error'); return; }

    if (editingKemasanId) {
        const success = await updateSheetDB('KemasanInventaris', 'id', editingKemasanId, { namaItem, ukuran, basisHitung, rasioPerUnit, stokTersedia, catatan });
        if (success) {
            const item = appData.kemasanInventaris.find(i => i.id === editingKemasanId);
            if (item) { item.namaItem = namaItem; item.ukuran = ukuran; item.basisHitung = basisHitung; item.rasioPerUnit = rasioPerUnit; item.stokTersedia = stokTersedia; item.catatan = catatan; }
            showAlert('Item diperbarui', 'success');
            batalEditKemasanItem();
            refreshKemasanInventaris();
        } else {
            showAlert('Gagal menyimpan perubahan, coba lagi.', 'error');
        }
        return;
    }

    const newId = appData.kemasanInventaris.length > 0
        ? Math.max(...appData.kemasanInventaris.map(i => i.id)) + 1
        : 1;

    const record = {
        id: newId,
        namaItem,
        ukuran,
        kategori: 'kemasan',
        basisHitung,
        rasioPerUnit,
        kebutuhanManual: 0,
        stokTersedia,
        catatan,
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('KemasanInventaris', record);
    if (success) {
        appData.kemasanInventaris.push(record);
        showAlert('Item ditambahkan', 'success');
        document.getElementById('kemasanNamaItem').value = '';
        document.getElementById('kemasanUkuran').value = '';
        document.getElementById('kemasanRasioPerUnit').value = '';
        document.getElementById('kemasanStokTersedia').value = '';
        document.getElementById('kemasanCatatan').value = '';
        document.getElementById('kemasanBasisHitung').value = 'paket';
        refreshKemasanInventaris();
    } else {
        showAlert('Gagal menyimpan item, coba lagi.', 'error');
    }
}

// Isi 6 item plastik yang umum dipakai (Kresek Sablon, Plastik
// Daging/Jeroan/Tulang, Plastik Laundry, Kresek Mudhohi). Kresek Sablon &
// Plastik Daging ikut TOTAL ALOKASI (Qty rencana di Rencana Distribusi
// Daging Umum, lintas semua alokasi) - dipilih basis 'rencanaDaging' (BUKAN
// 'paket'/aktual) supaya kebutuhannya sudah bisa diperkirakan dari awal
// begitu rencana disusun, tidak perlu nunggu semua penerima diinput
// satu-satu ke Penerima & Tiket dulu. Plastik Jeroan/Tulang ikut Qty rencana
// di Rencana Distribusi Bagian Lain utk jenis masing-masing. Plastik
// Laundry pakai basis 'kg' (total estimasi Kg Daging) dengan rasioPerUnit
// 0.04 (= 1/25) supaya kebutuhannya otomatis "Total Kg Daging / 25". Kresek
// Mudhohi pakai basis 'sapi' (totalSapiSurvei - jumlah SAPI yang disurvey,
// BUKAN jumlah peserta tabungan qurban) dengan rasioPerUnit 7 supaya
// kebutuhannya otomatis "Total Sapi x 7" (7 bagian mudhohi per sapi). Rasio
// default 1 (1 plastik per unit basis) kecuali item
// yang punya rasioPerUnit sendiri - admin bebas edit lewat ✏️ kalau butuh
// beda (mis. 2 plastik per paket). Item yang namanya SUDAH ADA (persis
// sama, case-insensitive) dilewati - aman diklik berkali-kali, tidak bikin
// dobel. Dipanggil OTOMATIS oleh refreshKemasanInventaris() pas tabel
// Kemasan masih kosong (silent=true, tanpa alert supaya tidak berisik pas
// cuma buka tab), ATAU manual lewat tombol "Isi Default Plastik"
// (silent=false, ada alert konfirmasi).
async function isiDefaultKemasanPlastik(silent) {
    const DEFAULTS = [
        { namaItem: 'Kresek Sablon', basisHitung: 'rencanaDaging', catatan: 'Ikut total Qty rencana di Rencana Distribusi Daging (Umum), lintas semua alokasi' },
        { namaItem: 'Plastik Daging', basisHitung: 'rencanaDaging', catatan: 'Ikut total Qty rencana di Rencana Distribusi Daging (Umum), lintas semua alokasi' },
        { namaItem: 'Plastik Jeroan', basisHitung: 'jeroan', catatan: 'Ikut total Qty rencana Jeroan di Rencana Distribusi Bagian Lain' },
        { namaItem: 'Plastik Tulang', basisHitung: 'tulang', catatan: 'Ikut total Qty rencana Tulang di Rencana Distribusi Bagian Lain' },
        { namaItem: 'Plastik Laundry', basisHitung: 'kg', rasioPerUnit: 0.04, catatan: 'Otomatis: Total Estimasi Kg Daging ÷ 25 (1 plastik laundry per 25 kg daging)' },
        { namaItem: 'Kresek Mudhohi', basisHitung: 'sapi', rasioPerUnit: 7, catatan: 'Otomatis: Total Jumlah Sapi x 7 (7 bagian mudhohi per sapi)' }
    ];

    const existingNames = new Set(
        appData.kemasanInventaris.filter(i => i.status !== 'batal').map(i => (i.namaItem || '').trim().toLowerCase())
    );
    const toAdd = DEFAULTS.filter(d => !existingNames.has(d.namaItem.toLowerCase()));

    if (toAdd.length === 0) {
        if (!silent) showAlert('Ke-6 item plastik default sudah ada semua', 'info');
        return;
    }

    let nextId = appData.kemasanInventaris.length > 0 ? Math.max(...appData.kemasanInventaris.map(i => i.id)) + 1 : 1;
    let berhasil = 0;

    for (const d of toAdd) {
        const record = {
            id: nextId,
            namaItem: d.namaItem,
            ukuran: '',
            kategori: 'kemasan',
            basisHitung: d.basisHitung,
            rasioPerUnit: d.rasioPerUnit || 1,
            kebutuhanManual: 0,
            stokTersedia: 0,
            catatan: d.catatan,
            status: 'aktif',
            created_date: new Date().toISOString()
        };
        const success = await appendSheetDB('KemasanInventaris', record);
        if (success) {
            appData.kemasanInventaris.push(record);
            nextId++;
            berhasil++;
        }
    }

    if (berhasil > 0) {
        if (!silent) showAlert(`${berhasil} item plastik default ditambahkan - sesuaikan Rasio/Stok Tersedia sesuai kebutuhan`, 'success');
        refreshKemasanInventaris();
    } else if (!silent) {
        showAlert('Gagal menambahkan item default, coba lagi.', 'error');
    }
}

// Isi 2 item timbangan default (Timbangan Digital Besar/Kecil). Kebutuhan
// diisi MANUAL (kategori 'inventaris', bukan auto-hitung dari basisHitung -
// sama seperti item Inventaris lain). Item yang namanya SUDAH ADA (persis
// sama, case-insensitive) dilewati - aman diklik berkali-kali, tidak bikin
// dobel. Dipanggil OTOMATIS oleh refreshKemasanInventaris() pas tabel
// Inventaris masih kosong (silent=true), ATAU manual lewat tombol "Isi
// Default Inventaris" (silent=false, ada alert konfirmasi).
async function isiDefaultInventaris(silent) {
    const DEFAULTS = [
        { namaItem: 'Timbangan Digital Besar (Warung)', kebutuhanManual: 2, catatan: 'Timbangan digital kapasitas besar utk penimbangan daging skala warung/lapak' },
        { namaItem: 'Timbangan Digital Kecil (Rumah)', kebutuhanManual: 3, catatan: 'Timbangan digital kapasitas kecil utk penimbangan porsi per paket/rumah' }
    ];

    const existingNames = new Set(
        appData.kemasanInventaris.filter(i => i.status !== 'batal').map(i => (i.namaItem || '').trim().toLowerCase())
    );
    const toAdd = DEFAULTS.filter(d => !existingNames.has(d.namaItem.toLowerCase()));

    if (toAdd.length === 0) {
        if (!silent) showAlert('Ke-2 item timbangan default sudah ada semua', 'info');
        return;
    }

    let nextId = appData.kemasanInventaris.length > 0 ? Math.max(...appData.kemasanInventaris.map(i => i.id)) + 1 : 1;
    let berhasil = 0;

    for (const d of toAdd) {
        const record = {
            id: nextId,
            namaItem: d.namaItem,
            ukuran: '',
            kategori: 'inventaris',
            basisHitung: 'paket',
            rasioPerUnit: 0,
            kebutuhanManual: d.kebutuhanManual,
            stokTersedia: 0,
            catatan: d.catatan,
            status: 'aktif',
            created_date: new Date().toISOString()
        };
        const success = await appendSheetDB('KemasanInventaris', record);
        if (success) {
            appData.kemasanInventaris.push(record);
            nextId++;
            berhasil++;
        }
    }

    if (berhasil > 0) {
        if (!silent) showAlert(`${berhasil} item timbangan default ditambahkan - sesuaikan Kebutuhan/Stok Tersedia sesuai kebutuhan`, 'success');
        refreshKemasanInventaris();
    } else if (!silent) {
        showAlert('Gagal menambahkan item default, coba lagi.', 'error');
    }
}

function editKemasanItem(id) {
    const item = appData.kemasanInventaris.find(i => i.id === id);
    if (!item) return;

    editingKemasanId = id;
    document.getElementById('kemasanNamaItem').value = item.namaItem;
    document.getElementById('kemasanUkuran').value = item.ukuran || '';
    document.getElementById('kemasanBasisHitung').value = item.basisHitung;
    document.getElementById('kemasanRasioPerUnit').value = item.rasioPerUnit;
    document.getElementById('kemasanStokTersedia').value = item.stokTersedia;
    document.getElementById('kemasanCatatan').value = item.catatan;
    document.getElementById('kemasanEditId').value = id;

    const btn = document.getElementById('kemasanSubmitBtn');
    if (btn) btn.textContent = '💾 Simpan Perubahan';
    const cancelBtn = document.getElementById('kemasanCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    document.getElementById('kemasanNamaItem').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function batalEditKemasanItem() {
    editingKemasanId = null;
    document.getElementById('kemasanNamaItem').value = '';
    document.getElementById('kemasanUkuran').value = '';
    document.getElementById('kemasanBasisHitung').value = 'paket';
    document.getElementById('kemasanRasioPerUnit').value = '';
    document.getElementById('kemasanStokTersedia').value = '';
    document.getElementById('kemasanCatatan').value = '';
    document.getElementById('kemasanEditId').value = '';

    const btn = document.getElementById('kemasanSubmitBtn');
    if (btn) btn.textContent = '+ Tambah Item';
    const cancelBtn = document.getElementById('kemasanCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

async function simpanInventarisItem() {
    const namaItem = document.getElementById('inventarisNamaItem').value.trim();
    const kebutuhanManual = parseFloat(document.getElementById('inventarisKebutuhanManual').value) || 0;
    const stokTersedia = parseFloat(document.getElementById('inventarisStokTersedia').value) || 0;
    const catatan = document.getElementById('inventarisCatatan').value.trim();

    if (!namaItem) { showAlert('Nama Item harus diisi', 'error'); return; }
    if (kebutuhanManual <= 0) { showAlert('Kebutuhan harus diisi', 'error'); return; }

    if (editingInventarisId) {
        const success = await updateSheetDB('KemasanInventaris', 'id', editingInventarisId, { namaItem, kebutuhanManual, stokTersedia, catatan });
        if (success) {
            const item = appData.kemasanInventaris.find(i => i.id === editingInventarisId);
            if (item) { item.namaItem = namaItem; item.kebutuhanManual = kebutuhanManual; item.stokTersedia = stokTersedia; item.catatan = catatan; }
            showAlert('Item diperbarui', 'success');
            batalEditInventarisItem();
            refreshKemasanInventaris();
        } else {
            showAlert('Gagal menyimpan perubahan, coba lagi.', 'error');
        }
        return;
    }

    const newId = appData.kemasanInventaris.length > 0
        ? Math.max(...appData.kemasanInventaris.map(i => i.id)) + 1
        : 1;

    const record = {
        id: newId,
        namaItem,
        kategori: 'inventaris',
        basisHitung: 'paket',
        rasioPerUnit: 0,
        kebutuhanManual,
        stokTersedia,
        catatan,
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('KemasanInventaris', record);
    if (success) {
        appData.kemasanInventaris.push(record);
        showAlert('Item ditambahkan', 'success');
        document.getElementById('inventarisNamaItem').value = '';
        document.getElementById('inventarisKebutuhanManual').value = '';
        document.getElementById('inventarisStokTersedia').value = '';
        document.getElementById('inventarisCatatan').value = '';
        refreshKemasanInventaris();
    } else {
        showAlert('Gagal menyimpan item, coba lagi.', 'error');
    }
}

function editInventarisItem(id) {
    const item = appData.kemasanInventaris.find(i => i.id === id);
    if (!item) return;

    editingInventarisId = id;
    document.getElementById('inventarisNamaItem').value = item.namaItem;
    document.getElementById('inventarisKebutuhanManual').value = item.kebutuhanManual;
    document.getElementById('inventarisStokTersedia').value = item.stokTersedia;
    document.getElementById('inventarisCatatan').value = item.catatan;
    document.getElementById('inventarisEditId').value = id;

    const btn = document.getElementById('inventarisSubmitBtn');
    if (btn) btn.textContent = '💾 Simpan Perubahan';
    const cancelBtn = document.getElementById('inventarisCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    document.getElementById('inventarisNamaItem').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function batalEditInventarisItem() {
    editingInventarisId = null;
    document.getElementById('inventarisNamaItem').value = '';
    document.getElementById('inventarisKebutuhanManual').value = '';
    document.getElementById('inventarisStokTersedia').value = '';
    document.getElementById('inventarisCatatan').value = '';
    document.getElementById('inventarisEditId').value = '';

    const btn = document.getElementById('inventarisSubmitBtn');
    if (btn) btn.textContent = '+ Tambah Item';
    const cancelBtn = document.getElementById('inventarisCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

// Dipakai bareng oleh item kategori 'kemasan' maupun 'inventaris' - soft
// delete generik by id, lalu refresh kedua tabel sekaligus.
async function hapusKemasanItem(id) {
    const item = appData.kemasanInventaris.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Hapus item "${item.namaItem}"?`)) return;

    const success = await updateSheetDB('KemasanInventaris', 'id', id, { status: 'batal' });
    if (success) {
        item.status = 'batal';
        showAlert('Item dihapus', 'success');
        if (editingKemasanId === id) batalEditKemasanItem();
        if (editingInventarisId === id) batalEditInventarisItem();
        refreshKemasanInventaris();
    } else {
        showAlert('Gagal menghapus item, coba lagi.', 'error');
    }
}

// ===== SURVEY SAPI - TAMPILAN ANGGOTA (read-only + tombol Ikut) =====
// Beda dari loadSurveySapiTable() (tabel admin), ini render 1 kartu per
// survey lengkap dengan list peserta yang sudah "Ikut" - lihat CSS
// .survey-member-card di bagian <style>.
function loadSurveySapiMemberList() {
    const container = document.getElementById('surveySapiMemberList');
    if (!container) return;

    if (appData.surveySapi.length === 0) {
        container.innerHTML = '<p style="color:var(--ink-faint);">Belum ada data survey sapi.</p>';
        return;
    }

    // 1 anggota cuma boleh ikut 1 sapi. Partisipasi yang dibatalkan (pindah ke
    // sapi lain) ditandai status='batal' - BUKAN dihapus dari sheet, supaya
    // tetap ada jejaknya (sama pola dengan Verifications). Baris lama sebelum
    // fitur ini ada (status kosong) tetap dianggap aktif.
    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');
    // PENTING: myJoin/sudahIkut cuma dihitung utk role 'member' (login asli).
    // Guest currentUser.id SELALU 0 (lihat handleGuestLogin()) - kalau ini
    // tidak digating, guest bisa "match" peserta Instan manapun yang
    // memberId-nya juga 0 (bukan miliknya sendiri), bikin tombol Ikut salah
    // nyangka guest itu "sudah ikut" grup orang lain. Peserta tipe 'instan'
    // (hasil submitInstantJoin(), tanpa akun) memang sengaja memberId=0 -
    // aman krn perbandingan ini di-skip total utk non-member.
    const isRealMember = currentUser && currentUser.role === 'member';
    const myJoin = isRealMember ? activePeserta.find(p => p.memberId === currentUser.id) : null;

    container.innerHTML = appData.surveySapi.map(s => {
        const peserta = activePeserta.filter(p => p.surveyId === s.id);
        const sudahIkut = isRealMember && peserta.some(p => p.memberId === currentUser.id);
        const lokasiCell = s.latitude && s.longitude
            ? `<a href="https://www.google.com/maps?q=${s.latitude},${s.longitude}" target="_blank" rel="noopener" style="color:var(--emerald-2);">📍 Lihat Peta</a>`
            : '—';
        const fotoCount = [s.hasFoto1, s.hasFoto2, s.hasFoto3, s.hasFoto4, s.hasFoto5].filter(Boolean).length;
        const fotoCell = fotoCount > 0
            ? `<button class="btn btn-ghost btn-small" onclick="viewSurveyFotos(${s.id})">🖼️ ${fotoCount} foto</button>`
            : '—';
        const penuh = peserta.length >= SURVEY_MAX_PESERTA;
        let ikutBtn;
        if (sudahIkut) {
            ikutBtn = `<button class="btn btn-ghost btn-small" disabled>✓ Sudah Ikut</button>`;
        } else if (myJoin) {
            // Sudah ikut sapi lain -> tawarkan pindah ke sapi ini alih-alih dikunci total,
            // kecuali grup tujuan sudah penuh.
            ikutBtn = penuh
                ? `<button class="btn btn-ghost btn-small" disabled title="Grup sapi ini sudah penuh">Penuh (${SURVEY_MAX_PESERTA}/${SURVEY_MAX_PESERTA})</button>`
                : `<button class="btn btn-ghost btn-small" onclick="switchSurveySapi(${s.id})">🔄 Pindah ke Sini</button>`;
        } else if (penuh) {
            ikutBtn = `<button class="btn btn-ghost btn-small" disabled title="Grup sapi ini sudah penuh">Penuh (${SURVEY_MAX_PESERTA}/${SURVEY_MAX_PESERTA})</button>`;
        } else if (isRealMember) {
            ikutBtn = `<button class="btn btn-success btn-small" onclick="joinSurveySapi(${s.id})">Ikut</button>`;
        } else {
            // Guest/belum login - jalur "Daftar Langsung" (Qurban Instan):
            // tidak menabung, cukup isi data diri di modal, admin follow-up
            // pembayaran via WA. Lihat openInstantJoinModal()/submitInstantJoin().
            ikutBtn = `<button class="btn btn-success btn-small" onclick="openInstantJoinModal(${s.id})">Daftar Langsung</button>`;
        }
        // Chip peserta 'instan' (Daftar Langsung) dibedain warnanya (biru-abu,
        // .instan) dari peserta tabungan (hijau default) - dan klik-able,
        // langsung buka modal upload bukti transfer buat peserta itu (skip
        // langkah cari-by-nomor-HP), lihat openUploadBuktiInstanModalDirect().
        const pesertaHtml = peserta.length > 0
            ? peserta.map(p => {
                if (p.tipe === 'instan') {
                    // Tidak pass iuranOverride di sini krn iuranPerOrang
                    // dihitung setelah blok ini (lihat computeSurveyKalkulasi
                    // di bawah) - biarkan helper hitung sendiri dari
                    // survey terkait (p.surveyId === s.id).
                    const lunas = pesertaInstanBayarSummary(p).lunas;
                    const nama = p.atasNama || p.memberName;
                    return `<span class="survey-participant-chip instan" onclick="openUploadBuktiInstanModalDirect(${p.id})" title="Klik untuk konfirmasi nomor WA & upload bukti transfer">${lunas ? '✓' : '👤'} ${nama} <span class="badge-instan" title="Daftar langsung, tanpa menabung">Langsung</span></span>`;
                }
                return `<span class="survey-participant-chip">👤 ${p.memberName}</span>`;
            }).join('')
            : '<span style="color:var(--ink-faint); font-size:12.5px;">Belum ada yang ikut.</span>';
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        const iuranPerOrang = Math.round(k.iuran);

        // Status iuran PRIBADI (tabungan vs iuran) - hanya ditampilkan ke
        // pemiliknya sendiri, bukan ke semua anggota, supaya tidak membocorkan
        // nominal tabungan anggota lain (beda dengan resume admin yang boleh
        // lihat semua karena memang tugasnya verifikasi).
        let statusIuranHtml = '';
        if (sudahIkut && currentUser) {
            const tabunganSaya = memberApprovedSavings(currentUser.id);
            const kurangSaya = Math.max(iuranPerOrang - tabunganSaya, 0);
            const lunasSaya = kurangSaya === 0;
            statusIuranHtml = `
              <div class="rek-box" style="margin:14px 0 0;">
                <div class="rek-row"><span>Tabungan Anda (terverifikasi)</span><span>Rp ${tabunganSaya.toLocaleString('id-ID')}</span></div>
                <div class="rek-row"><span>Iuran Sapi Ini</span><span>Rp ${iuranPerOrang.toLocaleString('id-ID')}</span></div>
                <div class="rek-row"><span>Status</span><span style="color:${lunasSaya ? 'var(--emerald-2)' : 'var(--brick)'}; font-weight:600;">${lunasSaya ? '✓ Lunas' : 'Kurang Rp ' + kurangSaya.toLocaleString('id-ID')}</span></div>
              </div>`;
        }

        return `
            <div class="survey-member-card">
              <div class="survey-member-card-head">
                <div>
                  <div class="survey-member-card-title">${surveyKode(s)} · ${s.supplier || '—'} · ${jenisSapiLabel(s.jenisSapi)}</div>
                  <div class="survey-member-card-sub">Survey ${s.tanggal || '—'}</div>
                </div>
                ${ikutBtn}
              </div>
              <div class="survey-member-meta">
                <div><span class="label">Berat</span>${s.berat ? s.berat + ' kg' : '—'}</div>
                <div><span class="label">Harga</span>${s.harga ? 'Rp ' + s.harga.toLocaleString('id-ID') : '—'}</div>
                <div><span class="label">Iuran per Peserta</span>Rp ${iuranPerOrang.toLocaleString('id-ID')}</div>
                <div><span class="label">Estimasi Daging</span>${formatKg(k.estimasiDaging)}</div>
                <div><span class="label">Hak Mudhohi</span>${formatKg(k.hakMudhohi)}</div>
                <div><span class="label">Share Warga</span>${formatKg(k.shareWarga)}</div>
                <div><span class="label">Lokasi</span>${lokasiCell}</div>
                <div><span class="label">Foto</span>${fotoCell}</div>
              </div>
              ${statusIuranHtml}
              <div class="survey-participants">
                <div class="survey-participants-title">Peserta (${peserta.length}/${SURVEY_MAX_PESERTA})</div>
                ${pesertaHtml}
              </div>
            </div>`;
    }).join('');
}

async function joinSurveySapi(surveyId) {
    if (!currentUser) return;
    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');
    const already = activePeserta.some(p => p.surveyId === surveyId && p.memberId === currentUser.id);
    if (already) return;

    // 1 anggota cuma boleh ikut 1 sapi - kalau ternyata sudah ikut sapi lain
    // (mis. data baru saja berubah), arahkan ke switchSurveySapi() bukan gagal diam-diam.
    const joinedElsewhere = activePeserta.some(p => p.memberId === currentUser.id && p.surveyId !== surveyId);
    if (joinedElsewhere) {
        return switchSurveySapi(surveyId);
    }

    // Maksimal 7 peserta per sapi (1 ekor sapi qurban = 7 bagian).
    const jumlahDiSurveyIni = activePeserta.filter(p => p.surveyId === surveyId).length;
    if (jumlahDiSurveyIni >= SURVEY_MAX_PESERTA) {
        showAlert(`Grup sapi ini sudah penuh (maksimal ${SURVEY_MAX_PESERTA} peserta).`, 'error');
        loadSurveySapiMemberList();
        loadSurveySapiDistribusi('surveySapiDistribusiBodyMember', 'surveySapiDistribusiFootMember');
        loadWorkOrderList('workOrderListMember', false);
        return;
    }

    const newId = appData.surveyPeserta.length > 0
        ? Math.max(...appData.surveyPeserta.map(p => p.id)) + 1
        : 1;

    const record = {
        id: newId,
        surveyId: surveyId,
        memberId: currentUser.id,
        memberName: currentUser.name,
        phone: currentUser.phone || '',
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('SurveyPeserta', record);
    if (success) {
        appData.surveyPeserta.push(record);
        showAlert('Berhasil ikut grup sapi ini', 'success');
        loadSurveySapiMemberList();
        loadSurveySapiDistribusi('surveySapiDistribusiBodyMember', 'surveySapiDistribusiFootMember');
        loadWorkOrderList('workOrderListMember', false);
    }
}

// Pindah dari sapi yang sudah diikuti ke sapi lain - baris lama ditandai
// status='batal' (bukan dihapus, lihat komentar activePeserta di atas),
// lalu daftar baris baru buat sapi tujuan.
async function switchSurveySapi(newSurveyId) {
    if (!currentUser) return;
    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');
    const myCurrent = activePeserta.find(p => p.memberId === currentUser.id);

    if (!myCurrent) return joinSurveySapi(newSurveyId);
    if (myCurrent.surveyId === newSurveyId) return;

    // Maksimal 7 peserta per sapi - cek dulu kuota grup tujuan sebelum pindah.
    const jumlahDiTujuan = activePeserta.filter(p => p.surveyId === newSurveyId).length;
    if (jumlahDiTujuan >= SURVEY_MAX_PESERTA) {
        showAlert(`Grup sapi ini sudah penuh (maksimal ${SURVEY_MAX_PESERTA} peserta).`, 'error');
        return;
    }

    const survey = appData.surveySapi.find(s => s.id === newSurveyId);
    if (!confirm(`Pindah dari grup sapi sebelumnya ke grup "${survey ? surveyKode(survey) + ' - ' + survey.supplier : 'ini'}"?`)) return;

    const cancelSuccess = await updateSheetDB('SurveyPeserta', 'id', myCurrent.id, { status: 'batal' });
    if (!cancelSuccess) {
        showAlert('Gagal memindahkan grup sapi, coba lagi.', 'error');
        return;
    }
    myCurrent.status = 'batal';

    const newId = appData.surveyPeserta.length > 0
        ? Math.max(...appData.surveyPeserta.map(p => p.id)) + 1
        : 1;
    const record = {
        id: newId,
        surveyId: newSurveyId,
        memberId: currentUser.id,
        memberName: currentUser.name,
        phone: currentUser.phone || '',
        status: 'aktif',
        created_date: new Date().toISOString()
    };

    const success = await appendSheetDB('SurveyPeserta', record);
    if (success) {
        appData.surveyPeserta.push(record);
        showAlert('Berhasil pindah grup sapi', 'success');
    } else {
        showAlert('Grup lama sudah dibatalkan tapi gagal daftar ke grup baru. Coba klik Ikut lagi.', 'error');
    }
    loadSurveySapiMemberList();
    loadSurveySapiDistribusi('surveySapiDistribusiBodyMember', 'surveySapiDistribusiFootMember');
    loadWorkOrderList('workOrderListMember', false);
}

// ===== DAFTAR LANGSUNG (QURBAN INSTAN) =====
// Jalur utk orang yang mau ikut qurban TANPA menabung bertahap (biasanya
// mendekati hari-H) - tanpa akun login, cukup isi Nama/No HP/Alamat. Hasil
// submit langsung jadi baris SurveyPeserta (tipe:'instan', memberId:0, status
// 'aktif' seketika - TIDAK ada tahap approval, sesuai keputusan), jadi ikut
// terhitung otomatis di semua kalkulasi kuota/iuran/resume yang sudah ada
// (sama data source dengan peserta jalur tabungan), dan otomatis kebawa juga
// kalau admin generate Kupon Mudhohi nanti.
function openInstantJoinModal(surveyId) {
    const survey = appData.surveySapi.find(s => s.id === surveyId);
    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');
    const jumlahDiSurveyIni = activePeserta.filter(p => p.surveyId === surveyId).length;
    if (jumlahDiSurveyIni >= SURVEY_MAX_PESERTA) {
        showAlert(`Grup sapi ini sudah penuh (maksimal ${SURVEY_MAX_PESERTA} peserta).`, 'error');
        return;
    }

    const k = survey ? computeSurveyKalkulasi(survey.berat, survey.harga, survey.biayaPengolahan) : null;
    const iuranPerOrang = k ? Math.round(k.iuran) : 0;

    document.getElementById('instantJoinSurveyId').value = surveyId;
    document.getElementById('instantJoinName').value = '';
    document.getElementById('instantJoinRT').value = '';
    document.getElementById('instantJoinBlok').value = '';
    document.getElementById('instantJoinNo').value = '';
    document.getElementById('instantJoinPhone').value = '';
    document.getElementById('instantJoinAtasNama').value = '';
    document.getElementById('instantJoinInfo').textContent = survey
        ? `Grup: ${surveyKode(survey)} · ${jenisSapiLabel(survey.jenisSapi)}${survey.supplier ? ' · ' + survey.supplier : ''}. Total bayar (1x, penuh): Rp ${iuranPerOrang.toLocaleString('id-ID')}.`
        : 'Grup sapi tidak ditemukan.';

    const btn = document.getElementById('instantJoinSubmitBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Kirim Pendaftaran'; }

    document.getElementById('instantJoinModal').classList.add('show');
}

function closeInstantJoinModal() {
    document.getElementById('instantJoinModal').classList.remove('show');
}

async function submitInstantJoin() {
    const surveyId = parseInt(document.getElementById('instantJoinSurveyId').value) || 0;
    const name = document.getElementById('instantJoinName').value.trim();
    const rt = document.getElementById('instantJoinRT').value.trim();
    const blok = document.getElementById('instantJoinBlok').value.trim();
    const no = document.getElementById('instantJoinNo').value.trim();
    const phone = document.getElementById('instantJoinPhone').value.trim();
    // Opsional - kosong berarti qurban atas nama pendaftar sendiri. Kalau
    // diisi, dipakai sbg nama utama di e-tiket (lihat generateKuponMudhohi()),
    // bukan nama pendaftar - umum dipakai utk qurban atas nama ortu/keluarga
    // yg sudah wafat, mis. "Ahmad bin Abdullah".
    const atasNama = document.getElementById('instantJoinAtasNama').value.trim();

    if (!name || !rt || !blok || !no || !phone) {
        showAlert('Nama, RT, Blok, No, dan Nomor WhatsApp harus diisi', 'error');
        return;
    }
    if (!phone.startsWith('08')) {
        showAlert('Nomor WhatsApp harus dimulai dengan 08', 'error');
        return;
    }
    // Digabung jadi 1 string krn kolom "alamat" di SurveyPeserta memang
    // dirancang sbg 1 kolom (dipakai juga oleh PenerimaQR.alamat yg sama-sama
    // free text) - beda dari Members/Pendaftaran yg pakai 3 kolom terpisah.
    const alamat = `RT ${rt}, Blok ${blok}, No ${no}`;

    const survey = appData.surveySapi.find(s => s.id === surveyId);
    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');

    // Kuota bisa saja sudah berubah sejak modal dibuka (orang lain daftar
    // duluan) - cek ulang sebelum benar-benar simpan.
    const jumlahDiSurveyIni = activePeserta.filter(p => p.surveyId === surveyId).length;
    if (jumlahDiSurveyIni >= SURVEY_MAX_PESERTA) {
        showAlert(`Grup sapi ini baru saja penuh (maksimal ${SURVEY_MAX_PESERTA} peserta). Coba pilih grup lain.`, 'error');
        closeInstantJoinModal();
        loadSurveySapiMemberList();
        return;
    }

    // Cek nomor HP dobel (baik peserta tabungan maupun instan lain) - 1 orang
    // logisnya cuma ikut 1 grup, sama semangatnya dgn aturan "1 anggota 1
    // sapi" di joinSurveySapi(), tapi di sini dicek by nomor HP krn tidak ada
    // akun/memberId.
    const normalizedPhone = normalizePhone(phone);
    const dobel = activePeserta.find(p => p.phone && normalizePhone(p.phone) === normalizedPhone);
    if (dobel) {
        const dobelSurvey = appData.surveySapi.find(s => s.id === dobel.surveyId);
        showAlert(`Nomor WhatsApp ini sudah terdaftar di grup ${dobelSurvey ? surveyKode(dobelSurvey) : 'lain'}. Hubungi admin kalau ingin pindah grup.`, 'error');
        return;
    }

    const btn = document.getElementById('instantJoinSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }

    // ===== Notif WA ke Bendahara/Ketua: SEBELUM await apapun kalau bisa =====
    // Sama pola dgn handleRegistration() - data buat pesan sudah lengkap dari
    // form (tidak perlu tunggu server), jadi window.open() dipanggil sinkron
    // di sini supaya tidak diblokir browser mobile.
    const k = survey ? computeSurveyKalkulasi(survey.berat, survey.harga, survey.biayaPengolahan) : null;
    const iuranPerOrang = k ? Math.round(k.iuran) : 0;
    const adminMsgFor = () => `Assalamu'alaikum, ada yang daftar Qurban Instan (tanpa menabung)! 🐄

Nama Pendaftar: ${name}
${atasNama ? `Qurban Atas Nama: ${atasNama}\n` : ''}WhatsApp: ${phone}
Alamat: ${alamat}
Grup Sapi: ${survey ? surveyKode(survey) + ' · ' + jenisSapiLabel(survey.jenisSapi) : '-'}
Total Bayar: Rp ${iuranPerOrang.toLocaleString('id-ID')}

Mohon dihubungi untuk arahan pembayaran (transfer/tunai).
🔗 ${APP_CONFIG.appUrl}`;
    let officerPhone = (appData.members && appData.members.length > 0)
        ? findOfficerPhone(appData.members, ['bendum2', 'ketua1'])
        : '';
    if (officerPhone) openWaTo(officerPhone, adminMsgFor());

    const newId = appData.surveyPeserta.length > 0
        ? Math.max(...appData.surveyPeserta.map(p => p.id)) + 1
        : 1;
    const record = {
        id: newId,
        surveyId: surveyId,
        memberId: 0,
        memberName: name,
        phone: phone,
        status: 'aktif',
        created_date: new Date().toISOString(),
        alamat: alamat,
        tipe: 'instan',
        atasNama: atasNama,
        statusBayar: 'belum'
    };

    const success = await appendSheetDB('SurveyPeserta', record);

    if (btn) { btn.disabled = false; btn.textContent = 'Kirim Pendaftaran'; }

    if (!success) {
        showAlert('Gagal menyimpan pendaftaran. Coba lagi.', 'error');
        return;
    }

    appData.surveyPeserta.push(record);

    // Fallback: nomor pengurus belum ke-cache pas modal dibuka (jarang) -
    // coba lagi setelah data anggota ke-fetch fresh. window.open() di sini
    // sudah lewat await, jadi mungkin diblokir di sebagian browser mobile,
    // tapi pendaftarannya sendiri tetap tersimpan normal.
    if (!officerPhone) {
        const freshMembers = await fetchSheetDBTable('Members');
        officerPhone = findOfficerPhone(freshMembers, ['bendum2', 'ketua1']);
        if (officerPhone) openWaTo(officerPhone, adminMsgFor());
    }

    closeInstantJoinModal();
    showAlert('Pendaftaran berhasil dikirim! Admin akan menghubungi Anda via WhatsApp.', 'success');
    loadSurveySapiMemberList();
    renderSurveyHero();
}

// ===== UPLOAD BUKTI TRANSFER (peserta "Daftar Langsung"/instan) =====
// Peserta instan tidak punya akun login, jadi tidak ada halaman "riwayat
// saya" - modal ini 2 langkah: (1) cari pendaftaran sendiri by nomor WA yang
// dipakai saat submitInstantJoin() (1 nomor = 1 pendaftaran aktif, sudah
// di-dedupe di sana jadi aman dipakai sbg kunci pencarian), (2) form cicilan
// (nominal + tanggal + foto, dikompres pakai compressImage() yang sama dgn
// upload bukti Tabungan biasa) - disimpan sbg baris BARU di sheet
// SetoranInstan (BUKAN overwrite 1 kolom spt versi lama), lihat
// submitSetoranInstan(). 1 peserta bisa submit berkali-kali (cicilan).
let uploadBuktiInstanState = { pesertaId: null, fotoBase64: null };
// Diisi cuma pas modal dibuka dari chip nama peserta di daftar publik (lihat
// openUploadBuktiInstanModalDirect di bawah) - dipakai cariPendaftaranInstan()
// utk MEWAJIBKAN nomor WA yang diketik cocok dengan nomor peserta ini secara
// spesifik, supaya orang lain tidak bisa asal klik nama orang lain lalu
// langsung lihat status bayar/upload bukti atas nama dia (privasi jamaah).
let uploadBuktiConfirmTarget = null;

const UPLOAD_BUKTI_DESC_DEFAULT = 'Masukkan nomor WhatsApp yang Anda pakai saat daftar "Daftar Langsung" untuk mencari pendaftaran Anda.';

function openUploadBuktiInstanModal() {
    uploadBuktiConfirmTarget = null;
    resetUploadBuktiStep();
    const desc = document.getElementById('uploadBuktiStep1Desc');
    if (desc) desc.textContent = UPLOAD_BUKTI_DESC_DEFAULT;
    document.getElementById('uploadBuktiInstanModal').classList.add('show');
}

// Diklik dari chip nama peserta 'instan' di daftar publik (lihat
// loadSurveySapiMemberList()). DULU ini langsung lompat ke step 2 (skip
// verifikasi) - resikonya siapa saja yang buka halaman publik bisa klik nama
// orang lain dan langsung lihat status bayar + upload bukti atas nama orang
// itu. Sekarang tetap mulai dari step 1 (masukkan nomor WA), tapi nomornya
// WAJIB cocok dengan nomor peserta yang namanya diklik - lihat
// cariPendaftaranInstan(). Nama peserta ditampilkan di step 1 supaya jelas
// ini konfirmasi identitas, bukan pencarian bebas.
function openUploadBuktiInstanModalDirect(pesertaId) {
    const peserta = appData.surveyPeserta.find(p => p.id === pesertaId && p.status !== 'batal' && p.tipe === 'instan');
    if (!peserta) {
        showAlert('Pendaftaran tidak ditemukan.', 'error');
        return;
    }
    resetUploadBuktiStep();
    uploadBuktiConfirmTarget = peserta;
    const nama = (peserta.atasNama || peserta.memberName || '').replace(/</g, '&lt;');
    const desc = document.getElementById('uploadBuktiStep1Desc');
    if (desc) desc.innerHTML = `Demi menjaga privasi, konfirmasi dulu nomor WhatsApp yang didaftarkan atas nama <strong>${nama}</strong> sebelum lanjut upload bukti transfer.`;
    document.getElementById('uploadBuktiInstanModal').classList.add('show');
}

function closeUploadBuktiInstanModal() {
    document.getElementById('uploadBuktiInstanModal').classList.remove('show');
    uploadBuktiConfirmTarget = null;
}

function resetUploadBuktiStep() {
    uploadBuktiInstanState = { pesertaId: null, fotoBase64: null };
    document.getElementById('uploadBuktiPhone').value = '';
    document.getElementById('uploadBuktiSearchError').textContent = '';
    const searchBtn = document.getElementById('uploadBuktiSearchBtn');
    if (searchBtn) { searchBtn.disabled = false; searchBtn.textContent = 'Cari Pendaftaran Saya'; }
    document.getElementById('uploadBuktiStep1').style.display = 'block';
    document.getElementById('uploadBuktiStep2').style.display = 'none';
    document.getElementById('uploadBuktiError').textContent = '';
    const nominalEl = document.getElementById('uploadBuktiNominal');
    if (nominalEl) nominalEl.value = '';
    const tanggalEl = document.getElementById('uploadBuktiTanggal');
    if (tanggalEl) tanggalEl.value = '';
    const submitBtn = document.getElementById('uploadBuktiSubmitBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Kirim Bukti Transfer'; }
    const slot = document.getElementById('uploadBuktiSlot');
    if (slot) {
        slot.innerHTML = `
            <input type="file" id="uploadBuktiFile" accept="image/png,image/jpeg" capture="environment" onchange="previewBuktiInstan()">
            <div class="slot-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg>
                <span>Foto Bukti Transfer</span>
            </div>`;
    }
}

function cariPendaftaranInstan() {
    const phoneInput = document.getElementById('uploadBuktiPhone').value.trim();
    const errorEl = document.getElementById('uploadBuktiSearchError');
    errorEl.textContent = '';

    if (!phoneInput) {
        errorEl.textContent = 'Nomor WhatsApp harus diisi.';
        return;
    }

    const normalized = normalizePhone(phoneInput);
    let peserta;

    if (uploadBuktiConfirmTarget) {
        // Mode konfirmasi privasi (dibuka dari klik nama di daftar publik) -
        // nomor yang diketik HARUS cocok persis dengan nomor peserta target,
        // tidak boleh nyasar ke pendaftaran orang lain.
        if (uploadBuktiConfirmTarget.phone && normalizePhone(uploadBuktiConfirmTarget.phone) === normalized) {
            peserta = uploadBuktiConfirmTarget;
        }
    } else {
        // Jalur cari-bebas (dibuka dari tombol umum) - cuma cari di antara
        // peserta tipe 'instan'; peserta 'tabungan' punya akun & jalur upload
        // sendiri (menu Upload Bukti Transfer), tidak relevan di sini.
        peserta = appData.surveyPeserta.find(p =>
            p.status !== 'batal' && p.tipe === 'instan' && p.phone && normalizePhone(p.phone) === normalized
        );
    }

    if (!peserta) {
        errorEl.textContent = uploadBuktiConfirmTarget
            ? 'Nomor tidak cocok dengan data pendaftaran ini. Pastikan nomor yang dimasukkan sama dengan saat daftar "Daftar Langsung".'
            : 'Nomor tidak ditemukan. Pastikan sudah daftar "Daftar Langsung" dulu, atau hubungi admin kalau merasa sudah daftar.';
        return;
    }

    showUploadBuktiStep2ForPeserta(peserta);
}

// Isi & tampilkan step 2 (info peserta + riwayat cicilan + form upload) -
// dipakai bareng oleh cariPendaftaranInstan() (jalur cari-by-nomor-HP),
// openUploadBuktiInstanModalDirect() (jalur klik langsung dari chip), DAN
// submitSetoranInstan() (refresh tampilan setelah kirim cicilan baru, tanpa
// menutup modal - supaya peserta langsung lihat riwayat ter-update).
function showUploadBuktiStep2ForPeserta(peserta) {
    const survey = appData.surveySapi.find(s => s.id === peserta.surveyId);
    const sum = pesertaInstanBayarSummary(peserta);
    const nama = peserta.atasNama || peserta.memberName;

    uploadBuktiInstanState.pesertaId = peserta.id;

    const statusText = sum.lunas
        ? '✓ Status: <strong>Lunas</strong>.'
        : (sum.totalApproved > 0
            ? `Sudah terverifikasi <strong>Rp ${sum.totalApproved.toLocaleString('id-ID')}</strong>, sisa <strong>Rp ${sum.sisa.toLocaleString('id-ID')}</strong>.`
            : 'Status: <strong>Belum Bayar</strong>. Setelah upload, admin akan cek & verifikasi.');

    document.getElementById('uploadBuktiInfo').innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
        <span>Ditemukan: <strong>${nama}</strong>${survey ? ' · ' + surveyKode(survey) : ''}. Total iuran Rp ${sum.totalIuran.toLocaleString('id-ID')}. ${statusText}</span>`;

    // Riwayat cicilan yang sudah pernah dikirim peserta ini (kalau ada) -
    // supaya peserta lihat sendiri progress cicilannya, bukan cuma admin.
    const riwayatEl = document.getElementById('uploadBuktiRiwayat');
    if (riwayatEl) {
        if (sum.setoran.length === 0) {
            riwayatEl.innerHTML = '';
        } else {
            const statusLabel = st => ({ APPROVED: ['✓ Terverifikasi', 'var(--emerald-2)'], PENDING: ['⏳ Menunggu verifikasi', 'var(--gold)'], REJECTED: ['✕ Ditolak', 'var(--brick)'] }[st] || [st, 'var(--ink-faint)']);
            const rows = sum.setoran.slice().sort((a, b) => (a.uploadedAt || '').localeCompare(b.uploadedAt || '')).map(s => {
                const [label, color] = statusLabel(s.status);
                return `<div class="rek-row"><span>${s.transferDate || '—'} · Rp ${(s.nominal || 0).toLocaleString('id-ID')}</span><span style="color:${color};font-weight:600;">${label}</span></div>`;
            }).join('');
            riwayatEl.innerHTML = `
                <div class="rek-box">
                  <div style="font-weight:700;font-size:12.5px;margin-bottom:6px;color:var(--ink-soft);">Riwayat Cicilan Anda</div>
                  ${rows}
                </div>`;
        }
    }

    const tanggalEl = document.getElementById('uploadBuktiTanggal');
    if (tanggalEl && !tanggalEl.value) tanggalEl.value = new Date().toISOString().slice(0, 10);

    document.getElementById('uploadBuktiStep1').style.display = 'none';
    document.getElementById('uploadBuktiStep2').style.display = 'block';
}

function previewBuktiInstan() {
    const input = document.getElementById('uploadBuktiFile');
    const slot = document.getElementById('uploadBuktiSlot');
    const errorEl = document.getElementById('uploadBuktiError');
    const submitBtn = document.getElementById('uploadBuktiSubmitBtn');
    const file = input.files[0];
    if (!file) return;

    errorEl.textContent = '';
    submitBtn.disabled = true;

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
        errorEl.textContent = 'Foto harus PNG atau JPG.';
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        compressImage(e.target.result, function (compressedBase64) {
            uploadBuktiInstanState.fotoBase64 = compressedBase64;
            slot.innerHTML = `
                <input type="file" id="uploadBuktiFile" accept="image/png,image/jpeg" capture="environment" onchange="previewBuktiInstan()">
                <img src="${compressedBase64}" alt="Bukti transfer">
                <button type="button" class="slot-remove" onclick="removeBuktiInstan(event)" title="Hapus foto">&times;</button>`;
            submitBtn.disabled = false;
        }, function () {
            errorEl.textContent = 'Foto terlalu detail untuk disimpan walau sudah dikompres maksimal. Coba foto ulang lebih sederhana.';
            input.value = '';
        });
    };
    reader.readAsDataURL(file);
}

function removeBuktiInstan(evt) {
    if (evt) evt.stopPropagation();
    uploadBuktiInstanState.fotoBase64 = null;
    document.getElementById('uploadBuktiSubmitBtn').disabled = true;
    const slot = document.getElementById('uploadBuktiSlot');
    slot.innerHTML = `
        <input type="file" id="uploadBuktiFile" accept="image/png,image/jpeg" capture="environment" onchange="previewBuktiInstan()">
        <div class="slot-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg>
            <span>Foto Bukti Transfer</span>
        </div>`;
}

// Ganti nama dari submitBuktiInstan() - sekarang APPEND baris baru ke sheet
// SetoranInstan (cicilan, status PENDING nunggu verifikasi admin) alih-alih
// overwrite kolom tunggal SurveyPeserta.buktiBayar. Modal SENGAJA tidak
// ditutup setelah sukses (beda dari versi lama) - direfresh ke step 2 yang
// sama supaya peserta bisa langsung lihat riwayat ter-update atau langsung
// submit cicilan berikutnya kalau masih ada sisa.
async function submitSetoranInstan() {
    const { pesertaId, fotoBase64 } = uploadBuktiInstanState;
    const nominal = parseInt(document.getElementById('uploadBuktiNominal').value) || 0;
    const tanggal = document.getElementById('uploadBuktiTanggal').value || '';
    const errorEl = document.getElementById('uploadBuktiError');

    if (!pesertaId || !fotoBase64) {
        showAlert('Pilih foto bukti transfer dulu.', 'error');
        return;
    }
    if (nominal <= 0) {
        errorEl.textContent = 'Nominal transfer harus diisi.';
        return;
    }
    errorEl.textContent = '';

    const peserta = appData.surveyPeserta.find(p => p.id === pesertaId);
    const btn = document.getElementById('uploadBuktiSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }

    // ===== Notif WA ke Bendahara/Ketua: SEBELUM await, sama pola dgn
    // submitInstantJoin() - data pesan sudah lengkap dari state lokal, jadi
    // window.open() dipanggil sinkron di sini supaya tidak diblokir browser
    // mobile begitu ada jeda async (appendSheetDB) di bawahnya.
    if (peserta) {
        const survey = appData.surveySapi.find(s => s.id === peserta.surveyId);
        const nama = peserta.atasNama || peserta.memberName;
        const msg = `Assalamu'alaikum, peserta Daftar Langsung upload bukti transfer (cicilan)! 🧾

Nama: ${nama}
Pendaftar: ${peserta.memberName}
WhatsApp: ${peserta.phone}
Grup Sapi: ${survey ? surveyKode(survey) + ' · ' + jenisSapiLabel(survey.jenisSapi) : '-'}
Nominal: Rp ${nominal.toLocaleString('id-ID')}
Tanggal: ${tanggal || '-'}

Mohon dicek & diverifikasi (menu Verifikasi > Setoran Qurban Instan).
🔗 ${APP_CONFIG.appUrl}`;
        const officerPhone = findOfficerPhone(appData.members, ['bendum2', 'ketua1']);
        if (officerPhone) openWaTo(officerPhone, msg);
    }

    const newId = appData.setoranInstan.length > 0
        ? Math.max(...appData.setoranInstan.map(s => s.id)) + 1
        : 1;
    const record = {
        id: newId,
        pesertaId: pesertaId,
        nominal: nominal,
        transferDate: tanggal,
        fileData: fotoBase64,
        status: 'PENDING',
        uploadedAt: new Date().toISOString(),
        approvedAt: '',
        approvedBy: '',
        notes: ''
    };

    const success = await appendSheetDB('SetoranInstan', record);

    if (btn) { btn.disabled = false; btn.textContent = 'Kirim Bukti Transfer'; }

    if (!success) {
        showAlert('Gagal mengirim bukti transfer. Coba lagi.', 'error');
        return;
    }

    // Optimistic update - simpan flag hasFile TRUE tapi fileData TIDAK
    // disimpan di appData (sama pola strip-di-server utk item lain), cukup
    // dipakai lokal utk render riwayat & summary segera tanpa reload penuh.
    appData.setoranInstan.push({
        id: newId, pesertaId, nominal, transferDate: tanggal,
        status: 'PENDING', uploadedAt: record.uploadedAt,
        approvedAt: '', approvedBy: '', notes: '', hasFile: true
    });

    showAlert('Bukti transfer terkirim! Admin akan segera memverifikasi.', 'success');

    // Reset form (nominal/tanggal/foto) tapi TETAP di step 2 dgn riwayat
    // ter-update, supaya peserta bisa langsung submit cicilan berikutnya.
    uploadBuktiInstanState.fotoBase64 = null;
    document.getElementById('uploadBuktiNominal').value = '';
    const slot = document.getElementById('uploadBuktiSlot');
    if (slot) {
        slot.innerHTML = `
            <input type="file" id="uploadBuktiFile" accept="image/png,image/jpeg" capture="environment" onchange="previewBuktiInstan()">
            <div class="slot-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg>
                <span>Foto Bukti Transfer</span>
            </div>`;
    }
    if (btn) btn.disabled = true;
    if (peserta) showUploadBuktiStep2ForPeserta(peserta);
}

// ===== VERIFY =====
function loadVerifyData() {
    const pending = appData.savings.filter(s => s.status === 'PENDING');
    const approved = appData.savings.filter(s => s.status === 'APPROVED');
    const rejected = appData.savings.filter(s => s.status === 'REJECTED');

    const badge = document.getElementById('verifySummary');
    if (badge) {
        badge.innerHTML =
            `<span class="badge pending">${pending.length} Menunggu</span> ` +
            `<span class="badge approved">${approved.length} Disetujui</span> ` +
            `<span class="badge rejected">${rejected.length} Ditolak</span>`;
    }

    const pendingBody = document.getElementById('pendingTableBody');
    pendingBody.innerHTML = '';

    if (pending.length === 0) {
        pendingBody.innerHTML = '<tr><td colspan="6" class="loading">Tidak ada yang perlu diverifikasi</td></tr>';
        return;
    }

    pending.forEach(saving => {
        const d = new Date(saving.transferDate);
        const row = pendingBody.insertRow();
        const buktiBtn = saving.hasFile
            ? `<button class="file-thumb-btn" onclick="showPreview(${saving.id})">📋 Lihat Bukti</button>`
            : '<small style="color:var(--brick);">Tidak ada file</small>';
        
        row.innerHTML = `
            <td>${!isNaN(d) ? d.toLocaleDateString('id-ID') : saving.transferDate}</td>
            <td>${saving.accountName}</td>
            <td>Rp ${saving.amount.toLocaleString('id-ID')}</td>
            <td>${saving.bankSource}</td>
            <td>${buktiBtn}${saving.notes ? `<br><small style="color:var(--ink-faint);">${saving.notes}</small>` : ''}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-success btn-small" onclick="approveSavings(${saving.id})">Setujui</button>
                <button class="btn btn-danger btn-small" onclick="rejectSavings(${saving.id})">Tolak</button>
            </td>
        `;
    });
}

async function approveSavings(savingsId) {
    const saving = appData.savings.find(s => s.id === savingsId);
    if (!saving) return;

    if (!confirm(`Setujui tabungan ${saving.accountName} sebesar Rp ${saving.amount.toLocaleString('id-ID')}?`)) return;

    await processVerification(saving, 'APPROVED', '');
}

async function rejectSavings(savingsId) {
    const saving = appData.savings.find(s => s.id === savingsId);
    if (!saving) return;

    const reason = prompt(`Alasan penolakan untuk ${saving.accountName} (Rp ${saving.amount.toLocaleString('id-ID')}):`, 'Bukti transfer kurang jelas');
    if (reason === null) return;
    if (!reason.trim()) {
        showAlert('Alasan penolakan harus diisi', 'error');
        return;
    }

    await processVerification(saving, 'REJECTED', reason.trim());
}

async function processVerification(saving, action, reason) {
    const now = new Date().toISOString();
    const newNotes = action === 'REJECTED'
        ? (saving.notes ? saving.notes + ' | Ditolak: ' + reason : 'Ditolak: ' + reason)
        : saving.notes;

    // Simpan state lama buat rollback kalau gagal
    const prev = { status: saving.status, approvedAt: saving.approvedAt, approvedBy: saving.approvedBy, notes: saving.notes };

    // ✨ Optimistic update: ubah tampilan LANGSUNG (item hilang dari daftar
    // menunggu, badge ke-update) sebelum nunggu server - terasa instan.
    // Kalau ternyata gagal simpan, di-rollback otomatis di bawah.
    saving.status = action;
    saving.approvedAt = now;
    saving.approvedBy = currentUser.name;
    saving.notes = newNotes;
    loadVerifyData();
    updateDashboard();

    // ===== Notifikasi WA ke jamaah: SEKARANG, sebelum await simpan =====
    // Semua data pesan (nominal, total saldo, alasan tolak) sudah diketahui
    // sinkron dari sini (saving.status sudah di-flip di atas, appData.savings
    // sudah reflect perubahan ini) - tidak perlu nunggu server dulu, jadi
    // window.open() tetap dalam gesture klik/confirm() asli, aman dari
    // blokir browser mobile (lihat catatan panjang di openWaTo()).
    const memberForWa = appData.members.find(m => m.id === saving.memberId);
    if (memberForWa && memberForWa.phone) {
        if (action === 'APPROVED') {
            const memberSavings = appData.savings.filter(s => s.memberId === memberForWa.id && s.status === 'APPROVED');
            const totalSaldo = memberSavings.reduce((sum, s) => sum + s.amount, 0);
            openWaTo(memberForWa.phone, buildApprovedMsg(memberForWa, saving.amount, totalSaldo));
        } else if (action === 'REJECTED') {
            openWaTo(memberForWa.phone, buildRejectedMsg(memberForWa, saving.amount, reason));
        }
    }

    const written = await updateSheetDB('Savings', 'id', saving.id, {
        status: action,
        approvedAt: now,
        approvedBy: currentUser.name,
        notes: newNotes
    });

    if (!written) {
        // Rollback tampilan karena gagal tersimpan di server
        Object.assign(saving, prev);
        loadVerifyData();
        updateDashboard();
        showAlert('Gagal menyimpan ke Google Sheets. Status dikembalikan — silakan coba lagi.', 'error');
        return;
    }

    // Catat jejak audit ke tab Verifications
    const verification = {
        id: nextVerificationId(),
        savingsId: saving.id,
        adminId: currentUser.name,
        action: action,
        reason: reason,
        timestamp: now
    };
    const logged = await appendSheetDB('Verifications', verification);
    if (logged) appData.verifications.push(verification);

    // (Notifikasi WA ke jamaah sudah dibuka di atas, sebelum simpan ke
    // Sheets - lihat blok openWaTo() di dekat optimistic update)

    showAlert(
        action === 'APPROVED'
            ? `Tabungan ${saving.accountName} disetujui dan tersimpan di Google Sheets`
            : `Tabungan ${saving.accountName} ditolak dan tercatat di Google Sheets`,
        action === 'APPROVED' ? 'success' : 'warning'
    );

    loadVerifyData();
    updateDashboard();
}

function nextVerificationId() {
    return appData.verifications.length > 0
        ? Math.max(...appData.verifications.map(v => parseInt(v.id) || 0)) + 1
        : 1;
}

// ===== VERIFY: SETORAN INSTAN (cicilan Qurban Instan) =====
// Mirror pola loadVerifyData()/approveSavings()/rejectSavings()/
// processVerification() di atas, tapi sumbernya appData.setoranInstan &
// FK-nya ke SurveyPeserta (bukan Members) krn peserta instan tidak punya
// akun login.
function loadSetoranInstanVerifyData() {
    const badge = document.getElementById('setoranInstanSummary');
    const pendingBody = document.getElementById('setoranInstanPendingTableBody');
    if (!pendingBody) return;

    const all = appData.setoranInstan || [];
    const pending = all.filter(s => s.status === 'PENDING');
    const approved = all.filter(s => s.status === 'APPROVED');
    const rejected = all.filter(s => s.status === 'REJECTED');

    if (badge) {
        badge.innerHTML =
            `<span class="badge pending">${pending.length} Menunggu</span> ` +
            `<span class="badge approved">${approved.length} Disetujui</span> ` +
            `<span class="badge rejected">${rejected.length} Ditolak</span>`;
    }

    if (pending.length === 0) {
        pendingBody.innerHTML = '<tr><td colspan="6" class="loading">Tidak ada yang perlu diverifikasi</td></tr>';
        return;
    }

    pendingBody.innerHTML = pending.slice().sort((a, b) => (a.uploadedAt || '').localeCompare(b.uploadedAt || '')).map(s => {
        const peserta = appData.surveyPeserta.find(p => p.id === s.pesertaId);
        const survey = peserta ? appData.surveySapi.find(sv => sv.id === peserta.surveyId) : null;
        const nama = peserta ? (peserta.atasNama || peserta.memberName) : `Peserta #${s.pesertaId}`;
        const buktiBtn = s.hasFile
            ? `<button class="file-thumb-btn" onclick="previewSetoranInstanFoto(${s.id})">📋 Lihat Bukti</button>`
            : '<small style="color:var(--brick);">Tidak ada file</small>';
        return `
            <tr>
              <td>${s.transferDate || '—'}</td>
              <td>${nama}</td>
              <td>${survey ? surveyKode(survey) : '—'}</td>
              <td>Rp ${(s.nominal || 0).toLocaleString('id-ID')}</td>
              <td>${buktiBtn}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-success btn-small" onclick="approveSetoranInstan(${s.id})">Setujui</button>
                <button class="btn btn-danger btn-small" onclick="rejectSetoranInstan(${s.id})">Tolak</button>
              </td>
            </tr>`;
    }).join('');
}

async function approveSetoranInstan(setoranId) {
    const setoran = (appData.setoranInstan || []).find(s => s.id === setoranId);
    if (!setoran) return;
    const peserta = appData.surveyPeserta.find(p => p.id === setoran.pesertaId);
    const nama = peserta ? (peserta.atasNama || peserta.memberName) : `Peserta #${setoran.pesertaId}`;

    if (!confirm(`Setujui cicilan ${nama} sebesar Rp ${(setoran.nominal || 0).toLocaleString('id-ID')}?`)) return;

    await processSetoranInstanVerification(setoran, peserta, 'APPROVED', '');
}

async function rejectSetoranInstan(setoranId) {
    const setoran = (appData.setoranInstan || []).find(s => s.id === setoranId);
    if (!setoran) return;
    const peserta = appData.surveyPeserta.find(p => p.id === setoran.pesertaId);
    const nama = peserta ? (peserta.atasNama || peserta.memberName) : `Peserta #${setoran.pesertaId}`;

    const reason = prompt(`Alasan penolakan cicilan ${nama} (Rp ${(setoran.nominal || 0).toLocaleString('id-ID')}):`, 'Bukti transfer kurang jelas');
    if (reason === null) return;
    if (!reason.trim()) {
        showAlert('Alasan penolakan harus diisi', 'error');
        return;
    }

    await processSetoranInstanVerification(setoran, peserta, 'REJECTED', reason.trim());
}

async function processSetoranInstanVerification(setoran, peserta, action, reason) {
    const now = new Date().toISOString();
    const newNotes = action === 'REJECTED' ? ('Ditolak: ' + reason) : setoran.notes;

    const prev = { status: setoran.status, approvedAt: setoran.approvedAt, approvedBy: setoran.approvedBy, notes: setoran.notes };

    // Optimistic update - sama pola dgn processVerification() (Savings).
    setoran.status = action;
    setoran.approvedAt = now;
    setoran.approvedBy = currentUser.name;
    setoran.notes = newNotes;
    loadSetoranInstanVerifyData();
    loadSurveySapiResume();

    // ===== Notif WA ke peserta: SEBELUM await, sama pola dgn Savings di atas
    // - peserta instan tidak punya akun/memberId, jadi kirim ke p.phone
    // langsung (bukan lookup ke appData.members).
    if (peserta && peserta.phone) {
        const survey = appData.surveySapi.find(s => s.id === peserta.surveyId);
        const k = survey ? computeSurveyKalkulasi(survey.berat, survey.harga, survey.biayaPengolahan) : null;
        const iuranPerOrang = k ? Math.round(k.iuran) : 0;
        const sum = pesertaInstanBayarSummary(peserta, iuranPerOrang);
        const nama = peserta.atasNama || peserta.memberName;
        let msg;
        if (action === 'APPROVED') {
            msg = `Assalamu'alaikum ${nama},

Cicilan Anda sebesar Rp ${(setoran.nominal || 0).toLocaleString('id-ID')} sudah kami verifikasi ✅

Total terverifikasi: Rp ${sum.totalApproved.toLocaleString('id-ID')} dari Rp ${sum.totalIuran.toLocaleString('id-ID')}
${sum.lunas ? 'Status: LUNAS 🎉' : `Sisa: Rp ${sum.sisa.toLocaleString('id-ID')}`}

Barakallahu fiik! 🤲
${APP_CONFIG.mosqueName}`;
        } else {
            msg = `Assalamu'alaikum ${nama},

Mohon maaf, cicilan Anda sebesar Rp ${(setoran.nominal || 0).toLocaleString('id-ID')} belum dapat kami verifikasi.

❌ Alasan: ${reason}

Silakan upload ulang bukti transfer yang lebih jelas melalui aplikasi:
🔗 ${APP_CONFIG.appUrl}

${APP_CONFIG.mosqueName}`;
        }
        openWaTo(peserta.phone, msg);
    }

    const written = await updateSheetDB('SetoranInstan', 'id', setoran.id, {
        status: action,
        approvedAt: now,
        approvedBy: currentUser.name,
        notes: newNotes
    });

    if (!written) {
        Object.assign(setoran, prev);
        loadSetoranInstanVerifyData();
        loadSurveySapiResume();
        showAlert('Gagal menyimpan ke Google Sheets. Status dikembalikan — silakan coba lagi.', 'error');
        return;
    }

    showAlert(
        action === 'APPROVED' ? 'Cicilan disetujui dan tersimpan di Google Sheets' : 'Cicilan ditolak dan tercatat di Google Sheets',
        action === 'APPROVED' ? 'success' : 'warning'
    );

    loadSetoranInstanVerifyData();
    loadSurveySapiResume();
    updateDashboard();
}

// Ambil foto bukti transfer 1 baris SetoranInstan on-demand (fileData
// dibuang dari bootstrap/list, lihat stripSetoranInstanFoto() di sheets.js) -
// sama pola dgn fetchSavingFileData()/fetchSurveyPesertaBuktiData().
async function fetchSetoranInstanFileData(setoranId) {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?sheet=SetoranInstan&getFile=${setoranId}${tenantParam()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.fileData || '';
    } catch (error) {
        console.error('Error fetching setoran instan file data:', error);
        return '';
    }
}

async function previewSetoranInstanFoto(setoranId) {
    const setoran = (appData.setoranInstan || []).find(s => s.id === setoranId);
    if (!setoran) return;
    const peserta = appData.surveyPeserta.find(p => p.id === setoran.pesertaId);
    const nama = peserta ? (peserta.atasNama || peserta.memberName) : `Peserta #${setoran.pesertaId}`;

    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const body = document.getElementById('previewBody');

    title.textContent = `Bukti Transfer - ${nama} (Rp ${(setoran.nominal || 0).toLocaleString('id-ID')})`;

    if (!setoran.hasFile) {
        body.innerHTML = '<div class="preview-pdf"><p>📄 Tidak ada bukti file tersimpan</p></div>';
        modal.classList.add('show');
        return;
    }

    body.innerHTML = '<div class="preview-pdf"><p>⏳ Memuat bukti...</p></div>';
    modal.classList.add('show');

    const fileData = await fetchSetoranInstanFileData(setoranId);

    if (!fileData) {
        body.innerHTML = '<div class="preview-pdf"><p>📄 Gagal memuat bukti file</p></div>';
        return;
    }

    body.innerHTML = `<img src="${fileData}" class="preview-full-image" alt="Bukti transfer">`;
}

// ===== HISTORY =====
// ===== DATE FORMATTING =====
function formatDate(dateString) {
    if (!dateString) return '-';
    
    // Parse date string (format: YYYY-MM-DD atau ISO datetime)
    let date;
    if (dateString.includes('T')) {
        // ISO format: 2026-08-03T15:16:50.932Z
        date = new Date(dateString);
    } else if (dateString.includes('-')) {
        // Format: 2026-08-03
        const [year, month, day] = dateString.split('-');
        date = new Date(year, parseInt(month) - 1, day);
    } else {
        return dateString; // Return as-is kalau format tidak dikenal
    }
    
    if (isNaN(date.getTime())) return dateString;
    
    return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function loadHistory() {
    const tbody = document.getElementById('historyTable');
    tbody.innerHTML = '';

    const mySavings = appData.savings.filter(s => s.memberId === currentUser.id);
    if (mySavings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Belum ada transaksi</td></tr>';
        return;
    }

    mySavings.forEach(saving => {
        const row = tbody.insertRow();
        const statusColor = saving.status === 'APPROVED' 
            ? 'approved' 
            : saving.status === 'REJECTED' 
            ? 'rejected' 
            : 'pending';
        
        row.innerHTML = `
            <td>${formatDate(saving.transferDate)}</td>
            <td>Rp ${saving.amount.toLocaleString('id-ID')}</td>
            <td><span class="badge ${statusColor}">${saving.status}</span></td>
            <td><small style="color:var(--ink-faint);">${saving.bankSource}</small></td>
        `;
    });
}

// ===== LAPORAN =====
// ===== LAPORAN PROFESIONAL =====
let laporanCharts = {};

// Chart.js (canvas) TIDAK BISA membaca CSS variable seperti 'var(--emerald)' -
// fillStyle canvas butuh warna asli (hex/rgb), makanya sebelumnya semua chart
// tampil hitam solid. Palet ini adalah nilai hex asli dari CSS custom
// properties di :root, dipakai khusus untuk konfigurasi Chart.js.
const REPORT_COLORS = {
    emerald: '#0E3B34',
    emerald2: '#175C50',
    emeraldTint: '#E6EEEA',
    gold: '#B6893A',
    goldSoft: '#E7C878',
    goldTint: '#F7EFDA',
    sage: '#6F9089',
    sageTint: '#E9F1EE',
    brick: '#9B4632',
    ink: '#182420',
    inkSoft: '#4C5851',
    inkFaint: '#869089',
    paper: '#FAF7F0',
    border: '#E4DBC5'
};

const REPORT_PALETTE = [
    REPORT_COLORS.emerald,
    REPORT_COLORS.gold,
    REPORT_COLORS.sage,
    REPORT_COLORS.emerald2,
    REPORT_COLORS.goldSoft,
    REPORT_COLORS.brick,
    REPORT_COLORS.inkSoft
];

// Plugin custom: tampilkan total di tengah doughnut chart, biar terasa "dashboard premium"
const centerTotalPlugin = {
    id: 'centerTotal',
    afterDraw(chart) {
        if (chart.config.type !== 'doughnut' || !chart._centerTotalText) return;
        const { ctx, chartArea } = chart;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = REPORT_COLORS.inkFaint;
        ctx.font = "600 11px 'Inter', sans-serif";
        ctx.fillText('TOTAL', cx, cy - 14);
        ctx.fillStyle = REPORT_COLORS.emerald;
        ctx.font = "700 20px 'IBM Plex Mono', monospace";
        ctx.fillText(chart._centerTotalText, cx, cy + 10);
        ctx.restore();
    }
};

// Styling global Chart.js (font & tooltip premium) + register centerTotalPlugin
// - SATU KALI, dipanggil lewat ensureChartJsReady() (bukan langsung dieksekusi
// di top-level lagi) karena Chart.js sekarang di-lazy-load (lihat
// ensureChartJs() di awal <script>), jadi belum tentu `Chart` sudah ada saat
// baris ini pertama kali di-parse.
let _chartJsSetupDone = false;
function setupChartJsDefaults() {
    if (_chartJsSetupDone) return;
    _chartJsSetupDone = true;
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.color = REPORT_COLORS.inkSoft;
    Chart.defaults.plugins.tooltip.backgroundColor = REPORT_COLORS.ink;
    Chart.defaults.plugins.tooltip.titleColor = REPORT_COLORS.goldSoft;
    Chart.defaults.plugins.tooltip.bodyColor = '#fff';
    Chart.defaults.plugins.tooltip.borderColor = REPORT_COLORS.gold;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    Chart.defaults.plugins.tooltip.titleFont = { family: "'IBM Plex Mono', monospace", size: 12, weight: '600' };
    Chart.defaults.plugins.tooltip.bodyFont = { family: "'IBM Plex Mono', monospace", size: 13, weight: '600' };
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.animation.duration = 900;
    Chart.defaults.animation.easing = 'easeOutQuart';
    Chart.register(centerTotalPlugin);
}
// Dipakai SEMUA fungsi drawXxxChart()/renderXxxChart() di bawah, gantikan
// ensureChartJs() polos - supaya library ke-load DAN styling/plugin-nya
// ke-setup, keduanya cuma sekali walau dipanggil berkali-kali dari banyak tab.
async function ensureChartJsReady() {
    await ensureChartJs();
    setupChartJsDefaults();
}

// Bikin gradient vertikal buat canvas (dipakai bar & line chart)
function makeVerticalGradient(ctx, chartArea, colorTop, colorBottom) {
    if (!chartArea) return colorTop; // belum ke-render, fallback warna solid
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, colorTop);
    gradient.addColorStop(1, colorBottom);
    return gradient;
}

function switchLaporanTab(tabName, btn) {
    document.querySelectorAll('#laporan .sub-tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabName + 'Tab').style.display = 'block';

    document.querySelectorAll('#laporan .sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Trigger load data untuk tab yang dipilih
    setTimeout(() => {
        if (tabName === 'overview') loadOverviewTab();
        if (tabName === 'sapi') loadSapiTab();
        if (tabName === 'detail') loadTransactionDetail();
        if (tabName === 'analisis') loadAnalisisTab();
    }, 100);
}

// Animasi "count-up" buat angka di hero card - sentuhan dashboard premium.
// Format via callback supaya bisa pakai format Rupiah maupun angka polos.
function animateCountUp(el, from, to, formatFn, duration = 900) {
    if (!el) return;
    const start = performance.now();
    const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const current = Math.round(from + (to - from) * eased);
        el.textContent = formatFn(current);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function loadLaporan() {
    // Load summary cards
    const approved = appData.savings.filter(s => s.status === 'APPROVED');
    const totalApproved = approved.reduce((sum, s) => sum + s.amount, 0);
    const totalTransactions = appData.savings.length;
    const totalMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length; // exclude admin
    const average = totalMembers > 0 ? Math.round(totalApproved / totalMembers) : 0;

    const rupiah = v => `Rp ${v.toLocaleString('id-ID')}`;
    animateCountUp(document.getElementById('reportGrandTotal'), 0, totalApproved, rupiah);
    animateCountUp(document.getElementById('reportTotalMembers'), 0, totalMembers, v => `${v}`);
    animateCountUp(document.getElementById('reportTotalTransactions'), 0, totalTransactions, v => `${v}`);
    animateCountUp(document.getElementById('reportAverage'), 0, average, rupiah);

    // Load overview tab by default
    loadOverviewTab();
}

function loadOverviewTab() {
    loadTopSapi();
    drawSapiChart();
}

function loadTopSapi() {
    const sapiStats = getSapiStatistics();
    const sorted = Object.entries(sapiStats)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);

    const tbody = document.getElementById('topSapiTable');
    tbody.innerHTML = '';

    sorted.forEach(([sapiNum, stats]) => {
        const row = tbody.insertRow();
        const percentage = (stats.total / (appData.savings.filter(s => s.status === 'APPROVED').reduce((sum, s) => sum + s.amount, 0) || 1) * 100).toFixed(1);
        row.innerHTML = `
            <td style="font-weight:600;">
                <span style="display:inline-flex;align-items:center;gap:6px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg, var(--gold-soft), var(--gold));display:inline-block;"></span>
                    Sapi #${sapiNum}
                </span>
            </td>
            <td>${stats.members.length}</td>
            <td style="color:var(--emerald);font-weight:700;font-family:var(--font-mono);">Rp ${stats.total.toLocaleString('id-ID')}</td>
            <td style="font-family:var(--font-mono);">Rp ${stats.average.toLocaleString('id-ID')}</td>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="flex:1;height:9px;background:var(--sand);border-radius:5px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.06);">
                        <div style="height:100%;width:${percentage}%;background:linear-gradient(90deg, var(--emerald-2), var(--emerald));border-radius:5px;box-shadow:0 0 8px rgba(14,59,52,.4);"></div>
                    </div>
                    <span style="font-size:12px;color:var(--ink-faint);font-weight:600;min-width:36px;text-align:right;">${percentage}%</span>
                </div>
            </td>
        `;
    });
}

function loadSapiTab() {
    const sapiStats = getSapiStatistics();
    const select = document.getElementById('sapiFilter');
    select.innerHTML = '<option value="">-- Semua Sapi --</option>';
    
    Object.keys(sapiStats).sort((a, b) => a - b).forEach(sapi => {
        const option = document.createElement('option');
        option.value = sapi;
        option.textContent = `Sapi #${sapi}`;
        select.appendChild(option);
    });

    loadSapiDetail();
}

function loadSapiDetail() {
    const selectedSapi = document.getElementById('sapiFilter')?.value || '';
    const sapiStats = getSapiStatistics();
    
    if (!selectedSapi) {
        document.getElementById('sapiDetailCard').style.display = 'none';
        document.getElementById('sapiDetailTitle').textContent = 'Semua Anggota';
        loadAllMembersTable();
    } else {
        const stats = sapiStats[selectedSapi];
        document.getElementById('sapiDetailCard').style.display = 'grid';
        document.getElementById('sapiMemberCount').textContent = stats.members.length;
        document.getElementById('sapiTotal').textContent = `Rp ${stats.total.toLocaleString('id-ID')}`;
        document.getElementById('sapiAverage').textContent = `Rp ${stats.average.toLocaleString('id-ID')}`;
        document.getElementById('sapiDetailTitle').textContent = `Anggota Sapi #${selectedSapi}`;
        loadSapiMembersTable(selectedSapi);
    }
}

function loadAllMembersTable() {
    const tbody = document.getElementById('sapiMemberTable');
    tbody.innerHTML = '';

    const members = appData.members.filter(m => m.role !== 'admin' && m.id > 0);
    
    members.forEach(member => {
        const memberSavings = appData.savings.filter(s => s.memberId === member.id && s.status === 'APPROVED');
        const total = memberSavings.reduce((sum, s) => sum + s.amount, 0);
        const count = memberSavings.length;

        const row = tbody.insertRow();
        row.innerHTML = `
            <td style="font-weight:600;">${member.id}</td>
            <td>${member.name}</td>
            <td><small>${member.rt ? `RT ${member.rt}, Blok ${member.blok}, No ${member.no}` : '-'}</small></td>
            <td style="color:var(--emerald);font-weight:600;">Rp ${total.toLocaleString('id-ID')}</td>
            <td>${count}</td>
            <td><span class="badge approved">Aktif</span></td>
        `;
    });
}

function loadSapiMembersTable(sapiNum) {
    const tbody = document.getElementById('sapiMemberTable');
    tbody.innerHTML = '';

    const members = appData.members.filter(m => m.sapi === parseInt(sapiNum));
    
    members.forEach(member => {
        const memberSavings = appData.savings.filter(s => s.memberId === member.id && s.status === 'APPROVED');
        const total = memberSavings.reduce((sum, s) => sum + s.amount, 0);
        const count = memberSavings.length;

        const row = tbody.insertRow();
        row.innerHTML = `
            <td style="font-weight:600;">${member.id}</td>
            <td>${member.name}</td>
            <td><small>${member.rt ? `RT ${member.rt}, Blok ${member.blok}, No ${member.no}` : '-'}</small></td>
            <td style="color:var(--emerald);font-weight:600;">Rp ${total.toLocaleString('id-ID')}</td>
            <td>${count}</td>
            <td><span class="badge approved">Aktif</span></td>
        `;
    });
}

function loadTransactionDetail() {
    const sapiSelect = document.getElementById('transactionSapiFilter');
    const sapiStats = getSapiStatistics();
    
    sapiSelect.innerHTML = '<option value="">-- Semua Sapi --</option>';
    Object.keys(sapiStats).sort((a, b) => a - b).forEach(sapi => {
        const option = document.createElement('option');
        option.value = sapi;
        option.textContent = `Sapi #${sapi}`;
        sapiSelect.appendChild(option);
    });

    renderTransactionTable();
}

function renderTransactionTable() {
    const selectedSapi = document.getElementById('transactionSapiFilter')?.value || '';
    const selectedStatus = document.getElementById('transactionStatusFilter')?.value || '';

    let transactions = appData.savings;

    if (selectedSapi) {
        const memberIds = appData.members
            .filter(m => m.sapi === parseInt(selectedSapi))
            .map(m => m.id);
        transactions = transactions.filter(t => memberIds.includes(t.memberId));
    }

    if (selectedStatus) {
        transactions = transactions.filter(t => t.status === selectedStatus);
    }

    const tbody = document.getElementById('transactionTable');
    tbody.innerHTML = '';

    transactions.sort((a, b) => new Date(b.transferDate) - new Date(a.transferDate)).forEach(trans => {
        const member = appData.members.find(m => m.id === trans.memberId);
        const row = tbody.insertRow();
        const statusColor = trans.status === 'APPROVED' ? 'approved' : trans.status === 'REJECTED' ? 'rejected' : 'pending';
        
        row.innerHTML = `
            <td>${formatDate(trans.transferDate)}</td>
            <td style="font-weight:600;">${trans.memberId}</td>
            <td>${member?.name || '-'}</td>
            <td style="color:var(--emerald);font-weight:600;">Rp ${trans.amount.toLocaleString('id-ID')}</td>
            <td><small>${trans.bankSource}</small></td>
            <td><span class="badge ${statusColor}">${trans.status}</span></td>
        `;
    });
}

function loadAnalisisTab() {
    drawDistributionChart();
    drawMonthlyChart();
    loadStatistics();
}

function loadStatistics() {
    const approved = appData.savings.filter(s => s.status === 'APPROVED');
    const pending = appData.savings.filter(s => s.status === 'PENDING');
    const activeMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length;
    const paidMembers = new Set(approved.map(s => s.memberId)).size;
    const pendingMembers = new Set(pending.map(s => s.memberId)).size;
    
    const totalApproved = approved.reduce((sum, s) => sum + s.amount, 0);
    const avgApproved = paidMembers > 0 ? Math.round(totalApproved / paidMembers) : 0;
    const maxApproved = approved.length > 0 ? Math.max(...approved.map(s => s.amount)) : 0;
    const minApproved = approved.length > 0 ? Math.min(...approved.map(s => s.amount)) : 0;

    document.getElementById('stat-active').textContent = activeMembers;
    document.getElementById('stat-paid').textContent = `${paidMembers} orang`;
    document.getElementById('stat-pending').textContent = `${pendingMembers} orang`;
    document.getElementById('stat-avg').textContent = `Rp ${avgApproved.toLocaleString('id-ID')}`;
    document.getElementById('stat-max').textContent = `Rp ${maxApproved.toLocaleString('id-ID')}`;
    document.getElementById('stat-min').textContent = `Rp ${minApproved.toLocaleString('id-ID')}`;
}

function getSapiStatistics() {
    const sapiStats = {};
    
    appData.members.filter(m => m.sapi > 0).forEach(member => {
        if (!sapiStats[member.sapi]) {
            sapiStats[member.sapi] = { members: [], total: 0, average: 0 };
        }
        sapiStats[member.sapi].members.push(member);

        const memberSavings = appData.savings.filter(s => s.memberId === member.id && s.status === 'APPROVED');
        const memberTotal = memberSavings.reduce((sum, s) => sum + s.amount, 0);
        sapiStats[member.sapi].total += memberTotal;
    });

    Object.values(sapiStats).forEach(stat => {
        stat.average = stat.members.length > 0 ? Math.round(stat.total / stat.members.length) : 0;
    });

    return sapiStats;
}

async function drawSapiChart() {
    const sapiStats = getSapiStatistics();
    const sortedKeys = Object.keys(sapiStats).sort((a, b) => a - b);
    const labels = sortedKeys.map(s => `Sapi #${s}`);
    const data = sortedKeys.map(s => sapiStats[s].total);

    const canvas = document.getElementById('sapiChart');
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    if (laporanCharts.sapi) laporanCharts.sapi.destroy();

    await ensureChartJsReady();
    laporanCharts.sapi = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Terkumpul',
                data: data,
                backgroundColor: (context) => {
                    const { ctx, chartArea } = context.chart;
                    return makeVerticalGradient(ctx, chartArea, REPORT_COLORS.emerald2, REPORT_COLORS.emerald);
                },
                hoverBackgroundColor: REPORT_COLORS.gold,
                borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
                borderSkipped: false,
                maxBarThickness: 56
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: items => items[0].label,
                        label: ctx => `Rp ${ctx.parsed.y.toLocaleString('id-ID')}`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { weight: '600' } } },
                y: {
                    beginAtZero: true,
                    grid: { color: REPORT_COLORS.border, drawBorder: false },
                    ticks: { callback: v => `${(v/1000000).toFixed(1)}M` }
                }
            }
        }
    });
}

async function drawDistributionChart() {
    const sapiStats = getSapiStatistics();
    const sortedKeys = Object.keys(sapiStats).sort((a, b) => a - b);
    const labels = sortedKeys.map(s => `Sapi #${s}`);
    const data = sortedKeys.map(s => sapiStats[s].total);
    const grandTotal = data.reduce((sum, v) => sum + v, 0);

    const ctx = document.getElementById('distributionChart')?.getContext('2d');
    if (!ctx) return;

    if (laporanCharts.distribution) laporanCharts.distribution.destroy();

    await ensureChartJsReady();
    laporanCharts.distribution = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: REPORT_PALETTE,
                hoverOffset: 14,
                borderColor: '#fff',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 16,
                        font: { weight: '600', size: 12.5 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const pct = grandTotal > 0 ? ((ctx.parsed / grandTotal) * 100).toFixed(1) : 0;
                            return `Rp ${ctx.parsed.toLocaleString('id-ID')} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
    laporanCharts.distribution._centerTotalText = `Rp ${(grandTotal/1000000).toFixed(1)}M`;
    laporanCharts.distribution.update();
}

async function drawMonthlyChart() {
    const monthlyData = {};
    
    appData.savings.filter(s => s.status === 'APPROVED').forEach(trans => {
        const date = new Date(trans.transferDate);
        const monthKey = `${date.getMonth() + 1}/${date.getFullYear()}`;
        monthlyData[monthKey] = (monthlyData[monthKey] || 0) + trans.amount;
    });

    const labels = Object.keys(monthlyData).sort((a, b) => {
        const [m1, y1] = a.split('/').map(Number);
        const [m2, y2] = b.split('/').map(Number);
        return y1 - y2 || m1 - m2;
    });
    const data = labels.map(k => monthlyData[k]);

    const ctx = document.getElementById('monthlyChart')?.getContext('2d');
    if (!ctx) return;

    if (laporanCharts.monthly) laporanCharts.monthly.destroy();

    await ensureChartJsReady();
    laporanCharts.monthly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tabungan per Bulan',
                data: data,
                borderColor: REPORT_COLORS.gold,
                backgroundColor: (context) => {
                    const { ctx, chartArea } = context.chart;
                    if (!chartArea) return REPORT_COLORS.emeraldTint;
                    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    gradient.addColorStop(0, 'rgba(182, 137, 58, 0.32)');
                    gradient.addColorStop(1, 'rgba(182, 137, 58, 0.02)');
                    return gradient;
                },
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: REPORT_COLORS.emerald,
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `Rp ${ctx.parsed.y.toLocaleString('id-ID')}` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { weight: '600' } } },
                y: {
                    beginAtZero: true,
                    grid: { color: REPORT_COLORS.border, drawBorder: false },
                    ticks: { callback: v => `${(v/1000000).toFixed(1)}M` }
                }
            }
        }
    });
}

function exportTransactionCSV() {
    const selectedSapi = document.getElementById('transactionSapiFilter')?.value || '';
    const selectedStatus = document.getElementById('transactionStatusFilter')?.value || '';

    let transactions = appData.savings;

    if (selectedSapi) {
        const memberIds = appData.members
            .filter(m => m.sapi === parseInt(selectedSapi))
            .map(m => m.id);
        transactions = transactions.filter(t => memberIds.includes(t.memberId));
    }

    if (selectedStatus) {
        transactions = transactions.filter(t => t.status === selectedStatus);
    }

    const headers = ['Tanggal', 'ID', 'Nama', 'Nominal', 'Bank', 'Status'];
    const rows = transactions.map(trans => {
        const member = appData.members.find(m => m.id === trans.memberId);
        return [
            formatDate(trans.transferDate),
            trans.memberId,
            member?.name || '-',
            trans.amount,
            trans.bankSource,
            trans.status
        ];
    });

    downloadExcel([headers, ...rows], 'Laporan_Transaksi_Qurban');
}

// Helper export Excel sederhana (1 sheet, tanpa styling) - dipakai tombol
// "Export Excel" di tab Detail Transaksi.
async function downloadExcel(data, filenameBase) {
    await ensureXLSX();
    const ws = XLSX.utils.aoa_to_sheet(data);
    const colCount = data.reduce((max, row) => Math.max(max, row.length), 0);
    ws['!cols'] = Array.from({ length: colCount }, (_, c) => {
        let maxLen = 8;
        data.forEach(row => {
            const val = row[c];
            const len = val === undefined || val === null ? 0 : String(val).length;
            if (len > maxLen) maxLen = len;
        });
        return { wch: Math.min(maxLen + 2, 40) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filenameBase}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// Export Excel "premium" untuk Laporan - pakai ExcelJS supaya bisa kasih
// warna, font tebal, dan gambar chart asli (mirip tampilan web), karena
// library XLSX biasa tidak bisa menulis styling ke file .xlsx.
async function exportLaporanExcel(evt) {
    const btn = evt?.currentTarget || evt?.target;
    const originalHTML = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span>Menyiapkan...</span>'; }
    try {
        const c = REPORT_COLORS;
        const argb = hex => 'FF' + hex.replace('#', '').toUpperCase();
        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.emerald) } };
        const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };

        const sapiStats = getSapiStatistics();
        const approved = appData.savings.filter(s => s.status === 'APPROVED');
        const totalApproved = approved.reduce((sum, s) => sum + s.amount, 0);
        const totalMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length;
        const totalTransactions = appData.savings.length;
        const average = totalMembers > 0 ? Math.round(totalApproved / totalMembers) : 0;

        await ensureExcelJS();
        const wb = new ExcelJS.Workbook();
        wb.creator = `Tabungan Qurban - ${APP_CONFIG.mosqueName}`;
        wb.created = new Date();

        // ===== SHEET 1: RINGKASAN =====
        const ws = wb.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] });
        ws.columns = [{ width: 22 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 16 }];

        ws.mergeCells('A1:E1');
        ws.getCell('A1').value = 'LAPORAN TABUNGAN QURBAN';
        ws.getCell('A1').font = { bold: true, size: 16, color: { argb: argb(c.emerald) } };
        ws.getCell('A1').alignment = { horizontal: 'center' };

        ws.mergeCells('A2:E2');
        ws.getCell('A2').value = APP_CONFIG.mosqueName;
        ws.getCell('A2').font = { italic: true, size: 11, color: { argb: argb(c.inkFaint) } };
        ws.getCell('A2').alignment = { horizontal: 'center' };

        ws.mergeCells('A4:E4');
        const heroCell = ws.getCell('A4');
        heroCell.value = `TOTAL TABUNGAN QURBAN: Rp ${totalApproved.toLocaleString('id-ID')}`;
        heroCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        heroCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.emerald) } };
        heroCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(4).height = 28;

        ws.addRow([]);
        const statHeaderRow = ws.addRow(['Total Anggota', 'Total Transaksi', 'Rata-rata/Anggota']);
        statHeaderRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: argb(c.inkSoft) } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.emeraldTint) } };
        });
        const statValRow = ws.addRow([totalMembers, totalTransactions, average]);
        statValRow.getCell(3).numFmt = '"Rp" #,##0';

        ws.addRow([]);
        const perSapiTitleRow = ws.addRow(['PER SAPI']);
        perSapiTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: argb(c.gold) } };

        const sapiHeaderRow = ws.addRow(['Sapi', 'Jumlah Anggota', 'Total Terkumpul', 'Rata-rata']);
        sapiHeaderRow.eachCell(cell => { cell.font = headerFont; cell.fill = headerFill; });

        Object.keys(sapiStats).sort((a, b) => a - b).forEach(sapi => {
            const stats = sapiStats[sapi];
            const row = ws.addRow([`Sapi #${sapi}`, stats.members.length, stats.total, stats.average]);
            row.getCell(3).numFmt = '"Rp" #,##0';
            row.getCell(4).numFmt = '"Rp" #,##0';
        });

        // Sisipkan gambar chart yang sama persis dengan yang tampil di web
        if (laporanCharts.sapi && typeof laporanCharts.sapi.toBase64Image === 'function') {
            const imgId = wb.addImage({ base64: laporanCharts.sapi.toBase64Image(), extension: 'png' });
            const startRow = ws.lastRow.number + 2;
            ws.addImage(imgId, { tl: { col: 0, row: startRow }, ext: { width: 560, height: 260 } });
        }

        // ===== SHEET 2: Anggota =====
        const wsMembers = wb.addWorksheet('Anggota');
        wsMembers.columns = [
            { header: 'ID', key: 'id', width: 8 }, { header: 'Nama', key: 'nama', width: 24 },
            { header: 'RT', key: 'rt', width: 8 }, { header: 'Blok', key: 'blok', width: 10 },
            { header: 'No', key: 'no', width: 8 }, { header: 'Sapi', key: 'sapi', width: 8 },
            { header: 'Total', key: 'total', width: 16 }, { header: 'Transaksi', key: 'transaksi', width: 12 }
        ];
        wsMembers.getRow(1).eachCell(cell => { cell.font = headerFont; cell.fill = headerFill; });
        appData.members.filter(m => m.role !== 'admin' && m.id > 0).forEach(member => {
            const memberSavings = appData.savings.filter(s => s.memberId === member.id && s.status === 'APPROVED');
            const total = memberSavings.reduce((sum, s) => sum + s.amount, 0);
            wsMembers.addRow({
                id: member.id, nama: member.name, rt: member.rt || '', blok: member.blok || '',
                no: member.no || '', sapi: member.sapi || '', total, transaksi: memberSavings.length
            });
        });
        wsMembers.getColumn('total').numFmt = '"Rp" #,##0';

        // ===== SHEET 3: Transaksi =====
        const wsTrans = wb.addWorksheet('Transaksi');
        wsTrans.columns = [
            { header: 'Tanggal', key: 'tgl', width: 14 }, { header: 'ID', key: 'id', width: 8 },
            { header: 'Nama', key: 'nama', width: 24 }, { header: 'Nominal', key: 'nominal', width: 16 },
            { header: 'Bank', key: 'bank', width: 16 }, { header: 'Status', key: 'status', width: 12 }
        ];
        wsTrans.getRow(1).eachCell(cell => { cell.font = headerFont; cell.fill = headerFill; });
        appData.savings.forEach(trans => {
            const member = appData.members.find(m => m.id === trans.memberId);
            wsTrans.addRow({
                tgl: formatDate(trans.transferDate), id: trans.memberId, nama: member?.name || '-',
                nominal: trans.amount, bank: trans.bankSource, status: trans.status
            });
        });
        wsTrans.getColumn('nominal').numFmt = '"Rp" #,##0';

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Laporan_Tabungan_Qurban_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Export Excel gagal:', err);
        alert('Gagal membuat file Excel: ' + (err && err.message ? err.message : err));
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}

// Siapkan tampilan print: tandai sub-tab Laporan yang sedang aktif supaya
// stylesheet @media print tahu bagian mana yang harus ditampilkan (yang lain
// otomatis disembunyikan oleh CSS), lalu otomatis bersih-bersih lagi setelah
// dialog print/save ditutup.
function preparePrintView() {
    const laporanTab = document.getElementById('laporan');
    if (laporanTab) laporanTab.classList.add('print-target');

    const activeTab = document.querySelector('#laporan .sub-tab-content:not([style*="display: none"]):not([style*="display:none"])');
    if (activeTab) activeTab.classList.add('print-active');

    const cleanup = () => {
        if (laporanTab) laporanTab.classList.remove('print-target');
        if (activeTab) activeTab.classList.remove('print-active');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 4000); // fallback kalau 'afterprint' tidak terpicu (mis. sebagian browser mobile)
}

function printLaporan() {
    preparePrintView();
    window.print();
}

// ===== LAPORAN IURAN QURBAN =====
// Sama semangat & struktur dgn Laporan Tabungan (#laporan) di atas, tapi base
// data-nya peserta Survey Sapi (appData.surveyPeserta) - baik yang ikut lewat
// Tabungan (tipe 'tabungan') maupun Daftar Langsung/Qurban Instan (tipe
// 'instan'). "Terkumpul" per peserta: tipe 'tabungan' = total tabungan
// disetujui (memberApprovedSavings), tipe 'instan' = iuran penuh KALAU
// statusBayar='lunas' (0 kalau belum) - dua-duanya dibandingkan thd
// "kebutuhan" (iuranPerOrang dari computeSurveyKalkulasi grup sapinya) supaya
// satu tabel bisa gabungkan dua jalur pendaftaran secara adil.
function getIuranStatistics() {
    const activePeserta = appData.surveyPeserta.filter(p => p.status !== 'batal');
    const bySurvey = {};
    let totalTerkumpul = 0, totalKebutuhan = 0, totalPeserta = 0;

    appData.surveySapi.forEach(s => {
        const k = computeSurveyKalkulasi(s.berat, s.harga, s.biayaPengolahan);
        const iuranPerOrang = Math.round(k.iuran);
        const peserta = activePeserta
            .filter(p => p.surveyId === s.id)
            .map(p => {
                let terkumpul;
                if (p.tipe === 'instan') {
                    // Gabungkan status manual lama (statusBayar==='lunas') DAN
                    // cicilan baru (SetoranInstan APPROVED) - lihat
                    // pesertaInstanBayarSummary(). Kalau sudah lunas (dari
                    // manapun), dianggap penuh supaya kurang=0; kalau belum,
                    // terkumpul = jumlah cicilan APPROVED sejauh ini (bisa
                    // sebagian, bukan 0/penuh saja seperti sebelumnya).
                    const summary = pesertaInstanBayarSummary(p, iuranPerOrang);
                    terkumpul = summary.lunas ? iuranPerOrang : summary.totalApproved;
                } else {
                    terkumpul = memberApprovedSavings(p.memberId);
                }
                const kurang = Math.max(iuranPerOrang - terkumpul, 0);
                return Object.assign({}, p, { terkumpul, iuran: iuranPerOrang, kurang, lunas: kurang === 0 });
            });

        const grupTerkumpul = peserta.reduce((sum, p) => sum + p.terkumpul, 0);
        const grupKebutuhan = iuranPerOrang * peserta.length;

        bySurvey[s.id] = {
            survey: s,
            iuranPerOrang,
            peserta,
            totalTerkumpul: grupTerkumpul,
            totalKebutuhan: grupKebutuhan,
            totalKurang: Math.max(grupKebutuhan - grupTerkumpul, 0),
            average: peserta.length > 0 ? Math.round(grupTerkumpul / peserta.length) : 0
        };

        totalTerkumpul += grupTerkumpul;
        totalKebutuhan += grupKebutuhan;
        totalPeserta += peserta.length;
    });

    return {
        bySurvey,
        totalTerkumpul,
        totalKebutuhan,
        totalKurang: Math.max(totalKebutuhan - totalTerkumpul, 0),
        totalPeserta,
        totalGrup: appData.surveySapi.length,
        average: totalPeserta > 0 ? Math.round(totalTerkumpul / totalPeserta) : 0
    };
}

let laporanIuranCharts = {};

function loadLaporanIuran() {
    const stats = getIuranStatistics();
    const rupiah = v => `Rp ${v.toLocaleString('id-ID')}`;
    animateCountUp(document.getElementById('iuranGrandTotal'), 0, stats.totalTerkumpul, rupiah);
    animateCountUp(document.getElementById('iuranTotalPeserta'), 0, stats.totalPeserta, v => `${v}`);
    animateCountUp(document.getElementById('iuranTotalGrup'), 0, stats.totalGrup, v => `${v}`);
    animateCountUp(document.getElementById('iuranAverage'), 0, stats.average, rupiah);

    loadIuranOverviewTab();
}

const IURAN_TAB_PANEL_IDS = { overview: 'iuranOverviewTab', grup: 'iuranGrupTab', peserta: 'iuranDetailTab', analisis: 'iuranAnalisisTab' };
function switchLaporanIuranTab(tabName, btn) {
    document.querySelectorAll('#laporanIuran .sub-tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById(IURAN_TAB_PANEL_IDS[tabName]).style.display = 'block';

    document.querySelectorAll('#laporanIuran .report-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    setTimeout(() => {
        if (tabName === 'overview') loadIuranOverviewTab();
        if (tabName === 'grup') loadIuranGrupTab();
        if (tabName === 'peserta') loadIuranPesertaTab();
        if (tabName === 'analisis') loadIuranAnalisisTab();
    }, 100);
}

function loadIuranOverviewTab() {
    loadTopGrupIuran();
    drawIuranGrupChart();
}

function loadTopGrupIuran() {
    const stats = getIuranStatistics();
    const sorted = Object.values(stats.bySurvey).sort((a, b) => b.totalTerkumpul - a.totalTerkumpul);
    const tbody = document.getElementById('topGrupIuranTable');
    if (!tbody) return;

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Belum ada data survey</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(g => {
        const pct = g.totalKebutuhan > 0 ? Math.min((g.totalTerkumpul / g.totalKebutuhan) * 100, 100).toFixed(1) : 0;
        return `
            <tr>
                <td style="font-weight:600;">
                    <span style="display:inline-flex;align-items:center;gap:6px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg, var(--gold-soft), var(--gold));display:inline-block;"></span>
                        ${surveyKode(g.survey)}
                    </span>
                </td>
                <td>${g.peserta.length}/${SURVEY_MAX_PESERTA}</td>
                <td style="color:var(--emerald);font-weight:700;font-family:var(--font-mono);">Rp ${g.totalTerkumpul.toLocaleString('id-ID')}</td>
                <td style="font-family:var(--font-mono);">Rp ${g.average.toLocaleString('id-ID')}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="flex:1;height:9px;background:var(--sand);border-radius:5px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.06);">
                            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg, var(--emerald-2), var(--emerald));border-radius:5px;box-shadow:0 0 8px rgba(14,59,52,.4);"></div>
                        </div>
                        <span style="font-size:12px;color:var(--ink-faint);font-weight:600;min-width:36px;text-align:right;">${pct}%</span>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

async function drawIuranGrupChart() {
    const stats = getIuranStatistics();
    const sorted = Object.values(stats.bySurvey);
    const labels = sorted.map(g => surveyKode(g.survey));
    const data = sorted.map(g => g.totalTerkumpul);

    const canvas = document.getElementById('iuranGrupChart');
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    if (laporanIuranCharts.grup) laporanIuranCharts.grup.destroy();

    await ensureChartJsReady();
    laporanIuranCharts.grup = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Terkumpul',
                data: data,
                backgroundColor: (context) => {
                    const { ctx, chartArea } = context.chart;
                    return makeVerticalGradient(ctx, chartArea, REPORT_COLORS.emerald2, REPORT_COLORS.emerald);
                },
                hoverBackgroundColor: REPORT_COLORS.gold,
                borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
                borderSkipped: false,
                maxBarThickness: 56
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: items => items[0].label,
                        label: ctx => `Rp ${ctx.parsed.y.toLocaleString('id-ID')}`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { weight: '600' } } },
                y: {
                    beginAtZero: true,
                    grid: { color: REPORT_COLORS.border, drawBorder: false },
                    ticks: { callback: v => `${(v/1000000).toFixed(1)}M` }
                }
            }
        }
    });
}

function loadIuranGrupTab() {
    const stats = getIuranStatistics();
    const select = document.getElementById('iuranGrupFilter');
    select.innerHTML = '<option value="">-- Semua Grup --</option>';

    Object.values(stats.bySurvey).forEach(g => {
        const option = document.createElement('option');
        option.value = g.survey.id;
        option.textContent = surveyKode(g.survey);
        select.appendChild(option);
    });

    loadIuranGrupDetail();
}

function loadIuranGrupDetail() {
    const selectedId = document.getElementById('iuranGrupFilter')?.value || '';
    const stats = getIuranStatistics();

    if (!selectedId) {
        document.getElementById('iuranGrupDetailCard').style.display = 'none';
        document.getElementById('iuranGrupDetailTitle').textContent = 'Semua Peserta';
        renderIuranGrupTable(Object.values(stats.bySurvey).flatMap(g => g.peserta));
    } else {
        const g = stats.bySurvey[selectedId];
        document.getElementById('iuranGrupDetailCard').style.display = 'grid';
        document.getElementById('iuranGrupPesertaCount').textContent = g.peserta.length;
        document.getElementById('iuranGrupTotal').textContent = `Rp ${g.totalTerkumpul.toLocaleString('id-ID')}`;
        document.getElementById('iuranGrupKurang').textContent = `Rp ${g.totalKurang.toLocaleString('id-ID')}`;
        document.getElementById('iuranGrupDetailTitle').textContent = `Peserta ${surveyKode(g.survey)}`;
        renderIuranGrupTable(g.peserta);
    }
}

function renderIuranGrupTable(pesertaList) {
    const tbody = document.getElementById('iuranGrupPesertaTable');
    tbody.innerHTML = '';

    if (pesertaList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Belum ada peserta</td></tr>';
        return;
    }

    pesertaList.forEach(p => {
        const nama = p.tipe === 'instan' ? (p.atasNama || p.memberName) : p.memberName;
        const tipeLabel = p.tipe === 'instan' ? '<span class="badge-instan">Langsung</span>' : 'Tabungan';
        const row = tbody.insertRow();
        row.innerHTML = `
            <td style="font-weight:600;">${nama}</td>
            <td>${tipeLabel}</td>
            <td style="color:var(--emerald);font-weight:600;">Rp ${p.terkumpul.toLocaleString('id-ID')}</td>
            <td>Rp ${p.iuran.toLocaleString('id-ID')}</td>
            <td><span class="badge ${p.lunas ? 'approved' : 'pending'}">${p.lunas ? 'Lunas' : 'Rp ' + p.kurang.toLocaleString('id-ID') + ' kurang'}</span></td>
        `;
    });
}

function loadIuranPesertaTab() {
    const stats = getIuranStatistics();
    const select = document.getElementById('iuranPesertaGrupFilter');
    select.innerHTML = '<option value="">-- Semua Grup --</option>';

    Object.values(stats.bySurvey).forEach(g => {
        const option = document.createElement('option');
        option.value = g.survey.id;
        option.textContent = surveyKode(g.survey);
        select.appendChild(option);
    });

    renderIuranPesertaTable();
}

function getFilteredIuranPeserta() {
    const stats = getIuranStatistics();
    const selGrup = document.getElementById('iuranPesertaGrupFilter')?.value || '';
    const selTipe = document.getElementById('iuranPesertaTipeFilter')?.value || '';
    const selStatus = document.getElementById('iuranPesertaStatusFilter')?.value || '';

    let rows = [];
    Object.values(stats.bySurvey).forEach(g => {
        if (selGrup && String(g.survey.id) !== selGrup) return;
        g.peserta.forEach(p => rows.push(Object.assign({}, p, { survey: g.survey })));
    });
    if (selTipe) rows = rows.filter(p => p.tipe === selTipe);
    if (selStatus) rows = rows.filter(p => (selStatus === 'lunas' ? p.lunas : !p.lunas));
    return rows;
}

function renderIuranPesertaTable() {
    const rows = getFilteredIuranPeserta();
    const tbody = document.getElementById('iuranPesertaTable');
    tbody.innerHTML = '';

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Belum ada peserta</td></tr>';
        return;
    }

    rows.forEach(p => {
        const nama = p.tipe === 'instan' ? (p.atasNama || p.memberName) : p.memberName;
        const tipeLabel = p.tipe === 'instan' ? '<span class="badge-instan">Langsung</span>' : 'Tabungan';
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${surveyKode(p.survey)}</strong></td>
            <td>${nama}</td>
            <td>${tipeLabel}</td>
            <td style="color:var(--emerald);font-weight:600;">Rp ${p.terkumpul.toLocaleString('id-ID')}</td>
            <td>Rp ${p.iuran.toLocaleString('id-ID')}</td>
            <td><span class="badge ${p.lunas ? 'approved' : 'pending'}">${p.lunas ? 'Lunas' : 'Belum Lunas'}</span></td>
        `;
    });
}

// Export CSV sederhana (mirip exportTransactionCSV() di Laporan Tabungan) -
// dipakai tombol "Export Excel" di tab Detail Peserta, hormat filter yang
// sedang aktif.
function exportIuranPesertaCSV() {
    const rows = getFilteredIuranPeserta();
    const headers = ['Grup', 'Nama', 'Tipe', 'Terkumpul', 'Iuran', 'Status'];
    const data = rows.map(p => [
        surveyKode(p.survey),
        p.tipe === 'instan' ? (p.atasNama || p.memberName) : p.memberName,
        p.tipe === 'instan' ? 'Daftar Langsung' : 'Tabungan',
        p.terkumpul, p.iuran, p.lunas ? 'Lunas' : 'Belum Lunas'
    ]);
    downloadExcel([headers, ...data], 'Laporan_Iuran_Qurban_Peserta');
}

function loadIuranAnalisisTab() {
    drawIuranDistributionChart();
    drawIuranTipeChart();
    loadIuranStatistics();
}

async function drawIuranDistributionChart() {
    const stats = getIuranStatistics();
    const sorted = Object.values(stats.bySurvey);
    const labels = sorted.map(g => surveyKode(g.survey));
    const data = sorted.map(g => g.totalTerkumpul);
    const grandTotal = data.reduce((sum, v) => sum + v, 0);

    const ctx = document.getElementById('iuranDistributionChart')?.getContext('2d');
    if (!ctx) return;

    if (laporanIuranCharts.distribution) laporanIuranCharts.distribution.destroy();

    await ensureChartJsReady();
    laporanIuranCharts.distribution = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: REPORT_PALETTE,
                hoverOffset: 14,
                borderColor: '#fff',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { weight: '600', size: 12.5 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const pct = grandTotal > 0 ? ((ctx.parsed / grandTotal) * 100).toFixed(1) : 0;
                            return `Rp ${ctx.parsed.toLocaleString('id-ID')} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

async function drawIuranTipeChart() {
    const stats = getIuranStatistics();
    const allPeserta = Object.values(stats.bySurvey).flatMap(g => g.peserta);
    const tabunganCount = allPeserta.filter(p => p.tipe !== 'instan').length;
    const instanCount = allPeserta.filter(p => p.tipe === 'instan').length;

    const ctx = document.getElementById('iuranTipeChart')?.getContext('2d');
    if (!ctx) return;

    if (laporanIuranCharts.tipe) laporanIuranCharts.tipe.destroy();

    await ensureChartJsReady();
    laporanIuranCharts.tipe = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Tabungan', 'Daftar Langsung'],
            datasets: [{
                label: 'Jumlah Peserta',
                data: [tabunganCount, instanCount],
                backgroundColor: [REPORT_COLORS.emerald2, REPORT_COLORS.gold],
                borderRadius: 8,
                maxBarThickness: 70
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, grid: { color: REPORT_COLORS.border, drawBorder: false }, ticks: { stepSize: 1 } },
                y: { grid: { display: false } }
            }
        }
    });
}

function loadIuranStatistics() {
    const stats = getIuranStatistics();
    const allPeserta = Object.values(stats.bySurvey).flatMap(g => g.peserta);
    const tabunganCount = allPeserta.filter(p => p.tipe !== 'instan').length;
    const instanCount = allPeserta.filter(p => p.tipe === 'instan').length;
    const lunasCount = allPeserta.filter(p => p.lunas).length;
    const belumCount = allPeserta.length - lunasCount;

    document.getElementById('iuran-stat-active').textContent = allPeserta.length;
    document.getElementById('iuran-stat-tabungan').textContent = `${tabunganCount} orang`;
    document.getElementById('iuran-stat-instan').textContent = `${instanCount} orang`;
    document.getElementById('iuran-stat-lunas').textContent = `${lunasCount} orang`;
    document.getElementById('iuran-stat-belum').textContent = `${belumCount} orang`;
    document.getElementById('iuran-stat-avg').textContent = `Rp ${stats.average.toLocaleString('id-ID')}`;
    document.getElementById('iuran-stat-kurang').textContent = `Rp ${stats.totalKurang.toLocaleString('id-ID')}`;
}

// Export Excel "premium" (ExcelJS, sama pola dgn exportLaporanExcel()) - 2
// sheet: Ringkasan (per grup + gambar chart) dan Peserta (semua baris detail).
async function exportLaporanIuranExcel(evt) {
    const btn = evt?.currentTarget || evt?.target;
    const originalHTML = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span>Menyiapkan...</span>'; }
    try {
        const c = REPORT_COLORS;
        const argb = hex => 'FF' + hex.replace('#', '').toUpperCase();
        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.emerald) } };
        const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };

        const stats = getIuranStatistics();
        const sortedGrup = Object.values(stats.bySurvey).sort((a, b) => b.totalTerkumpul - a.totalTerkumpul);

        await ensureExcelJS();
        const wb = new ExcelJS.Workbook();
        wb.creator = `Tabungan Qurban - ${APP_CONFIG.mosqueName}`;
        wb.created = new Date();

        // ===== SHEET 1: RINGKASAN =====
        const ws = wb.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] });
        ws.columns = [{ width: 22 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 16 }];

        ws.mergeCells('A1:E1');
        ws.getCell('A1').value = 'LAPORAN IURAN QURBAN';
        ws.getCell('A1').font = { bold: true, size: 16, color: { argb: argb(c.emerald) } };
        ws.getCell('A1').alignment = { horizontal: 'center' };

        ws.mergeCells('A2:E2');
        ws.getCell('A2').value = APP_CONFIG.mosqueName;
        ws.getCell('A2').font = { italic: true, size: 11, color: { argb: argb(c.inkFaint) } };
        ws.getCell('A2').alignment = { horizontal: 'center' };

        ws.mergeCells('A4:E4');
        const heroCell = ws.getCell('A4');
        heroCell.value = `TOTAL IURAN TERKUMPUL: Rp ${stats.totalTerkumpul.toLocaleString('id-ID')}`;
        heroCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        heroCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.emerald) } };
        heroCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(4).height = 28;

        ws.addRow([]);
        const statHeaderRow = ws.addRow(['Total Peserta', 'Total Grup Sapi', 'Rata-rata/Peserta']);
        statHeaderRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: argb(c.inkSoft) } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.emeraldTint) } };
        });
        const statValRow = ws.addRow([stats.totalPeserta, stats.totalGrup, stats.average]);
        statValRow.getCell(3).numFmt = '"Rp" #,##0';

        ws.addRow([]);
        const perGrupTitleRow = ws.addRow(['PER GRUP SAPI']);
        perGrupTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: argb(c.gold) } };

        const grupHeaderRow = ws.addRow(['Grup', 'Jumlah Peserta', 'Total Terkumpul', 'Kebutuhan', 'Kekurangan']);
        grupHeaderRow.eachCell(cell => { cell.font = headerFont; cell.fill = headerFill; });

        sortedGrup.forEach(g => {
            const row = ws.addRow([surveyKode(g.survey), g.peserta.length, g.totalTerkumpul, g.totalKebutuhan, g.totalKurang]);
            row.getCell(3).numFmt = '"Rp" #,##0';
            row.getCell(4).numFmt = '"Rp" #,##0';
            row.getCell(5).numFmt = '"Rp" #,##0';
        });

        if (laporanIuranCharts.grup && typeof laporanIuranCharts.grup.toBase64Image === 'function') {
            const imgId = wb.addImage({ base64: laporanIuranCharts.grup.toBase64Image(), extension: 'png' });
            const startRow = ws.lastRow.number + 2;
            ws.addImage(imgId, { tl: { col: 0, row: startRow }, ext: { width: 560, height: 260 } });
        }

        // ===== SHEET 2: Peserta =====
        const wsPeserta = wb.addWorksheet('Peserta');
        wsPeserta.columns = [
            { header: 'Grup', key: 'grup', width: 14 }, { header: 'Nama', key: 'nama', width: 24 },
            { header: 'Tipe', key: 'tipe', width: 16 }, { header: 'Terkumpul', key: 'terkumpul', width: 16 },
            { header: 'Iuran', key: 'iuran', width: 16 }, { header: 'Status', key: 'status', width: 14 }
        ];
        wsPeserta.getRow(1).eachCell(cell => { cell.font = headerFont; cell.fill = headerFill; });
        sortedGrup.forEach(g => {
            g.peserta.forEach(p => {
                wsPeserta.addRow({
                    grup: surveyKode(g.survey),
                    nama: p.tipe === 'instan' ? (p.atasNama || p.memberName) : p.memberName,
                    tipe: p.tipe === 'instan' ? 'Daftar Langsung' : 'Tabungan',
                    terkumpul: p.terkumpul, iuran: p.iuran, status: p.lunas ? 'Lunas' : 'Belum Lunas'
                });
            });
        });
        wsPeserta.getColumn('terkumpul').numFmt = '"Rp" #,##0';
        wsPeserta.getColumn('iuran').numFmt = '"Rp" #,##0';

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Laporan_Iuran_Qurban_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Export Excel Iuran gagal:', err);
        alert('Gagal membuat file Excel: ' + (err && err.message ? err.message : err));
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}

// Print - sama pola dgn preparePrintView()/printLaporan(), cuma target
// #laporanIuran (CSS sub-tab-content-nya sudah digeneralisir, lihat @media
// print di <style>).
function prepareLaporanIuranPrintView() {
    const tab = document.getElementById('laporanIuran');
    if (tab) tab.classList.add('print-target');

    const activeTab = document.querySelector('#laporanIuran .sub-tab-content:not([style*="display: none"]):not([style*="display:none"])');
    if (activeTab) activeTab.classList.add('print-active');

    const cleanup = () => {
        if (tab) tab.classList.remove('print-target');
        if (activeTab) activeTab.classList.remove('print-active');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 4000);
}

function printLaporanIuran() {
    prepareLaporanIuranPrintView();
    window.print();
}

// PDF sederhana (jsPDF murni, sama pola dgn exportLaporanPDF()) - hero + tabel
// ringkas per grup sapi + tabel semua peserta (nama/tipe/terkumpul/status).
async function exportLaporanIuranPDF(evt) {
    const btn = evt?.currentTarget || evt?.target;
    const originalHTML = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span>Menyiapkan...</span>'; }

    try {
        await ensureJsPDF();
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('Library PDF gagal dimuat. Cek koneksi internet lalu coba lagi.');
        }
        const { jsPDF } = window.jspdf;
        const c = REPORT_COLORS;
        const rgb = hex => {
            const h = hex.replace('#', '');
            return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
        };
        const rupiah = v => `Rp ${v.toLocaleString('id-ID')}`;

        const stats = getIuranStatistics();
        const sortedGrup = Object.values(stats.bySurvey).sort((a, b) => b.totalTerkumpul - a.totalTerkumpul);

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const marginX = 15;
        const usableW = pageW - marginX * 2;
        let y = 18;

        const checkPageBreak = (needed) => {
            if (y + needed > pageH - 15) {
                doc.addPage();
                y = 18;
            }
        };

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...rgb(c.gold));
        doc.text(APP_CONFIG.mosqueName.toUpperCase(), pageW / 2, y, { align: 'center' });
        y += 7;
        doc.setFontSize(17);
        doc.setTextColor(...rgb(c.emerald));
        doc.text('Laporan Iuran Qurban', pageW / 2, y, { align: 'center' });
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...rgb(c.inkFaint));
        doc.text(`Dicetak ${new Date().toLocaleString('id-ID')}`, pageW / 2, y, { align: 'center' });
        y += 10;

        // Hero card
        const heroH = 38;
        checkPageBreak(heroH + 5);
        doc.setFillColor(...rgb(c.emerald));
        doc.roundedRect(marginX, y, usableW, heroH, 3, 3, 'F');
        doc.setFillColor(...rgb(c.gold));
        doc.rect(marginX, y, usableW, 1.2, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...rgb(c.goldSoft));
        doc.text('TOTAL IURAN TERKUMPUL', marginX + 8, y + 10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(255, 255, 255);
        doc.text(rupiah(stats.totalTerkumpul), marginX + 8, y + 20);

        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.15);
        doc.line(marginX + 8, y + 25, marginX + usableW - 8, y + 25);

        const statColW = (usableW - 16) / 3;
        [['Total Peserta', String(stats.totalPeserta)], ['Grup Sapi', String(stats.totalGrup)], ['Rata-rata/Peserta', rupiah(stats.average)]]
            .forEach((s, i) => {
                const sx = marginX + 8 + i * statColW;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(225, 225, 225);
                doc.text(s[0], sx, y + 31);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(255, 255, 255);
                doc.text(s[1], sx, y + 36);
            });
        y += heroH + 10;

        const drawSectionTitle = (text) => {
            checkPageBreak(12);
            doc.setFillColor(...rgb(c.gold));
            doc.rect(marginX, y, 1.2, 5, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11.5);
            doc.setTextColor(...rgb(c.emerald));
            doc.text(text, marginX + 4, y + 4);
            y += 9;
        };

        // ===== TABEL RINGKASAN PER GRUP =====
        drawSectionTitle('Ringkasan per Grup Sapi');
        {
            const cx = { grup: marginX + 3, peserta: marginX + usableW * 0.30, terkumpul: marginX + usableW * 0.50, kebutuhan: marginX + usableW * 0.72, kurang: marginX + usableW * 0.90 };
            const rH = 8;
            checkPageBreak(rH * 2);
            doc.setFillColor(...rgb(c.emeraldTint));
            doc.rect(marginX, y, usableW, rH, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...rgb(c.inkSoft));
            doc.text('GRUP', cx.grup, y + 5.3);
            doc.text('PESERTA', cx.peserta, y + 5.3);
            doc.text('TERKUMPUL', cx.terkumpul, y + 5.3);
            doc.text('KEBUTUHAN', cx.kebutuhan, y + 5.3);
            doc.text('KURANG', cx.kurang, y + 5.3);
            y += rH;

            if (sortedGrup.length === 0) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...rgb(c.inkFaint));
                doc.text('Belum ada data survey', cx.grup, y + 5.5);
                y += rH;
            } else {
                sortedGrup.forEach(g => {
                    checkPageBreak(rH + 2);
                    doc.setDrawColor(...rgb(c.border)); doc.setLineWidth(0.1);
                    doc.line(marginX, y + rH, marginX + usableW, y + rH);

                    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...rgb(c.ink));
                    doc.text(surveyKode(g.survey), cx.grup, y + 5.3);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(...rgb(c.inkSoft));
                    doc.text(`${g.peserta.length}/${SURVEY_MAX_PESERTA}`, cx.peserta, y + 5.3);
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(...rgb(c.emerald));
                    doc.text(rupiah(g.totalTerkumpul), cx.terkumpul, y + 5.3);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(...rgb(c.inkSoft));
                    doc.text(rupiah(g.totalKebutuhan), cx.kebutuhan, y + 5.3);
                    doc.setTextColor(...rgb(g.totalKurang > 0 ? c.brick : c.emerald2));
                    doc.text(g.totalKurang > 0 ? rupiah(g.totalKurang) : 'Lunas', cx.kurang, y + 5.3);

                    y += rH;
                });
            }
            y += 8;
        }

        // ===== TABEL DETAIL PESERTA =====
        drawSectionTitle('Detail Peserta');
        {
            const cx = { grup: marginX + 3, nama: marginX + usableW * 0.16, tipe: marginX + usableW * 0.52, terkumpul: marginX + usableW * 0.70, status: marginX + usableW * 0.90 };
            const rH = 8;
            const allRows = sortedGrup.flatMap(g => g.peserta.map(p => Object.assign({}, p, { survey: g.survey })));

            checkPageBreak(rH * 2);
            doc.setFillColor(...rgb(c.emeraldTint));
            doc.rect(marginX, y, usableW, rH, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...rgb(c.inkSoft));
            doc.text('GRUP', cx.grup, y + 5.3);
            doc.text('NAMA', cx.nama, y + 5.3);
            doc.text('TIPE', cx.tipe, y + 5.3);
            doc.text('TERKUMPUL', cx.terkumpul, y + 5.3);
            doc.text('STATUS', cx.status, y + 5.3);
            y += rH;

            if (allRows.length === 0) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...rgb(c.inkFaint));
                doc.text('Belum ada peserta', cx.grup, y + 5.5);
                y += rH;
            } else {
                allRows.forEach(p => {
                    checkPageBreak(rH + 2);
                    doc.setDrawColor(...rgb(c.border)); doc.setLineWidth(0.1);
                    doc.line(marginX, y + rH, marginX + usableW, y + rH);

                    const nama = p.tipe === 'instan' ? (p.atasNama || p.memberName) : p.memberName;
                    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...rgb(c.ink));
                    doc.text(surveyKode(p.survey), cx.grup, y + 5.3);
                    doc.setFont('helvetica', 'normal');
                    doc.text(String(nama || '-').substring(0, 26), cx.nama, y + 5.3);
                    doc.setTextColor(...rgb(c.inkSoft));
                    doc.text(p.tipe === 'instan' ? 'Daftar Langsung' : 'Tabungan', cx.tipe, y + 5.3);
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(...rgb(c.emerald));
                    doc.text(rupiah(p.terkumpul), cx.terkumpul, y + 5.3);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(...rgb(p.lunas ? c.emerald2 : c.brick));
                    doc.text(p.lunas ? 'Lunas' : 'Belum Lunas', cx.status, y + 5.3);

                    y += rH;
                });
            }
        }

        downloadPdfDoc(doc, `Laporan_Iuran_Qurban_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (err) {
        console.error('Export PDF Iuran gagal:', err);
        alert('Gagal membuat PDF: ' + (err && err.message ? err.message : err));
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}

// Sama pola dengan preparePrintView(), versi tab LPJ - LPJ tidak punya
// sub-tab (satu halaman panjang berisi semua ringkasan), jadi cukup tandai
// #lpj sendiri sbg '.print-target', tidak perlu logic sub-tab-content.
function prepareLpjPrintView() {
    const lpjTab = document.getElementById('lpj');
    if (lpjTab) lpjTab.classList.add('print-target');

    const cleanup = () => {
        if (lpjTab) lpjTab.classList.remove('print-target');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 4000);
}

function printLPJ() {
    prepareLpjPrintView();
    window.print();
}

// ===== LPJ (LAPORAN PERTANGGUNGJAWABAN) =====
// Beda dari loadLaporan() (tabungan saja), loadLPJ() menggabungkan angka dari
// SEMUA modul yang sudah dimuat ke appData - sengaja pakai ulang logika hitung
// yang SAMA dengan tab aslinya masing-masing (mis. hitungRealisasiPos() dari
// tab Keuangan) supaya angka LPJ tidak pernah selisih dengan tab sumbernya.
function loadLPJ() {
    const rupiah = v => `Rp ${v.toLocaleString('id-ID')}`;
    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    // ----- Tabungan Qurban -----
    const membersNonAdmin = appData.members.filter(m => m.role !== 'admin' && m.id);
    const totalMembers = membersNonAdmin.length;
    const approvedSavings = appData.savings.filter(s => s.status === 'APPROVED');
    const totalTabungan = approvedSavings.reduce((sum, s) => sum + s.amount, 0);
    const kelompokSapiTabungan = new Set(membersNonAdmin.filter(m => m.sapi > 0).map(m => m.sapi)).size;

    // ----- Survey Sapi & Peserta -----
    const totalSapiSurvei = appData.surveySapi.length;
    const pesertaAktif = appData.surveyPeserta.filter(p => p.status === 'aktif');
    const totalPesertaUnik = new Set(pesertaAktif.map(p => p.memberId)).size;
    const totalBeratSapi = appData.surveySapi.reduce((sum, s) => sum + (s.berat || 0), 0);

    // ----- Distribusi Daging (Rencana Umum vs Aktual hari-H) -----
    const rencanaAktif = appData.rencanaDistribusi.filter(d => d.status !== 'batal');
    const totalRencanaQty = rencanaAktif.reduce((sum, d) => sum + d.qty, 0);
    const aktualAktif = appData.workOrderAktual.filter(d => d.status !== 'batal');
    const totalAktualQty = aktualAktif.reduce((sum, d) => sum + d.qty, 0);
    const persenDistribusi = totalRencanaQty > 0 ? Math.round((totalAktualQty / totalRencanaQty) * 100) : 0;
    // Dikelompokkan per "alokasi" (nama peruntukan, mis. "Warga RT 01") buat
    // grafik batang Rencana vs Aktual - lihat renderLpjDistribusiChart().
    const rencanaByAlokasi = {};
    rencanaAktif.forEach(d => { rencanaByAlokasi[d.alokasi || '(Tanpa nama)'] = (rencanaByAlokasi[d.alokasi || '(Tanpa nama)'] || 0) + d.qty; });
    const aktualByAlokasi = {};
    aktualAktif.forEach(d => { aktualByAlokasi[d.alokasi || '(Tanpa nama)'] = (aktualByAlokasi[d.alokasi || '(Tanpa nama)'] || 0) + d.qty; });

    // ----- Keuangan (persis sama caranya dgn renderKeuanganRingkasan()) -----
    const posAktif = appData.posBudget.filter(p => p.status !== 'batal');
    let totalAnggaranKeluar = 0, totalRealisasiMasuk = 0, totalRealisasiKeluar = 0;
    const realisasiPerPosKeluar = []; // [{ nama, realisasi }] - buat donut "Peruntukan Dana"
    posAktif.forEach(pos => {
        const realisasi = hitungRealisasiPos(pos.id);
        if (pos.jenisPos === 'pemasukan') {
            totalRealisasiMasuk += realisasi;
        } else {
            totalRealisasiKeluar += realisasi;
            totalAnggaranKeluar += pos.jumlahAnggaran;
            if (realisasi > 0) realisasiPerPosKeluar.push({ nama: pos.nama || '(Tanpa nama)', realisasi });
        }
    });
    const saldoKas = totalRealisasiMasuk - totalRealisasiKeluar;
    const persenAnggaran = totalAnggaranKeluar > 0 ? Math.round((totalRealisasiKeluar / totalAnggaranKeluar) * 100) : 0;

    // ----- Penerima & Penyaluran -----
    const penerimaAktif = appData.penerimaQR.filter(d => d.status !== 'batal');
    const totalPenerima = penerimaAktif.length;
    const sudahDiambil = penerimaAktif.filter(d => d.diambil).length;
    const persenPenerima = totalPenerima > 0 ? Math.round((sudahDiambil / totalPenerima) * 100) : 0;

    // ----- Hero -----
    const heroTotalEl = document.getElementById('lpjHeroTotal');
    if (heroTotalEl) animateCountUp(heroTotalEl, 0, totalTabungan, rupiah);
    const heroAnggotaEl = document.getElementById('lpjStatAnggota');
    if (heroAnggotaEl) animateCountUp(heroAnggotaEl, 0, totalMembers, v => `${v}`);
    const heroPesertaEl = document.getElementById('lpjStatPeserta');
    if (heroPesertaEl) animateCountUp(heroPesertaEl, 0, totalPesertaUnik, v => `${v}`);
    const heroPenerimaEl = document.getElementById('lpjStatPenerima');
    if (heroPenerimaEl) animateCountUp(heroPenerimaEl, 0, totalPenerima, v => `${v}`);

    // ----- Tabungan -----
    setText('lpjTabunganAnggota', totalMembers.toLocaleString('id-ID'));
    setText('lpjTabunganTotal', rupiah(totalTabungan));
    setText('lpjTabunganKelompok', kelompokSapiTabungan.toLocaleString('id-ID'));

    // ----- Survey & Peserta -----
    setText('lpjSurveySapi', totalSapiSurvei.toLocaleString('id-ID'));
    setText('lpjSurveyPeserta', totalPesertaUnik.toLocaleString('id-ID'));
    setText('lpjSurveyBerat', `${totalBeratSapi.toLocaleString('id-ID')} kg`);

    // ----- Distribusi -----
    setText('lpjDistribusiRencana', totalRencanaQty.toLocaleString('id-ID'));
    setText('lpjDistribusiAktual', totalAktualQty.toLocaleString('id-ID'));
    setText('lpjDistribusiPersen', `${persenDistribusi}%`);
    animateLpjProgressBar('lpjDistribusiPersenBar', persenDistribusi);

    // ----- Keuangan -----
    setText('lpjKeuanganAnggaran', rupiah(totalAnggaranKeluar));
    setText('lpjKeuanganMasuk', rupiah(totalRealisasiMasuk));
    setText('lpjKeuanganKeluar', rupiah(totalRealisasiKeluar));
    setText('lpjKeuanganSaldo', rupiah(saldoKas));
    setText('lpjKeuanganRealisasiPersen', `${persenAnggaran}%`);
    animateLpjProgressBar('lpjKeuanganRealisasiPersenBar', persenAnggaran);

    // ----- Penerima & Penyaluran -----
    setText('lpjPenerimaTotal', totalPenerima.toLocaleString('id-ID'));
    setText('lpjPenerimaSudah', sudahDiambil.toLocaleString('id-ID'));
    setText('lpjPenerimaPersen', `${persenPenerima}%`);
    animateLpjProgressBar('lpjPenerimaPersenBar', persenPenerima);

    // ----- Infografis tambahan -----
    renderLpjTimeline({
        totalTabungan, totalMembers,
        totalSapiSurvei, totalPesertaUnik,
        totalRencanaQty, totalAktualQty,
        totalPenerima, sudahDiambil
    });
    renderLpjTopSapiList();
    renderLpjDistribusiChart(rencanaByAlokasi, aktualByAlokasi);
    renderLpjDanaChart(realisasiPerPosKeluar);

    renderLpjNarasi();
}

// Animasi lebar progress bar dari 0 - pola double requestAnimationFrame yang
// sama dipakai di seluruh app ini supaya transition CSS tidak ke-skip (kalau
// width diset langsung tanpa 2x rAF, browser kadang render final state saja
// tanpa animasi kelihatan).
function animateLpjProgressBar(elId, percent) {
    const el = document.getElementById(elId);
    if (!el) return;
    const clamped = Math.max(0, Math.min(100, percent));
    el.style.width = '0%';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.style.width = clamped + '%';
        });
    });
}

// Narasi/kata pengantar LPJ - read-only utk anggota/guest, editable utk admin
// (tersimpan ke sheet "LPJNarasi" lewat appendSheetDB/updateSheetDB generik -
// tidak butuh endpoint backend khusus).
function renderLpjNarasi() {
    const viewEl = document.getElementById('lpjNarasiView');
    const editEl = document.getElementById('lpjNarasiEdit');
    const metaEl = document.getElementById('lpjNarasiMeta');
    const adminActions = document.getElementById('lpjNarasiAdminActions');
    const editBtn = document.getElementById('lpjNarasiEditBtn');
    const saveBtn = document.getElementById('lpjNarasiSaveBtn');
    const cancelBtn = document.getElementById('lpjNarasiCancelBtn');
    if (!viewEl || !editEl) return;

    const isAdmin = !!(currentUser && currentUser.role === 'admin');
    const narasi = (appData.lpjNarasi && appData.lpjNarasi.narasi) || '';

    viewEl.textContent = narasi || (isAdmin
        ? 'Belum ada kata pengantar. Klik "Edit Narasi" untuk menambahkan.'
        : 'Belum ada kata pengantar dari pengurus.');
    editEl.value = narasi;

    const updatedBy = appData.lpjNarasi && appData.lpjNarasi.updatedBy;
    const updatedDate = appData.lpjNarasi && appData.lpjNarasi.updatedDate;
    if (metaEl) {
        const parsedDate = updatedDate ? new Date(updatedDate) : null;
        const dateText = (parsedDate && !isNaN(parsedDate)) ? parsedDate.toLocaleString('id-ID') : '';
        metaEl.textContent = (updatedBy || dateText)
            ? `Terakhir diperbarui${updatedBy ? ' oleh ' + updatedBy : ''}${dateText ? ' - ' + dateText : ''}`
            : '';
    }

    // Selalu balik ke mode tampil (bukan edit) tiap kali data di-refresh -
    // dan tombol edit cuma kelihatan utk admin, anggota/guest read-only.
    viewEl.style.display = 'block';
    editEl.style.display = 'none';
    if (adminActions) adminActions.style.display = isAdmin ? 'flex' : 'none';
    if (editBtn) editBtn.style.display = 'inline-flex';
    if (saveBtn) saveBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
}

function toggleLpjNarasiEdit(isEditing) {
    const viewEl = document.getElementById('lpjNarasiView');
    const editEl = document.getElementById('lpjNarasiEdit');
    const editBtn = document.getElementById('lpjNarasiEditBtn');
    const saveBtn = document.getElementById('lpjNarasiSaveBtn');
    const cancelBtn = document.getElementById('lpjNarasiCancelBtn');
    if (!viewEl || !editEl) return;

    if (isEditing) {
        editEl.value = (appData.lpjNarasi && appData.lpjNarasi.narasi) || '';
        viewEl.style.display = 'none';
        editEl.style.display = 'block';
        if (editBtn) editBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'inline-flex';
        if (cancelBtn) cancelBtn.style.display = 'inline-flex';
        editEl.focus();
    } else {
        renderLpjNarasi();
    }
}

async function saveLpjNarasi() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const editEl = document.getElementById('lpjNarasiEdit');
    const saveBtn = document.getElementById('lpjNarasiSaveBtn');
    if (!editEl) return;
    const narasiBaru = editEl.value.trim();

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan...'; }

    const nowIso = new Date().toISOString();
    const namaAdmin = currentUser.name || String(currentUser.id);
    // Baris "lpj" sudah pernah dibuat sebelumnya (ada narasi/updatedBy/
    // updatedDate tersimpan) -> pakai update. Kalau belum pernah sama sekali
    // (baris "lpj" belum ada di sheet) -> append baris baru.
    const hadRow = !!(appData.lpjNarasi && (appData.lpjNarasi.narasi || appData.lpjNarasi.updatedBy || appData.lpjNarasi.updatedDate));

    let ok;
    if (hadRow) {
        ok = await updateSheetDB('LPJNarasi', 'id', 'lpj', {
            narasi: narasiBaru,
            updatedBy: namaAdmin,
            updatedDate: nowIso
        });
    } else {
        ok = await appendSheetDB('LPJNarasi', {
            id: 'lpj',
            narasi: narasiBaru,
            updatedBy: namaAdmin,
            updatedDate: nowIso
        });
    }

    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Simpan'; }

    if (ok) {
        appData.lpjNarasi = { narasi: narasiBaru, updatedBy: namaAdmin, updatedDate: nowIso };
        renderLpjNarasi();
        showAlert('Narasi LPJ berhasil disimpan.', 'success');
    } else {
        showAlert('Gagal menyimpan narasi. Coba lagi.', 'error');
    }
}

// Timeline "Alur Pelaksanaan Qurban" - 4 tahap, status per tahap dihitung
// dari angka yang SAMA dengan kartu ringkasan di bawahnya (dioper sbg
// parameter dari loadLPJ(), bukan dihitung ulang) supaya tidak pernah selisih.
// Status: 'done' (emerald, centang) kalau tahap itu sudah ada progres nyata,
// 'progress' (gold) kalau baru sebagian, abu-abu kalau belum mulai sama sekali.
function renderLpjTimeline(stats) {
    const el = document.getElementById('lpjTimeline');
    if (!el) return;

    const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

    const steps = [
        {
            title: '1. Tabungan Terkumpul',
            desc: stats.totalTabungan > 0
                ? `Rp ${stats.totalTabungan.toLocaleString('id-ID')} dari ${stats.totalMembers} anggota`
                : 'Belum ada setoran disetujui',
            status: stats.totalTabungan > 0 ? 'done' : 'pending'
        },
        {
            title: '2. Survey & Pendataan Sapi',
            desc: stats.totalSapiSurvei > 0
                ? `${stats.totalSapiSurvei} sapi disurvei, ${stats.totalPesertaUnik} peserta terdaftar`
                : 'Belum ada sapi disurvei',
            status: stats.totalSapiSurvei > 0 ? 'done' : 'pending'
        },
        {
            title: '3. Penyembelihan & Distribusi',
            desc: stats.totalAktualQty > 0
                ? `${stats.totalAktualQty.toLocaleString('id-ID')} dari ${stats.totalRencanaQty.toLocaleString('id-ID')} rencana sudah direalisasikan`
                : (stats.totalRencanaQty > 0 ? 'Rencana sudah disusun, pelaksanaan belum dimulai' : 'Belum ada rencana distribusi'),
            status: stats.totalAktualQty > 0
                ? (stats.totalAktualQty >= stats.totalRencanaQty && stats.totalRencanaQty > 0 ? 'done' : 'progress')
                : (stats.totalRencanaQty > 0 ? 'progress' : 'pending')
        },
        {
            title: '4. Penyaluran ke Penerima',
            desc: stats.totalPenerima > 0
                ? `${stats.sudahDiambil} dari ${stats.totalPenerima} penerima sudah menerima`
                : 'Belum ada penerima terdaftar',
            status: stats.totalPenerima > 0
                ? (stats.sudahDiambil >= stats.totalPenerima ? 'done' : 'progress')
                : 'pending'
        }
    ];

    el.innerHTML = steps.map(step => `
        <div class="lpj-timeline-step ${step.status === 'pending' ? '' : step.status}">
            <div class="lpj-timeline-icon">${step.status === 'done' ? checkIcon : (step.status === 'progress' ? '…' : '○')}</div>
            <div class="lpj-timeline-title">${step.title}</div>
            <div class="lpj-timeline-desc">${step.desc}</div>
        </div>
    `).join('');
}

// Top 5 kelompok sapi (tabungan terkumpul) - bar list sederhana, pakai ulang
// getSapiStatistics() yang sama dgn tab Laporan Tabungan supaya angkanya
// konsisten dgn tab aslinya.
function renderLpjTopSapiList() {
    const el = document.getElementById('lpjTopSapiList');
    if (!el) return;

    const sapiStats = getSapiStatistics();
    const sorted = Object.entries(sapiStats).sort((a, b) => b[1].total - a[1].total).slice(0, 5);

    if (sorted.length === 0) {
        el.innerHTML = '<div style="color:var(--ink-faint);font-size:12.5px;">Belum ada data tabungan per kelompok sapi.</div>';
        return;
    }

    const maxTotal = sorted[0][1].total || 1;
    el.innerHTML = sorted.map(([sapiNum, stat]) => {
        const pct = Math.round((stat.total / maxTotal) * 100);
        return `
            <div class="lpj-sapi-bar-row">
                <div class="lpj-sapi-bar-label">Sapi #${sapiNum}</div>
                <div class="lpj-sapi-bar-track"><div class="lpj-sapi-bar-fill" style="width:0%;" data-target="${pct}"></div></div>
                <div class="lpj-sapi-bar-value">Rp ${stat.total.toLocaleString('id-ID')}</div>
            </div>
        `;
    }).join('');

    // Animasi lebar bar - sama pola double rAF dgn animateLpjProgressBar().
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.querySelectorAll('.lpj-sapi-bar-fill').forEach(bar => {
                bar.style.width = (bar.dataset.target || 0) + '%';
            });
        });
    });
}

// Wadah instance Chart.js khusus tab LPJ - dipisah dari laporanCharts/
// keuanganChart (punya tab lain) supaya destroy()-nya tidak saling tabrakan.
const lpjCharts = {};

// Grafik batang Rencana vs Aktual per alokasi (Top 8 alokasi terbesar
// menurut Rencana). ensureChartJs() di bawah cuma download CDN kalau Chart.js
// BELUM dimuat (mis. tab LPJ dibuka duluan tanpa lewat Laporan Tabungan
// dulu - LPJ kelihatan buat guest juga) - kalau sudah ada, langsung lanjut.
async function renderLpjDistribusiChart(rencanaByAlokasi, aktualByAlokasi) {
    const canvas = document.getElementById('lpjDistribusiChart');
    const emptyBox = document.getElementById('lpjDistribusiChartEmpty');
    if (!canvas) return;

    const allAlokasi = new Set([...Object.keys(rencanaByAlokasi), ...Object.keys(aktualByAlokasi)]);
    const sorted = Array.from(allAlokasi)
        .map(nama => ({ nama, rencana: rencanaByAlokasi[nama] || 0, aktual: aktualByAlokasi[nama] || 0 }))
        .sort((a, b) => b.rencana - a.rencana)
        .slice(0, 8);

    if (sorted.length === 0) {
        canvas.style.display = 'none';
        if (emptyBox) emptyBox.style.display = 'block';
        if (lpjCharts.distribusi) { lpjCharts.distribusi.destroy(); lpjCharts.distribusi = null; }
        return;
    }
    canvas.style.display = 'block';
    if (emptyBox) emptyBox.style.display = 'none';

    const ctx = canvas.getContext('2d');
    if (lpjCharts.distribusi) lpjCharts.distribusi.destroy();

    await ensureChartJsReady();
    lpjCharts.distribusi = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(s => s.nama),
            datasets: [
                {
                    label: 'Rencana',
                    data: sorted.map(s => s.rencana),
                    backgroundColor: REPORT_COLORS.goldSoft,
                    borderRadius: 6,
                    maxBarThickness: 28
                },
                {
                    label: 'Aktual',
                    data: sorted.map(s => s.aktual),
                    backgroundColor: REPORT_COLORS.emerald,
                    borderRadius: 6,
                    maxBarThickness: 28
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14 } },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('id-ID')}` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
                y: { beginAtZero: true, grid: { color: REPORT_COLORS.border, drawBorder: false } }
            }
        }
    });
}

// Donut "Peruntukan Dana" - realisasi pengeluaran per Pos Budget (Top 6 +
// gabungan "Lainnya") supaya publik lihat uang dipakai buat apa saja, bukan
// cuma 1 angka total pengeluaran yang abstrak.
async function renderLpjDanaChart(realisasiPerPosKeluar) {
    const canvas = document.getElementById('lpjDanaChart');
    const emptyBox = document.getElementById('lpjDanaChartEmpty');
    if (!canvas) return;

    const sorted = [...realisasiPerPosKeluar].sort((a, b) => b.realisasi - a.realisasi);

    if (sorted.length === 0) {
        canvas.style.display = 'none';
        if (emptyBox) emptyBox.style.display = 'block';
        if (lpjCharts.dana) { lpjCharts.dana.destroy(); lpjCharts.dana = null; }
        return;
    }
    canvas.style.display = 'block';
    if (emptyBox) emptyBox.style.display = 'none';

    const top6 = sorted.slice(0, 6);
    const sisa = sorted.slice(6).reduce((sum, p) => sum + p.realisasi, 0);
    const labels = top6.map(p => p.nama);
    const data = top6.map(p => p.realisasi);
    if (sisa > 0) { labels.push('Lainnya'); data.push(sisa); }

    const ctx = canvas.getContext('2d');
    if (lpjCharts.dana) lpjCharts.dana.destroy();

    await ensureChartJsReady();
    lpjCharts.dana = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: REPORT_PALETTE,
                hoverOffset: 14,
                borderColor: '#fff',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            cutout: '68%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: Rp ${ctx.parsed.toLocaleString('id-ID')}` } }
            }
        }
    });
}

// PDF LPJ - sama pola dgn exportLaporanPDF() (jsPDF murni, digambar manual,
// TIDAK screenshot DOM) supaya reliable di semua perangkat termasuk HP.
async function exportLPJPDF(evt) {
    const btn = evt?.currentTarget || evt?.target;
    const originalHTML = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span>Menyiapkan...</span>'; }

    try {
        await ensureJsPDF();
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('Library PDF gagal dimuat. Cek koneksi internet lalu coba lagi.');
        }
        const { jsPDF } = window.jspdf;
        const c = REPORT_COLORS;
        const rgb = hex => {
            const h = hex.replace('#', '');
            return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
        };
        const rupiah = v => `Rp ${v.toLocaleString('id-ID')}`;
        const getText = id => (document.getElementById(id)?.textContent || '').trim();

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const marginX = 15;
        const usableW = pageW - marginX * 2;
        let y = 18;

        const checkPageBreak = (needed) => {
            if (y + needed > pageH - 15) {
                doc.addPage();
                y = 18;
            }
        };

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...rgb(c.gold));
        doc.text(APP_CONFIG.mosqueName.toUpperCase(), pageW / 2, y, { align: 'center' });
        y += 7;
        doc.setFontSize(16);
        doc.setTextColor(...rgb(c.emerald));
        doc.text('Laporan Pertanggungjawaban (LPJ) Qurban', pageW / 2, y, { align: 'center', maxWidth: usableW });
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...rgb(c.inkFaint));
        doc.text(`Dicetak ${new Date().toLocaleString('id-ID')}`, pageW / 2, y, { align: 'center' });
        y += 10;

        // Hero (Total Tabungan + 3 stat, dibaca langsung dari DOM yang sudah
        // di-render loadLPJ() - supaya PDF selalu sama persis dgn tampilan).
        const heroH = 34;
        checkPageBreak(heroH + 5);
        doc.setFillColor(...rgb(c.emerald));
        doc.roundedRect(marginX, y, usableW, heroH, 3, 3, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...rgb(c.goldSoft));
        doc.text('TOTAL TABUNGAN QURBAN TERKUMPUL', marginX + 8, y + 9);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(19);
        doc.setTextColor(255, 255, 255);
        doc.text(getText('lpjHeroTotal') || rupiah(0), marginX + 8, y + 20);

        const heroStats = [
            ['Total Anggota', getText('lpjStatAnggota')],
            ['Peserta Qurban', getText('lpjStatPeserta')],
            ['Penerima Manfaat', getText('lpjStatPenerima')]
        ];
        const heroStatW = usableW / 3;
        heroStats.forEach((s, i) => {
            const sx = marginX + 8 + i * heroStatW;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...rgb(c.goldSoft));
            doc.text(s[0], sx, y + 28);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(255, 255, 255);
            doc.text(s[1] || '0', sx, y + 32.5);
        });
        y += heroH + 10;

        // Narasi
        const narasi = (appData.lpjNarasi && appData.lpjNarasi.narasi) || '';
        if (narasi) {
            checkPageBreak(16);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11.5);
            doc.setTextColor(...rgb(c.emerald));
            doc.text('Kata Pengantar', marginX, y);
            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(...rgb(c.ink));
            const narasiLines = doc.splitTextToSize(narasi, usableW);
            narasiLines.forEach(line => {
                checkPageBreak(6);
                doc.text(line, marginX, y);
                y += 5;
            });
            y += 6;
        }

        // Bagian ringkasan per modul, dibaca langsung dari DOM (konsisten dgn
        // apa yang dilihat user, tidak perlu hitung ulang di sini).
        const sections = [
            { title: 'Tabungan Qurban', rows: [
                ['Total Anggota Aktif', getText('lpjTabunganAnggota')],
                ['Total Setoran Disetujui', getText('lpjTabunganTotal')],
                ['Jumlah Kelompok Sapi', getText('lpjTabunganKelompok')]
            ]},
            { title: 'Survey Sapi & Peserta', rows: [
                ['Sapi Disurvei', getText('lpjSurveySapi')],
                ['Peserta Ikut Qurban', getText('lpjSurveyPeserta')],
                ['Total Berat Sapi', getText('lpjSurveyBerat')]
            ]},
            { title: 'Distribusi Daging', rows: [
                ['Rencana Distribusi (Qty)', getText('lpjDistribusiRencana')],
                ['Realisasi Aktual (Qty)', getText('lpjDistribusiAktual')],
                ['Persentase Realisasi', getText('lpjDistribusiPersen')]
            ]},
            { title: 'Keuangan Pelaksanaan', rows: [
                ['Total Anggaran', getText('lpjKeuanganAnggaran')],
                ['Realisasi Pemasukan', getText('lpjKeuanganMasuk')],
                ['Realisasi Pengeluaran', getText('lpjKeuanganKeluar')],
                ['Realisasi vs Anggaran', getText('lpjKeuanganRealisasiPersen')],
                ['Saldo Kas Akhir', getText('lpjKeuanganSaldo')]
            ]},
            { title: 'Penerima & Penyaluran', rows: [
                ['Total Penerima Terdaftar', getText('lpjPenerimaTotal')],
                ['Sudah Diambil', getText('lpjPenerimaSudah')],
                ['Persentase Tersalurkan', getText('lpjPenerimaPersen')]
            ]}
        ];

        sections.forEach(section => {
            checkPageBreak(12 + section.rows.length * 8);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11.5);
            doc.setTextColor(...rgb(c.emerald));
            doc.text(section.title, marginX, y);
            y += 3;
            doc.setDrawColor(...rgb(c.border));
            doc.setLineWidth(0.3);
            doc.line(marginX, y, marginX + usableW, y);
            y += 6;

            section.rows.forEach((row, i) => {
                checkPageBreak(8);
                if (i % 2 === 0) {
                    doc.setFillColor(...rgb(c.paper));
                    doc.rect(marginX, y - 4.5, usableW, 7.5, 'F');
                }
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...rgb(c.inkSoft));
                doc.text(row[0], marginX + 3, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...rgb(c.ink));
                doc.text(String(row[1] || '-'), marginX + usableW - 3, y, { align: 'right' });
                y += 7.5;
            });
            y += 6;
        });

        downloadPdfDoc(doc, `LPJ_Qurban_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
        console.error('exportLPJPDF error:', err);
        showAlert('Gagal membuat PDF: ' + (err.message || err), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}

// Trigger download dokumen jsPDF. Di banyak browser HP, atribut
// <a download> "diam" (file masuk folder Downloads tanpa notifikasi apapun
// yang terlihat, jadi kelihatan seperti tidak terjadi apa-apa) atau malah
// diblokir sama sekali di beberapa WebView/PWA. Jadi khusus di HP, PDF
// dibuka di tab baru dulu (browser HP otomatis punya PDF viewer bawaan) -
// dari situ user bisa lihat hasilnya langsung dan simpan/share sendiri.
function downloadPdfDoc(doc, filename) {
    // Sempat dicoba buka blob URL di tab baru khusus HP, tapi ternyata malah
    // jadi halaman putih kosong di sebagian besar browser Android (mereka
    // tidak semua punya PDF viewer bawaan yang bisa baca blob: URL). Jadi
    // balik ke cara paling standar jsPDF (Blob + <a download>) yang memang
    // sudah teruji luas dan bekerja di hampir semua browser termasuk HP -
    // hanya saja di HP prosesnya "diam" (file langsung masuk folder Downloads
    // tanpa notifikasi jelas), makanya ditambah pesan konfirmasi di layar.
    doc.save(filename);
    showQuickToast('PDF berhasil disimpan. Cek folder Downloads atau notifikasi di HP Anda.');
}

// Notifikasi kecil di pojok bawah layar, dipakai supaya user tahu proses
// selesai walau browser tidak menampilkan indikator download yang jelas
// (umum terjadi di banyak browser HP).
function showQuickToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:${REPORT_COLORS.ink};color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:999999;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:88vw;text-align:center;`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity .4s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// PDF Laporan digambar manual pakai jsPDF (vector/teks langsung ke PDF, TIDAK
// screenshot DOM sama sekali). Ini dipilih setelah html2canvas/html2pdt.js
// terbukti tidak reliable (hasil kosong di desktop), dan window.print() juga
// tidak bisa diandalkan di HP (banyak browser mobile tidak mendukung dialog
// print / "Save as PDF"). jsPDF murni bekerja identik di semua perangkat
// karena tidak butuh screenshot ataupun dialog print sama sekali.
async function exportLaporanPDF(evt) {
    const btn = evt?.currentTarget || evt?.target;
    const originalHTML = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span>Menyiapkan...</span>'; }

    try {
        await ensureJsPDF();
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('Library PDF gagal dimuat. Cek koneksi internet lalu coba lagi.');
        }
        const { jsPDF } = window.jspdf;
        const c = REPORT_COLORS;
        const rgb = hex => {
            const h = hex.replace('#', '');
            return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
        };
        const rupiah = v => `Rp ${v.toLocaleString('id-ID')}`;

        const approved = appData.savings.filter(s => s.status === 'APPROVED');
        const totalApproved = approved.reduce((sum, s) => sum + s.amount, 0);
        const totalTransactions = appData.savings.length;
        const totalMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length;
        const average = totalMembers > 0 ? Math.round(totalApproved / totalMembers) : 0;

        const sapiStats = getSapiStatistics();
        const sortedSapi = Object.entries(sapiStats).sort((a, b) => b[1].total - a[1].total).slice(0, 10);

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const marginX = 15;
        const usableW = pageW - marginX * 2;
        let y = 18;

        const checkPageBreak = (needed) => {
            if (y + needed > pageH - 15) {
                doc.addPage();
                y = 18;
            }
        };

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...rgb(c.gold));
        doc.text(APP_CONFIG.mosqueName.toUpperCase(), pageW / 2, y, { align: 'center' });
        y += 7;
        doc.setFontSize(17);
        doc.setTextColor(...rgb(c.emerald));
        doc.text('Laporan Tabungan Qurban', pageW / 2, y, { align: 'center' });
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...rgb(c.inkFaint));
        doc.text(`Dicetak ${new Date().toLocaleString('id-ID')}`, pageW / 2, y, { align: 'center' });
        y += 10;

        // Hero card (total + 3 statistik)
        const heroH = 38;
        checkPageBreak(heroH + 5);
        doc.setFillColor(...rgb(c.emerald));
        doc.roundedRect(marginX, y, usableW, heroH, 3, 3, 'F');
        doc.setFillColor(...rgb(c.gold));
        doc.rect(marginX, y, usableW, 1.2, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...rgb(c.goldSoft));
        doc.text('TOTAL TABUNGAN QURBAN', marginX + 8, y + 10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(255, 255, 255);
        doc.text(rupiah(totalApproved), marginX + 8, y + 20);

        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.15);
        doc.line(marginX + 8, y + 25, marginX + usableW - 8, y + 25);

        const statColW = (usableW - 16) / 3;
        [['Total Anggota', String(totalMembers)], ['Total Transaksi', String(totalTransactions)], ['Rata-rata/Anggota', rupiah(average)]]
            .forEach((s, i) => {
                const sx = marginX + 8 + i * statColW;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(225, 225, 225);
                doc.text(s[0], sx, y + 31);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(255, 255, 255);
                doc.text(s[1], sx, y + 36);
            });
        y += heroH + 10;

        // ----- Helper: judul section dengan aksen garis emas -----
        const drawSectionTitle = (text) => {
            checkPageBreak(12);
            doc.setFillColor(...rgb(c.gold));
            doc.rect(marginX, y, 1.2, 5, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11.5);
            doc.setTextColor(...rgb(c.emerald));
            doc.text(text, marginX + 4, y + 4);
            y += 9;
        };

        // ----- Helper: embed gambar chart Chart.js asli (bukan gambar ulang) -----
        const drawChartImage = (chart, label) => {
            if (!chart || !chart.canvas || typeof chart.toBase64Image !== 'function') return;
            const imgData = chart.toBase64Image();
            const ratio = chart.canvas.height / chart.canvas.width;
            const imgW = usableW - 8;
            const imgH = imgW * ratio;
            checkPageBreak(imgH + 20);
            drawSectionTitle(label);
            doc.setDrawColor(...rgb(c.border));
            doc.setLineWidth(0.2);
            doc.roundedRect(marginX, y, usableW, imgH + 8, 2, 2, 'S');
            doc.addImage(imgData, 'PNG', marginX + 4, y + 4, imgW, imgH);
            y += imgH + 8 + 10;
        };

        // Konten mengikuti sub-tab Laporan yang SEDANG AKTIF di layar user,
        // supaya PDF yang di-download sesuai dengan yang sedang dilihat
        // (sebelumnya selalu Ringkasan apapun tab yang dipilih).
        const activeTabEl = document.querySelector('#laporan .sub-tab-content:not([style*="display: none"]):not([style*="display:none"])');
        const activeTabId = activeTabEl ? activeTabEl.id : 'overviewTab';

        if (activeTabId === 'sapiTab') {
            // ===== TAB: PER SAPI =====
            const selectedSapi = document.getElementById('sapiFilter')?.value || '';
            drawSectionTitle(selectedSapi ? `Detail Anggota - Sapi #${selectedSapi}` : 'Detail Semua Anggota');

            const members = selectedSapi
                ? appData.members.filter(m => m.sapi === parseInt(selectedSapi))
                : appData.members.filter(m => m.role !== 'admin' && m.id > 0);

            const cx = {
                id: marginX + 3,
                nama: marginX + usableW * 0.11,
                alamat: marginX + usableW * 0.40,
                total: marginX + usableW * 0.70,
                trx: marginX + usableW * 0.92
            };
            const rH = 8;
            checkPageBreak(rH * 2);
            doc.setFillColor(...rgb(c.emeraldTint));
            doc.rect(marginX, y, usableW, rH, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...rgb(c.inkSoft));
            doc.text('ID', cx.id, y + 5.3);
            doc.text('NAMA', cx.nama, y + 5.3);
            doc.text('ALAMAT', cx.alamat, y + 5.3);
            doc.text('TOTAL', cx.total, y + 5.3);
            doc.text('TRX', cx.trx, y + 5.3);
            y += rH;

            if (members.length === 0) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...rgb(c.inkFaint));
                doc.text('Belum ada anggota', cx.id, y + 5.5);
                y += rH;
            } else {
                members.forEach(member => {
                    checkPageBreak(rH + 2);
                    const memberSavings = appData.savings.filter(s => s.memberId === member.id && s.status === 'APPROVED');
                    const total = memberSavings.reduce((sum, s) => sum + s.amount, 0);

                    doc.setDrawColor(...rgb(c.border)); doc.setLineWidth(0.1);
                    doc.line(marginX, y + rH, marginX + usableW, y + rH);

                    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...rgb(c.ink));
                    doc.text(String(member.id), cx.id, y + 5.3);
                    doc.setFont('helvetica', 'normal');
                    doc.text(String(member.name || '-').substring(0, 22), cx.nama, y + 5.3);
                    doc.setTextColor(...rgb(c.inkSoft));
                    const alamat = member.rt ? `RT ${member.rt}/Blok ${member.blok}/No ${member.no}` : '-';
                    doc.text(alamat.substring(0, 24), cx.alamat, y + 5.3);
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(...rgb(c.emerald));
                    doc.text(rupiah(total), cx.total, y + 5.3);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(...rgb(c.inkSoft));
                    doc.text(String(memberSavings.length), cx.trx, y + 5.3);

                    y += rH;
                });
            }
            y += 8;

        } else if (activeTabId === 'detailTab') {
            // ===== TAB: DETAIL TRANSAKSI =====
            const selSapi = document.getElementById('transactionSapiFilter')?.value || '';
            const selStatus = document.getElementById('transactionStatusFilter')?.value || '';

            let transactions = appData.savings;
            if (selSapi) {
                const memberIds = appData.members.filter(m => m.sapi === parseInt(selSapi)).map(m => m.id);
                transactions = transactions.filter(t => memberIds.includes(t.memberId));
            }
            if (selStatus) transactions = transactions.filter(t => t.status === selStatus);
            transactions = [...transactions].sort((a, b) => new Date(b.transferDate) - new Date(a.transferDate));

            const filterNotes = [selSapi ? `Sapi #${selSapi}` : null, selStatus || null].filter(Boolean);
            drawSectionTitle(`Detail Transaksi${filterNotes.length ? ` (${filterNotes.join(', ')})` : ''}`);

            const cx = {
                tgl: marginX + 3,
                id: marginX + usableW * 0.18,
                nama: marginX + usableW * 0.28,
                nominal: marginX + usableW * 0.55,
                bank: marginX + usableW * 0.76,
                status: marginX + usableW * 0.90
            };
            const rH = 8;
            checkPageBreak(rH * 2);
            doc.setFillColor(...rgb(c.emeraldTint));
            doc.rect(marginX, y, usableW, rH, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...rgb(c.inkSoft));
            doc.text('TANGGAL', cx.tgl, y + 5.3);
            doc.text('ID', cx.id, y + 5.3);
            doc.text('NAMA', cx.nama, y + 5.3);
            doc.text('NOMINAL', cx.nominal, y + 5.3);
            doc.text('BANK', cx.bank, y + 5.3);
            doc.text('STATUS', cx.status, y + 5.3);
            y += rH;

            if (transactions.length === 0) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...rgb(c.inkFaint));
                doc.text('Belum ada transaksi', cx.tgl, y + 5.5);
                y += rH;
            } else {
                const statusHex = st => st === 'APPROVED' ? c.emerald : st === 'REJECTED' ? c.brick : c.gold;
                transactions.forEach(trans => {
                    checkPageBreak(rH + 2);
                    const member = appData.members.find(m => m.id === trans.memberId);

                    doc.setDrawColor(...rgb(c.border)); doc.setLineWidth(0.1);
                    doc.line(marginX, y + rH, marginX + usableW, y + rH);

                    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...rgb(c.inkSoft));
                    doc.text(formatDate(trans.transferDate), cx.tgl, y + 5.3);
                    doc.setTextColor(...rgb(c.ink));
                    doc.text(String(trans.memberId), cx.id, y + 5.3);
                    doc.text(String(member?.name || '-').substring(0, 16), cx.nama, y + 5.3);
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(...rgb(c.emerald));
                    doc.text(rupiah(trans.amount), cx.nominal, y + 5.3);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(...rgb(c.inkSoft));
                    doc.text(String(trans.bankSource || '-').substring(0, 12), cx.bank, y + 5.3);
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(...rgb(statusHex(trans.status)));
                    doc.text(trans.status, cx.status, y + 5.3);

                    y += rH;
                });
            }
            y += 8;

        } else if (activeTabId === 'analisisTab') {
            // ===== TAB: ANALISIS =====
            drawChartImage(laporanCharts.distribution, 'Distribusi per Sapi');
            drawChartImage(laporanCharts.monthly, 'Transaksi per Bulan');

            const pendingS = appData.savings.filter(s => s.status === 'PENDING');
            const activeMembers = appData.members.filter(m => m.role !== 'admin' && m.id > 0).length;
            const paidMembers = new Set(approved.map(s => s.memberId)).size;
            const pendingMembers = new Set(pendingS.map(s => s.memberId)).size;
            const avgApproved = paidMembers > 0 ? Math.round(totalApproved / paidMembers) : 0;
            const maxApproved = approved.length > 0 ? Math.max(...approved.map(s => s.amount)) : 0;
            const minApproved = approved.length > 0 ? Math.min(...approved.map(s => s.amount)) : 0;

            drawSectionTitle('Statistik Anggota');
            const statRows = [
                ['Total Anggota Aktif', String(activeMembers)],
                ['Anggota Sudah Bayar', `${paidMembers} orang`],
                ['Anggota Menunggu Verifikasi', `${pendingMembers} orang`],
                ['Rata-rata Tabungan/Anggota', rupiah(avgApproved)],
                ['Nominal Terbesar', rupiah(maxApproved)],
                ['Nominal Terkecil', rupiah(minApproved)]
            ];
            const rH = 8;
            checkPageBreak(rH * 2);
            doc.setFillColor(...rgb(c.emeraldTint));
            doc.rect(marginX, y, usableW, rH, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...rgb(c.inkSoft));
            doc.text('METRIK', marginX + 3, y + 5.3);
            doc.text('NILAI', marginX + usableW * 0.6, y + 5.3);
            y += rH;
            statRows.forEach(([label, val]) => {
                checkPageBreak(rH + 2);
                doc.setDrawColor(...rgb(c.border)); doc.setLineWidth(0.1);
                doc.line(marginX, y + rH, marginX + usableW, y + rH);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...rgb(c.ink));
                doc.text(label, marginX + 3, y + 5.3);
                doc.setFont('helvetica', 'bold'); doc.setTextColor(...rgb(c.emerald));
                doc.text(val, marginX + usableW * 0.6, y + 5.3);
                y += rH;
            });
            y += 8;

        } else {
            // ===== TAB: RINGKASAN (default) =====
            drawChartImage(laporanCharts.sapi, 'Progress Tabungan per Sapi');
            drawSectionTitle('Top Sapi Terkumpul');

            const cx = {
                sapi: marginX + 3,
                anggota: marginX + usableW * 0.24,
                total: marginX + usableW * 0.38,
                rata: marginX + usableW * 0.63,
                progress: marginX + usableW * 0.83
            };
            const rH = 8;
            checkPageBreak(rH * 2);
            doc.setFillColor(...rgb(c.emeraldTint));
            doc.rect(marginX, y, usableW, rH, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...rgb(c.inkSoft));
            doc.text('SAPI', cx.sapi, y + 5.3);
            doc.text('ANGGOTA', cx.anggota, y + 5.3);
            doc.text('TOTAL', cx.total, y + 5.3);
            doc.text('RATA-RATA', cx.rata, y + 5.3);
            doc.text('PROGRESS', cx.progress, y + 5.3);
            y += rH;

            if (sortedSapi.length === 0) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...rgb(c.inkFaint));
                doc.text('Belum ada data', cx.sapi, y + 5.5);
                y += rH;
            } else {
                sortedSapi.forEach(([num, stats]) => {
                    checkPageBreak(rH + 2);
                    const pct = totalApproved > 0 ? (stats.total / totalApproved * 100) : 0;

                    doc.setDrawColor(...rgb(c.border)); doc.setLineWidth(0.1);
                    doc.line(marginX, y + rH, marginX + usableW, y + rH);

                    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...rgb(c.ink));
                    doc.text(`Sapi #${num}`, cx.sapi, y + 5.3);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(...rgb(c.inkSoft));
                    doc.text(String(stats.members.length), cx.anggota, y + 5.3);
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(...rgb(c.emerald));
                    doc.text(rupiah(stats.total), cx.total, y + 5.3);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(...rgb(c.inkSoft));
                    doc.text(rupiah(stats.average), cx.rata, y + 5.3);

                    const barW = 20, barH = 2.2;
                    doc.setFillColor(...rgb(c.emeraldTint));
                    doc.roundedRect(cx.progress, y + 3, barW, barH, 1, 1, 'F');
                    doc.setFillColor(...rgb(c.emerald));
                    doc.roundedRect(cx.progress, y + 3, Math.max(barW * pct / 100, 1), barH, 1, 1, 'F');
                    doc.setFontSize(6.5);
                    doc.setTextColor(...rgb(c.inkFaint));
                    doc.text(`${pct.toFixed(1)}%`, cx.progress + barW + 2, y + 4.8);

                    y += rH;
                });
            }
            y += 8;
        }

        // Info rekening tujuan transfer
        const bankRows = [
            ['Bank', APP_CONFIG.bankName],
            ['Kode Bank', APP_CONFIG.bankCode],
            ['No. Rekening', APP_CONFIG.bankAccountNumberDisplay],
            ['Atas Nama', APP_CONFIG.bankAccountHolder]
        ];
        const bankBoxH = 10 + bankRows.length * 6;
        checkPageBreak(bankBoxH + 5);

        doc.setDrawColor(...rgb(c.gold));
        doc.setLineWidth(0.4);
        doc.setFillColor(...rgb(c.goldTint));
        doc.roundedRect(marginX, y, usableW, bankBoxH, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...rgb(c.gold));
        doc.text('REKENING TUJUAN TRANSFER TABUNGAN QURBAN', marginX + 6, y + 7);

        let by = y + 14;
        bankRows.forEach(([label, val]) => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...rgb(c.inkSoft));
            doc.text(label, marginX + 6, by);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...rgb(c.ink));
            doc.text(val, marginX + usableW - 6, by, { align: 'right' });
            by += 6;
        });

        downloadPdfDoc(doc, `Laporan_Tabungan_Qurban_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (err) {
        console.error('Export PDF gagal:', err);
        alert('Gagal membuat PDF: ' + (err && err.message ? err.message : err));
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}

// ===== DASHBOARD =====
function updateDashboard() {
    const approved = appData.savings.filter(s => s.status === 'APPROVED');
    const pending = appData.savings.filter(s => s.status === 'PENDING');
    const totalSavings = approved.reduce((sum, s) => sum + s.amount, 0);

    const rupiah = v => `Rp ${v.toLocaleString('id-ID')}`;
    animateCountUp(document.getElementById('totalSavings'), 0, totalSavings, rupiah);
    animateCountUp(document.getElementById('pendingCount'), 0, pending.length, v => `${v}`);
    animateCountUp(document.getElementById('totalTransactions'), 0, approved.length, v => `${v}`);

    const top5 = Object.values(
        approved.reduce((acc, s) => {
            const member = appData.members.find(m => m.id === s.memberId);
            if (!acc[s.memberId]) {
                acc[s.memberId] = { id: s.memberId, name: member?.name || 'Unknown', total: 0, count: 0 };
            }
            acc[s.memberId].total += s.amount;
            acc[s.memberId].count += 1;
            return acc;
        }, {})
    ).sort((a, b) => b.total - a.total).slice(0, 5);

    const list = document.getElementById('topSavingsList');
    if (!list) return;

    if (top5.length === 0) {
        list.innerHTML = '<div class="top-savers-empty">Belum ada transaksi</div>';
        return;
    }

    // Progress bar dipatok ke target tabungan per porsi qurban (Rp 3.500.000),
    // sama dengan patokan {PROGRESS} di template WA - BUKAN relatif ke sesama
    // top 5 (supaya angkanya konsisten di seluruh aplikasi).
    const medals = ['🥇', '🥈', '🥉'];
    const tierClass = ['rank-gold', 'rank-silver', 'rank-bronze'];
    list.innerHTML = top5.map((member, i) => {
        const pctRaw = QURBAN_TARGET_PER_ORANG > 0 ? (member.total / QURBAN_TARGET_PER_ORANG) * 100 : 0;
        const pct = Math.max(4, Math.min(100, Math.round(pctRaw)));
        const initial = (member.name || '?').charAt(0).toUpperCase();
        const rankHtml = i < 3
            ? `<div class="top-saver-rank">${medals[i]}</div>`
            : `<div class="top-saver-rank rank-num">#${i + 1}</div>`;
        return `
            <div class="top-saver-item ${tierClass[i] || ''}" style="animation-delay:${i * 70}ms;">
                ${rankHtml}
                <div class="top-saver-avatar">${initial}</div>
                <div class="top-saver-info">
                    <div class="top-saver-name">${member.name}</div>
                    <div class="top-saver-bar-track"><div class="top-saver-bar-fill" data-target-width="${pct}"></div></div>
                    <div class="top-saver-pct">${pct}% dari target</div>
                </div>
                <div class="top-saver-amount">
                    <div class="top-saver-total">${rupiah(member.total)}</div>
                    <div class="top-saver-count">${member.count} transaksi</div>
                </div>
            </div>
        `;
    }).join('');

    // Animasikan progress bar dari 0 ke lebar aslinya (efek "mengisi"),
    // bukan langsung muncul penuh - kesan lebih hidup/premium.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            list.querySelectorAll('.top-saver-bar-fill').forEach(bar => {
                bar.style.width = bar.dataset.targetWidth + '%';
            });
        });
    });
}

// Salin nomor rekening ke clipboard, dengan fallback kalau Clipboard API
// diblokir (mis. koneksi non-HTTPS lama atau browser lawas).
function copyRekening(btn) {
    const nomor = APP_CONFIG.bankAccountNumber;
    const originalHTML = btn.innerHTML;
    const showCopied = () => {
        btn.innerHTML = '✓ Tersalin';
        setTimeout(() => { btn.innerHTML = originalHTML; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(nomor).then(showCopied).catch(() => {
            showAlert('Gagal menyalin. Nomor: ' + nomor, 'warning');
        });
    } else {
        showAlert('Nomor rekening: ' + nomor, 'info');
    }
}

// ===== WHATSAPP NOTIFICATIONS (bangun teks pesan - pengirimannya lewat
// openWaTo()/wa.me manual, BUKAN lagi Fonnte, lihat catatan di openWaTo()) =====
function buildApprovedMsg(member, amount, totalSaldo) {
    return `Alhamdulillah, ${member.name}! 🎉

Tabungan Qurban Anda sebesar Rp ${amount.toLocaleString('id-ID')} telah DISETUJUI ✅

📊 Rincian:
├─ Nominal: Rp ${amount.toLocaleString('id-ID')}
├─ Total Saldo: Rp ${totalSaldo.toLocaleString('id-ID')}
└─ Status: DISETUJUI

Terima kasih atas kepercayaan dan ketulusan Anda. Semoga Allah menerima amal kita semua.

🔗 ${APP_CONFIG.appUrl}

Barakallahu fiik! 🤲

Admin ${APP_CONFIG.mosqueName}`;
}

function buildRejectedMsg(member, amount, reason) {
    return `Assalamu'alaikum ${member.name},

Mohon maaf, tabungan Qurban Anda sebesar Rp ${amount.toLocaleString('id-ID')} belum dapat kami verifikasi.

❌ Alasan: ${reason}

📝 Silakan upload ulang bukti transfer yang lebih jelas melalui aplikasi:
🔗 ${APP_CONFIG.appUrl}

Terima kasih atas pengertian dan kesabaran Anda.

Admin ${APP_CONFIG.mosqueName}`;
}

// ===== PREVIEW BUKTI TRANSFER =====
// Ambil isi foto/file (base64) satu transaksi saja dari server, on-demand.
// Ini sengaja TIDAK ikut di load data biasa (bootstrap) karena base64 foto
// bisa besar dan bikin loading lambat kalau dikirim tiap kali untuk semua baris.
async function fetchSavingFileData(savingsId) {
    try {
        const url = `${SHEETDB_CONFIG.ENDPOINT}?sheet=Savings&getFile=${savingsId}${tenantParam()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.fileData || '';
    } catch (error) {
        console.error('Error fetching file data:', error);
        return '';
    }
}

async function showPreview(savingsId) {
    const saving = appData.savings.find(s => s.id === savingsId);
    if (!saving) return;

    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const body = document.getElementById('previewBody');

    title.textContent = `Bukti Transfer - ${saving.accountName} (Rp ${saving.amount.toLocaleString('id-ID')})`;

    if (!saving.hasFile) {
        body.innerHTML = '<div class="preview-pdf"><p>📄 Tidak ada bukti file tersimpan</p></div>';
        modal.classList.add('show');
        return;
    }

    body.innerHTML = '<div class="preview-pdf"><p>⏳ Memuat bukti...</p></div>';
    modal.classList.add('show');

    const fileData = await fetchSavingFileData(savingsId);

    if (!fileData) {
        body.innerHTML = '<div class="preview-pdf"><p>📄 Gagal memuat bukti file</p></div>';
        return;
    }

    const isPdf = fileData.includes('application/pdf');
    const isImage = fileData.includes('image/');

    if (isImage) {
        body.innerHTML = `<img src="${fileData}" class="preview-full-image" alt="Bukti transfer">`;
    } else if (isPdf) {
        body.innerHTML = `
            <div class="preview-pdf">
              <p>📄 File PDF</p>
              <p style="font-size:12px; color:var(--ink-faint);">${saving.fileUrl}</p>
              <p style="font-size:12px; margin-top:10px;">Preview PDF tidak didukung dalam browser. Admin bisa download dari Google Sheets.</p>
            </div>`;
    } else {
        body.innerHTML = `<div class="preview-pdf"><p>❓ Tipe file tidak dikenali</p></div>`;
    }
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    modal.classList.remove('show');
}

// Tutup modal saat klik overlay
document.addEventListener('click', e => {
    const modal = document.getElementById('previewModal');
    if (e.target === modal) modal.classList.remove('show');
});
const MESSAGE_TEMPLATES = {
    upload_ack: {
        title: 'Konfirmasi Upload Bukti',
        message: `Assalamu'alaikum {NAMA}!\n\nTerima kasih telah mengunggah bukti transfer Qurban sebesar Rp {NOMINAL}.\n\nStatus: MENUNGGU VERIFIKASI ADMIN\nAdmin akan memverifikasi dalam 1-2 jam kerja.\n\nBarakallahu fiik.\n\n🔗 Buka aplikasi:\n{LINK}\nMasuk dengan ID: {ID}\n\nAdmin ${APP_CONFIG.mosqueName}`
    },
    approval: {
        title: 'Notifikasi Disetujui',
        message: `Alhamdulillah, {NAMA}!\n\nTabungan Qurban Anda sebesar Rp {NOMINAL} telah DISETUJUI.\n\nTotal tabungan Anda: Rp {SALDO}\nProgress: {PROGRESS}%\n\nTerima kasih atas kepercayaannya.\n\n🔐 Buka aplikasi (langsung masuk, tanpa perlu ketik password):\n{LINK_OTOMATIS}\n\nLink ini pribadi, berlaku 30 hari. Mohon tidak diteruskan ke orang lain.\n\nAdmin ${APP_CONFIG.mosqueName}`
    },
    rejection: {
        title: 'Notifikasi Ditolak',
        message: `Assalamu'alaikum {NAMA},\n\nMohon maaf, bukti transfer Qurban Anda belum dapat kami verifikasi karena bukti kurang jelas terbaca.\n\nSilakan unggah ulang bukti transfer yang lebih jelas melalui aplikasi.\n\nTerima kasih atas pengertiannya.\n\n🔗 Buka aplikasi:\n{LINK}\nMasuk dengan ID: {ID}\n\nAdmin ${APP_CONFIG.mosqueName}`
    },
    reminder: {
        title: 'Pengingat Bulanan',
        message: `Assalamu'alaikum {NAMA}!\n\nPengingat: saatnya menabung Qurban bulan ini.\n\nSaldo tabungan Anda saat ini: Rp {SALDO}\n\nSilakan transfer ke rekening DKM, lalu unggah bukti melalui aplikasi.\n\nBarakallahu fiik.\n\n🔗 Buka aplikasi:\n{LINK}\nMasuk dengan ID: {ID}\n\nAdmin ${APP_CONFIG.mosqueName}`
    },
    recap: {
        title: 'Rekap Bulanan',
        message: `REKAP TABUNGAN QURBAN\n{TANGGAL}\n\nAssalamu'alaikum {NAMA}!\n\nTabungan Anda: Rp {SALDO}\nTotal terkumpul: Rp {TOTAL}\nJumlah peserta: {PESERTA} anggota\nProgress: {PROGRESS}%\n\nJazakumullahu khairan.\n\n🔗 Buka aplikasi:\n{LINK}\nMasuk dengan ID: {ID}\n\nAdmin ${APP_CONFIG.mosqueName}`
    }
};

// Gabungkan template bawaan (MESSAGE_TEMPLATES, di kode) dengan template yang
// sudah diedit/ditambah admin lewat menu (tersimpan di sheet "Templates").
// Baris di sheet dengan "key" yang sama akan MENIMPA judul/isi bawaan;
// "key" baru (bukan salah satu dari 5 bawaan) akan jadi template tambahan.
// Dengan begini, kalau sheet "Templates" belum dibuat/masih kosong, aplikasi
// tetap jalan normal pakai template bawaan seperti sebelumnya.
function getTemplates() {
    const merged = {};
    Object.entries(MESSAGE_TEMPLATES).forEach(([key, tpl]) => {
        merged[key] = { title: tpl.title, message: tpl.message };
    });
    (appData.templates || []).forEach(row => {
        if (!row.key) return;
        merged[row.key] = {
            title: row.title || merged[row.key]?.title || row.key,
            message: row.message || merged[row.key]?.message || ''
        };
    });
    return merged;
}

function switchBroadcastTab(tabName, btn) {
    ['sendNow', 'schedule', 'templates', 'history'].forEach(t => {
        const el = document.getElementById(t + 'Tab');
        if (el) el.style.display = 'none';
    });
    const target = document.getElementById(tabName + 'Tab');
    if (target) target.style.display = 'block';

    document.querySelectorAll('#broadcast .sub-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (tabName === 'schedule') loadScheduledMessages();
    if (tabName === 'templates') loadTemplates();
    if (tabName === 'history') loadBroadcastHistory();
}

function loadTemplate() {
    const key = document.getElementById('broadcastTemplate').value;
    const tpl = getTemplates()[key];
    if (!tpl) return;
    document.getElementById('broadcastTitle').value = tpl.title;
    document.getElementById('broadcastMessage').value = tpl.message;
    updateMessagePreview();
}

// Sisipkan variabel ke field manapun (dipakai form Kirim Sekarang & editor Template)
function insertVariableInto(fieldId, variable) {
    const box = document.getElementById(fieldId);
    if (!box) return;
    const start = box.selectionStart ?? box.value.length;
    const end = box.selectionEnd ?? start;
    box.value = box.value.slice(0, start) + variable + box.value.slice(end);
    box.focus();
    box.selectionStart = box.selectionEnd = start + variable.length;
    if (fieldId === 'broadcastMessage') updateMessagePreview();
}

function insertVariable(variable) {
    insertVariableInto('broadcastMessage', variable);
}

// Diambil dari APP_CONFIG di bagian atas file (satu-satunya tempat yang perlu
// diedit kalau nilai ini mau diganti).
const APP_URL = APP_CONFIG.appUrl;

// Target tabungan per porsi qurban (Rp) - dipakai buat {PROGRESS} di template
// WA maupun progress bar di Dashboard "Lima Tabungan Tertinggi", supaya
// keduanya konsisten pakai patokan yang sama.
const QURBAN_TARGET_PER_ORANG = APP_CONFIG.qurbanTarget;

function fillVariables(text, member) {
    const approved = appData.savings.filter(s => s.status === 'APPROVED');
    const total = approved.reduce((sum, s) => sum + s.amount, 0);
    const peserta = new Set(approved.map(s => s.memberId)).size;
    const saldo = member
        ? approved.filter(s => s.memberId === member.id).reduce((sum, s) => sum + s.amount, 0)
        : 0;
    const lastAmount = member
        ? (appData.savings.filter(s => s.memberId === member.id).slice(-1)[0]?.amount || 0)
        : 0;
    const target = QURBAN_TARGET_PER_ORANG;
    const progress = target > 0 ? Math.min(100, Math.round((saldo / target) * 100)) : 0;

    return text
        .replace(/\{NAMA\}/g, member ? member.name : 'Nama Anggota')
        .replace(/\{SALDO\}/g, saldo.toLocaleString('id-ID'))
        .replace(/\{NOMINAL\}/g, lastAmount.toLocaleString('id-ID'))
        .replace(/\{TOTAL\}/g, total.toLocaleString('id-ID'))
        .replace(/\{PESERTA\}/g, peserta)
        .replace(/\{PROGRESS\}/g, progress)
        .replace(/\{TANGGAL\}/g, new Date().toLocaleDateString('id-ID'))
        .replace(/\{ID\}/g, member ? String(member.id) : '-')
        // {LINK_OTOMATIS} = link yang langsung membuka akun anggota ybs tanpa
        // perlu ketik apa pun (berlaku 30 hari). Harus sudah di-cache lebih
        // dulu lewat ensureAutoLoginTokens() - lihat sendBroadcastNow().
        .replace(/\{LINK_OTOMATIS\}/g, autoLoginLinkFor(member))
        // {PASSWORD} DIPERTAHANKAN cuma supaya template lama buatan admin
        // (tersimpan di sheet "Templates") tidak error - tapi sekarang SELALU
        // menghasilkan tanda "-", karena password memang tidak pernah lagi
        // dikirim server ke browser. Pakai {LINK_OTOMATIS} sebagai gantinya.
        .replace(/\{PASSWORD\}/g, '-')
        .replace(/\{LINK\}/g, APP_URL);
}

function updateMessagePreview() {
    const raw = document.getElementById('broadcastMessage').value;
    const box = document.getElementById('messagePreview');
    if (!raw.trim()) {
        box.innerHTML = '<div class="placeholder">Pratinjau akan muncul di sini…</div>';
        return;
    }
    const sample = getRecipientList(document.getElementById('broadcastRecipients').value)[0] || appData.members[0];
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = fillVariables(raw, sample);
    box.innerHTML = '';
    box.appendChild(bubble);
}

// Set berisi id anggota yang dicentang manual di mode "Pilih Anggota Manual".
// Disimpan di luar fungsi supaya centangan tidak hilang saat list difilter
// lewat kolom pencarian.
let selectedBroadcastMemberIds = new Set();

// SENGAJA cuma mendukung dua mode: MEMBER (pilih manual) dan SAPI:<nilai>
// (per grup sapi). Broadcast ke SEMUA anggota sekaligus dihapus total dari
// aplikasi ini - bukan cuma disembunyikan di dropdown - supaya tidak ada
// jalur kode manapun (termasuk data jadwal lama yang mungkin masih tersimpan
// dengan recipients=ALL dari versi sebelumnya) yang bisa memicu pengiriman
// massal. Nomor WhatsApp masjid pernah diblokir karena pola broadcast massal
// ini, jadi mode selain MEMBER/SAPI sengaja dianggap TIDAK VALID (return
// kosong) alih-alih "aman default ke semua orang".
function getRecipientList(mode) {
    if (mode === 'MEMBER') {
        return appData.members.filter(m => selectedBroadcastMemberIds.has(String(m.id)));
    }
    if (mode && mode.startsWith('SAPI:')) {
        const sapiValue = mode.slice(5);
        return appData.members.filter(m => String(m.sapi || '') === sapiValue);
    }
    return [];
}

// Ambil semua nilai "sapi" yang benar-benar ada di data anggota (buang yang
// kosong), diurutkan secara alami (1, 2, 10 - bukan 1, 10, 2 seperti sort
// string biasa), lalu isi jadi opsi di dropdown Penerima. Dipanggil setiap
// buka menu Broadcast supaya selalu ikut data anggota terbaru.
function populateSapiOptions() {
    const values = [...new Set(appData.members.map(m => String(m.sapi || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));

    // Isi ke dua tempat: dropdown "Kirim Sekarang" dan dropdown "Jadwalkan" -
    // keduanya dibatasi maksimal per grup sapi juga.
    ['sapiOptGroup', 'scheduleSapiOptGroup'].forEach(groupId => {
        const group = document.getElementById(groupId);
        if (!group) return;

        if (values.length === 0) {
            group.innerHTML = '';
            group.style.display = 'none';
            return;
        }

        group.style.display = '';
        group.innerHTML = values.map(v => {
            const count = appData.members.filter(m => String(m.sapi || '') === v).length;
            return `<option value="SAPI:${v}">Sapi #${v} (${count} anggota)</option>`;
        }).join('');
    });
}

// Dipanggil saat dropdown Penerima berganti - tampilkan/sembunyikan kotak
// pilih-anggota-manual sesuai mode yang dipilih.
function onBroadcastRecipientChange() {
    const mode = document.getElementById('broadcastRecipients').value;
    const box = document.getElementById('memberPickerBox');
    if (box) box.style.display = mode === 'MEMBER' ? 'block' : 'none';
    if (mode === 'MEMBER') renderMemberPicker();
    updateRecipientCount();
}

function renderMemberPicker() {
    const list = document.getElementById('memberPickerList');
    if (!list) return;
    const query = (document.getElementById('memberPickerSearch')?.value || '').trim().toLowerCase();

    const members = appData.members.filter(m => {
        if (!query) return true;
        return String(m.name || '').toLowerCase().includes(query) || String(m.id).includes(query);
    });

    if (members.length === 0) {
        list.innerHTML = '<div class="member-picker-empty">Tidak ada anggota yang cocok.</div>';
        return;
    }

    list.innerHTML = members.map(m => {
        const id = String(m.id);
        const checked = selectedBroadcastMemberIds.has(id) ? 'checked' : '';
        const metaBits = [m.sapi ? `Sapi #${m.sapi}` : null, m.phone ? m.phone : 'tanpa WA'].filter(Boolean).join(' · ');
        return `
            <label class="member-picker-item">
                <input type="checkbox" ${checked} onchange="toggleBroadcastMember('${id}', this.checked)">
                <span class="mp-name">${m.name || '(tanpa nama)'}</span>
                <span class="mp-meta">${metaBits}</span>
            </label>
        `;
    }).join('');
}

function toggleBroadcastMember(id, checked) {
    if (checked) selectedBroadcastMemberIds.add(id);
    else selectedBroadcastMemberIds.delete(id);
    updateRecipientCount();
}

function setAllMemberPicker(select) {
    const query = (document.getElementById('memberPickerSearch')?.value || '').trim().toLowerCase();
    const members = appData.members.filter(m => {
        if (!query) return true;
        return String(m.name || '').toLowerCase().includes(query) || String(m.id).includes(query);
    });

    if (select) {
        members.forEach(m => selectedBroadcastMemberIds.add(String(m.id)));
    } else {
        // "Kosongkan" selalu bersihkan SELURUH pilihan, bukan cuma yang lagi
        // kelihatan di hasil pencarian - lebih sesuai ekspektasi tombol ini.
        selectedBroadcastMemberIds.clear();
    }
    renderMemberPicker();
    updateRecipientCount();
}

function updateRecipientCount() {
    const mode = document.getElementById('broadcastRecipients').value;
    const list = getRecipientList(mode);
    const withPhone = list.filter(m => m.phone).length;
    document.getElementById('recipientCount').textContent =
        `${list.length} anggota terpilih · ${withPhone} punya nomor WhatsApp`;
    updateMessagePreview();
}

function clearBroadcastForm() {
    document.getElementById('broadcastTitle').value = '';
    document.getElementById('broadcastMessage').value = '';
    document.getElementById('broadcastTemplate').value = '';
    updateMessagePreview();
}

async function sendBroadcastNow() {
    const mode = document.getElementById('broadcastRecipients').value;
    const title = document.getElementById('broadcastTitle').value.trim();
    const message = document.getElementById('broadcastMessage').value.trim();

    if (!title || !message) {
        showAlert('Judul dan pesan harus diisi', 'error');
        return;
    }

    if (mode === 'MEMBER' && selectedBroadcastMemberIds.size === 0) {
        showAlert('Belum ada anggota yang dipilih. Centang minimal satu anggota di daftar.', 'warning');
        return;
    }

    const targets = getRecipientList(mode).filter(m => m.phone);
    if (targets.length === 0) {
        showAlert('Tidak ada penerima dengan nomor WhatsApp', 'warning');
        return;
    }

    if (!confirm(`Kirim pesan "${title}" ke ${targets.length} anggota?\n\nPengiriman akan diberi jeda beberapa detik antar pesan (bukan langsung semua) supaya nomor WhatsApp masjid tidak dianggap spam oleh WhatsApp.`)) return;

    // Siapkan token link otomatis SEKALIGUS untuk semua penerima (1 request)
    // SEBELUM pengiriman dimulai - fillVariables() di bawah sinkron, jadi
    // token harus sudah ada di cache saat {LINK_OTOMATIS} diganti. Hanya
    // dijalankan kalau template-nya memang memakai penanda itu.
    if (/\{LINK_OTOMATIS\}/.test(message)) {
        showAlert('Menyiapkan link masuk otomatis…', 'info');
        await ensureAutoLoginTokens(targets.map(m => m.id));
    }

    let sent = 0, failed = 0;
    for (let i = 0; i < targets.length; i++) {
        const member = targets[i];
        showAlert(`Mengirim ${i + 1}/${targets.length} — ke ${member.name}…`, 'info');

        const ok = await sendFonnteMessage(member.phone, fillVariables(message, member));
        ok ? sent++ : failed++;

        // Jeda ACAK (bukan interval tetap) di antara 4-8 detik sebelum pesan
        // berikutnya. Interval tetap yang cepat (dulu 600ms untuk semua orang)
        // adalah salah satu pola paling gampang dikenali sebagai bot oleh
        // sistem anti-spam WhatsApp, dan pernah bikin nomor masjid diblokir.
        // Jeda 4-8 detik dipilih supaya lebih mendekati ritme ketik+kirim
        // manusia sungguhan, dikombinasikan dengan jumlah penerima yang sudah
        // dibatasi maksimal per grup sapi.
        if (i < targets.length - 1) {
            const delay = 4000 + Math.floor(Math.random() * 4000);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    await appendSheetDB('Pesan', {
        id: nextMessageId(),
        type: 'BROADCAST',
        recipients: mode,
        title: title,
        message: message,
        scheduledTime: 'IMMEDIATE',
        status: sent > 0 ? 'SENT' : 'FAILED',
        sentAt: new Date().toISOString(),
        createdBy: currentUser.name,
        notes: `${sent} terkirim, ${failed} gagal`
    });

    if (failed === 0) {
        showAlert(`Selesai. ${sent} pesan terkirim.`, 'success');
    } else if (sent === 0) {
        showAlert(`Semua pengiriman gagal (${failed}). Cek koneksi Fonnte.`, 'error');
    } else {
        showAlert(`${sent} terkirim, ${failed} gagal.`, 'warning');
    }

    clearBroadcastForm();
}

// Cek status koneksi device WhatsApp (Fonnte) lewat /api/wa-status, supaya
// admin tahu dari awal kalau device-nya disconnect - sebelum capek nulis
// pesan yang ujung-ujungnya gagal terkirim semua.
async function loadFonnteStatus() {
    const dot = document.getElementById('waStatusDot');
    const label = document.getElementById('waStatusLabel');
    const detail = document.getElementById('waStatusDetail');
    if (!dot || !label || !detail) return;

    dot.className = 'wa-status-dot checking';
    label.textContent = 'Memeriksa koneksi WhatsApp…';
    detail.textContent = '';

    try {
        const response = await fetch('/api/wa-status');
        const data = await response.json().catch(() => null);

        if (data && data.connected) {
            dot.className = 'wa-status-dot online';
            label.textContent = `Terhubung ke WhatsApp${data.device ? ' — ' + data.device : ''}`;
            const bits = [];
            if (data.quota !== undefined) bits.push(`Sisa kuota: ${data.quota}`);
            if (data.package) bits.push(`Paket: ${data.package}`);
            detail.textContent = bits.join(' · ') || 'Siap mengirim broadcast.';
        } else {
            dot.className = 'wa-status-dot offline';
            label.textContent = 'Tidak terhubung ke Fonnte';
            detail.textContent = (data && data.error) || 'Cek device Fonnte Anda - mungkin perlu scan ulang QR.';
        }
    } catch (error) {
        console.error('Gagal cek status Fonnte:', error);
        dot.className = 'wa-status-dot offline';
        label.textContent = 'Gagal memeriksa status';
        detail.textContent = 'Tidak bisa menghubungi server. Coba lagi sebentar.';
    }
}

// Kirim WA lewat proxy /api/wa-send (bukan langsung ke Fonnte dari browser),
// supaya API key Fonnte tidak pernah kelihatan di sisi client.
async function sendFonnteMessage(phoneNumber, message) {
    try {
        const response = await fetch('/api/wa-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: String(phoneNumber).trim(), message })
        });

        if (!response.ok) {
            console.error('WA send HTTP error', phoneNumber, response.status);
            return false;
        }
        const result = await response.json().catch(() => null);
        if (result && result.success === false) {
            console.error('WA send rejected', phoneNumber, result);
            return false;
        }
        return true;
    } catch (error) {
        console.error('WA send request failed for', phoneNumber, error);
        return false;
    }
}

function nextMessageId() {
    return appData.messages.length > 0
        ? Math.max(...appData.messages.map(m => parseInt(m.id) || 0)) + 1
        : 1;
}

// ===== BROADCAST: SCHEDULE =====
async function saveScheduledMessage() {
    const recipients = document.getElementById('scheduleRecipients').value;
    const title = document.getElementById('scheduleTitle').value.trim();
    const message = document.getElementById('scheduleMessage').value.trim();
    const scheduledTime = document.getElementById('scheduleTime').value;

    if (!title || !message || !scheduledTime) {
        showAlert('Judul, pesan, dan waktu harus diisi', 'error');
        return;
    }

    const record = {
        id: nextMessageId(),
        type: 'BROADCAST',
        recipients: recipients,
        title: title,
        message: message,
        scheduledTime: scheduledTime,
        status: 'SCHEDULED',
        sentAt: '',
        createdBy: currentUser.name,
        notes: 'Dijadwalkan via admin'
    };

    const ok = await appendSheetDB('Pesan', record);
    if (!ok) return;

    appData.messages.push(record);
    showAlert('Jadwal tersimpan di tab Pesan', 'success');
    document.getElementById('scheduleTitle').value = '';
    document.getElementById('scheduleMessage').value = '';
    document.getElementById('scheduleTime').value = '';
    loadScheduledMessages();
}

function loadScheduledMessages() {
    const tbody = document.getElementById('scheduledMessagesTable');
    const scheduled = appData.messages.filter(m => m.status === 'SCHEDULED');
    tbody.innerHTML = '';

    if (scheduled.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Belum ada jadwal tersimpan</td></tr>';
        return;
    }

    scheduled.forEach(msg => {
        const when = msg.scheduledTime ? new Date(msg.scheduledTime) : null;
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${msg.title}</td>
            <td>${when && !isNaN(when) ? when.toLocaleString('id-ID') : msg.scheduledTime}</td>
            <td><span class="badge scheduled">SCHEDULED</span></td>
            <td><button class="btn btn-ghost btn-small" onclick="useScheduled(${msg.id})">Kirim</button></td>
        `;
    });
}

function useScheduled(id) {
    const msg = appData.messages.find(m => parseInt(m.id) === parseInt(id));
    if (!msg) return;

    const select = document.getElementById('broadcastRecipients');
    select.value = msg.recipients || 'MEMBER';
    // Jadwal lama (sebelum broadcast massal dihapus) mungkin masih menyimpan
    // recipients=ALL/APPROVED/PENDING/NO_UPLOAD - nilai itu sudah tidak ada
    // lagi di dropdown, jadi select.value akan gagal ter-set dan balik ke
    // opsi pertama. Kasih tahu admin secara eksplisit alih-alih diam-diam.
    if (select.value !== (msg.recipients || 'MEMBER')) {
        showAlert('Jadwal ini dulu ditujukan untuk "broadcast massal" yang sekarang sudah dihapus. Pilih ulang penerimanya (per anggota/grup sapi) sebelum kirim.', 'warning');
    } else {
        showAlert('Jadwal dimuat ke form. Periksa lalu kirim.', 'info');
    }

    document.getElementById('broadcastTitle').value = msg.title;
    document.getElementById('broadcastMessage').value = msg.message;
    switchBroadcastTab('sendNow', document.querySelector('#broadcast .sub-tab-btn'));
    onBroadcastRecipientChange();
}

// ===== BROADCAST: TEMPLATES TABLE =====
function loadTemplates() {
    const tbody = document.getElementById('templatesTable');
    tbody.innerHTML = '';

    const templates = getTemplates();
    Object.entries(templates).forEach(([key, tpl]) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${tpl.title}</td>
            <td>${tpl.message.replace(/\n/g, ' ').substring(0, 60)}…</td>
            <td>
                <button class="btn btn-ghost btn-small" onclick="useTemplate('${key}')">Gunakan</button>
                <button class="btn btn-ghost btn-small" onclick="openTemplateEditor('${key}')">Edit</button>
            </td>
        `;
    });

    populateTemplateSelect();
}

// Isi ulang dropdown "Pilih Template" di form Kirim Sekarang secara dinamis,
// supaya template baru/hasil edit langsung muncul di situ juga (sebelumnya
// daftar ini statis di HTML, cuma memuat 5 template bawaan).
function populateTemplateSelect() {
    const select = document.getElementById('broadcastTemplate');
    if (!select) return;
    const currentVal = select.value;
    const templates = getTemplates();
    select.innerHTML = '<option value="">— Tulis Manual —</option>' +
        Object.entries(templates).map(([key, tpl]) => `<option value="${key}">${tpl.title}</option>`).join('');
    if (templates[currentVal]) select.value = currentVal;
}

function useTemplate(key) {
    const tpl = getTemplates()[key];
    if (!tpl) return;
    document.getElementById('broadcastTemplate').value = key;
    document.getElementById('broadcastTitle').value = tpl.title;
    document.getElementById('broadcastMessage').value = tpl.message;
    switchBroadcastTab('sendNow', document.querySelector('#broadcast .sub-tab-btn'));
    updateMessagePreview();
}

// ----- Editor template (buka/simpan/batal) -----
function openTemplateEditor(key) {
    const panel = document.getElementById('templateEditPanel');
    const keyGroup = document.getElementById('templateEditKeyGroup');
    const heading = document.getElementById('templateEditHeading');

    if (key) {
        const tpl = getTemplates()[key];
        if (!tpl) return;
        heading.textContent = `Edit Template: ${tpl.title}`;
        document.getElementById('templateEditKey').value = key;
        keyGroup.style.display = 'none';
        document.getElementById('templateEditTitle').value = tpl.title;
        document.getElementById('templateEditMessage').value = tpl.message;
    } else {
        heading.textContent = 'Template Baru';
        document.getElementById('templateEditKey').value = '';
        keyGroup.style.display = 'block';
        document.getElementById('templateEditNewKey').value = '';
        document.getElementById('templateEditTitle').value = '';
        document.getElementById('templateEditMessage').value = '';
    }

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeTemplateEditor() {
    document.getElementById('templateEditPanel').style.display = 'none';
}

async function saveTemplateEdit(evt) {
    const btn = evt?.currentTarget || evt?.target;
    const originalHTML = btn ? btn.innerHTML : null;

    const existingKey = document.getElementById('templateEditKey').value;
    const title = document.getElementById('templateEditTitle').value.trim();
    const message = document.getElementById('templateEditMessage').value.trim();

    if (!title || !message) {
        showAlert('Judul dan isi pesan wajib diisi', 'error');
        return;
    }

    let key = existingKey;
    if (!key) {
        const rawKey = document.getElementById('templateEditNewKey').value.trim();
        key = (rawKey ? rawKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : '') || ('custom_' + Date.now());
        if (getTemplates()[key]) {
            showAlert('Kode template sudah dipakai, gunakan kode lain', 'error');
            return;
        }
    }

    if (btn) { btn.disabled = true; btn.innerHTML = 'Menyimpan...'; }

    try {
        const existingRow = (appData.templates || []).find(t => t.key === key);
        const ok = existingRow
            ? await updateSheetDB('Templates', 'key', key, { title, message })
            : await appendSheetDB('Templates', { key, title, message });

        if (!ok) {
            showAlert('Gagal menyimpan template. Pastikan sheet "Templates" (kolom: key, title, message) sudah dibuat di Google Sheets.', 'error');
            return;
        }

        if (existingRow) {
            existingRow.title = title;
            existingRow.message = message;
        } else {
            appData.templates = appData.templates || [];
            appData.templates.push({ key, title, message });
        }

        showAlert('Template tersimpan', 'success');
        closeTemplateEditor();
        loadTemplates();
    } catch (err) {
        console.error('Simpan template gagal:', err);
        showAlert('Gagal menyimpan template', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}

// ===== APPROVAL ANGGOTA BARU =====
// ===== LOG AKTIVITAS ANGGOTA (admin) =====

// Ubah timestamp ISO jadi teks relatif ("3 hari lalu", "baru saja") ala media
// sosial - lebih gampang dibaca sekilas daripada tanggal mentah.
function timeAgo(isoString) {
    if (!isoString) return null;
    const then = new Date(isoString);
    if (isNaN(then)) return null;
    const diffMs = Date.now() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Baru saja';
    if (diffMin < 60) return `${diffMin} menit lalu`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} jam lalu`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay} hari lalu`;
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth} bulan lalu`;
    return `${Math.floor(diffMonth / 12)} tahun lalu`;
}

// Susun ringkasan aktivitas per anggota (login terakhir + jumlah login) dari
// appData.loginLogs, dipakai bareng oleh kartu ringkasan dan tabel.
function computeActivitySummary() {
    // Admin tidak ikut dihitung di sini - menu ini untuk memantau keaktifan
    // anggota penabung qurban, bukan akun admin masjid.
    return appData.members.filter(member => member.role !== 'admin').map(member => {
        const logs = appData.loginLogs.filter(l => l.memberId === member.id);
        const lastLog = logs.reduce((latest, l) => {
            const t = new Date(l.loginAt).getTime();
            return (!isNaN(t) && (!latest || t > latest)) ? t : latest;
        }, null);

        let statusClass = 'rejected', statusLabel = 'Belum Pernah Login';
        if (lastLog) {
            const diffDays = (Date.now() - lastLog) / 86400000;
            if (diffDays <= 7) { statusClass = 'approved'; statusLabel = 'Aktif'; }
            else if (diffDays <= 30) { statusClass = 'pending'; statusLabel = 'Kurang Aktif'; }
            else { statusClass = 'rejected'; statusLabel = 'Tidak Aktif'; }
        }

        return {
            member,
            lastLogin: lastLog,
            loginCount: logs.length,
            statusClass,
            statusLabel
        };
    });
}

function loadActivityLog() {
    const summary = computeActivitySummary();

    const active7 = summary.filter(s => s.lastLogin && (Date.now() - s.lastLogin) / 86400000 <= 7).length;
    const active30 = summary.filter(s => s.lastLogin && (Date.now() - s.lastLogin) / 86400000 <= 30).length;
    const neverLoggedIn = summary.filter(s => !s.lastLogin).length;

    const statsBox = document.getElementById('activityStats');
    if (statsBox) {
        const stats = [
            { value: appData.members.filter(m => m.role !== 'admin').length, label: 'Total Anggota' },
            { value: active7, label: 'Aktif 7 Hari Terakhir' },
            { value: active30, label: 'Aktif 30 Hari Terakhir' },
            { value: neverLoggedIn, label: 'Belum Pernah Login' }
        ];
        statsBox.innerHTML = stats.map(s => `
            <div class="activity-stat-card">
                <div class="activity-stat-value">${s.value}</div>
                <div class="activity-stat-label">${s.label}</div>
            </div>
        `).join('');
    }

    renderActivityLogTable();
}

function renderActivityLogTable() {
    const tbody = document.getElementById('activityLogTableBody');
    if (!tbody) return;

    const query = (document.getElementById('activityLogSearch')?.value || '').trim().toLowerCase();
    let summary = computeActivitySummary();

    if (query) {
        summary = summary.filter(s =>
            String(s.member.name || '').toLowerCase().includes(query) ||
            String(s.member.id).includes(query)
        );
    }

    // Paling aktif (login terbaru) di atas; yang belum pernah login di bawah sendiri.
    summary.sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0));

    if (summary.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Tidak ada anggota yang cocok.</td></tr>';
        return;
    }

    tbody.innerHTML = summary.map(s => `
        <tr>
            <td>${s.member.name}</td>
            <td>${s.member.sapi ? '#' + s.member.sapi : '-'}</td>
            <td>${s.lastLogin ? timeAgo(new Date(s.lastLogin).toISOString()) : '-'}</td>
            <td>${s.loginCount}</td>
            <td><span class="badge ${s.statusClass}">${s.statusLabel}</span></td>
        </tr>
    `).join('');
}

function loadApprovalData() {
    const pending = appData.pendaftaran ? appData.pendaftaran.filter(p => p.status === 'PENDING') : [];
    const approved = appData.pendaftaran ? appData.pendaftaran.filter(p => p.status === 'APPROVED') : [];

    const badge = document.getElementById('approvalSummary');
    if (badge) {
        badge.innerHTML =
            `<span class="badge pending">${pending.length} Menunggu</span> ` +
            `<span class="badge approved">${approved.length} Disetujui</span>`;
    }

    const tbody = document.getElementById('approvalTableBody');
    tbody.innerHTML = '';

    if (pending.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Tidak ada pendaftaran yang menunggu</td></tr>';
        return;
    }

    pending.forEach(pendaftar => {
        const d = new Date(pendaftar.applied_at);
        const row = tbody.insertRow();
        const alamat = `RT ${pendaftar.rt}, Blok ${pendaftar.blok}, No ${pendaftar.no}`;
        row.innerHTML = `
            <td>${!isNaN(d) ? d.toLocaleDateString('id-ID') : pendaftar.applied_at}</td>
            <td>${pendaftar.name}</td>
            <td><small>${alamat}</small></td>
            <td><a href="https://wa.me/+62${pendaftar.phone.slice(2)}" target="_blank" style="color:var(--emerald);text-decoration:none;">${pendaftar.phone}</a></td>
            <td><small style="color:var(--ink-faint);">${pendaftar.reason}</small></td>
            <td style="white-space:nowrap;">
                <button class="btn btn-success btn-small" onclick="approveCandidate(${pendaftar.id})">Setujui</button>
                <button class="btn btn-danger btn-small" onclick="rejectCandidate(${pendaftar.id})">Tolak</button>
            </td>
        `;
    });
}

async function approveCandidate(pendaftaranId) {
    const pendaftar = appData.pendaftaran.find(p => p.id === pendaftaranId);
    if (!pendaftar) return;

    if (!confirm(`Setujui pendaftaran ${pendaftar.name}?`)) return;

    const now = new Date().toISOString();
    
    // 1. Update status di Pendaftaran tab
    const updated = await updateSheetDB('Pendaftaran', 'id', pendaftaranId, {
        status: 'APPROVED',
        approved_at: now,
        approved_by: currentUser.name
    });

    if (!updated) {
        showAlert('Gagal menyimpan approval ke Google Sheets', 'error');
        return;
    }

    // ✅ PENTING: REFRESH DATA DARI SHEETS AGAR NOMOR URUTAN AKURAT
    // Ini memastikan appData.members sudah ter-update dengan data terbaru
    await loadDataFromSheets();

    // 2. Generate auto ID (per sapi logic)
    const idInfo = generateAutoID();
    const password = pendaftar.password; // Password sudah dari 4 digit terakhir hape

    // 3. Create entry di Members tab
    const newMember = {
        id: idInfo.id,
        name: pendaftar.name,
        phone: pendaftar.phone,
        status: 'active',
        created_date: now,
        password: password,
        rt: pendaftar.rt,
        blok: pendaftar.blok,
        no: pendaftar.no,
        sapi: idInfo.sapi,
        urutan: idInfo.urutan
    };

    const memberAdded = await appendSheetDB('Members', newMember);
    if (!memberAdded) {
        showAlert('Gagal menambahkan member baru', 'error');
        return;
    }

    appData.members.push(newMember);

    // 4. Update local data
    pendaftar.status = 'APPROVED';
    pendaftar.approved_at = now;
    pendaftar.approved_by = currentUser.name;

    showAlert(`Selamat! ${pendaftar.name} (ID ${idInfo.id}, Sapi #${idInfo.sapi}) berhasil disetujui.`, 'success');
    loadApprovalData();

    // 5. Notifikasi WA kredensial login ke anggota baru.
    // TIDAK bisa dibuka sinkron dari awal fungsi ini - ID & nomor Sapi baru
    // diketahui SETELAH loadDataFromSheets() di atas (sengaja nunggu data
    // terbaru dari server dulu, demi akurasi nomor urut/sapi, hindari
    // tabrakan kalau ada approval lain berbarengan). Karena itu dipasang di
    // belakang confirm() sendiri: klik OK di confirm() ini terhitung
    // gesture baru yang sah buat window.open(), jadi tetap aman dari blokir
    // browser walau sudah lewat beberapa `await` duluan (lihat catatan
    // panjang soal timing di openWaTo()).
    const credMsg = `Alhamdulillah, ${pendaftar.name}! 🎉

Pendaftaran Anda sebagai anggota Tabungan Qurban telah DISETUJUI ✅

📋 Data Login Anda:
├─ ID: ${idInfo.id}
├─ Password: ${password}
├─ Sapi: #${idInfo.sapi}
└─ Alamat: RT ${pendaftar.rt}, Blok ${pendaftar.blok}, No ${pendaftar.no}

🔗 Link aplikasi: ${APP_CONFIG.appUrl}

Langkah berikutnya:
1. Buka link aplikasi di atas
2. Pilih "Masuk Akun"
3. Masukkan ID dan password di atas
4. Mulai menabung!

Catatan: Ganti password di profil setelah login pertama.

Terima kasih telah bergabung. Semoga Allah memudahkan niat kita semua.

Barakallahu fiik! 🤲

Admin ${APP_CONFIG.mosqueName}`;

    if (confirm(`Buka WhatsApp sekarang untuk kirim ID & password ke ${pendaftar.name} (${pendaftar.phone})?`)) {
        openWaTo(pendaftar.phone, credMsg);
    }
}

async function rejectCandidate(pendaftaranId) {
    const pendaftar = appData.pendaftaran.find(p => p.id === pendaftaranId);
    if (!pendaftar) return;

    const reason = prompt(`Alasan penolakan untuk ${pendaftar.name}:`, 'Data tidak lengkap');
    if (reason === null) return;

    // Notif WA ke pendaftar - SINKRON di sini (sebelum await simpan di
    // bawah), karena alasan penolakan sudah diketahui dari prompt() di atas,
    // tidak perlu nunggu server dulu (lihat catatan timing di openWaTo()).
    const rejectMsg = `Assalamu'alaikum ${pendaftar.name},

Terima kasih telah mendaftar menjadi anggota Tabungan Qurban.

Mohon maaf, tim kami masih perlu klarifikasi beberapa hal:

❌ ${reason}

Silakan hubungi kami melalui WhatsApp untuk diskusi lebih lanjut, atau coba daftar kembali dengan data yang lebih lengkap.

Terima kasih atas pengertian Anda.

🔗 ${APP_CONFIG.appUrl}

Admin ${APP_CONFIG.mosqueName}`;
    openWaTo(pendaftar.phone, rejectMsg);

    const now = new Date().toISOString();

    const updated = await updateSheetDB('Pendaftaran', 'id', pendaftaranId, {
        status: 'REJECTED',
        approved_at: now,
        approved_by: currentUser.name
    });

    if (!updated) {
        showAlert('Gagal menyimpan penolakan', 'error');
        return;
    }

    pendaftar.status = 'REJECTED';
    pendaftar.approved_at = now;
    pendaftar.approved_by = currentUser.name;

    showAlert(`Pendaftaran ${pendaftar.name} ditolak`, 'warning');
    loadApprovalData();
}

// ===== BROADCAST: HISTORY =====
function loadBroadcastHistory() {
    const tbody = document.getElementById('broadcastHistoryTable');
    const sent = appData.messages.filter(m => m.status === 'SENT' || m.status === 'FAILED');
    tbody.innerHTML = '';

    if (sent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Belum ada broadcast terkirim</td></tr>';
        return;
    }

    sent.slice().reverse().forEach(msg => {
        const when = msg.sentAt ? new Date(msg.sentAt) : null;
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${msg.title}</td>
            <td>${describeRecipientMode(msg.recipients)}</td>
            <td><span class="badge ${msg.status === 'SENT' ? 'sent' : 'rejected'}">${msg.status}</span></td>
            <td>${when && !isNaN(when) ? when.toLocaleString('id-ID') : '-'}</td>
        `;
    });
}

// Ubah kode mode penerima (mis. "SAPI:3", "MEMBER") jadi label yang enak
// dibaca di tabel Riwayat/Jadwal - biar admin tidak lihat kode mentah.
function describeRecipientMode(mode) {
    const labels = {
        ALL: 'Semua Anggota',
        APPROVED: 'Tabungan Disetujui',
        PENDING: 'Tabungan Menunggu',
        NO_UPLOAD: 'Belum Upload',
        MEMBER: 'Pilih Manual'
    };
    if (labels[mode]) return labels[mode];
    if (mode && mode.startsWith('SAPI:')) return `Grup Sapi #${mode.slice(5)}`;
    return mode || '-';
}

// (sendFontneMessage() - fungsi kirim WA otomatis via Fonnte utk pendaftaran/
// approval/upload/verifikasi transfer - SUDAH DIHAPUS. Semua flow itu sekarang
// pakai openWaTo()/wa.me manual, lihat catatan panjang di dekat definisi
// openWaTo(). sendFonnteMessage() (beda fungsi, EJAAN BENAR) masih dipakai
// khusus utk fitur Broadcast admin - itu memang sengaja tetap otomatis
// karena fiturnya sendiri untuk kirim massal, sudah ada jeda acak antar
// pesan supaya tidak dianggap spam oleh WhatsApp.)

// ===== EXPORT =====
function exportCSV() {
    const approved = appData.savings.filter(s => s.status === 'APPROVED');
    let csv = 'Laporan Tabungan Qurban\n' + new Date().toLocaleDateString('id-ID') + '\n\n';
    csv += 'Tanggal,Nama,Nominal,Bank\n';
    approved.forEach(s => {
        const member = appData.members.find(m => m.id === s.memberId);
        csv += `"${s.transferDate}","${member?.name || 'Unknown'}",${s.amount},"${s.bankSource}"\n`;
    });

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
    element.setAttribute('download', `Laporan_Qurban_${new Date().toISOString().split('T')[0]}.csv`);
    element.click();
}

// ===== ALERT =====
function showAlert(message, type) {
    const alert = document.getElementById('alert');
    alert.textContent = message;
    alert.className = `alert ${type} show`;
    setTimeout(() => { alert.classList.remove('show'); }, 4000);
}

// ===== PROFILE MANAGEMENT =====
function loadProfileData() {
    if (!currentUser) return;
    
    const member = appData.members.find(m => m.id === currentUser.id);
    if (!member) return;

    // Header card: avatar, nama, badges
    document.getElementById('profileHeaderAvatar').textContent = member.name.charAt(0).toUpperCase();
    document.getElementById('profileHeaderName').textContent = member.name;
    document.getElementById('profileHeaderId').textContent = member.id;
    document.getElementById('profileHeaderSapi').textContent = member.sapi;

    // Populate form dengan data current
    document.getElementById('profileId').textContent = member.id;
    document.getElementById('profileName').value = member.name;
    document.getElementById('profilePhone').value = member.phone || '';
    document.getElementById('profileRT').value = member.rt || '';
    document.getElementById('profileBlok').value = member.blok || '';
    document.getElementById('profileNo').value = member.no || '';
    document.getElementById('profileSapi').textContent = `#${member.sapi} · Urutan ${member.urutan}`;

    // Password khusus (custom, lepas dari nomor HP) cuma relevan buat admin.
    // Field selalu dikosongkan tiap buka Profil - tidak pernah prefill
    // password lama (baik demi keamanan maupun karena memang tidak perlu).
    const isAdmin = (member.role || '').toLowerCase() === 'admin';
    document.getElementById('profileAdminPasswordSection').style.display = isAdmin ? '' : 'none';
    document.getElementById('profileNewPassword').value = '';
    document.getElementById('profileNewPasswordConfirm').value = '';

    document.getElementById('profileMessage').innerHTML = '';
}

function updatePhonePassword() {
    const phone = document.getElementById('profilePhone').value;
    if (!phone || phone.length < 4) {
        showAlert('Nomor WhatsApp tidak valid', 'error');
        return;
    }
    
    const lastFour = phone.slice(-4);
    showAlert(`✓ Password otomatis dari nomor: ${lastFour}`, 'success');
}

async function handleProfileUpdate(event) {
    event.preventDefault();
    
    if (!currentUser) return;
    
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const rt = document.getElementById('profileRT').value.trim();
    const blok = document.getElementById('profileBlok').value.trim();
    const no = document.getElementById('profileNo').value.trim();
    
    // Validasi
    if (!name || !phone || !rt || !blok || !no) {
        showAlert('Semua field harus diisi', 'error');
        return;
    }
    
    if (phone.length < 10 || !phone.match(/^[0-9+\-]+$/)) {
        showAlert('Nomor WhatsApp tidak valid (minimal 10 digit)', 'error');
        return;
    }
    
    // Password: member biasa tetap pakai behavior lama (selalu auto = 4
    // digit terakhir HP, gampang diingat). Admin bisa pilih pakai password
    // custom sendiri (unik/rahasia, lepas dari HP) via 2 field tambahan yang
    // cuma muncul untuk role admin - kalau dikosongkan, password LAMA tidak
    // disentuh sama sekali (tidak diam-diam ke-reset ke digit HP baru cuma
    // gara-gara admin update alamat/nama).
    const memberBeforeSave = appData.members.find(m => m.id === currentUser.id);
    const isAdminAccount = memberBeforeSave && (memberBeforeSave.role || '').toLowerCase() === 'admin';
    const newPwField = document.getElementById('profileNewPassword');
    const newPwConfirmField = document.getElementById('profileNewPasswordConfirm');
    const customPw = isAdminAccount ? newPwField.value.trim() : '';
    const customPwConfirm = isAdminAccount ? newPwConfirmField.value.trim() : '';

    if (isAdminAccount && customPw) {
        if (customPw.length < 4) {
            showAlert('Password baru minimal 4 karakter', 'error');
            return;
        }
        if (customPw !== customPwConfirm) {
            showAlert('Konfirmasi password baru tidak cocok', 'error');
            return;
        }
    }

    const msgEl = document.getElementById('profileMessage');
    msgEl.innerHTML = '<div class="profile-msg loading"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Menyimpan perubahan...</div>';

    const now = new Date().toISOString();

    // passwordChanged=false berarti kolom password TIDAK ikut dikirim ke
    // Sheets sama sekali (updateRows cuma nyentuh key yang ada di object),
    // jadi password lama tetap aman walau field lain diubah.
    let passwordChanged = true;
    let newPassword;
    if (isAdminAccount && customPw) {
        newPassword = customPw; // admin set password sendiri
    } else if (isAdminAccount) {
        passwordChanged = false; // admin, tidak isi field baru -> jangan sentuh
        newPassword = memberBeforeSave.password;
    } else {
        newPassword = phone.slice(-4); // member biasa: tetap auto dari HP
    }

    const sheetUpdates = { name, phone, rt, blok, no };
    if (passwordChanged) sheetUpdates.password = newPassword;

    // Update ke Sheets
    const updated = await updateSheetDB('Members', 'id', currentUser.id, sheetUpdates);

    if (!updated) {
        msgEl.innerHTML = '<div class="profile-msg error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>Gagal menyimpan. Coba lagi.</div>';
        return;
    }

    // Update local data
    const member = appData.members.find(m => m.id === currentUser.id);
    if (member) {
        member.name = name;
        member.phone = phone;
        member.rt = rt;
        member.blok = blok;
        member.no = no;
        if (passwordChanged) member.password = newPassword;
        currentUser.name = name;
        currentUser.phone = phone;
    }

    // Kosongkan field password custom setelah tersimpan - jangan biarkan
    // tertinggal di layar/DOM.
    if (isAdminAccount) {
        newPwField.value = '';
        newPwConfirmField.value = '';
    }
    
    // Update sidebar
    document.getElementById('userName').textContent = name;
    document.getElementById('avatarInitial').textContent = name.charAt(0).toUpperCase();

    // Update header card profil
    document.getElementById('profileHeaderAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('profileHeaderName').textContent = name;
    
    const pwMsgHtml = passwordChanged
        ? ' &middot; Password baru: <strong>' + newPassword + '</strong>'
        : ' &middot; Password tidak berubah';
    msgEl.innerHTML = '<div class="profile-msg success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg><span>Perubahan berhasil disimpan' + pwMsgHtml + '</span></div>';

    // Auto-clear message
    setTimeout(() => {
        msgEl.innerHTML = '';
    }, 3000);


    // Kirim notif ke member - baris password cuma disertakan kalau memang
    // ikut berubah (admin yang tidak isi field password baru tidak perlu
    // dikirimi ulang password lama).
    const pwLineWa = passwordChanged
        ? `\\n\\n🔐 Password Baru:\\n└─ ${newPassword}${isAdminAccount ? ' (custom, disimpan sendiri)' : ' (dari 4 digit terakhir nomor HP)'}`
        : '';
    await fetch('/api/wa-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            target: phone,
            message: `Assalamu'alaikum ${name}!\\n\\n✅ Data pribadi Anda telah diperbarui:\\n\\n📋 Informasi Terbaru:\\n├─ Nama: ${name}\\n├─ WhatsApp: ${phone}\\n├─ Alamat: RT ${rt}, Blok ${blok}, No ${no}${pwLineWa}\\n\\nJika ada yang tidak sesuai, hubungi admin.\\n\\nBarakallahu fiik!\\n\\nAdmin ${APP_CONFIG.mosqueName}`
        })
    }).catch(err => console.log('Notif sent'));
}

function resetProfileForm() {
    loadProfileData();
    document.getElementById('profileMessage').innerHTML = '';
}

// ===== WAKTU SHOLAT (Dashboard) =====
// Sumber: api.myquran.com (data Kemenag RI), gratis & tanpa API key.
// Lokasi Kab. Karawang -> id lokasi 1210 (cek ulang di
// https://api.myquran.com/v2/sholat/kota/cari/<nama kota> kalau lokasi masjid pindah kota lain.
const PRAYER_LOCATION_ID = APP_CONFIG.prayerLocationId;
const PRAYER_ITEMS = [
    { key: 'imsak', label: 'Imsak' },
    { key: 'subuh', label: 'Subuh', fardhu: true },
    { key: 'terbit', label: 'Terbit' },
    { key: 'dhuha', label: 'Dhuha' },
    { key: 'dzuhur', label: 'Dzuhur', fardhu: true },
    { key: 'ashar', label: 'Ashar', fardhu: true },
    { key: 'maghrib', label: 'Maghrib', fardhu: true },
    { key: 'isya', label: 'Isya', fardhu: true }
];
let currentPrayerJadwal = null;

async function loadPrayerTimes() {
    const container = document.getElementById('prayerTimesRow');
    const dateEl = document.getElementById('prayerDate');
    if (!container) return;

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const cacheKey = `prayerTimes_${y}-${m}-${d}`;

    if (dateEl) {
        dateEl.textContent = today.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    // Cache per-hari di localStorage supaya tidak nge-fetch API tiap kali
    // buka Dashboard - jadwal sholat 1 lokasi kan sama sepanjang hari itu.
    let jadwal = null;
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) jadwal = JSON.parse(cached);
    } catch (e) { /* localStorage tidak tersedia, lanjut fetch biasa */ }

    if (!jadwal) {
        try {
            // AbortController 8 detik - API pihak ketiga ini kadang lambat,
            // dan tanpa batas waktu, request-nya bisa nggantung lama di
            // background tepat pas beberapa detik pertama halaman dibuka -
            // ikut menyita jalur jaringan yg lagi dipakai fetch2 lain
            // (tenant-config, dst) di koneksi HP yang pas-pasan.
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), 8000);
            const resp = await fetch(`https://api.myquran.com/v2/sholat/jadwal/${PRAYER_LOCATION_ID}/${y}/${m}/${d}`, { signal: ctrl.signal });
            clearTimeout(timeoutId);
            const data = await resp.json();
            if (data && data.status && data.data && data.data.jadwal) {
                jadwal = data.data.jadwal;
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(jadwal));
                    // Buang cache hari-hari lama biar tidak menumpuk terus
                    Object.keys(localStorage).forEach(k => {
                        if (k.startsWith('prayerTimes_') && k !== cacheKey) localStorage.removeItem(k);
                    });
                } catch (e) { /* abaikan kalau localStorage penuh/diblokir */ }
            }
        } catch (err) {
            console.error('Gagal memuat jadwal sholat:', err);
        }
    }

    if (!jadwal) {
        container.innerHTML = '<div style="opacity:.7;font-size:12.5px;padding:6px 0;">Jadwal sholat tidak tersedia saat ini.</div>';
        return;
    }

    currentPrayerJadwal = jadwal;
    renderPrayerTimes(jadwal);
}

function renderPrayerTimes(jadwal) {
    const container = document.getElementById('prayerTimesRow');
    const nameEl = document.getElementById('prayerNextName');
    const cdEl = document.getElementById('prayerNextCountdown');
    if (!container) return;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const fardhuTimes = PRAYER_ITEMS.filter(p => p.fardhu).map(p => {
        const [h, mnt] = (jadwal[p.key] || '00:00').split(':').map(Number);
        return { ...p, minutes: (h || 0) * 60 + (mnt || 0) };
    });

    let nextPrayer = fardhuTimes.find(p => p.minutes > nowMinutes);
    if (!nextPrayer) nextPrayer = fardhuTimes[0]; // sudah lewat Isya -> hitung mundur ke Subuh besok

    container.innerHTML = PRAYER_ITEMS.map(p => {
        const isNext = nextPrayer && p.key === nextPrayer.key;
        return `
            <div class="prayer-time-chip ${isNext ? 'active' : ''} ${p.fardhu ? '' : 'minor'}">
                <div class="label">${p.label}</div>
                <div class="time">${jadwal[p.key] || '--:--'}</div>
            </div>
        `;
    }).join('');

    if (nameEl && nextPrayer) {
        nameEl.textContent = nextPrayer.label;
        let diff = nextPrayer.minutes - nowMinutes;
        if (diff <= 0) diff += 24 * 60;
        const hh = Math.floor(diff / 60);
        const mm = diff % 60;
        if (cdEl) cdEl.textContent = hh > 0 ? `${hh} jam ${mm} menit lagi` : `${mm} menit lagi`;
    }
}

// ===== INIT =====
// Dibungkus async IIFE supaya bisa nunggu loadTenantConfigIfNeeded() dulu
// (fetch config masjid dari Registry, cuma jalan kalau CURRENT_TENANT ada -
// mode legacy/root path selesai instan tanpa fetch tambahan) sebelum
// applyBranding() & sisa init jalan - supaya nama/logo/rekening yang tampil
// pertama kali sudah benar punya masjid yang bersangkutan, bukan sempat
// kelihatan default lalu "loncat" begitu config-nya datang.
(async function initApp() {
    // app.html hanya dipakai lewat rewrite /slug-masjid -> tidak pernah
    // dimaksudkan diakses tanpa tenant. Kalau ada yang buka file ini
    // langsung tanpa slug, lempar ke landing page brand "Alur Qurban" di
    // root (/) - itu file terpisah (public/index.html), bukan app ini.
    if (!CURRENT_TENANT) {
        window.location.replace('/');
        return;
    }

    const tenantOk = await loadTenantConfigIfNeeded();
    if (!tenantOk) {
        showTenantNotFoundScreen();
        return;
    }

    // Bersihkan sisa key sesi lama (sebelum key di-scope per-tenant) yang
    // mungkin masih nyangkut di localStorage device ini - bukan bug baru,
    // cuma beres-beres sekali jalan, aman dihapus kapan saja.
    try { localStorage.removeItem('tqSession'); } catch (e) { /* abaikan */ }

    document.getElementById('uploadDate').valueAsDate = new Date();
    initFileDropzone();
    initPullToRefresh();

    // Terapkan identitas masjid (nama, logo, rekening) ke seluruh halaman dari
    // APP_CONFIG - supaya kustomisasi cukup edit satu tempat di atas, tidak
    // perlu cari-cari teks di HTML.
    applyBranding();

    // Kalau ada sesi login tersimpan (lihat SESSION_STORAGE_KEY), langsung
    // lanjutkan ke app tanpa lewat layar login - ini yang bikin pull-to-refresh
    // atau app dibuka ulang di HP tidak lagi terasa seperti "logout paksa".
    //
    // Kalau BELUM ada sesi (pertama kali buka / sudah logout, masih di layar
    // login) - TIDAK prefetch data sama sekali di sini lagi. Riwayat: versi
    // awal manggil ensureDataLoaded() LANGSUNG (blocking), lalu diganti
    // ditunda pakai requestIdleCallback - ternyata keduanya TETAP bikin
    // parsing 18-sheet (kerjaan CPU nyata, .map() per baris x 18 sheet)
    // terjadi di device user SAAT layar login masih dipegang, cuma beda soal
    // KAPAN persisnya dalam beberapa detik pertama - user tetap ngerasa berat
    // krn kerjaannya toh tetap harus jalan di device yang sama.
    //
    // Sekarang murni TIDAK dikerjakan sampai benar2 dibutuhkan: handleLogin()
    // sudah panggil ensureDataLoaded() sendiri sebelum cek username/password,
    // dan handleGuestLogin() sudah panggil loadDataFromSheets() sendiri -
    // keduanya independen dari prefetch ini (sudah begitu dari awal). Jadi
    // menghapus prefetch di sini TIDAK bikin data telat muncul setelah user
    // klik Masuk/Guest (tetap dimuat, cuma waktunya PERSIS saat dibutuhkan,
    // bukan lebih awal) - tapi HILANGKAN SAMA SEKALI beban CPU yang tadinya
    // "menyita" waktu scroll user selagi masih di layar login, PERSIS
    // mencontoh index.html (landing page) yang juga nol fetch data sebelum
    // ada aksi dari user.
    // Urutan sengaja: link otomatis dari WhatsApp (?t=…) diperiksa DULU,
    // baru sesi tersimpan. Alasannya, kalau HP itu dipakai bergantian
    // (mis. HP keluarga), link yang baru diklik harus menang atas sesi
    // anggota lain yang kebetulan masih tersimpan di browser tsb.
    tryAutoLoginFromLink().then(berhasil => {
        if (!berhasil && loadSavedSession()) {
            restoreSession();
        }
    });

    // Waktu sholat: tampil terlepas dari status login (info umum, bukan data
    // pribadi), dan di-refresh tiap menit supaya highlight "sholat berikutnya" +
    // hitung mundur tetap akurat tanpa perlu reload halaman.
    loadPrayerTimes();
    setInterval(loadPrayerTimes, 60000);
})();

// Daftarkan service worker supaya app.html bisa di-install sebagai PWA
// (ikon Alur Qurban, buka tanpa address bar) dan tetap kebuka pas offline.
// Didaftar di sini (app.html, bukan index.html/landing) karena yang masuk
// akal buat di-"install" adalah aplikasi tenant-nya, bukan halaman promosi.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Ditunda dikit lagi (idle callback / fallback setTimeout) - install()
        // service worker langsung nge-fetch beberapa aset (lihat CACHE_ASSETS
        // di service-worker.js) yang tetap makan jalur jaringan HP, walau
        // sekarang sudah jauh lebih kecil (app.html/index.html sudah dibuang
        // dari daftar itu krn redundan). Jeda ini kasih prioritas ke fetch2
        // yang lebih genting punya halaman sendiri (tenant-config, dst) duluan.
        const registerSW = () => {
            navigator.serviceWorker.register('/service-worker.js').catch(err => {
                console.warn('[SW] Registrasi gagal:', err);
            });
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(registerSW, { timeout: 3000 });
        } else {
            setTimeout(registerSW, 1500);
        }
    });
}
