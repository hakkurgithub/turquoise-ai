'use strict';
/* ============================================================
 * KELEPIR EMLAK AI - Hibrit Beyin (Web Surumu)
 * 1. Once yerel veri setinde akilli eslestirme yapar (ucretsiz, cevrimdisi)
 * 2. Bulamazsa Groq uzerinden acik kaynak LLM'e sorar (Llama 3.1)
 * Veriler: hasinder-ai-data/ klasorundeki acik kaynak JSON dosyalari
 * ============================================================ */

const VERI = {
  qa: [],
  terimler: [],
  sehirler: [],
  genelNotlar: {},
  prompt: ''
};

const GECMIS = []; // LLM icin sohbet gecmisi
const ESLESME_ESIGI = 0.45;

/* ---------- Metin Normalizasyonu (Turkce) ---------- */
const TR_HARF = { 'ı': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c', 'â': 'a', 'î': 'i', 'û': 'u' };

function normalize(metin) {
  return metin.toLocaleLowerCase('tr')
    .replace(/[ışğüöçâîû]/g, h => TR_HARF[h] || h)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'bir', 've', 'ile', 'icin', 'ne', 'nedir', 'nasil', 'mi', 'mı', 'mu', 'mü',
  'var', 'yok', 'ben', 'sen', 'o', 'bu', 'su', 'da', 'de', 'ki', 'en', 'cok',
  'ama', 'gibi', 'kadar', 'daha', 'ise', 'hakkinda', 'istiyorum', 'lutfen',
  'bana', 'bize', 'siz', 'biz', 'hangi', 'kac', 'nerede', 'olan', 'olarak',
  'sonra', 'once', 'sadece', 'yani', 'acaba', 'ya', 'hem', 'veya', 'her',
  'pek', 'hemen', 'simdi', 'bugun', 'sey', 'mi', 'musunuz', 'misiniz', 'sunu',
  'bunu', 'sunlari', 'aciklar', 'misin', 'anlat', 'soyler', 'soyle', 'edin',
  'ederim', 'tesekkur', 'merhaba', 'selam'
]);

function icerikKelimeleri(metin) {
  return normalize(metin).split(' ').filter(k => k.length > 1 && !STOPWORDS.has(k));
}

/* ---------- Kelime Eslestirme (Turkce ekler icin kok bazli) ---------- */
function kelimeEslesir(a, b) {
  if (a === b) return true;
  const kisa = a.length <= b.length ? a : b;
  const uzun = a.length <= b.length ? b : a;
  // "arsa"~"arsayi", "fiyat"~"fiyatlari" gibi ek farkliliklarini yakala
  return kisa.length >= 4 && uzun.startsWith(kisa);
}

function eslesmeSkoru(kullaniciKelimeler, soruKelimeler) {
  if (!kullaniciKelimeler.length || !soruKelimeler.length) return 0;
  let eslesme = 0;
  const kullanilan = new Set();
  for (const kk of kullaniciKelimeler) {
    for (let i = 0; i < soruKelimeler.length; i++) {
      if (!kullanilan.has(i) && kelimeEslesir(kk, soruKelimeler[i])) {
        eslesme++; kullanilan.add(i); break;
      }
    }
  }
  return eslesme / Math.sqrt(kullaniciKelimeler.length * soruKelimeler.length);
}

/* ---------- Veri Yukleme ---------- */
async function veriYukle() {
  const taban = 'hasinder-ai-data/';
  const [qa, terim, sehir, prompt] = await Promise.all([
    fetch(taban + 'soru-cevap-dataset.json').then(r => r.json()),
    fetch(taban + 'emlak-terimleri.json').then(r => r.json()),
    fetch(taban + 'sehir-bilgileri.json').then(r => r.json()),
    fetch(taban + 'kelepir-emlak-prompt.md').then(r => r.text())
  ]);
  VERI.qa = qa.dataset.map(o => ({ ...o, kelimeler: icerikKelimeleri(o.soru) }));
  VERI.terimler = terim.terimler;
  VERI.sehirler = sehir.sehirler;
  VERI.genelNotlar = sehir.genelNotlar || {};
  VERI.prompt = prompt;
}

