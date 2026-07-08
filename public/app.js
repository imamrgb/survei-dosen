// ====== State ======
const state = {
  step: 'intro', // intro | identitas | penilaian | selesai
  classes: [],
  questions: null,
  prodi: '',
  kelas: '',
  dosenList: [],
  dosenIndex: 0,
  penilaian: [] // { dosen, jawaban: [19 x number|null], saran: '' }
};

const contentEl = document.getElementById('content');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');

// ====== Bootstrap ======
async function init() {
  try {
    const [classes, questions] = await Promise.all([
      fetch('/api/classes').then(r => r.json()),
      fetch('/api/questions').then(r => r.json())
    ]);
    state.classes = classes;
    state.questions = questions;
    render();
  } catch (e) {
    contentEl.innerHTML = `<div class="error-banner">Gagal memuat data survei. Periksa koneksi lalu muat ulang halaman.</div>`;
  }
}

function setProgress(pct, label) {
  if (pct === null) {
    progressWrap.style.display = 'none';
    return;
  }
  progressWrap.style.display = 'block';
  progressFill.style.width = pct + '%';
  progressLabel.textContent = label;
}

// ====== Render router ======
function render() {
  if (state.step === 'intro') return renderIntro();
  if (state.step === 'identitas') return renderIdentitas();
  if (state.step === 'penilaian') return renderPenilaian();
  if (state.step === 'selesai') return renderSelesai();
}

// ====== Step 1: Intro ======
function renderIntro() {
  setProgress(null);
  contentEl.innerHTML = `
    <div class="kop">LPMI &middot; INSTBUNAS</div>
    <h1 class="title">Survei Kinerja Dosen INSTBUNAS<br/>Semester Genap TA 2025/2026</h1>
    <p class="desc">
      Sebagai salah satu upaya untuk menjamin proses peningkatan kualitas pembelajaran secara
      berkelanjutan di program studi Manajemen, Bisnis Digital, dan Teknologi Informasi di INSTBUNAS,
      kami memohon umpan balik (feedback) dari seluruh mahasiswa terkait kinerja dosen dalam proses
      pembelajaran (daring/luring) melalui kesediaan saudara/i menjawab beberapa pernyataan di bawah ini.
    </p>
    <p class="desc">
      Jawaban saudara/i sangat berharga bagi kemajuan kami. Survei ini bersifat <strong>anonim</strong> &mdash;
      kami tidak mengumpulkan nama atau email. Data yang saudara/i sampaikan akan dijaga kerahasiaannya.
      Untuk kerjasama yang baik serta bantuannya, kami mengucapkan terima kasih.
    </p>
    <div class="divider"></div>
    <div class="btn-row">
      <button class="btn btn-primary" id="btnStart">Mulai Survei &rarr;</button>
    </div>
  `;
  document.getElementById('btnStart').onclick = () => {
    state.step = 'identitas';
    render();
  };
}

// ====== Step 2: Identitas ======
function renderIdentitas() {
  setProgress(15, 'Langkah 1 dari 2 &middot; Identitas Responden'.replace('&middot;', '·'));

  const prodiOptions = [...new Set(state.classes.map(c => c.prodi))];

  contentEl.innerHTML = `
    <div class="kop">Identitas Responden</div>
    <h2 class="title" style="font-size:20px;">Pilih Program Studi &amp; Kelas Anda</h2>
    <p class="desc">Survei bersifat anonim. Pilihan kelas menentukan dosen mana saja yang akan Anda nilai.</p>
    <div class="divider"></div>

    <div class="field">
      <label for="prodiSelect">Program Studi</label>
      <select id="prodiSelect">
        <option value="">-- Pilih Program Studi --</option>
        ${prodiOptions.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label for="kelasSelect">Kelas</label>
      <select id="kelasSelect" disabled>
        <option value="">-- Pilih Program Studi terlebih dahulu --</option>
      </select>
    </div>

    <div id="idError"></div>

    <div class="btn-row">
      <button class="btn btn-ghost" id="btnBack">&larr; Kembali</button>
      <button class="btn btn-primary" id="btnNext" disabled>Berikutnya &rarr;</button>
    </div>
  `;

  const prodiSelect = document.getElementById('prodiSelect');
  const kelasSelect = document.getElementById('kelasSelect');
  const btnNext = document.getElementById('btnNext');

  prodiSelect.value = state.prodi;
  if (state.prodi) fillKelasOptions();

  prodiSelect.onchange = () => {
    state.prodi = prodiSelect.value;
    state.kelas = '';
    fillKelasOptions();
    checkReady();
  };

  function fillKelasOptions() {
    const list = state.classes.filter(c => c.prodi === state.prodi);
    kelasSelect.disabled = list.length === 0;
    kelasSelect.innerHTML = `<option value="">-- Pilih Kelas --</option>` +
      list.map(c => `<option value="${escapeHtml(c.kode)}">${escapeHtml(c.label)}</option>`).join('');
    kelasSelect.value = state.kelas;
  }

  kelasSelect.onchange = () => {
    state.kelas = kelasSelect.value;
    checkReady();
  };

  function checkReady() {
    btnNext.disabled = !(state.prodi && state.kelas);
  }
  checkReady();

  document.getElementById('btnBack').onclick = () => {
    state.step = 'intro';
    render();
  };

  btnNext.onclick = () => {
    const kelasObj = state.classes.find(c => c.kode === state.kelas);
    if (!kelasObj || !kelasObj.dosen.length) {
      document.getElementById('idError').innerHTML =
        `<div class="error-banner">Data dosen untuk kelas ini belum tersedia. Silakan hubungi LPMI.</div>`;
      return;
    }
    state.dosenList = kelasObj.dosen;
    state.dosenIndex = 0;
    state.penilaian = kelasObj.dosen.map(d => ({
      dosen: d,
      jawaban: new Array(19).fill(null),
      saran: ''
    }));
    state.step = 'penilaian';
    render();
  };
}

