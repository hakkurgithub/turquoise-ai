const fs = require('fs');
const data = JSON.parse(fs.readFileSync('D:\\Turquoise AI\\hasinder-ai-data\\gumruk-musavirligi-2006-sinav.json', 'utf-8'));

function cleanText(text) {
  if (!text) return '';
  let s = text;
  s = s.replace(/[�\xa0]/g, ' ');
  s = s.replace(/ṣ/g, 'ş');
  s = s.replace(/ṣ/g, 'ş');
  s = s.replace(/Gömrük/g, 'Gümrük');
  s = s.replace(/gömrük/g, 'gümrük');
  s = s.replace(/gömürk/g, 'gümrük');
  s = s.replace(/Gömrük/g, 'Gümrük');
  s = s.replace(/gömrük/g, 'gümrük');
  s = s.replace(/gümrük/g, 'gümrük');
  s = s.replace(/Gümrük/g, 'Gümrük');
  s = s.replace(/gorev/g, 'görev');
  s = s.replace(/gozetim/g, 'gözetim');
  s = s.replace(/gozetimi/g, 'gözetimi');
  s = s.replace(/iṣ/g, 'iş');
  s = s.replace(/ṣart/g, 'şart');
  s = s.replace(/ṣartlı/g, 'şartlı');
  s = s.replace(/ṣartli/g, 'şartlı');
  s = s.replace(/Türki̇ye/g, 'Türkiye');
  s = s.replace(/türki̇ye/g, 'türkiye');
  s = s.replace(/diṣ/g, 'dış');
  s = s.replace(/diş/g, 'dış');
  s = s.replace(/çış/g, 'çış');
  s = s.replace(/içi̇n/g, 'için');
  s = s.replace(/içi̇nde/g, 'içinde');
  s = s.replace(/müṣavirliği/g, 'müşavirliği');
  s = s.replace(/müṣavirlik/g, 'müşavirlik');
  s = s.replace(/güṣ/g, 'güş');
  s = s.replace(/iṣlem/g, 'işlem');
  s = s.replace(/iṣleme/g, 'işleme');
  s = s.replace(/kıṣ/i, 'kış');
  s = s.replace(/ṣe/g, 'şe');
  s = s.replace(/ṣu/g, 'şu');
  s = s.replace(/ṣun/g, 'şun');
  s = s.replace(/ṣöyle/g, 'şöyle');
  s = s.replace(/ṣimdi/g, 'şimdi');
  s = s.replace(/ṣu/g, 'şu');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

let cleaned = 0;
for (const entry of data.dataset) {
  const oldSoru = entry.soru;
  entry.soru = cleanText(entry.soru);
  if (entry.soru !== oldSoru) cleaned++;

  for (const key of Object.keys(entry.secenekler)) {
    entry.secenekler[key] = cleanText(entry.secenekler[key]);
  }

  const answerText = entry.dogruCevapMetni || '';
  if (entry.dogruCevap) {
    entry.cevap = `Doğru cevap: ${entry.dogruCevap}) ${answerText}`;
  } else {
    entry.cevap = 'Doğru cevap mevcut değil.';
  }
}

const withFullAnswer = data.dataset.filter(d => d.dogruCevap && d.dogruCevapMetni).length;
const withLetterOnly = data.dataset.filter(d => d.dogruCevap && !d.dogruCevapMetni).length;
const missingText = data.dataset.filter(d => d.soru.includes('tam çıkarılamadı')).length;

console.log('=== TEMIZLIK SONRASI ===');
console.log('Toplam soru:', data.dataset.length);
console.log('Cevap harfi + metin tam:', withFullAnswer);
console.log('Yalnizca cevap harfi var:', withLetterOnly);
console.log('Soru metin kayip:', missingText);
console.log('Duzeltilen metin:', cleaned);

fs.writeFileSync('D:\\Turquoise AI\\hasinder-ai-data\\gumruk-musavirligi-2006-sinav.json', JSON.stringify(data, null, 2));
console.log('Kaydedildi.');
