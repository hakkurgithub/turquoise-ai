#!/usr/bin/env node
'use strict';
/* ============================================================
 * Turquoise AI - Konsol Surumu (Node.js, Hibrit)
 * 1. Once yerel veri setinde akilli eslestirme yapar
 * 2. Bulamazsa Groq uzerinden acik kaynak LLM'e sorar (Llama 3.1)
 * 3. Cevap bulamazsa WhatsApp yonlendirmesi
 *
 * Kurulum: Node.js 18+ (ek paket GEREKMEZ)
 * Calistirma: node konsol.js
 * LLM icin: GROQ_API_KEY ortam degiskeni veya konsolda /key komutu
 * Komutlar: /key <anahtar> | /model <adi> | /temizle | /yardim | /cikis
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VERI_KLASORU = path.join(__dirname, 'hasinder-ai-data');
const ESLESME_ESIGI = 0.45;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
  'pek', 'hemen', 'simdi', 'bugun', 'sey', 'musunuz', 'misiniz', 'sunu',
  'bunu', 'sunlari', 'aciklar', 'misin', 'anlat', 'soyler', 'soyle', 'edin',
  'ederim', 'tesekkur', 'merhaba', 'selam'
]);

const SELAM_REGEX = /^(merhaba|selam|selamlar|hey|gunaydin|iyi gunler|iyi aksamlar|iyi bayramlar|hello|hi|naber|nasilsin|hosgeldin)\b/;

function icerikKelimeleri(metin) {
  return normalize(metin).split(' ').filter(k => k.length > 1 && !STOPWORDS.has(k));
}

function kelimeEslesir(a, b) {
  if (a === b) return true;
  const kisa = a.length <= b.length ? a : b;
  const uzun = a.length <= b.length ? b : a;
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
function veriYukle() {
  const oku = d => fs.readFileSync(path.join(VERI_KLASORU, d), 'utf-8');
  const dosyalar = [
    'soru-cevap-dataset.json',
    'hasinder-platform-dataset.json',
    'gumruk-dis-ticaret-dataset.json',
    'gayrimenkul-hukuk-dataset.json',
    'gumruk-musavirligi-2006-sinav.json',
    'gumruk-musavirligi-2008-sinav.json',
    'gumruk-musavirligi-2010-sinav.json',
    'gumruk-musavirligi-2011-sinav.json',
    'gumruk-musavirligi-2012-sinav.json',
    'gumruk-musavirligi-2013-sinav.json',
    'gumruk-musavirligi-2014-sinav.json',
    'gumruk-musavirligi-2015-sinav.json',
    'gumruk-musavirligi-2017-sinav.json',
    'gumruk-musavirligi-2018-sinav.json',
    'gumruk-tarife-cetveli-fasillar.json',
    'b2b-ticaret-dataset.json',
    'lojistik-tasimacilik-dataset.json',
    'finans-vergi-dataset.json',
    'sirket-is-hukuku-dataset.json',
    'turkiye-ekonomi-dataset.json',
    'emlak-yatirim-dataset.json'
  ];
  const tumQa = dosyalar.flatMap(d => JSON.parse(oku(d)).dataset || []);
  tumQa.forEach(k => k.kelimeler = icerikKelimeleri(k.soru));
  return {
    qa: tumQa,
    terimler: JSON.parse(oku('emlak-terimleri.json')).terimler,
    sehirler: JSON.parse(oku('sehir-bilgileri.json')).sehirler,
    prompt: oku('goodbuy-real-estate-prompt.md')
  };
}

/* ---------- Arama ---------- */
function enIyiEslesme(veri, girdi) {
  const kelimeler = icerikKelimeleri(girdi);
  let skor = 0, kayit = null;
  for (const k of veri.qa) {
    const s = eslesmeSkoru(kelimeler, k.kelimeler);
    if (s > skor) { skor = s; kayit = k; }
  }
  return { skor, kayit };
}

function terimBul(veri, girdi) {
  const kelimeler = normalize(girdi).split(' ');
  const skorlu = [];
  for (const t of veri.terimler) {
    const tk = normalize(t.terim).split(' ');
    const eslesen = tk.filter(w => kelimeler.some(k => k === w || (w.length >= 4 && kelimeEslesir(k, w))));
    const skor = eslesen.length / tk.length;
    const ilkKelimeUygun = eslesen.includes(tk[0]) && tk[0].length >= 4;
    if (skor >= 0.5 || ilkKelimeUygun) skorlu.push({ t, skor });
  }
  return skorlu.sort((a, b) => b.skor - a.skor).map(o => o.t);
}

