const ExcelJS = require('exceljs');

const NAVY = 'FF16294A';
const GOLD = 'FFB8912F';
const CREAM = 'FFF6F3EC';

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };
  });
  row.height = 28;
}

function addColorScale(ws, range) {
  ws.addConditionalFormatting({
    ref: range,
    rules: [{
      type: 'colorScale',
      cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
      color: [{ argb: 'FFF3AFAF' }, { argb: 'FFFCECA0' }, { argb: 'FFA9D9B4' }]
    }]
  });
}

async function buildWorkbook(analytics, questions, responses) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Survei Kinerja Dosen - LPMI INSTBUNAS';
  wb.created = new Date();

  // ================= SHEET 1: Ringkasan Institusi =================
  const wsOverview = wb.addWorksheet('Ringkasan Institusi', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  wsOverview.mergeCells('A1:D1');
  wsOverview.getCell('A1').value = 'RINGKASAN SURVEI KINERJA DOSEN — LPMI INSTBUNAS';
  wsOverview.getCell('A1').font = { bold: true, size: 14, color: { argb: NAVY } };
  wsOverview.getRow(1).height = 24;

  wsOverview.getCell('A3').value = 'Total Pengisian Survei (per kelas)';
  wsOverview.getCell('B3').value = analytics.overview.totalSubmission;
  wsOverview.getCell('A4').value = 'Total Penilaian Dosen (dosen x responden)';
  wsOverview.getCell('B4').value = analytics.overview.totalPenilaian;
  wsOverview.getCell('A5').value = 'Total Dosen Dinilai';
  wsOverview.getCell('B5').value = analytics.overview.totalDosen;
  wsOverview.getCell('A6').value = 'Rata-rata Keseluruhan Institusi (skala 1-5)';
  wsOverview.getCell('B6').value = analytics.overview.rataInstitusi;
  ['A3', 'A4', 'A5', 'A6'].forEach((c) => { wsOverview.getCell(c).font = { bold: true }; });

  wsOverview.getCell('A8').value = 'RATA-RATA PER DIMENSI (INSTITUSI)';
  wsOverview.getCell('A8').font = { bold: true, color: { argb: NAVY } };
  let rIdx = 9;
  Object.values(analytics.overview.rataPerDimensiInstitusi).forEach((d) => {
    wsOverview.getCell(`A${rIdx}`).value = d.judul;
    wsOverview.getCell(`B${rIdx}`).value = d.rata;
    rIdx++;
  });

  rIdx += 1;
  wsOverview.getCell(`A${rIdx}`).value = 'DISTRIBUSI KATEGORI KEPUASAN (per dosen)';
  wsOverview.getCell(`A${rIdx}`).font = { bold: true, color: { argb: NAVY } };
  rIdx++;
  const kategoriLabel = {
    sangatBaik: 'Sangat Baik (≥4.5)',
    baik: 'Baik (3.5–4.49)',
    cukup: 'Cukup (2.5–3.49)',
    perluPerhatian: 'Perlu Perhatian (<2.5)'
  };
  Object.entries(analytics.overview.distribusiKepuasan).forEach(([k, v]) => {
    wsOverview.getCell(`A${rIdx}`).value = kategoriLabel[k];
    wsOverview.getCell(`B${rIdx}`).value = v;
    rIdx++;
  });

  rIdx += 1;
  wsOverview.getCell(`A${rIdx}`).value = 'RATA-RATA PER KELAS';
  wsOverview.getCell(`A${rIdx}`).font = { bold: true, color: { argb: NAVY } };
  rIdx++;
  const kelasHeaderRow = wsOverview.getRow(rIdx);
  kelasHeaderRow.getCell(1).value = 'Kelas';
  kelasHeaderRow.getCell(2).value = 'Program Studi';
  kelasHeaderRow.getCell(3).value = 'Jumlah Responden';
  kelasHeaderRow.getCell(4).value = 'Rata-rata';
  styleHeaderRow(kelasHeaderRow);
  rIdx++;
  const kelasStartRow = rIdx;
  analytics.overview.perKelas.forEach((k) => {
    wsOverview.getCell(`A${rIdx}`).value = k.kelas;
    wsOverview.getCell(`B${rIdx}`).value = k.prodi;
    wsOverview.getCell(`C${rIdx}`).value = k.jumlahResponden;
    wsOverview.getCell(`D${rIdx}`).value = k.rataRata;
    rIdx++;
  });
  if (rIdx - 1 >= kelasStartRow) addColorScale(wsOverview, `D${kelasStartRow}:D${rIdx - 1}`);

  wsOverview.columns = [{ width: 34 }, { width: 22 }, { width: 18 }, { width: 14 }];

  // ================= SHEET 2: Ringkasan Per Dosen =================
  const wsDosen = wb.addWorksheet('Ringkasan Per Dosen', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const dimKodes = analytics.dimensiInfo.map((d) => d.kode);
  const header = ['Nama Dosen', 'Program Studi', 'Kelas', 'Jumlah Responden',
    ...analytics.dimensiInfo.map((d) => d.judul), 'Rata-rata Keseluruhan', 'Kategori'];
  const headerRow = wsDosen.addRow(header);
  styleHeaderRow(headerRow);

  const dosenStartRow = 2;
  analytics.dosen.forEach((d) => {
    wsDosen.addRow([
      d.dosen,
      d.prodi,
      d.kelas,
      d.jumlahResponden,
      ...dimKodes.map((k) => d.rataPerDimensi[k].rata),
      d.rataKeseluruhan,
      kategoriLabel[d.kategori]
    ]);
  });
  const dosenEndRow = dosenStartRow + analytics.dosen.length - 1;
  if (dosenEndRow >= dosenStartRow) {
    const overallCol = String.fromCharCode('A'.charCodeAt(0) + 4 + dimKodes.length);
    addColorScale(wsDosen, `${overallCol}${dosenStartRow}:${overallCol}${dosenEndRow}`);
  }
  wsDosen.columns = [
    { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 },
    ...dimKodes.map(() => ({ width: 16 })),
    { width: 18 }, { width: 18 }
  ];
  wsDosen.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + header.length)}1` };

  // ================= SHEET 3: Detail Per Item Pertanyaan =================
  const wsItem = wb.addWorksheet('Detail Per Item', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  const itemHeader = ['Nama Dosen', ...questions.dimensions.flatMap((d) =>
    d.items.map((it) => `Q${it.no}`))];
  const itemHeaderRow = wsItem.addRow(itemHeader);
  styleHeaderRow(itemHeaderRow);
  analytics.dosen.forEach((d) => {
    wsItem.addRow([d.dosen, ...d.rataPerItem]);
  });
  wsItem.columns = [{ width: 32 }, ...itemHeader.slice(1).map(() => ({ width: 8 }))];
  const itemEndRow = 1 + analytics.dosen.length;
  if (itemEndRow >= 2) {
    addColorScale(wsItem, `B2:${String.fromCharCode(65 + itemHeader.length - 1)}${itemEndRow}`);
  }

  // Legenda pertanyaan di baris bawah
  let legendRow = itemEndRow + 3;
  wsItem.getCell(`A${legendRow}`).value = 'KETERANGAN NOMOR PERTANYAAN';
  wsItem.getCell(`A${legendRow}`).font = { bold: true, color: { argb: NAVY } };
  legendRow++;
  questions.dimensions.forEach((d) => {
    wsItem.getCell(`A${legendRow}`).value = d.judul;
    wsItem.getCell(`A${legendRow}`).font = { bold: true };
    legendRow++;
    d.items.forEach((it) => {
      wsItem.getCell(`A${legendRow}`).value = `Q${it.no} — ${it.teks}`;
      legendRow++;
    });
  });

  // ================= SHEET 4: Distribusi Nilai (1-5) =================
  const wsDist = wb.addWorksheet('Distribusi Nilai');
  const distHeader = wsDist.addRow(['Nama Dosen', '1 (Tidak Baik)', '2', '3', '4', '5 (Sangat Baik)', 'Total Jawaban']);
  styleHeaderRow(distHeader);
  analytics.dosen.forEach((d) => {
    const total = [1, 2, 3, 4, 5].reduce((a, v) => a + (d.distribusi[v] || 0), 0);
    wsDist.addRow([d.dosen, d.distribusi[1] || 0, d.distribusi[2] || 0, d.distribusi[3] || 0,
      d.distribusi[4] || 0, d.distribusi[5] || 0, total]);
  });
  wsDist.columns = [{ width: 32 }, { width: 15 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 15 }, { width: 14 }];

  // ================= SHEET 5: Saran & Kritik =================
  const wsSaran = wb.addWorksheet('Saran & Kritik');
  const saranHeader = wsSaran.addRow(['Nama Dosen', 'Kelas', 'Waktu', 'Saran / Kritik Mahasiswa']);
  styleHeaderRow(saranHeader);
  analytics.dosen.forEach((d) => {
    d.saranList.forEach((s) => {
      wsSaran.addRow([d.dosen, s.kelas, new Date(s.waktu).toLocaleString('id-ID'), s.teks]);
    });
  });
  wsSaran.columns = [{ width: 32 }, { width: 14 }, { width: 20 }, { width: 70 }];
  wsSaran.getColumn(4).alignment = { wrapText: true, vertical: 'top' };

  // ================= SHEET 6: Data Mentah =================
  const wsRaw = wb.addWorksheet('Data Mentah', { views: [{ state: 'frozen', ySplit: 1 }] });
  const rawHeader = ['Waktu', 'Program Studi', 'Kelas', 'Nama Dosen',
    ...Array.from({ length: 19 }, (_, i) => `Q${i + 1}`), 'Saran / Kritik'];
  const rawHeaderRow = wsRaw.addRow(rawHeader);
  styleHeaderRow(rawHeaderRow);

  responses.forEach((r) => {
    r.penilaian.forEach((p) => {
      wsRaw.addRow([
        new Date(r.waktu).toLocaleString('id-ID'),
        r.prodi,
        r.kelas,
        p.dosen,
        ...p.jawaban,
        p.saran || ''
      ]);
    });
  });
  wsRaw.columns = [
    { width: 20 }, { width: 18 }, { width: 14 }, { width: 32 },
    ...Array.from({ length: 19 }, () => ({ width: 6 })),
    { width: 40 }
  ];
  wsRaw.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + rawHeader.length > 90 ? 90 : 64 + rawHeader.length)}1` };
  wsRaw.getColumn(rawHeader.length).alignment = { wrapText: true, vertical: 'top' };

  return wb;
}

module.exports = { buildWorkbook };
