# Acik Kaynak Bilesenler

Bu projeyi olusturan acik kaynak teknolojiler ve katkilari.

## Yapay Zeka Modeli: Llama 3.1

- **Kaynak:** [github.com/meta-llama/llama-models](https://github.com/meta-llama/llama-models)
- **Sahibi:** Meta (Facebook)
- **Lisans:** Llama 3.1 Community License
- **Aciklama:** 8B parametreli acik kaynak LLM. Turkce dilinde iyi performans gosterir.
  Projede iki yolla kullanilir:
  1. **Ollama (yerel):** `ollama pull llama3.1` - %100 bagimsiz, ucretsiz, sinirsiz
  2. **Groq (bulut):** [groq.com](https://groq.com) uzerinden, ucretsiz API anahtari ile

## Yerel LLM Motoru: Ollama

- **Kaynak:** [github.com/ollama/ollama](https://github.com/ollama/ollama)
- **Lisans:** MIT
- **Aciklama:** Yapay zeka modellerini yerel bilgisayarda calistirmayi saglar.
  GPU veya CPU ile calisir, internet gerektirmez. Projeyi tamamen bagimsiz yapar.

## Bulut LLM Saglayicisi: Groq

- **Kaynak:** [github.com/groq](https://github.com/groq)
- **Hizmet:** Ucretsiz API ile Llama modellerini bulutta calistirir.
  Ollama olmadiginda yedek olarak kullanilir.

## Projenin Kendi Acik Kaynak Kodlari

Tum kodumuz acik kaynak ve MIT lisansiyla lisanslanmistir:

- **Hibrit Eslestirme Algoritmasi:** TF-IDF benzeri, Turkce ekler icin optimize
  kok bazli kelime eslestirme (`kelimeEslesir` fonksiyonu). Herhangi bir harici
  kutuphane gerektirmez.
- **Veri Seti:** `hasinder-ai-data/` klasorundeki tum JSON ve Markdown dosyalari
  acik kaynak verilerdir. Ek paket, API veya harici veri tabani gerektirmez.
- **Kullanim Hakki:** Projeyi istediginiz gibi kullanabilir, degistirebilir ve
  dagitabilirsiniz.

## Bagimliliklar

| Bilesen | Tur | Lisans | Gerekli mi? |
|---------|-----|--------|-------------|
| Node.js (v18+) | Calisma ortami | MIT | Hayir (web + konsol.js icin) |
| Python (3.8+) | Calisma ortami | PSF | Hayir (konsol.py icin) |
| Ollama | LLM motoru | MIT | Hayir (opsiyonel, onerilir) |
| Groq API | Bulut LLM | Ticari | Hayir (opsiyonel) |
| Internet baglantisi | Veri | - | Hayir (veri seti yeterli) |

## Neden Tamamen Bagimsiz?

Proje hicbir harici servise, API anahtarina veya internet baglantisina
**zorunlu** olarak ihtiyac duymaz:

1. **Veri seti** (`hasinder-ai-data/`) tum temel bilgiyi icerir - 48 soru-cevap,
   49 terim, 23 sehir bilgisi.
2. **Akilli eslestirme** bu veri setinde dogru cevabi bulur - Turkce ekleri
   anlar, kok bazli eslestirme yapar.
3. **Ollama** (kuruluysa) veri setinde olmayan sorular icin yerel LLM calistirir
   - internet, API anahtari ve limit yok.
4. **Groq** sadece yedek, istege bagli.

Bu mimari sayesinde AI asistaniniz **tamamen bagimsiz, her ortamda calisir ve
sinirsizdir.**