function sehirBul(veri, girdi) {
  const norm = normalize(girdi);
  for (const s of veri.sehirler) {
    const adlar = [s.sehir, ...(s.ilceler || [])].map(normalize);
    if (adlar.some(ad => new RegExp(`\\b${ad}\\b`).test(norm))) return s;
  }
  return null;
}

function sehirCevabi(s) {
  return `${s.sehir} bolgesi hakkinda bilgiler:\n` +
    `- Populer bolgeler: ${(s.populerBolgeler || []).join(', ')}\n` +
    `- Ortalama arazi fiyati: ${s.araziOrtalamaFiyat}\n` +
    `- Ilceler: ${(s.ilceler || []).join(', ')}\n\n` +
    `${s.notlar}\n\n` +
    `Detayli bilgi icin sorunuzu daha spesifik sorabilirsiniz.`;
}

/* ---------- Groq LLM API ---------- */
function bilgiBankasiMetni(veri) {
  const qc = veri.qa.map(o => `S: ${o.soru}\nC: ${o.cevap}`).join('\n\n');
  const tr = veri.terimler.map(t => `- ${t.terim}: ${t.aciklama}`).join('\n');
  const sh = veri.sehirler.map(s =>
    `- ${s.sehir}: Fiyat ${s.araziOrtalamaFiyat}. Populer: ${(s.populerBolgeler || []).join(', ')}. ${s.notlar}`).join('\n');
  return `### Soru-Cevap Ornekleri:\n${qc}\n\n### Emlak Terimleri:\n${tr}\n\n### Sehir Bilgileri:\n${sh}`;
}

async function llmSor(veri, gecmis, apiKey, model, soru) {
  const sistem = veri.prompt +
    '\n\n## BILGI BANKASI (asagidaki acik kaynak verilerine dayanarak cevap ver):\n\n' +
    bilgiBankasiMetni(veri);
  gecmis.push({ role: 'user', content: soru });

  const yanit = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: sistem }, ...gecmis.slice(-10)], temperature: 0.7, max_tokens: 700 })
  });

  if (!yanit.ok) {
    gecmis.pop();
    const hata = await yanit.text();
    throw new Error(`Groq API hatasi (${yanit.status}): ${hata.slice(0, 200)}`);
  }
  const veri2 = await yanit.json();
  const cevap = veri2.choices[0].message.content.trim();
  gecmis.push({ role: 'assistant', content: cevap });
  return cevap;
}

/* ---------- Ollama Yerel LLM (%100 bagimsiz, sinirsiz) ---------- */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';
let ollamaDurum = false; // baslangicta bir kez kontrol edilir

async function ollamaAktifMi() {
  try {
    const yanit = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(2000) });
    return yanit.ok;
  } catch {
    return false;
  }
}

async function ollamaSor(veri, gecmis, soru) {
  const sistem = veri.prompt +
    '\n\n## BILGI BANKASI (asagidaki acik kaynak verilerine dayanarak cevap ver):\n\n' +
    bilgiBankasiMetni(veri);
  gecmis.push({ role: 'user', content: soru });

  const yanit = await fetch(OLLAMA_URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages: [{ role: 'system', content: sistem }, ...gecmis.slice(-10)], stream: false })
  });

  if (!yanit.ok) {
    gecmis.pop();
    throw new Error(`Ollama hatasi (${yanit.status})`);
  }
  const veri2 = await yanit.json();
  const cevap = veri2.message.content.trim();
  gecmis.push({ role: 'assistant', content: cevap });
  return cevap;
}

/* ---------- Ana Cevap Motoru (Hibrit) ---------- */
async function cevapUret(veri, gecmis, apiKey, model, girdi) {
  if (SELAM_REGEX.test(normalize(girdi))) {
    const selam = veri.qa.find(o => o.soru === 'Merhaba');
    return { metin: selam ? selam.cevap : 'Merhaba! Size nasil yardimci olabilirim?', kaynak: 'Veri Seti' };
  }

  const { skor, kayit } = enIyiEslesme(veri, girdi);
  if (skor >= ESLESME_ESIGI) return { metin: kayit.cevap, kaynak: 'Veri Seti' };

  const terimler = terimBul(veri, girdi);
  const sehir = sehirBul(veri, girdi);
  const terimSorusu = /(nedir|ne demek|ne anlama|anlami|acikla)/.test(normalize(girdi));

  if (terimler.length > 0 && terimSorusu) {
    return { metin: terimler.slice(0, 3).map(t => `${t.terim} (${t.kategori})\n${t.aciklama}`).join('\n\n'), kaynak: 'Terim Sozlugu' };
  }

  if (sehir) return { metin: sehirCevabi(sehir), kaynak: 'Sehir Bilgileri' };

  if (terimler.length > 0 && icerikKelimeleri(girdi).length <= 6) {
    return { metin: terimler.slice(0, 3).map(t => `${t.terim} (${t.kategori})\n${t.aciklama}`).join('\n\n'), kaynak: 'Terim Sozlugu' };
  }

  // LLM'e dus (hibrit adim): once yerel Ollama (sinirsiz), sonra Groq
  if (ollamaDurum) {
    try {
      return { metin: await ollamaSor(veri, gecmis, girdi), kaynak: 'Yerel LLM (Ollama)' };
    } catch (e) { /* Ollama basarisiz, Groq'a dus */ }
  }

  if (apiKey) {
    try {
      return { metin: await llmSor(veri, gecmis, apiKey, model, girdi), kaynak: 'Bulut LLM (Groq)' };
    } catch (e) {
      return { metin: `LLM servisine ulasilamadi: ${e.message}\nSorunuzu WhatsApp uzerinden uzmanimize iletebilirim: https://wa.me/905333715577?text=${encodeURIComponent('Merhaba, su soruma cevap bulamadim: ' + girdi)}`, kaynak: 'Hata' };
    }
  }

  return {
    metin: 'Bu soruya su an net bir cevap bulamadim. Uzmanimiza suradan WhatsApp uzerinden iletebilirsiniz:\nhttps://wa.me/905333715577?text=' + encodeURIComponent('Merhaba, su soruma cevap bulamadim: ' + girdi),
    kaynak: 'WhatsApp'
  };
}

