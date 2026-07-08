# Cara Push ke GitHub & Deploy ke Railway

## Bagian 1 — Upload ke GitHub

### 1. Buat repo baru di GitHub
Buka [github.com/new](https://github.com/new):
- Repository name: misalnya `survei-dosen-instbunas`
- Pilih **Private** (disarankan, karena ada password admin & data institusi)
- **Jangan** centang "Add a README file" (folder ini sudah punya)
- Klik **Create repository**

Setelah dibuat, GitHub akan menampilkan URL repo, contoh:
```
https://github.com/USERNAME/survei-dosen-instbunas.git
```

### 2. Push dari komputer Anda
Buka terminal di folder project ini (`survei-dosen/`), lalu jalankan:

```bash
git init
git add .
git commit -m "Initial commit: survei kinerja dosen INSTBUNAS"
git branch -M main
git remote add origin https://github.com/USERNAME/survei-dosen-instbunas.git
git push -u origin main
```

Ganti `USERNAME` dengan username GitHub Anda. Saat `git push`, Anda akan diminta
login — kalau GitHub minta password dan gagal, itu karena GitHub sudah tidak
menerima password akun biasa lewat terminal; gunakan salah satu dari:
- **GitHub Desktop** (aplikasi GUI, paling mudah untuk pemula — tinggal login lalu klik "Publish repository"), atau
- **Personal Access Token** sebagai pengganti password ([panduan resmi GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens))

File `node_modules/` dan `data/responses.json` (kalau nanti sudah ada isinya)
sudah otomatis diabaikan lewat `.gitignore`, jadi tidak ikut ter-upload.

## Bagian 2 — Deploy ke Railway

### 1. Buat akun & project
Buka [railway.app](https://railway.app) → login pakai akun GitHub Anda (paling mudah,
langsung terhubung).

### 2. Deploy dari GitHub repo
- Klik **New Project** → **Deploy from GitHub repo**
- Pilih repo `survei-dosen-instbunas` yang tadi di-push
- Railway otomatis mendeteksi ini project Node.js dan menjalankan `npm install && npm start`

### 3. Set environment variable (WAJIB — ganti password admin)
Di dashboard Railway, buka tab **Variables** pada service Anda, tambahkan:
- `ADMIN_PASSWORD` = password rahasia pilihan Anda

Tanpa ini, password admin masih default `admin123` — **jangan dibiarkan** kalau
sudah dipakai publik.

### 4. Ambil URL publik
Buka tab **Settings** pada service → bagian **Networking** → klik **Generate Domain**.
Railway akan memberi URL publik, contoh:
```
https://survei-dosen-instbunas-production.up.railway.app
```

- Link untuk mahasiswa: URL tersebut langsung (halaman survei)
- Link untuk admin: tambahkan `/admin` di belakangnya

### 5. Redeploy otomatis
Setiap kali Anda `git push` perubahan baru ke branch `main`, Railway otomatis
build & deploy ulang — tidak perlu langkah manual lagi.

## ⚠️ Catatan penting: penyimpanan data di Railway

Railway (paket gratis/hobby) memakai **filesystem sementara** — artinya isi
`data/responses.json` (hasil survei mahasiswa) **akan hilang setiap kali service
di-redeploy atau restart**.

Untuk data survei yang aman dalam jangka panjang, lakukan salah satu:

1. **Backup rutin** — buka `/admin`, klik **⬇ Unduh Excel (.xlsx)** atau **⬇ CSV Mentah**
   secara berkala (misalnya tiap malam / tiap minggu) selama periode survei berjalan,
   lalu simpan filenya.
2. **Upgrade ke Railway Volume** (disk persisten) — di tab **Settings** service, ada
   opsi **Volumes**, mount ke path `/app/data` supaya `responses.json` tidak hilang
   saat redeploy. ini opsi paling aman kalau surveinya berjalan lama/berkelanjutan.
3. **Pindah ke database** (opsional, untuk skala besar) — ganti `readJSON`/`queueWrite`
   di `server.js` dengan koneksi database seperti PostgreSQL (Railway juga menyediakan
   Postgres sebagai add-on satu klik). Struktur endpoint API tidak perlu berubah.

Untuk pemakaian survei per-semester dengan periode pengisian singkat (beberapa hari–minggu),
opsi 1 (backup manual) biasanya sudah cukup.