/* ---------- Arama: Soru-Cevap ---------- */
function enIyiEslesme(girdi) {
  const kelimeler = icerikKelimeleri(girdi);
  let enIyi = { skor: 0, kayit: null };
  for (const kayit of VERI.qa) {
    const skor = eslesmeSkoru(kelimeler, kayit.kelimeler);
    if (skor > enIyi.skor) enIyi = { skor, kayit };
  }
  return enIyi;
}

/* ---------- Arama: Terimler ---------- */
function terimBul(girdi) {
  const kelimeler = normalize(girdi).split(' ');
  const skorlu = [];
  for (const t of VERI.terimler) {
    const tk = normalize(t.terim).split(' ');
    const eslesen = tk.filter(w => kelimeler.some(k => k === w || (w.length >= 4 && kelimeEslesir(k, w))));
    const skor = eslesen.length / tk.length;
    // Tam eslesme, yaridan fazla eslesme veya ilk kelime (genelde kisaltma) eslesmesi yeterli
    const ilkKelimeUygun = eslesen.includes(tk[0]) && tk[0].length >= 4;
    if (skor >= 0.5 || ilkKelimeUygun) skorlu.push({ t, skor });
  }
  return skorlu.sort((a, b) => b.skor - a.skor).map(o => o.t);
}

/* ---------- Arama: Sehirler ---------- */
function sehirBul(girdi) {
  const norm = normalize(girdi);
  for (const s of VERI.sehirler) {
    const adlar = [s.sehir, ...(s.ilceler || [])].map(normalize);
    if (adlar.some(ad => new RegExp(`\\b${ad}\\b`).test(norm))) return s;
  }
  return null;
}

function sehirCevabi(s) {
  return [
    `**${s.sehir}** bolgesi hakkinda bilgiler:`,
    `- Populer bolgeler: ${(s.populerBolgeler || []).join(', ')}`,
    `- Ortalama arazi fiyati: ${s.araziOrtalamaFiyat}`,
    `- Ilceler: ${(s.ilceler || []).join(', ')}`,
    ``,
    s.notlar,
    ``,
    `Bu bolgedeki guncel ilanlarimiz icin butce ve gayrimenkul turunuzu belirtir misiniz?`
  ].join('\n');
}

/* ---------- Selamlama ---------- */
const SELAM_REGEX = /^(merhaba|selam|selamlar|hey|gunaydin|iyi gunler|iyi aksamlar|iyi bayramlar|hello|hi|naber|nasilsin|hosgeldin)\b/;

/* ---------- LLM Ayarlari ---------- */
function ayarGetir() {
  return {
    apiKey: localStorage.getItem('groq_api_key') || '',
    model: localStorage.getItem('groq_model') || 'llama-3.1-8b-instant',
    ollamaUrl: localStorage.getItem('ollama_url') || 'http://localhost:11434',
    ollamaModel: localStorage.getItem('ollama_model') || 'llama3.1'
  };
}

function bilgiBankasiMetni() {
  const parcalar = [];
  parcalar.push('### Soru-Cevap Ornekleri:\n' + VERI.qa.map(o => `S: ${o.soru}\nC: ${o.cevap}`).join('\n\n'));
  parcalar.push('### Emlak Terimleri:\n' + VERI.terimler.map(t => `- ${t.terim}: ${t.aciklama}`).join('\n'));
  parcalar.push('### Sehir Bilgileri:\n' + VERI.sehirler.map(s =>
    `- ${s.sehir}: Fiyat ${s.araziOrtalamaFiyat}. Populer: ${(s.populerBolgeler || []).join(', ')}. ${s.notlar}`).join('\n'));
  return parcalar.join('\n\n');
}