/* ---------- Konsol Dongusu ---------- */
const YARDIM = `Komutlar:
  /key <anahtar>   Groq API anahtarini ayarla (yedek bulut LLM icin)
  /model <adi>     Groq model degistir (varsayilan: llama-3.1-8b-instant)
  /temizle         Sohbet gecmisini sifirla
  /yardim          Bu mesaji goster
  /cikis           Programdan cik

Ollama (oncelikli, sinirsiz, bagimsiz):
  Bilgisayariniza ollama kurun (ollama.com), sonra "ollama pull llama3.1" yapin.
  Asistan otomatik algilar ve once Ollama'yi, bulamazsa Groq'u kullanir.
  OLLAMA_URL=http://localhost:11434  (ortam degiskeni ile ozellestirilebilir)
  OLLAMA_MODEL=llama3.1`;

async function main() {
  console.log('='.repeat(60));
  console.log('  Turquoise AI - Genel Yapay Zeka Asistani (Konsol)');
  console.log('='.repeat(60));

  let veri;
  try {
    veri = veriYukle();
  } catch (e) {
    console.error('HATA: Veri dosyalari yuklenemedi: ' + e.message);
    process.exit(1);
  }

  let apiKey = process.env.GROQ_API_KEY || '';
  let model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const gecmis = [];

  ollamaDurum = await ollamaAktifMi();
  const modMetin = ollamaDurum
    ? 'Bagimsiz (Ollama yerel LLM aktif - sinirsiz)'
    : apiKey ? 'Hibrit (Groq bulut LLM aktif)' : 'Yerel (LLM icin Ollama kurun veya /key kullanin)';
  console.log(`Mod: ${modMetin}`);
  console.log(YARDIM);
  console.log('-'.repeat(60));

  const selam = await cevapUret(veri, gecmis, '', model, 'merhaba');
  console.log(`\nAsistan: ${selam.metin}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'Siz: ' });
  rl.prompt();

  // for-await dongusu satirlari sirayla isler (async cevaplar icin guvenli)
  for await (const satir of rl) {
    const girdi = satir.trim();
    if (!girdi) { rl.prompt(); continue; }
    const norm = normalize(girdi);
    const komut = girdi.toLowerCase();

    if (['cikis', 'exit', 'quit'].includes(norm)) {
      break;
    } else if (komut === '/yardim') {
      console.log(YARDIM);
    } else if (komut === '/temizle') {
      gecmis.length = 0;
      console.log('Sohbet gecmisi sifirlandi.');
    } else if (girdi.startsWith('/key')) {
      const p = girdi.split(/\s+/, 2);
      if (p[1]) { apiKey = p[1]; console.log('API anahtari kaydedildi. Hibrit mod aktif!'); }
      else console.log('Kullanim: /key gsk_xxxxxxxx');
    } else if (girdi.startsWith('/model')) {
      const p = girdi.split(/\s+/, 2);
      if (p[1]) { model = p[1]; console.log('Model degistirildi: ' + model); }
      else console.log('Mevcut model: ' + model);
    } else {
      const cevap = await cevapUret(veri, gecmis, apiKey, model, girdi);
      console.log(`\nAsistan: ${cevap.metin}`);
      console.log(`  [Kaynak: ${cevap.kaynak}]\n`);
    }
    rl.prompt();
  }

  console.log('\nGorusmek uzere!');
  rl.close();
}

main();
