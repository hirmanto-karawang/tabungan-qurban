# Setup Platform Multi-Masjid (Fase 1)

Panduan ini buat mengaktifkan mode multi-tenant (1 kode, banyak masjid) di atas kode yang sudah ada. Mode lama (single-tenant, `APP_CONFIG` hardcoded) **tetap jalan seperti biasa** di path root (`/`) - jadi URL live yang sudah beredar (`tabungan-qurban-orpin.vercel.app`) tidak akan berubah perilaku sampai kamu sendiri yang mengaktifkan tenant baru.

## Cara kerja singkat

- Buka `https://<domain>/` (root, tanpa slug) → tetap pakai `APP_CONFIG` hardcoded di `index.html`, sheet `GOOGLE_SHEET_ID` seperti sekarang. Tidak berubah.
- Buka `https://<domain>/<slug-masjid>` (mis. `/dhafinul`, `/annurlam`) → frontend baca slug dari URL, minta config masjid itu ke backend, backend cari di **Registry Sheet**, lalu semua data (Members, Savings, dst) diarahkan ke Google Sheet DATA masjid itu.

## Langkah 1 — Buat Registry Sheet

1. Buka Google Sheets pakai akun Google yang SAMA dengan yang dipakai `GOOGLE_REFRESH_TOKEN` sekarang (supaya otomatis punya akses tanpa perlu share manual).
2. Buat spreadsheet baru, kasih nama misalnya **"TQ Registry - Super Admin"**.
3. Ganti nama tab/sheet default jadi persis **`Registry`** (harus persis, case-sensitive).
4. Isi baris 1 (header) dengan kolom-kolom ini, persis urutan/nama ini:

```
slug	status	mosqueName	mosqueShortName	logoFile	locationName	prayerLocationId	bankName	bankCode	bankAccountNumber	bankAccountNumberDisplay	bankAccountHolder	qurbanTarget	sheetId	fonnteApiKey	createdDate
```

5. Isi baris 2 = data **Dhafinul** (migrasi dari `APP_CONFIG` yang sekarang di `public/index.html`):

| Kolom | Nilai |
|---|---|
| slug | `dhafinul` |
| status | `aktif` |
| mosqueName | `Masjid Dhafinul Jariyah` |
| mosqueShortName | `Dhafinul Jariyah` |
| logoFile | `logo-masjid.jpg` |
| locationName | `Karawang` |
| prayerLocationId | `1210` |
| bankName | `Bank Muamalat` |
| bankCode | `147` |
| bankAccountNumber | `3410020637` |
| bankAccountNumberDisplay | `341 002 0637` |
| bankAccountHolder | `Masjid Dhafinul Jariyah` |
| qurbanTarget | `3500000` |
| sheetId | `1UareCU-UMZianvrCKWVeI7_LHZlOgEAOlBJfBwjcH4Q` |
| fonnteApiKey | (boleh kosong dulu - lihat catatan WA di bawah) |
| createdDate | (tanggal hari ini) |

6. Isi baris 3 = data **An-Nurlam**. Kamu perlu cari 2 nilai ini dulu:
   - `sheetId` An-Nurlam: buka Google Sheet data An-Nurlam, ambil ID dari URL (bagian antara `/d/` dan `/edit`). Atau cek env var `GOOGLE_SHEET_ID` di project Vercel `tabungan-qurban-annurlam`.
   - Isi kolom lain (mosqueName, bankName, dst) sesuai konfigurasi An-Nurlam saat ini (bisa dicek dari `APP_CONFIG` di repo `tabungan-qurban-annurlam`, atau dari tampilan live app-nya).
   - slug: `annurlam`, status: `aktif`.

7. Ambil **Registry Sheet ID** dari URL spreadsheet Registry ini (antara `/d/` dan `/edit`) - ini yang akan jadi env var `REGISTRY_SHEET_ID`.

## Langkah 2 — Tambah env var di Vercel

Di project Vercel yang sekarang serve `tabungan-qurban-orpin.vercel.app` (Dhafinul) → Project Settings → Environment Variables → tambah:

```
REGISTRY_SHEET_ID = <ID dari Langkah 1.7>
```

Deploy ulang (atau tunggu deploy otomatis dari push berikutnya) supaya env var ini kebaca.

## Langkah 3 — Siapkan logo per masjid

Logo dibaca dari `logoFile` di Registry, relatif ke folder `public/`. Dhafinul sudah ada (`logo-masjid.jpg`). Untuk An-Nurlam, taruh file logonya di `public/` dengan nama unik (mis. `logo-annurlam.jpg`), lalu isi kolom `logoFile` di Registry dengan nama file itu. Commit & push filenya seperti file lain.

## Langkah 4 — Push kode ini & tes

Setelah push (pakai `push-survey-peserta.ps1` seperti biasa, commit message sudah diupdate), tes:

- `https://tabungan-qurban-orpin.vercel.app/` → harus tetap seperti sekarang (Dhafinul, tidak berubah).
- `https://tabungan-qurban-orpin.vercel.app/dhafinul` → Dhafinul juga, tapi lewat jalur Registry (config diambil dari Sheet Registry, bukan hardcoded).
- `https://tabungan-qurban-orpin.vercel.app/annurlam` → harus tampil branding An-Nurlam (nama, logo, rekening), dan data yang dimuat (Members, Savings, dst) dari Sheet DATA An-Nurlam, terpisah dari Dhafinul.
- `https://tabungan-qurban-orpin.vercel.app/masjid-ngasal` (slug yang tidak ada di Registry) → harus tampil halaman "Masjid tidak ditemukan", bukan error putih/kosong.

## Keterbatasan Fase 1 (penting)

- **Broadcast WhatsApp (Fonnte) BELUM multi-tenant.** `api/wa-status.js` dan `api/wa-send.js` masih pakai 1 env var global `FONNTE_API_KEY` - jadi kalau tab Broadcast WA dibuka lewat path `/annurlam`, pesan akan tetap terkirim lewat device Fonnte yang terpasang di env var global (kemungkinan besar device Dhafinul), BUKAN device An-Nurlam sendiri. Kolom `fonnteApiKey` di Registry sudah disiapkan tempatnya, tapi logic pemakaiannya menyusul di fase berikutnya. **Jangan pakai tab Broadcast WA dari path `/annurlam` dulu sampai ini dibereskan**, supaya tidak salah kirim pesan pakai nomor WA masjid lain.
- **Tambah masjid baru masih manual** (isi baris di Registry + upload logo manual). Tombol "Tambah Masjid" otomatis di panel Super Admin adalah Fase 3.
- Repo `tabungan-qurban-annurlam` (deployment terpisah) **belum di-retire**. URL lama An-Nurlam tetap jalan seperti biasa sampai kamu putuskan untuk pindah member ke URL baru (`/annurlam` di deployment ini).

## Menambah masjid ke-3, ke-4, dst (sementara, manual)

1. Buat Google Sheet DATA baru buat masjid itu (bisa copy struktur sheet Dhafinul: Members, Savings, Verifications, Pesan, Pendaftaran, dst - semua nama sheet yang ada di `SHEET_NAMES`).
2. Tambah 1 baris baru di Registry dengan slug unik, isi semua kolom, `status = aktif`.
3. Upload logo masjid itu ke `public/`, isi `logoFile`.
4. Masjid itu langsung bisa diakses di `/<slug>` tanpa perlu deploy ulang kode (Registry dibaca live, cuma di-cache 30 detik).