async function llmSor(soru) {
  const { apiKey, model } = ayarGetir();
  if (!apiKey) return null;

  const sistem = VERI.prompt +
    '\n\n## BILGI BANKASI (asagidaki acik kaynak verilerine dayanarak cevap ver):\n\n' +
    bilgiBankasiMetni();

  GECMIS.push({ role: 'user', content: soru });
  const mesajlar = [
    { role: 'system', content: sistem },
    ...GECMIS.slice(-10) // son 10 mesaj
  ];

  const yanit = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, messages: mesajlar, temperature: 0.7, max_tokens: 700 })
  });

  if (!yanit.ok) {
    GECMIS.pop();
    const hata = await yanit.text();
    throw new Error('Groq API hatasi (' + yanit.status + '): ' + hata.slice(0, 200));
  }

  const veri = await yanit.json();
  const cevap = veri.choices[0].message.content.trim();
  GECMIS.push({ role: 'assistant', content: cevap });
  return cevap;
}

/* ---------- Ollama Yerel LLM (%100 bagimsiz, sinirsiz) ---------- */
async function ollamaSor(soru) {
  const { ollamaUrl, ollamaModel } = ayarGetir();

  const sistem = VERI.prompt +
    '\n\n## BILGI BANKASI (asagidaki acik kaynak verilerine dayanarak cevap ver):\n\n' +
    bilgiBankasiMetni();

  GECMIS.push({ role: 'user', content: soru });
  const mesajlar = [
    { role: 'system', content: sistem },
    ...GECMIS.slice(-10)
  ];

  const yanit = await fetch(ollamaUrl + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ollamaModel, messages: mesajlar, stream: false })
  });

  if (!yanit.ok) {
    GECMIS.pop();
    throw new Error('Ollama hatasi (' + yanit.status + ')');
  }

  const veri = await yanit.json();
  const cevap = veri.message.content.trim();
  GECMIS.push({ role: 'assistant', content: cevap });
  return cevap;
}

async function ollamaAktifMi() {
  try {
    const { ollamaUrl } = ayarGetir();
    const yanit = await fetch(ollamaUrl + '/api/tags', { signal: AbortSignal.timeout(2000) });
    return yanit.ok;
  } catch {
    return false;
  }
}

