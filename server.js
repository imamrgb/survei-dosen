const express = require('express');
const fs = require('fs');
const path = require('path');
const { buildAnalytics } = require('./analytics');
const { buildWorkbook } = require('./excelExport');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // GANTI PASSWORD INI!

const DATA_DIR = path.join(__dirname, 'data');
const CLASS_FILE = path.join(DATA_DIR, 'classdata.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const RESPONSES_FILE = path.join(DATA_DIR, 'responses.json');

// Pastikan file responses.json ada
if (!fs.existsSync(RESPONSES_FILE)) {
  fs.writeFileSync(RESPONSES_FILE, '[]', 'utf-8');
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Simple write mutex (mencegah race condition saat banyak submit bersamaan) ----------
let writeLock = Promise.resolve();
function queueWrite(task) {
  // 'result' is this task's own outcome (so the caller can catch its specific error).
  const result = writeLock.then(task);
  // The shared chain always continues (even after a failure) so one bad write
  // doesn't permanently block future writes.
  writeLock = result.catch(() => {});
  return result;
}

// ---------- Helper ----------
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ---------- Public API ----------

// Daftar kelas + dosen per kelas (dari jadwal)
app.get('/api/classes', (req, res) => {
  try {
    res.json(readJSON(CLASS_FILE));
  } catch (e) {
    res.status(500).json({ error: 'Gagal memuat data kelas' });
  }
});

// Struktur pertanyaan kuesioner
app.get('/api/questions', (req, res) => {
  try {
    res.json(readJSON(QUESTIONS_FILE));
  } catch (e) {
    res.status(500).json({ error: 'Gagal memuat data pertanyaan' });
  }
});

// Validasi payload prodi/kelas/penilaian (dipakai submit publik & edit admin)
function validateSubmission(body) {
  const { prodi, kelas, penilaian } = body || {};
  if (!prodi || !kelas || !Array.isArray(penilaian) || penilaian.length === 0) {
    return 'Data tidak lengkap';
  }
  for (const p of penilaian) {
    if (!p.dosen || !Array.isArray(p.jawaban) || p.jawaban.length !== 19) {
      return 'Data penilaian dosen tidak valid';
    }
    for (const j of p.jawaban) {
      if (typeof j !== 'number' || j < 1 || j > 5) {
        return 'Nilai jawaban harus 1-5';
      }
    }
  }
  return null;
}

// Terima submit hasil survei
app.post('/api/submit', (req, res) => {
  const errMsg = validateSubmission(req.body);
  if (errMsg) {
    return res.status(400).json({ error: errMsg });
  }
  const { prodi, kelas, penilaian } = req.body;

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    waktu: new Date().toISOString(),
    prodi,
    kelas,
    penilaian
  };

  queueWrite(() => {
    const current = readJSON(RESPONSES_FILE);
    current.push(entry);
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(current, null, 2), 'utf-8');
  }).catch((err) => console.error('Write error:', err));

  res.json({ ok: true, message: 'Terima kasih, survei berhasil dikirim.' });
});

// ---------- Admin API (butuh token / password) ----------

// Ambil semua data mentah
app.get('/api/admin/responses', requireAdmin, (req, res) => {
  try {
    res.json(readJSON(RESPONSES_FILE));
  } catch (e) {
    res.status(500).json({ error: 'Gagal memuat data' });
  }
});

// Hapus satu pengisian survei (satu mahasiswa) sepenuhnya
app.delete('/api/admin/responses/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  queueWrite(() => {
    const current = readJSON(RESPONSES_FILE);
    const next = current.filter((r) => r.id !== id);
    if (next.length === current.length) {
      throw Object.assign(new Error('not found'), { notFound: true });
    }
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(next, null, 2), 'utf-8');
  })
    .then(() => res.json({ ok: true }))
    .catch((e) => {
      if (e && e.notFound) return res.status(404).json({ error: 'Data tidak ditemukan' });
      res.status(500).json({ error: 'Gagal menghapus data' });
    });
});

