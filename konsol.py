#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Turquoise AI - Konsol Surumu (Hibrit)
1. Once yerel veri setinde akilli eslestirme yapar (ucretsiz, cevrimdisi)
2. Bulamazsa Groq uzerinden acik kaynak LLM'e sorar (Llama 3.1)
3. Cevap bulamazsa WhatsApp yonlendirmesi

Kurulum: Python 3.8+ (ek paket GEREKMEZ, sadece standart kutuphane)
Calistirma: python konsol.py
LLM icin: GROQ_API_KEY ortam degiskenini ayarlayin veya konsolda /key komutunu kullanin
Komutlar: /key <anahtar> | /model <adi> | /temizle | /yardim | /cikis
"""

import json
import math
import os
import re
import sys
import urllib.request
import urllib.error

DOSYA_YOLU = os.path.dirname(os.path.abspath(__file__))
VERI_KLASORU = os.path.join(DOSYA_YOLU, 'hasinder-ai-data')
ESLESME_ESIGI = 0.45
GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

# ---------- Metin Normalizasyonu (Turkce) ----------
TR_HARF = str.maketrans({'ı': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c',
                         'â': 'a', 'î': 'i', 'û': 'u', 'I': 'i',
                         'İ': 'i', 'Ş': 's', 'Ğ': 'g', 'Ü': 'u', 'Ö': 'o', 'Ç': 'c'})

STOPWORDS = {
    'bir', 've', 'ile', 'icin', 'ne', 'nedir', 'nasil', 'mi', 'mı', 'mu', 'mü',
    'var', 'yok', 'ben', 'sen', 'o', 'bu', 'su', 'da', 'de', 'ki', 'en', 'cok',
    'ama', 'gibi', 'kadar', 'daha', 'ise', 'hakkinda', 'istiyorum', 'lutfen',
    'bana', 'bize', 'siz', 'biz', 'hangi', 'kac', 'nerede', 'olan', 'olarak',
    'sonra', 'once', 'sadece', 'yani', 'acaba', 'ya', 'hem', 'veya', 'her',
    'pek', 'hemen', 'simdi', 'bugun', 'sey', 'musunuz', 'misiniz', 'sunu',
    'bunu', 'sunlari', 'aciklar', 'misin', 'anlat', 'soyler', 'soyle', 'edin',
    'ederim', 'tesekkur', 'merhaba', 'selam'
}

SELAM_REGEX = re.compile(
    r'^(merhaba|selam|selamlar|hey|gunaydin|iyi gunler|iyi aksamlar|iyi bayramlar|hello|hi|naber|nasilsin|hosgeldin)\b')


def normalize(metin):
    metin = metin.translate(TR_HARF).lower()
    metin = re.sub(r'[^a-z0-9\s]', ' ', metin)
    return re.sub(r'\s+', ' ', metin).strip()


def icerik_kelimeleri(metin):
    return [k for k in normalize(metin).split() if len(k) > 1 and k not in STOPWORDS]


def kelime_eslesir(a, b):
    if a == b:
        return True
    kisa, uzun = (a, b) if len(a) <= len(b) else (b, a)
    return len(kisa) >= 4 and uzun.startswith(kisa)


def eslesme_skoru(kullanici_kelimeler, soru_kelimeler):
    if not kullanici_kelimeler or not soru_kelimeler:
        return 0.0
    eslesme = 0
    kullanilan = set()
    for kk in kullanici_kelimeler:
        for i, sk in enumerate(soru_kelimeler):
            if i not in kullanilan and kelime_eslesir(kk, sk):
                eslesme += 1
                kullanilan.add(i)
                break
    return eslesme / math.sqrt(len(kullanici_kelimeler) * len(soru_kelimeler))


# ---------- Veri Yukleme ----------
def veri_yukle():
    def oku(dosya):
        with open(os.path.join(VERI_KLASORU, dosya), encoding='utf-8') as f:
            return f.read()

    dosyalar = ['soru-cevap-dataset.json', 'hasinder-platform-dataset.json',
                'gumruk-dis-ticaret-dataset.json', 'gayrimenkul-hukuk-dataset.json',
                'b2b-ticaret-dataset.json', 'lojistik-tasimacilik-dataset.json',
                'finans-vergi-dataset.json', 'sirket-is-hukuku-dataset.json',
                'turkiye-ekonomi-dataset.json', 'emlak-yatirim-dataset.json']
    qa = []
    for dosya in dosyalar:
        qa.extend(json.loads(oku(dosya)).get('dataset', []))
    for kayit in qa:
        kayit['kelimeler'] = icerik_kelimeleri(kayit['soru'])
    return {
        'qa': qa,
        'terimler': json.loads(oku('emlak-terimleri.json'))['terimler'],
        'sehirler': json.loads(oku('sehir-bilgileri.json'))['sehirler'],
        'prompt': oku('goodbuy-real-estate-prompt.md')
    }


# ---------- Arama ----------
def en_iyi_eslesme(veri, girdi):
    kelimeler = icerik_kelimeleri(girdi)
    en_iyi_skor, en_iyi_kayit = 0.0, None
    for kayit in veri['qa']:
        skor = eslesme_skoru(kelimeler, kayit['kelimeler'])
        if skor > en_iyi_skor:
            en_iyi_skor, en_iyi_kayit = skor, kayit
    return en_iyi_skor, en_iyi_kayit


def terim_bul(veri, girdi):
    kelimeler = normalize(girdi).split()
    skorlu = []
    for t in veri['terimler']:
        tk = normalize(t['terim']).split()
        eslesen = [w for w in tk if any(k == w or (len(w) >= 4 and kelime_eslesir(k, w)) for k in kelimeler)]
        skor = len(eslesen) / len(tk)
        ilk_kelime_uygun = tk[0] in eslesen and len(tk[0]) >= 4
        if skor >= 0.5 or ilk_kelime_uygun:
            skorlu.append((skor, t))
    skorlu.sort(key=lambda o: -o[0])
    return [t for _, t in skorlu]


def sehir_bul(veri, girdi):
    norm = normalize(girdi)
    for s in veri['sehirler']:
        adlar = [normalize(s['sehir'])] + [normalize(i) for i in s.get('ilceler', [])]
        if any(re.search(r'\b' + re.escape(ad) + r'\b', norm) for ad in adlar):
            return s
    return None


def sehir_cevabi(s):
    return (
        f"{s['sehir']} bolgesi hakkinda bilgiler:\n"
        f"- Populer bolgeler: {', '.join(s.get('populerBolgeler', []))}\n"
        f"- Ortalama arazi fiyati: {s.get('araziOrtalamaFiyat', '-')}\n"
        f"- Ilceler: {', '.join(s.get('ilceler', []))}\n\n"
        f"{s.get('notlar', '')}\n\n"
        f"Detayli bilgi icin sorunuzu daha spesifik sorabilirsiniz."
    )


# ---------- Groq LLM API ----------
def bilgi_bankasi_metni(veri):
    qc = '\n\n'.join(f"S: {o['soru']}\nC: {o['cevap']}" for o in veri['qa'])
    tr = '\n'.join(f"- {t['terim']}: {t['aciklama']}" for t in veri['terimler'])
    sh = '\n'.join(f"- {s['sehir']}: Fiyat {s.get('araziOrtalamaFiyat','-')}. "
                   f"Populer: {', '.join(s.get('populerBolgeler', []))}. {s.get('notlar','')}"
                   for s in veri['sehirler'])
    return f"### Soru-Cevap Ornekleri:\n{qc}\n\n### Emlak Terimleri:\n{tr}\n\n### Sehir Bilgileri:\n{sh}"


def llm_sor(veri, gecmis, api_key, model, soru):
    sistem = (veri['prompt'] +
              '\n\n## BILGI BANKASI (asagidaki acik kaynak verilerine dayanarak cevap ver):\n\n' +
              bilgi_bankasi_metni(veri))
    gecmis.append({'role': 'user', 'content': soru})
    govde = json.dumps({
        'model': model,
        'messages': [{'role': 'system', 'content': sistem}] + gecmis[-10:],
        'temperature': 0.7,
        'max_tokens': 700
    }).encode('utf-8')

    istek = urllib.request.Request(GROQ_URL, data=govde, headers={
        'Authorization': 'Bearer ' + api_key,
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(istek, timeout=60) as yanit:
            sonuc = json.loads(yanit.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        gecmis.pop()
        raise RuntimeError(f'LLM API hatasi ({e.code}): {e.read().decode("utf-8")[:200]}')

    cevap = sonuc['choices'][0]['message']['content'].strip()
    gecmis.append({'role': 'assistant', 'content': cevap})
    return cevap


# ---------- Ollama Yerel LLM (%100 bagimsiz, sinirsiz) ----------
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.1')
ollama_durum = False  # baslangicta bir kez kontrol edilir


def ollama_aktif_mi():
    try:
        with urllib.request.urlopen(OLLAMA_URL + '/api/tags', timeout=2):
            return True
    except Exception:
        return False


def ollama_sor(veri, gecmis, soru):
    sistem = (veri['prompt'] +
              '\n\n## BILGI BANKASI (asagidaki acik kaynak verilerine dayanarak cevap ver):\n\n' +
              bilgi_bankasi_metni(veri))
    gecmis.append({'role': 'user', 'content': soru})
    govde = json.dumps({
        'model': OLLAMA_MODEL,
        'messages': [{'role': 'system', 'content': sistem}] + gecmis[-10:],
        'stream': False
    }).encode('utf-8')

    istek = urllib.request.Request(OLLAMA_URL + '/api/chat', data=govde,
                                   headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(istek, timeout=120) as yanit:
            sonuc = json.loads(yanit.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        gecmis.pop()
        raise RuntimeError(f'Ollama hatasi ({e.code})')

    cevap = sonuc['message']['content'].strip()
    gecmis.append({'role': 'assistant', 'content': cevap})
    return cevap


# ---------- Ana Cevap Motoru (Hibrit) ----------
def cevap_uret(veri, gecmis, api_key, model, girdi):
    if SELAM_REGEX.match(normalize(girdi)):
        selam = next((o for o in veri['qa'] if o['soru'] == 'Merhaba'), None)
        return (selam['cevap'] if selam else 'Merhaba! Size nasil yardimci olabilirim?', 'Veri Seti')

    skor, kayit = en_iyi_eslesme(veri, girdi)
    if skor >= ESLESME_ESIGI:
        return kayit['cevap'], 'Veri Seti'

    terimler = terim_bul(veri, girdi)
    sehir = sehir_bul(veri, girdi)
    terim_sorusu = re.search(r'(nedir|ne demek|ne anlama|anlami|acikla)', normalize(girdi))

    if terimler and terim_sorusu:
        metin = '\n\n'.join(f"{t['terim']} ({t['kategori']})\n{t['aciklama']}" for t in terimler[:3])
        return metin, 'Terim Sozlugu'

    if sehir:
        return sehir_cevabi(sehir), 'Sehir Bilgileri'

    if terimler and len(icerik_kelimeleri(girdi)) <= 6:
        metin = '\n\n'.join(f"{t['terim']} ({t['kategori']})\n{t['aciklama']}" for t in terimler[:3])
        return metin, 'Terim Sozlugu'

    global ollama_durum
    if ollama_durum:
        try:
            return ollama_sor(veri, gecmis, girdi), 'Yerel LLM (Ollama)'
        except Exception:
            pass

    if api_key:
        try:
            return llm_sor(veri, gecmis, api_key, model, girdi), 'Bulut LLM (Groq)'
        except Exception as e:
            import urllib.parse
            whatsapp_link = 'https://wa.me/905333715577?text=' + urllib.parse.quote('Merhaba, su soruma cevap bulamadim: ' + girdi)
            return (f'LLM servisine ulasilamadi: {e}\n'
                    f'Sorunuzu WhatsApp uzerinden uzmanimize iletebilirim: {whatsapp_link}', 'Hata')

    import urllib.parse
    whatsapp_link = 'https://wa.me/905333715577?text=' + urllib.parse.quote('Merhaba, su soruma cevap bulamadim: ' + girdi)
    return (f'Bu soruya su an net bir cevap bulamadim. Uzmanimiza WhatsApp uzerinden iletebilirsiniz:\n{whatsapp_link}', 'WhatsApp')


# ---------- Konsol Dongusu ----------
YARDIM = """Komutlar:
  /key <anahtar>   Groq API anahtarini ayarla (yedek bulut LLM icin)
  /model <adi>     Groq model degistir (varsayilan: llama-3.1-8b-instant)
  /temizle         Sohbet gecmisini sifirla
  /yardim          Bu mesaji goster
  /cikis           Programdan cik

