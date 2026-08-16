/**
 * PREVIEW / LINK UNFURL PER MASJID (multi-tenant)
 * ============================================================
 * MASALAH YANG DISELESAIKAN FILE INI:
 * Waktu link masjid (mis. /alistiqomah) di-share ke WhatsApp, preview-nya
 * SELALU nampilin "Masjid Dhafinul Jariyah" - masjid mana pun slug-nya.
 *
 * Sebabnya: public/app.html itu SATU file statis yang dipakai bareng semua
 * masjid. Nama masjid yang benar baru dipasang BELAKANGAN oleh JavaScript
 * (applyBranding(), setelah fetch config tenant). Padahal robot pembuat
 * preview link - WhatsApp, Facebook, Telegram, dst - TIDAK PERNAH
 * menjalankan JavaScript. Mereka cuma baca HTML mentah, ambil <title> /
 * og:title, lalu berhenti. Jadi yang kebaca ya judul hardcoded di file itu.
 *
 * SOLUSINYA: khusus untuk robot-robot itu (dideteksi dari User-Agent lewat
 * aturan "has" di vercel.json), request TIDAK dilayani app.html statis,
 * tapi dibelokkan ke fungsi ini - yang membaca config masjid dari Registry
 * DULU, baru menyusun HTML berisi meta tag yang sudah benar per masjid.
 *
 * KENAPA CUMA UNTUK ROBOT, BUKAN SEMUA ORANG?
 * Kalau SEMUA request dilewatkan fungsi serverless spt ini, tiap orang buka
 * app harus nunggu server baca Registry dulu - nambah jeda, dan menghapus
 * keuntungan app.html dilayani langsung dari CDN sbg file statis (ini
 * penting; lihat riwayat commit soal perbaikan performa scroll di HP).
 * Dengan pembatasan User-Agent, pengunjung manusia TETAP dapat file statis
 * secepat sebelumnya, cuma robot preview yang lewat jalur agak lambat ini -
 * dan robot tidak peduli soal kecepatan.
 */

// Judul & keterangan cadangan, dipakai kalau slug tidak ketemu di Registry
// atau Registry-nya lagi bermasalah. SENGAJA netral (merek platform), bukan
// nama salah satu masjid - lebih baik tampil generik daripada tampil nama
// masjid yang KELIRU (itu justru masalah yang mau dibereskan file ini).
const FALLBACK_TITLE = 'Alur Qurban — Sistem Tata Kelola Qurban Masjid';
const FALLBACK_DESC = 'Kelola qurban masjid dalam satu alur: tabungan jamaah, survei hewan, distribusi daging, sampai laporan pertanggungjawaban.';
const FALLBACK_IMAGE = '/icons/icon-512x512.png';

// Escape karakter yang bisa merusak/menyusup keluar dari atribut HTML.
// Nama masjid datang dari Google Sheet Registry (diisi manusia), jadi tetap
// diperlakukan sbg data tidak tepercaya - jangan pernah ditempel mentah ke
// dalam atribut content="...".
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Ambil config publik masjid lewat endpoint yang SUDAH ADA
// (/api/sheets?tenant=<slug>&config=1). Sengaja memanggil endpoint itu
// daripada menyalin ulang logika OAuth + baca Registry ke file ini - biar
// tidak ada dua sumber kebenaran yang bisa beda kalau nanti salah satu
// diubah.
async function fetchTenantConfig(origin, slug) {
  try {
    const url = `${origin}/api/sheets?tenant=${encodeURIComponent(slug)}&config=1`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'AlurQurban-Preview' } });
    if (!resp.ok) return null;
    const config = await resp.json();
    if (!config || !config.mosqueName) return null;
    return config;
  } catch (err) {
    console.error('[preview] gagal ambil config tenant:', err && err.message ? err.message : err);
    return null;
  }
}

export default async function handler(req, res) {
  // Slug dikirim vercel.json lewat query (?slug=:slug). Dibersihkan
  // seadanya - cuma huruf/angka/dash yang dianggap slug wajar.
  const rawSlug = (req.query && req.query.slug) ? String(req.query.slug) : '';
  const slug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const origin = `${proto}://${host}`;

  let title = FALLBACK_TITLE;
  let description = FALLBACK_DESC;
  let image = `${origin}${FALLBACK_IMAGE}`;

  if (slug) {
    const config = await fetchTenantConfig(origin, slug);
    if (config) {
      const nama = config.mosqueName;
      title = `Tabungan Qurban — ${nama}`;
      description = `Ikut qurban di ${nama} dengan cara paling nyaman — menabung bertahap atau langsung lunas lewat Qurban Instan. Progres tabungan, survei hewan, sampai distribusi daging bisa dipantau sendiri.`;
      // logoFile di Registry isinya URL penuh (Vercel Blob) sejak logo
      // dipindah dari data-URI ke Blob storage. Tapi baris lama bisa saja
      // masih berisi path relatif atau data URI - keduanya TIDAK dipakai
      // sbg og:image (data URI tidak didukung WhatsApp, path relatif tidak
      // bisa diambil robot), jatuh balik ke lambang Alur Qurban.
      const logo = (config.logoFile || '').toString().trim();
      if (/^https?:\/\//i.test(logo)) image = logo;
    }
  }

  const canonical = slug ? `${origin}/${slug}` : origin;

  // HALAMAN INI CUMA DILIHAT ROBOT (lihat aturan User-Agent di vercel.json),
  // jadi isinya minimal - tidak perlu app-nya sama sekali. Tetap dikasih
  // pengalihan (JS + meta refresh + link manual) sebagai jaring pengaman
  // kalau ternyata ada manusia yang User-Agent-nya kebetulan kena aturan
  // itu: mereka langsung dilempar ke app yang sebenarnya, tidak nyangkut
  // di halaman kosong ini.
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Alur Qurban">
<meta property="og:locale" content="id_ID">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta name="theme-color" content="#0E3B34">
<meta http-equiv="refresh" content="0; url=${escapeHtml(canonical)}">
</head>
<body>
<p>Membuka ${escapeHtml(title)}…</p>
<p><a href="${escapeHtml(canonical)}">Klik di sini kalau tidak berpindah otomatis</a></p>
<script>location.replace(${JSON.stringify(canonical)});</script>
</body>
</html>`;

  // Cache di CDN Vercel 10 menit (robot WhatsApp sering minta ulang link yg
  // sama berkali-kali kalau di-forward ke banyak orang) tapi tetap boleh
  // dipakai basi sambil di-refresh di latar, jadi Registry tidak dibaca
  // berulang-ulang tanpa perlu.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  return res.status(200).send(html);
}