/* ---------- Ana Cevap Motoru (Hibrit) ---------- */
async function cevapUret(girdi) {
  // 1) Selamlama
  if (SELAM_REGEX.test(normalize(girdi))) {
    const selam = VERI.qa.find(o => o.soru === 'Merhaba');
    return { metin: selam ? selam.cevap : 'Merhaba! Size nasil yardimci olabilirim?', kaynak: 'Veri Seti' };
  }

  // 2) Veri seti eslesmesi
  const eslesme = enIyiEslesme(girdi);
  if (eslesme.skor >= ESLESME_ESIGI) {
    return { metin: eslesme.kayit.cevap, kaynak: 'Veri Seti' };
  }

  // 3) Terim + sehir analizi
  const terimler = terimBul(girdi);
  const sehir = sehirBul(girdi);
  const terimSorusu = /(nedir|ne demek|ne anlama|anlami|acikla)/.test(normalize(girdi));

  // Acikca terim soruluyorsa once terim cevabi ver
  if (terimler.length > 0 && terimSorusu) {
    const metin = terimler.slice(0, 3).map(t => `**${t.terim}** (${t.kategori})\n${t.aciklama}`).join('\n\n');
    return { metin, kaynak: 'Terim Sozlugu' };
  }

  // Bolge sorgusu (sehir adi geciyorsa)
  if (sehir) {
    return { metin: sehirCevabi(sehir), kaynak: 'Sehir Bilgileri' };
  }

  // Kisa terim sorgulari (sehir ve veri seti eslesmesi yoksa)
  if (terimler.length > 0 && icerikKelimeleri(girdi).length <= 6) {
    const metin = terimler.slice(0, 3).map(t => `**${t.terim}** (${t.kategori})\n${t.aciklama}`).join('\n\n');
    return { metin, kaynak: 'Terim Sozlugu' };
  }

  // 5) LLM'e dus (hibrit adim): once yerel Ollama (sinirsiz), sonra Groq
  if (await ollamaAktifMi()) {
    try {
      const cevap = await ollamaSor(girdi);
      return { metin: cevap, kaynak: 'Yerel LLM (Ollama)' };
    } catch (e) { /* Ollama basarisiz, Groq'a dus */ }
  }

  const { apiKey } = ayarGetir();
  if (apiKey) {
    try {
      const cevap = await llmSor(girdi);
      return { metin: cevap, kaynak: 'Bulut LLM (Groq)' };
    } catch (e) {
      return { metin: 'LLM servisine ulasilamadi: ' + e.message + '\n\nYerel veri setinden cevap veremedim. Sorunuzu emlak, arazi, fiyat, tapu gibi konularla ilgili sorabilir misiniz?', kaynak: 'Hata', hata: true };
    }
  }

  // 6) LLM yoksa dusme mesaji
  return {
    metin: 'Bu soruya veri setimde net bir cevap bulamadim. Sunlari sorabilirsiniz:\n' +
      '- Arazi/arsa/villa fiyatlari (orn: "Fethiye\'de arsa fiyatlari ne kadar?")\n' +
      '- Emlak terimleri (orn: "KAKS nedir?", "Hisseli tapu riskli mi?")\n' +
      '- Sehir bilgileri (orn: "Mugla\'da yatirim")\n' +
      '- Tapu ve imar islemleri\n\n' +
      'Sinirsiz ve bagimsiz cevaplar icin bilgisayariniza Ollama kurun (ollama.com) veya ayarlardan Groq API anahtari ekleyin.',
    kaynak: 'Yardim'
  };
}

/* ============================================================
 * KULLANICI ARAYUZU
 * ============================================================ */
const mesajlarEl = document.getElementById('mesajlar');
const soruInput = document.getElementById('soruInput');
const gonderBtn = document.getElementById('gonderBtn');
const durumEl = document.getElementById('durum');
const onerilerEl = document.getElementById('oneriler');

function bicimle(metin) {
  return metin
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\s(\d{1,2})\)/g, '<br>$1)')
    .replace(/\n/g, '<br>');
}

function mesajEkle(metin, kim, kaynak) {
  const kapsayici = document.createElement('div');
  kapsayici.className = kim === 'asistan' ? 'mesaj-asil' : '';
  kapsayici.style.alignSelf = kim === 'kullanici' ? 'flex-end' : 'flex-start';

  const div = document.createElement('div');
  div.className = 'mesaj ' + kim;
  div.innerHTML = bicimle(metin);
  kapsayici.appendChild(div);

  if (kaynak) {
    const etiket = document.createElement('span');
    etiket.className = 'kaynak-etiket' + (kaynak.includes('LLM') ? ' llm' : '') + (kaynak === 'Hata' ? ' uyari' : '');
    etiket.textContent = 'Kaynak: ' + kaynak;
    kapsayici.appendChild(etiket);
  }

  mesajlarEl.appendChild(kapsayici);
  mesajlarEl.scrollTop = mesajlarEl.scrollHeight;
  return kapsayici;
}

function yaziyorEkle() {
  const div = document.createElement('div');
  div.className = 'mesaj asistan yaziyor';
  div.innerHTML = '<span></span><span></span><span></span>';
  mesajlarEl.appendChild(div);
  mesajlarEl.scrollTop = mesajlarEl.scrollHeight;
  return div;
}

