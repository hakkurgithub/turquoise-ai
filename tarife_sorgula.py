"""
Türk Gümrük Tarife Cetveli (TGTC) Sorgu Aracı
=============================================
GTİP kodundan fasıl bilgisi çıkarma ve ürün arama aracı.

Kullanım:
    python tarife_sorgula.py
    python tarife_sorgula.py 8471.80
    python tarife_sorgula.py --ara "bilgisayar"
"""

import json
import sys
import os

# JSON dosyasını yükle
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_FILE = os.path.join(SCRIPT_DIR, "gumruk-tarife-cetveli-fasillar.json")

def yukle():
    """Tarife cetveli JSON dosyasını yükler."""
    with open(JSON_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def gtip_den_fasil(gtip_kodu, veri):
    """
    GTİP kodundan fasıl ve bölüm bilgisi çıkarır.
    
    Args:
        gtip_kodu: GTİP kodu (örn: "8471.80", "8471", "62.03")
        veri: Tarife cetveli verisi
    
    Returns:
        dict: Fasıl ve bölüm bilgisi
    """
    # GTİP kodunun ilk 2 hanesini al (fasıl numarası)
    temiz = gtip_kodu.strip().replace(" ", "")
    
    # Noktadan önceki kısmı al
    if "." in temiz:
        temiz = temiz.split(".")[0]
    
    # İlk 2 haneyi al
    if len(temiz) >= 2:
        fasil_no = int(temiz[:2])
    elif len(temiz) == 1:
        fasil_no = int(temiz)
    else:
        return None
    
    # Fasılı ara
    for bolum in veri["bolumler"]:
        for fasil in bolum["fasillar"]:
            if fasil["fasil_no"] == fasil_no:
                return {
                    "gtip_kodu": gtip_kodu,
                    "fasil_no": fasil_no,
                    "fasil_adi": fasil["fasil_adi"],
                    "fasil_aciklama": fasil["aciklama"],
                    "bolum_no": bolum["bolum_no"],
                    "bolum_adi": bolum["bolum_adi"]
                }
    
    return None

def fasil_den_urunler(fasil_no, veri):
    """
    Fasıl numarasından ürün bilgilerini döndürür.
    
    Args:
        fasil_no: Fasıl numarası (örn: 62, 84)
        veri: Tarife cetveli verisi
    
    Returns:
        dict: Fasıl bilgisi
    """
    for bolum in veri["bolumler"]:
        for fasil in bolum["fasillar"]:
            if fasil["fasil_no"] == fasil_no:
                return {
                    "fasil_no": fasil_no,
                    "fasil_adi": fasil["fasil_adi"],
                    "fasil_aciklama": fasil["aciklama"],
                    "bolum_no": bolum["bolum_no"],
                    "bolum_adi": bolum["bolum_adi"]
                }
    return None

def ara(anahtar_kelime, veri):
    """
    Anahtar kelimeyle fasıl araması yapar.
    
    Args:
        anahtar_kelime: Aranacak kelime (örn: "bilgisayar", "giyim", "plastik")
        veri: Tarife cetveli verisi
    
    Returns:
        list: Eşleşen fasıllar listesi
    """
    sonuclar = []
    arama = anahtar_kelime.lower()
    
    for bolum in veri["bolumler"]:
        for fasil in bolum["fasillar"]:
            # Fasıl adında ara
            if arama in fasil["fasil_adi"].lower():
                sonuclar.append({
                    "tip": "fasil_adi",
                    "eslesme": fasil["fasil_adi"],
                    "fasil_no": fasil["fasil_no"],
                    "fasil_adi": fasil["fasil_adi"],
                    "aciklama": fasil["aciklama"],
                    "bolum_no": bolum["bolum_no"],
                    "bolum_adi": bolum["bolum_adi"]
                })
            # Açıklamada ara
            elif arama in fasil["aciklama"].lower():
                sonuclar.append({
                    "tip": "aciklama",
                    "eslesme": fasil["aciklama"][:100],
                    "fasil_no": fasil["fasil_no"],
                    "fasil_adi": fasil["fasil_adi"],
                    "aciklama": fasil["aciklama"],
                    "bolum_no": bolum["bolum_no"],
                    "bolum_adi": bolum["bolum_adi"]
                })
            # Bölüm adında ara
            elif arama in bolum["bolum_adi"].lower():
                sonuclar.append({
                    "tip": "bolum_adi",
                    "eslesme": bolum["bolum_adi"],
                    "fasil_no": fasil["fasil_no"],
                    "fasil_adi": fasil["fasil_adi"],
                    "aciklama": fasil["aciklama"],
                    "bolum_no": bolum["bolum_no"],
                    "bolum_adi": bolum["bolum_adi"]
                })
    
    return sonuclar

def tum_fasillar(veri):
    """Tüm fasılları listeler."""
    sonuclar = []
    for bolum in veri["bolumler"]:
        for fasil in bolum["fasillar"]:
            sonuclar.append({
                "fasil_no": fasil["fasil_no"],
                "fasil_adi": fasil["fasil_adi"],
                "bolum_no": bolum["bolum_no"],
                "bolum_adi": bolum["bolum_adi"]
            })
    return sonuclar

def bolum_listele(veri):
    """Tüm bölümleri ve fasıllarını listeler."""
    sonuclar = []
    for bolum in veri["bolumler"]:
        fasil_listesi = [f"{f['fasil_no']}. {f['fasil_adi']}" for f in bolum["fasillar"]]
        sonuclar.append({
            "bolum_no": bolum["bolum_no"],
            "bolum_adi": bolum["bolum_adi"],
            "fasillar": fasil_listesi
        })
    return sonuclar

def format_bilgi(bilgi):
    """Fasıl bilgisini formatlar."""
    if bilgi is None:
        return "❌ Bu GTİP kodu için Fasıl bulunamadı."
    
    return f"""
╔══════════════════════════════════════════════════════════════╗
║           TÜRK GÜMRÜK TARİFE CETVELİ - FASIL BİLGİSİ        ║
╠══════════════════════════════════════════════════════════════╣
║  GTİP Kodu    : {bilgi['gtip_kodu']}
║  Fasıl No     : {bilgi['fasil_no']}
║  Fasıl Adı    : {bilgi['fasil_adi']}
║  Bölüm No     : {bilgi['bolum_no']}
║  Bölüm Adı    : {bilgi['bolum_adi']}
╠══════════════════════════════════════════════════════════════╣
║  Açıklama     : {bilgi['fasil_aciklama'][:80]}
╚══════════════════════════════════════════════════════════════╝
"""

def format_aramasonucu(sonuclar, arama):
    """Arama sonuçlarını formatlar."""
    if not sonuclar:
        return f"❌ '{arama}' için sonuç bulunamadı."
    
    cikti = f"\n╔══════════════════════════════════════════════════════════════╗\n"
    cikti += f"║  '{arama}' İÇİN ARAMA SONUÇLARI ({len(sonuclar)} sonuç)\n"
    cikti += f"╠══════════════════════════════════════════════════════════════╣\n"
    
    for i, s in enumerate(sonuclar[:20], 1):  # En fazla 20 sonuç
        cikti += f"║  {i:2d}. [{s['fasil_no']:2d}] {s['fasil_adi']}\n"
        cikti += f"║      Bölüm {s['bolum_no']}: {s['bolum_adi']}\n"
        cikti += f"║      {s['aciklama'][:60]}...\n"
        cikti += f"║\n"
    
    if len(sonuclar) > 20:
        cikti += f"║  ... ve {len(sonuclar) - 20} sonuç daha\n"
    
    cikti += f"╚══════════════════════════════════════════════════════════════╝\n"
    return cikti

def ana_menu():
    """İnteraktif ana menü."""
    veri = yukle()
    
    while True:
        print("\n" + "=" * 60)
        print("  TÜRK GÜMRÜK TARİFE CETVELİ SORGU ARACI")
        print("=" * 60)
        print("  1. GTİP Kodundan Fasıl Bul")
        print("  2. Fasıl Numarasından Bilgi Al")
        print("  3. Ürün/Kelime Ara")
        print("  4. Tüm Fasılları Listele")
        print("  5. Bölüm Listele")
        print("  0. Çıkış")
        print("-" * 60)
        
        secim = input("  Seçiminiz: ").strip()
        
        if secim == "1":
            gtip = input("  GTİP Kodu girin (örn: 8471.80): ").strip()
            if gtip:
                sonuc = gtip_den_fasil(gtip, veri)
                print(format_bilgi(sonuc))
        
        elif secim == "2":
            try:
                fasil_no = int(input("  Fasıl numarası girin (örn: 62): ").strip())
                sonuc = fasil_den_urunler(fasil_no, veri)
                if sonuc:
                    print(f"\n  Fasıl {sonuc['fasil_no']}: {sonuc['fasil_adi']}")
                    print(f"  Bölüm {sonuc['bolum_no']}: {sonuc['bolum_adi']}")
                    print(f"  Açıklama: {sonuc['aciklama']}")
                else:
                    print("  ❌ Fasıl bulunamadı.")
            except ValueError:
                print("  ❌ Geçersiz numara.")
        
        elif secim == "3":
            arama = input("  Aranacak kelime girin: ").strip()
            if arama:
                sonuclar = ara(arama, veri)
                print(format_aramasonucu(sonuclar, arama))
        
        elif secim == "4":
            fasil_listesi = tum_fasillar(veri)
            print(f"\n  Toplam {len(fasil_listesi)} Fasıl:")
            for f in fasil_listesi:
                print(f"  [{f['fasil_no']:2d}] {f['fasil_adi'][:50]} (Bölüm {f['bolum_no']})")
        
        elif secim == "5":
            bolumler = bolum_listele(veri)
            for b in bolumler:
                print(f"\n  Bölüm {b['bolum_no']}: {b['bolum_adi']}")
                for f in b['fasillar']:
                    print(f"    {f}")
        
        elif secim == "0":
            print("  Güle güle!")
            break
        
        else:
            print("  ❌ Geçersiz seçim.")

def main():
    """Ana fonksiyon."""
    # Komut satırı argümanları
    if len(sys.argv) > 1:
        veri = yukle()
        
        arg = sys.argv[1]
        
        if arg == "--ara" and len(sys.argv) > 2:
            arama = " ".join(sys.argv[2:])
            sonuclar = ara(arama, veri)
            print(format_aramasonucu(sonuclar, arama))
        
        elif arg == "--fasil" and len(sys.argv) > 2:
            try:
                fasil_no = int(sys.argv[2])
                sonuc = fasil_den_urunler(fasil_no, veri)
                if sonuc:
                    print(f"\n  Fasıl {sonuc['fasil_no']}: {sonuc['fasil_adi']}")
                    print(f"  Bölüm {sonuc['bolum_no']}: {sonuc['bolum_adi']}")
                    print(f"  Açıklama: {sonuc['aciklama']}")
                else:
                    print("  ❌ Fasıl bulunamadı.")
            except ValueError:
                print("  ❌ Geçersiz numara.")
        
        elif arg == "--liste":
            bolumler = bolum_listele(veri)
            for b in bolumler:
                print(f"\n  Bölüm {b['bolum_no']}: {b['bolum_adi']}")
                for f in b['fasillar']:
                    print(f"    {f}")
        
        else:
            # GTİP kodu olarak dene
            sonuc = gtip_den_fasil(arg, veri)
            print(format_bilgi(sonuc))
    
    else:
        # İnteraktif mod
        ana_menu()

if __name__ == "__main__":
    main()