// Edit satu pengisian survei (prodi/kelas/penilaian) — mis. perbaikan salah pilih kelas/dosen atau nilai
app.put('/api/admin/responses/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const errMsg = validateSubmission(req.body);
  if (errMsg) {
    return res.status(400).json({ error: errMsg });
  }
  const { prodi, kelas, penilaian } = req.body;

  queueWrite(() => {
    const current = readJSON(RESPONSES_FILE);
    const idx = current.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw Object.assign(new Error('not found'), { notFound: true });
    }
    current[idx] = {
      ...current[idx],
      prodi,
      kelas,
      penilaian,
      editedAt: new Date().toISOString()
    };
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(current, null, 2), 'utf-8');
  })
    .then(() => res.json({ ok: true }))
    .catch((e) => {
      if (e && e.notFound) return res.status(404).json({ error: 'Data tidak ditemukan' });
      res.status(500).json({ error: 'Gagal menyimpan perubahan' });
    });
});

// Hapus satu penilaian dosen saja dari sebuah pengisian (tanpa menghapus seluruh pengisian)
app.delete('/api/admin/responses/:id/penilaian/:index', requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = Number(req.params.index);

  queueWrite(() => {
    const current = readJSON(RESPONSES_FILE);
    const idx = current.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw Object.assign(new Error('not found'), { notFound: true });
    }
    const entry = current[idx];
    if (!Number.isInteger(index) || index < 0 || index >= entry.penilaian.length) {
      throw Object.assign(new Error('bad index'), { badIndex: true });
    }
    entry.penilaian.splice(index, 1);
    entry.editedAt = new Date().toISOString();
    // Jika tidak ada lagi penilaian dosen tersisa, hapus seluruh pengisian
    const next = entry.penilaian.length === 0
      ? current.filter((r) => r.id !== id)
      : current;
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(next, null, 2), 'utf-8');
  })
    .then(() => res.json({ ok: true }))
    .catch((e) => {
      if (e && e.notFound) return res.status(404).json({ error: 'Data tidak ditemukan' });
      if (e && e.badIndex) return res.status(400).json({ error: 'Index penilaian tidak valid' });
      res.status(500).json({ error: 'Gagal menghapus penilaian dosen' });
    });
});

// Ringkasan rata-rata per dosen (dipertahankan untuk kompatibilitas mundur)
app.get('/api/admin/summary', requireAdmin, (req, res) => {
  try {
    const analytics = buildAnalytics();
    res.json(analytics.dosen);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal membuat ringkasan' });
  }
});

// Analitik lengkap: overview institusi + per dosen + info dimensi (dipakai dasbor visual)
app.get('/api/admin/analytics', requireAdmin, (req, res) => {
  try {
    res.json(buildAnalytics());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal membuat analitik' });
  }
});

// Export ke file Excel (.xlsx) asli — multi-sheet, berwarna, siap dianalisis
app.get('/api/admin/export.xlsx', requireAdmin, async (req, res) => {
  try {
    const analytics = buildAnalytics();
    const questions = readJSON(QUESTIONS_FILE);
    const responses = readJSON(RESPONSES_FILE);
    const wb = await buildWorkbook(analytics, questions, responses);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="hasil_survei_dosen.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal membuat file Excel' });
  }
});

// Export CSV (data mentah per dosen per mahasiswa)
app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  try {
    const responses = readJSON(RESPONSES_FILE);
    const header = ['waktu', 'prodi', 'kelas', 'dosen',
      ...Array.from({ length: 19 }, (_, i) => `Q${i + 1}`), 'saran'];
    const rows = [header.join(',')];

    for (const r of responses) {
      for (const p of r.penilaian) {
        const row = [
          r.waktu,
          csvEscape(r.prodi),
          csvEscape(r.kelas),
          csvEscape(p.dosen),
          ...p.jawaban,
          csvEscape(p.saran || '')
        ];
        rows.push(row.join(','));
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hasil_survei_dosen.csv"');
    res.send('\uFEFF' + rows.join('\n')); // BOM agar Excel baca UTF-8 dgn benar
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal export CSV' });
  }
});

function csvEscape(str) {
  const s = String(str).replace(/"/g, '""');
  return `"${s}"`;
}

// Halaman admin (butuh password di UI)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server survei dosen berjalan di http://localhost:${PORT}`);
  console.log(`Halaman admin: http://localhost:${PORT}/admin`);
});