async function soruGonder(soru) {
  soru = soru.trim();
  if (!soru) return;
  mesajEkle(soru, 'kullanici');
  soruInput.value = '';
  gonderBtn.disabled = true;
  const yaziyor = yaziyorEkle();
  try {
    const cevap = await cevapUret(soru);
    yaziyor.remove();
    mesajEkle(cevap.metin, 'asistan', cevap.kaynak);
  } catch (e) {
    yaziyor.remove();
    mesajEkle('Bir hata olustu: ' + e.message, 'asistan', 'Hata');
  }
  gonderBtn.disabled = false;
  soruInput.focus();
}

/* ---------- Oneriler ---------- */
const ORNEK_SORULAR = [
  'Merhaba', 'Fethiye\'de arsa fiyatlari ne kadar?', 'KAKS nedir?',
  'Tapu islemleri nasil yapiliyor?', 'Yatirim icin hangi bolgeyi onerirsiniz?',
  'Emlak komisyonu ne kadar?'
];

function onerileriGoster() {
  onerilerEl.innerHTML = '';
  for (const s of ORNEK_SORULAR) {
    const btn = document.createElement('button');
    btn.className = 'oneri';
    btn.textContent = s;
    btn.onclick = () => soruGonder(s);
    onerilerEl.appendChild(btn);
  }
}

/* ---------- Ayarlar ---------- */
const ayarlarPanel = document.getElementById('ayarlarPanel');
document.getElementById('ayarlarBtn').onclick = () => {
  ayarlarPanel.classList.toggle('gizli');
  document.getElementById('apiKey').value = localStorage.getItem('groq_api_key') || '';
  document.getElementById('modelAdi').value = localStorage.getItem('groq_model') || 'llama-3.1-8b-instant';
  document.getElementById('ollamaUrl').value = localStorage.getItem('ollama_url') || 'http://localhost:11434';
  document.getElementById('ollamaModel').value = localStorage.getItem('ollama_model') || 'llama3.1';
};
document.getElementById('ayarlarKapat').onclick = () => ayarlarPanel.classList.add('gizli');
document.getElementById('ayarlarKaydet').onclick = () => {
  localStorage.setItem('groq_api_key', document.getElementById('apiKey').value.trim());
  localStorage.setItem('groq_model', document.getElementById('modelAdi').value.trim() || 'llama-3.1-8b-instant');
  localStorage.setItem('ollama_url', document.getElementById('ollamaUrl').value.trim() || 'http://localhost:11434');
  localStorage.setItem('ollama_model', document.getElementById('ollamaModel').value.trim() || 'llama3.1');
  ayarlarPanel.classList.add('gizli');
  durumGuncelle();
};

async function durumGuncelle() {
  const { apiKey } = ayarGetir();
  if (await ollamaAktifMi()) {
    durumEl.textContent = 'Bagimsiz Mod (Ollama aktif)';
  } else if (apiKey) {
    durumEl.textContent = 'Hibrit Mod (Groq aktif)';
  } else {
    durumEl.textContent = 'Yerel Mod';
  }
  durumEl.className = 'durum hazir';
}

/* ---------- Baslat ---------- */
gonderBtn.onclick = () => soruGonder(soruInput.value);
soruInput.addEventListener('keydown', e => { if (e.key === 'Enter') soruGonder(soruInput.value); });

veriYukle()
  .then(() => {
    durumGuncelle();
    onerileriGoster();
    mesajEkle('Merhaba! Ben Kelepir Emlak AI Satis Temsilciniz. Arazi, tarla, villa ve gayrimenkul konularinda size yardimci olabilirim. Asagidaki ornek sorularla baslayabilirsiniz.', 'asistan', 'Sistem');
  })
  .catch(e => {
    durumEl.textContent = 'Veri yuklenemedi';
    durumEl.className = 'durum hata';
    mesajEkle('Veri dosyalari yuklenemedi: ' + e.message + '\n\nNot: Bu sayfayi dogrudan dosyadan actiysaniz (file://), tarayici guvenligi veri okumayi engeller. Klasorde "python -m http.server" veya "npx serve" calistirip http://localhost uzerinden acin. GitHub Pages\'de otomatik calisir.', 'asistan', 'Hata');
  });
