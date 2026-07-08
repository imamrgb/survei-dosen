# Survei Kinerja Dosen — INSTBUNAS

Aplikasi web survei kinerja dosen (mirip alur Google Form) berbasis Node.js + Express.
Mahasiswa memilih **Program Studi** dan **Kelas**, lalu hanya dosen yang mengajar di
kelas tersebut (berdasarkan `Jadwal_UAS_Genap_TA_2025-2026.docx`) yang ditampilkan untuk
dinilai — masing-masing dengan 19 pernyataan skala Likert 1–5 + kolom saran/kritik.

## Struktur Folder

```
survei-dosen/
├── server.js              # Backend Express (API + penyimpanan data)
├── package.json
├── data/
│   ├── classdata.json     # Mapping kelas → daftar dosen (dari jadwal)
│   ├── questions.json     # 19 pertanyaan + 4 dimensi (Reliability, Responsiveness, Assurance, Empathy)
│   └── responses.json     # Hasil submit mahasiswa (dibuat otomatis, jangan dihapus manual)
└── public/
    ├── index.html          # Halaman survei mahasiswa
    ├── admin.html           # Dasbor admin (rekap + export CSV)
    ├── style.css
    └── app.js
```

## Menjalankan di Lokal

Butuh Node.js versi 18 ke atas.

```bash
cd survei-dosen
npm install
npm start
```

Buka `http://localhost:3000` untuk mengisi survei, dan `http://localhost:3000/admin`
untuk melihat rekap hasil.

**Password admin default:** `admin123`
Segera ganti lewat environment variable sebelum di-deploy:

```bash
ADMIN_PASSWORD="password-rahasia-anda" npm start
```

## Cara Hosting (mirip Google Form, tapi punya sendiri)

Karena ini aplikasi Node.js (bukan file statis), Anda butuh hosting yang mendukung
Node.js. Beberapa opsi termudah:

### 1. Railway (gratis untuk trafik kecil, paling mudah) — lihat `CARA-DEPLOY-RAILWAY.md`
Panduan lengkap step-by-step (push ke GitHub lalu deploy ke Railway) ada di file
`CARA-DEPLOY-RAILWAY.md` pada folder ini.

⚠️ Catatan: platform gratis biasanya punya **filesystem sementara** (reset saat redeploy).
Untuk keamanan data jangka panjang, lakukan backup rutin lewat tombol **Unduh CSV** di
halaman admin, atau upgrade ke paket dengan disk persisten / gunakan database (lihat catatan di bawah).

### 2. VPS sendiri (paling stabil untuk pemakaian jangka panjang)
1. Upload folder ke server (misalnya lewat `scp` atau Git).
2. Install Node.js, lalu jalankan:
   ```bash
   npm install
   ADMIN_PASSWORD="password-rahasia-anda" pm2 start server.js --name survei-dosen
   ```
3. Arahkan domain/subdomain ke server memakai reverse proxy (Nginx) ke port 3000.

### 3. Shared hosting berbasis cPanel dengan dukungan Node.js
Banyak hosting Indonesia (Niagahoster, DomaiNesia, dll.) kini punya menu **Setup Node.js App**.
Upload folder ini, atur *Application Root* ke folder `survei-dosen`, *Application Startup File*
ke `server.js`, lalu jalankan `npm install` dari terminal cPanel.

## Menambah / Mengubah Data Kelas & Dosen

Edit `data/classdata.json`. Formatnya:

```json
{
  "kode": "MN 3 B",
  "label": "MN 23 Reg Sore",
  "prodi": "Manajemen",
  "dosen": ["Nama Dosen 1", "Nama Dosen 2", "..."]
}
```

Data ini sudah dibuat otomatis dari `Jadwal_UAS_Genap_TA_2025-2026.docx` yang Anda kirim
(setiap kelas hanya berisi dosen unik yang benar-benar mengajar di kelas tersebut).
Jika jadwal berubah semester depan, cukup update file ini — tidak perlu mengubah kode.

## Mengubah Pertanyaan Kuesioner

Edit `data/questions.json` — setiap dimensi punya `judul`, `deskripsi`, dan daftar `items`.
Urutan `no` di dalam `items` harus tetap berurutan 1–19 karena dipakai untuk validasi
dan penyimpanan jawaban.

## Melihat & Mengekspor Hasil

Buka `/admin`, masukkan password. Dasbor menampilkan:

- **KPI ringkas**: total pengisian survei, total penilaian, jumlah dosen dinilai, rata-rata skor institusi.
- **Grafik batang rata-rata per dosen** (bisa diklik untuk membuka detail).
- **Radar chart rata-rata per dimensi** (Reliability, Responsiveness, Assurance, Empathy) tingkat institusi.
- **Doughnut chart kategori kepuasan** (Sangat Baik / Baik / Cukup / Perlu Perhatian).
- **Distribusi nilai 1–5** seluruh jawaban.
- **Grafik rata-rata per kelas.**
- **Filter Program Studi** yang memperbarui semua grafik & tabel.
- **Tabel rekap per dosen** — klik baris untuk melihat detail per item pertanyaan (Q1–Q19),
  radar per dimensi untuk dosen tersebut, dan seluruh saran/kritik mahasiswa untuk dosen itu.

### Export ke Excel (.xlsx)

Klik **⬇ Unduh Excel (.xlsx)** untuk mendapatkan file Excel asli (bukan sekadar CSV),
berisi 6 sheet siap pakai:

1. **Ringkasan Institusi** — total responden, rata-rata institusi, rata-rata per dimensi, distribusi kategori kepuasan, rata-rata per kelas (dengan color-scale otomatis).
2. **Ringkasan Per Dosen** — rata-rata per dimensi + rata-rata keseluruhan + kategori, dengan filter/autofilter aktif dan color-scale pada kolom rata-rata.
3. **Detail Per Item** — rata-rata tiap dosen untuk ke-19 pertanyaan (Q1–Q19), lengkap dengan teks lengkap tiap pertanyaan di bagian bawah sheet sebagai keterangan.
4. **Distribusi Nilai** — jumlah jawaban 1–5 per dosen.
5. **Saran & Kritik** — seluruh masukan terbuka mahasiswa per dosen, per kelas, dengan waktu pengisian.
6. **Data Mentah** — satu baris per mahasiswa per dosen (semua 19 skor + saran), dengan autofilter, cocok untuk pivot table lanjutan di Excel.

File ini bisa langsung dibuka di Excel/Google Sheets, atau dijadikan dasar PivotChart
tambahan sesuai kebutuhan LPMI.

Tombol **⬇ CSV Mentah** tetap tersedia sebagai alternatif ekspor ringan (data mentah saja).

## Catatan Teknis

- Data disimpan sebagai file JSON (`data/responses.json`) dengan mekanisme antrian tulis
  sederhana untuk mencegah tabrakan saat banyak mahasiswa submit bersamaan. Cocok untuk
  skala ratusan–ribuan responden per periode survei. Jika ke depan volumenya sangat besar
  atau butuh multi-server, tinggal ganti `readJSON`/`queueWrite` di `server.js` dengan
  koneksi database (SQLite/PostgreSQL) — struktur endpoint API tidak perlu berubah.
- Survei bersifat **anonim** — tidak ada field nama/email/NIM yang disimpan, sesuai
  permintaan.
- Tidak ada pembatasan satu submit per mahasiswa (tidak ada login). Jika ke depan
  dibutuhkan pencegahan submit ganda, bisa ditambahkan mekanisme device fingerprint/token
  sekali pakai per kelas.
