const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const RESPONSES_FILE = path.join(DATA_DIR, 'responses.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const CLASS_FILE = path.join(DATA_DIR, 'classdata.json');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function getDimensionMap() {
  const q = readJSON(QUESTIONS_FILE);
  // [{kode, judul, indices:[0-based idx into jawaban[]]}]
  return q.dimensions.map((d) => ({
    kode: d.kode,
    judul: d.judul,
    indices: d.items.map((it) => it.no - 1)
  }));
}

function bucketOf(rata) {
  if (rata >= 4.5) return 'sangatBaik';
  if (rata >= 3.5) return 'baik';
  if (rata >= 2.5) return 'cukup';
  return 'perluPerhatian';
}

/**
 * Bangun ringkasan lengkap: per-dosen (rata2 keseluruhan, per dimensi, per item,
 * distribusi nilai, daftar saran) + ringkasan tingkat institusi.
 */
function buildAnalytics() {
  const responses = readJSON(RESPONSES_FILE);
  const dims = getDimensionMap();
  const classData = readJSON(CLASS_FILE);
  const prodiByKode = {};
  classData.forEach((c) => { prodiByKode[c.kode] = c.prodi; });

  const perDosen = {}; // dosen -> agg

  for (const r of responses) {
    for (const p of r.penilaian) {
      if (!perDosen[p.dosen]) {
        perDosen[p.dosen] = {
          dosen: p.dosen,
          kelasSet: new Set(),
          prodiSet: new Set(),
          jumlahResponden: 0,
          totalPerItem: new Array(19).fill(0),
          distribusi: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          saranList: []
        };
      }
      const s = perDosen[p.dosen];
      s.jumlahResponden += 1;
      s.kelasSet.add(r.kelas);
      s.prodiSet.add(r.prodi || prodiByKode[r.kelas] || '');
      p.jawaban.forEach((v, idx) => {
        s.totalPerItem[idx] += v;
        s.distribusi[v] = (s.distribusi[v] || 0) + 1;
      });
      if (p.saran && p.saran.trim()) {
        s.saranList.push({ kelas: r.kelas, waktu: r.waktu, teks: p.saran.trim() });
      }
    }
  }

  const dosenResult = Object.values(perDosen).map((s) => {
    const rataPerItem = s.totalPerItem.map((t) => +(t / s.jumlahResponden).toFixed(2));
    const rataPerDimensi = {};
    dims.forEach((d) => {
      const vals = d.indices.map((i) => rataPerItem[i]);
      rataPerDimensi[d.kode] = {
        judul: d.judul,
        rata: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
      };
    });
    const rataKeseluruhan = +(rataPerItem.reduce((a, b) => a + b, 0) / rataPerItem.length).toFixed(2);

    return {
      dosen: s.dosen,
      kelas: Array.from(s.kelasSet).join(', '),
      prodi: Array.from(s.prodiSet).join(', '),
      jumlahResponden: s.jumlahResponden,
      rataPerItem,
      rataPerDimensi,
      rataKeseluruhan,
      distribusi: s.distribusi,
      kategori: bucketOf(rataKeseluruhan),
      saranList: s.saranList
    };
  }).sort((a, b) => b.rataKeseluruhan - a.rataKeseluruhan);

  // ---- Ringkasan tingkat institusi ----
  const totalPenilaian = dosenResult.reduce((a, d) => a + d.jumlahResponden, 0);
  const totalSubmission = responses.length;
  const totalDosen = dosenResult.length;

  const rataInstitusi = totalDosen
    ? +(dosenResult.reduce((a, d) => a + d.rataKeseluruhan, 0) / totalDosen).toFixed(2)
    : 0;

  const rataPerDimensiInstitusi = {};
  dims.forEach((d) => {
    const vals = dosenResult.map((x) => x.rataPerDimensi[d.kode].rata);
    rataPerDimensiInstitusi[d.kode] = {
      judul: d.judul,
      rata: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 0
    };
  });

  const distribusiKepuasan = { sangatBaik: 0, baik: 0, cukup: 0, perluPerhatian: 0 };
  dosenResult.forEach((d) => { distribusiKepuasan[d.kategori] += 1; });

  const distribusiNilaiInstitusi = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  dosenResult.forEach((d) => {
    for (let v = 1; v <= 5; v++) distribusiNilaiInstitusi[v] += d.distribusi[v] || 0;
  });

  const perKelasMap = {};
  responses.forEach((r) => {
    if (!perKelasMap[r.kelas]) {
      perKelasMap[r.kelas] = { kelas: r.kelas, prodi: r.prodi, jumlahResponden: 0, totalSkor: 0, totalItem: 0 };
    }
    const k = perKelasMap[r.kelas];
    k.jumlahResponden += 1;
    r.penilaian.forEach((p) => {
      p.jawaban.forEach((v) => { k.totalSkor += v; k.totalItem += 1; });
    });
  });
  const perKelas = Object.values(perKelasMap).map((k) => ({
    kelas: k.kelas,
    prodi: k.prodi,
    jumlahResponden: k.jumlahResponden,
    rataRata: k.totalItem ? +(k.totalSkor / k.totalItem).toFixed(2) : 0
  })).sort((a, b) => a.kelas.localeCompare(b.kelas));

  return {
    overview: {
      totalSubmission,
      totalPenilaian,
      totalDosen,
      rataInstitusi,
      rataPerDimensiInstitusi,
      distribusiKepuasan,
      distribusiNilaiInstitusi,
      perKelas
    },
    dosen: dosenResult,
    dimensiInfo: dims.map((d) => ({ kode: d.kode, judul: d.judul }))
  };
}

module.exports = { buildAnalytics, readJSON, RESPONSES_FILE, QUESTIONS_FILE, CLASS_FILE };
