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

/**
 * Skor netral berbasis batas bawah interval kepercayaan (Wilson score untuk
 * rating bintang, metode Evan Miller — "How Not To Sort By Average Rating").
 * Berbeda dari skor tertimbang (yang hanya mempertimbangkan JUMLAH responden),
 * metode ini mempertimbangkan seluruh SEBARAN nilai (1-5) yang diterima dosen,
 * termasuk konsistensinya. Tidak ada parameter arbitrer (seperti "m") yang
 * perlu dipilih manual — z adalah tingkat keyakinan statistik standar.
 *   counts = [n1,n2,n3,n4,n5] -> jumlah jawaban per nilai 1..5
 *   z = 1.65 setara ~95% confidence satu sisi (semakin besar z, semakin
 *       konservatif/menuntut data lebih banyak sebelum skor tinggi dipercaya)
 */
function wilsonStarScore(counts, z = 1.65) {
  const K = counts.length;
  const N = counts.reduce((a, b) => a + b, 0);
  if (N === 0) return 0;
  let mean = 0;
  for (let k = 0; k < K; k++) {
    const s = k + 1;
    mean += s * ((counts[k] + 1) / (N + K));
  }
  let variance = 0;
  for (let k = 0; k < K; k++) {
    const s = k + 1;
    const p = (counts[k] + 1) / (N + K);
    variance += p * Math.pow(s - mean, 2);
  }
  const se = Math.sqrt(variance / (N + K + 1));
  return mean - z * se;
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
    // Versi presisi penuh (dari total mentah, tanpa pembulatan per-item lebih dulu)
    // dipakai untuk SORTING & perhitungan skor, supaya tidak banyak dosen "kembar"
    // nilai gara-gara pembulatan 2 desimal. rataKeseluruhan (dibulatkan) tetap
    // dipakai untuk apa yang ditampilkan ke layar.
    const totalSemuaItem = s.totalPerItem.reduce((a, b) => a + b, 0);
    const rataKeseluruhanRaw = totalSemuaItem / (s.jumlahResponden * s.totalPerItem.length);

    return {
      dosen: s.dosen,
      kelas: Array.from(s.kelasSet).join(', '),
      prodi: Array.from(s.prodiSet).join(', '),
      jumlahResponden: s.jumlahResponden,
      rataPerItem,
      rataPerDimensi,
      rataKeseluruhan,
      rataKeseluruhanRaw,
      distribusi: s.distribusi,
      kategori: bucketOf(rataKeseluruhan),
      saranList: s.saranList
    };
  }).sort((a, b) => b.rataKeseluruhanRaw - a.rataKeseluruhanRaw);

  // ---- Skor tertimbang (mengatasi bias sampel kecil) ----
  // Dosen dengan sedikit responden (mis. 1-2 orang) bisa punya rata-rata sempurna
  // hanya karena kebetulan, sehingga tidak adil jika langsung mengalahkan dosen
  // dengan puluhan responden. Kita "tarik" skor ke rata-rata institusi (C) secara
  // proporsional terhadap kekurangan datanya, memakai formula weighted rating
  // (mirip IMDB): WR = (v/(v+m))*R + (m/(v+m))*C
  //   R = rata-rata dosen ybs, v = jumlah responden dosen ybs
  //   m = jumlah responden "normal"/tipikal (median semua dosen)
  //   C = rata-rata seluruh dosen
  const totalDosenAwal = dosenResult.length;
  const semuaRata = dosenResult.map((d) => d.rataKeseluruhanRaw);
  const semuaN = dosenResult.map((d) => d.jumlahResponden).sort((a, b) => a - b);
  const C = totalDosenAwal
    ? semuaRata.reduce((a, b) => a + b, 0) / totalDosenAwal
    : 0;
  const mid = Math.floor(semuaN.length / 2);
  const m = semuaN.length
    ? (semuaN.length % 2 ? semuaN[mid] : (semuaN[mid - 1] + semuaN[mid]) / 2)
    : 0;

  const WILSON_Z = 1.65; // ~95% confidence satu sisi
  dosenResult.forEach((d) => {
    const v = d.jumlahResponden;
    d.skorTertimbangRaw = m
      ? ((v / (v + m)) * d.rataKeseluruhanRaw) + ((m / (v + m)) * C)
      : d.rataKeseluruhanRaw;
    d.skorTertimbang = +d.skorTertimbangRaw.toFixed(2);
    d.dataTerbatas = v < m; // penanda: jumlah responden di bawah "normal"

    const counts = [1, 2, 3, 4, 5].map((val) => d.distribusi[val] || 0);
    d.skorNetralRaw = wilsonStarScore(counts, WILSON_Z);
    d.skorNetral = +d.skorNetralRaw.toFixed(3);
  });

  // Ranking utama memakai skor netral (Wilson) — lihat catatan wilsonStarScore().
  dosenResult.sort((a, b) => b.skorNetralRaw - a.skorNetralRaw);

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
      perKelas,
      skorTertimbangInfo: { m, c: C },
      skorNetralInfo: { z: WILSON_Z }
    },
    dosen: dosenResult,
    dimensiInfo: dims.map((d) => ({ kode: d.kode, judul: d.judul }))
  };
}

module.exports = { buildAnalytics, readJSON, RESPONSES_FILE, QUESTIONS_FILE, CLASS_FILE };