Ollama (oncelikli, sinirsiz, bagimsiz):
  Bilgisayariniza ollama kurun (ollama.com), sonra "ollama pull llama3.1" yapin.
  Asistan otomatik algilar ve once Ollama'yi, bulamazsa Groq'u kullanir.
  OLLAMA_URL=http://localhost:11434  (ortam degiskeni ile ozellestirilebilir)
  OLLAMA_MODEL=llama3.1"""


def main():
    print('=' * 60)
    print('  Turquoise AI - Genel Yapay Zeka Asistani (Konsol)')
    print('=' * 60)

    try:
        veri = veri_yukle()
    except Exception as e:
        print(f'HATA: Veri dosyalari yuklenemedi: {e}')
        sys.exit(1)

    api_key = os.environ.get('GROQ_API_KEY', '')
    model = os.environ.get('GROQ_MODEL', 'llama-3.1-8b-instant')
    gecmis = []

    global ollama_durum
    ollama_durum = ollama_aktif_mi()
    if ollama_durum:
        mod = 'Bagimsiz (Ollama yerel LLM aktif - sinirsiz)'
    elif api_key:
        mod = 'Hibrit (Groq bulut LLM aktif)'
    else:
        mod = 'Yerel (LLM icin Ollama kurun veya /key kullanin)'
    print(f'Mod: {mod}')
    print(YARDIM)
    print('-' * 60)

    cevap, _ = cevap_uret(veri, gecmis, None, model, 'merhaba')
    print(f'\nAsistan: {cevap}\n')

    while True:
        try:
            girdi = input('Siz: ').strip()
        except (EOFError, KeyboardInterrupt):
            print('\nGorusmek uzere!')
            break
        if not girdi:
            continue

        norm = normalize(girdi)
        komut = girdi.lower()
        if norm in ('cikis', 'exit', 'quit'):
            print('Gorusmek uzere!')
            break
        elif komut == '/yardim':
            print(YARDIM)
            continue
        elif komut == '/temizle':
            gecmis.clear()
            print('Sohbet gecmisi sifirlandi.')
            continue
        elif girdi.startswith('/key'):
            parcalar = girdi.split(maxsplit=1)
            if len(parcalar) == 2 and parcalar[1].strip():
                api_key = parcalar[1].strip()
                print('API anahtari kaydedildi. Hibrit mod aktif!')
            else:
                print('Kullanim: /key gsk_xxxxxxxx')
            continue
        elif girdi.startswith('/model'):
            parcalar = girdi.split(maxsplit=1)
            if len(parcalar) == 2 and parcalar[1].strip():
                model = parcalar[1].strip()
                print(f'Model degistirildi: {model}')
            else:
                print(f'Mevcut model: {model}')
            continue

        cevap, kaynak = cevap_uret(veri, gecmis, api_key, model, girdi)
        print(f'\nAsistan: {cevap}')
        print(f'  [Kaynak: {kaynak}]\n')


if __name__ == '__main__':
    main()