// ====== Step 3: Penilaian per dosen ======
function renderPenilaian() {
  const total = state.dosenList.length;
  const idx = state.dosenIndex;
  const current = state.penilaian[idx];
  const q = state.questions;

  const pct = 15 + Math.round(((idx) / total) * 80);
  setProgress(pct, `Menilai Dosen ${idx + 1} dari ${total}`);

  const dimensiHtml = q.dimensions.map(dim => `
    <div class="dimensi">
      <div class="dimensi-judul">${escapeHtml(dim.judul)}</div>
      <div class="dimensi-sub">${escapeHtml(dim.deskripsi)}</div>
      ${dim.items.map(item => renderLikertItem(item, current.jawaban[item.no - 1])).join('')}
    </div>
  `).join('');

  contentEl.innerHTML = `
    <div class="dosen-header">
      <div class="dosen-eyebrow">Penilaian Dosen ${idx + 1} / ${total}</div>
      <div class="dosen-name">${escapeHtml(current.dosen)}</div>
    </div>

    ${dimensiHtml}

    <div class="dimensi">
      <div class="dimensi-judul">SARAN &amp; KRITIK</div>
      <div class="field" style="margin-top:12px;">
        <label for="saranBox">${escapeHtml(q.pertanyaanSaran)}</label>
        <textarea id="saranBox" placeholder="Tulis saran Anda di sini...">${escapeHtml(current.saran)}</textarea>
      </div>
    </div>

    <div id="valError"></div>

    <div class="btn-row">
      <button class="btn btn-ghost" id="btnBack">&larr; ${idx === 0 ? 'Kembali ke Identitas' : 'Dosen Sebelumnya'}</button>
      <button class="btn btn-primary" id="btnNext">
        ${idx === total - 1 ? 'Kirim Survei' : 'Dosen Berikutnya →'}
      </button>
    </div>
  `;

  // Bind likert radios
  q.dimensions.forEach(dim => {
    dim.items.forEach(item => {
      const radios = document.getElementsByName(`item_${item.no}`);
      radios.forEach(r => {
        r.checked = current.jawaban[item.no - 1] === Number(r.value);
        r.onchange = () => {
          current.jawaban[item.no - 1] = Number(r.value);
        };
      });
    });
  });

  document.getElementById('saranBox').oninput = (e) => {
    current.saran = e.target.value;
  };

  document.getElementById('btnBack').onclick = () => {
    if (idx === 0) {
      state.step = 'identitas';
    } else {
      state.dosenIndex -= 1;
    }
    render();
  };

  document.getElementById('btnNext').onclick = () => {
    const unanswered = current.jawaban.findIndex(v => v === null);
    if (unanswered !== -1) {
      document.getElementById('valError').innerHTML =
        `<div class="error-banner">Mohon isi semua pernyataan (No. ${unanswered + 1}) sebelum melanjutkan.</div>`;
      document.querySelector(`[data-item="${unanswered + 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (idx === total - 1) {
      submitSurvey();
    } else {
      state.dosenIndex += 1;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
}

function renderLikertItem(item, currentValue) {
  return `
    <div class="item" data-item="${item.no}">
      <div class="item-text"><span class="item-no">${item.no}.</span>${escapeHtml(item.teks)}</div>
      <div class="likert">
        <span class="likert-scale-label">Tidak Baik</span>
        <div class="likert-options">
          ${[1, 2, 3, 4, 5].map(v => `
            <label class="likert-opt">
              <input type="radio" name="item_${item.no}" value="${v}" ${currentValue === v ? 'checked' : ''}/>
              <span>${v}</span>
            </label>
          `).join('')}
        </div>
        <span class="likert-scale-label right">Sangat Baik</span>
      </div>
    </div>
  `;
}

// ====== Submit ======
async function submitSurvey() {
  const btnNext = document.getElementById('btnNext');
  btnNext.disabled = true;
  btnNext.textContent = 'Mengirim...';

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prodi: state.prodi,
        kelas: state.kelas,
        penilaian: state.penilaian
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim survei');
    state.step = 'selesai';
    render();
  } catch (e) {
    document.getElementById('valError').innerHTML =
      `<div class="error-banner">${escapeHtml(e.message)}. Silakan coba lagi.</div>`;
    btnNext.disabled = false;
    btnNext.textContent = 'Kirim Survei';
  }
}

// ====== Step 4: Selesai ======
function renderSelesai() {
  setProgress(100, 'Selesai');
  contentEl.innerHTML = `
    <div class="complete-icon">✓</div>
    <h2 class="title" style="font-size:22px;">Terima kasih atas partisipasi Anda</h2>
    <p class="desc">
      Jawaban Anda telah tersimpan dan akan menjadi bagian dari evaluasi kinerja dosen
      program studi ${escapeHtml(state.prodi)} untuk kelas ${escapeHtml(labelForKelas(state.kelas))}.
      Masukan Anda membantu LPMI menjaga kualitas pembelajaran di INSTBUNAS.
    </p>
    <div class="divider"></div>
    <div class="btn-row">
      <button class="btn btn-ghost" id="btnAgain">Isi Survei Baru (Kelas Lain)</button>
    </div>
  `;
  document.getElementById('btnAgain').onclick = () => {
    state.step = 'intro';
    state.prodi = '';
    state.kelas = '';
    state.dosenList = [];
    state.dosenIndex = 0;
    state.penilaian = [];
    render();
  };
}

function labelForKelas(kode) {
  const c = state.classes.find(c => c.kode === kode);
  return c ? c.label : kode;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

init();
