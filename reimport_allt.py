#!/usr/bin/env python3
"""
Ren reimport av ALLA filer (MOM, HPR, HQC, FPR) från Behandlade + Inkommande.
Rensar alla fakt/detalj-tabeller först, sedan processerar alla filer i ordning.
"""
import os, sys, glob, time, requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skogsmaskin_import_version_6 import (
    SUPABASE_URL, SUPABASE_KEY, BEHANDLADE, INKOMMANDE,
    init_supabase, parse_mom_file, parse_hpr_file, parse_hqc_file, parse_fpr_file,
    save_mom_to_supabase, save_hpr_to_supabase, save_hqc_to_supabase, save_fpr_to_supabase,
    process_file, logger,
    _GLOBAL_TID_ENTRIES, _GLOBAL_TID_OPERATORS
)
import skogsmaskin_import_version_6 as imp

HEADERS_DELETE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Prefer": "return=minimal"
}

def clear_table(table):
    """Rensa en tabell via DELETE med brett filter."""
    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/{table}?id=gte.0",
        headers=HEADERS_DELETE, timeout=30
    )
    if resp.status_code in (200, 204):
        print(f"  {table}: rensad")
    else:
        # Försök med annat filter
        resp2 = requests.delete(
            f"{SUPABASE_URL}/rest/v1/{table}?datum=gte.2000-01-01",
            headers=HEADERS_DELETE, timeout=30
        )
        if resp2.status_code in (200, 204):
            print(f"  {table}: rensad (via datum)")
        else:
            print(f"  {table}: FEL {resp.status_code} / {resp2.status_code}")

def main():
    if not init_supabase():
        print("Kunde inte ansluta till Supabase")
        return

    # 1. Rensa alla fakt/detalj-tabeller
    print("=" * 60)
    print("STEG 1: Rensar alla tabeller")
    print("=" * 60)
    tables_to_clear = [
        'fakt_tid', 'fakt_produktion', 'fakt_skift', 'fakt_avbrott',
        'fakt_sortiment', 'fakt_kalibrering', 'fakt_kalibrering_historik',
        'fakt_lass', 'fakt_lass_sortiment', 'fakt_skotning_status',
        'fakt_maskin_statistik',
        'detalj_stam', 'detalj_kontroll_stock', 'detalj_gps_spar',
        'meta_importerade_filer'
    ]
    for t in tables_to_clear:
        clear_table(t)

    # Rensa global state för MOM-dedup
    imp._GLOBAL_TID_ENTRIES.clear()
    imp._GLOBAL_TID_OPERATORS.clear()

    # 2. Samla alla filer från Behandlade
    print("\n" + "=" * 60)
    print("STEG 2: Samlar filer")
    print("=" * 60)

    behandlade_files = sorted(
        glob.glob(os.path.join(BEHANDLADE, "**", "*.mom"), recursive=True) +
        glob.glob(os.path.join(BEHANDLADE, "**", "*.hpr"), recursive=True) +
        glob.glob(os.path.join(BEHANDLADE, "**", "*.hqc"), recursive=True) +
        glob.glob(os.path.join(BEHANDLADE, "**", "*.fpr"), recursive=True)
    )

    inkommande_files = sorted(
        glob.glob(os.path.join(INKOMMANDE, "**", "*.mom"), recursive=True) +
        glob.glob(os.path.join(INKOMMANDE, "**", "*.hpr"), recursive=True) +
        glob.glob(os.path.join(INKOMMANDE, "**", "*.hqc"), recursive=True) +
        glob.glob(os.path.join(INKOMMANDE, "**", "*.fpr"), recursive=True)
    )

    ext_count = {}
    for f in behandlade_files:
        ext = os.path.splitext(f)[1].lower()
        ext_count[ext] = ext_count.get(ext, 0) + 1
    for ext, cnt in sorted(ext_count.items()):
        print(f"  Behandlade {ext}: {cnt} filer")

    ink_count = {}
    for f in inkommande_files:
        ext = os.path.splitext(f)[1].lower()
        ink_count[ext] = ink_count.get(ext, 0) + 1
    for ext, cnt in sorted(ink_count.items()):
        print(f"  Inkommande {ext}: {cnt} filer")

    total = len(behandlade_files) + len(inkommande_files)
    print(f"  Totalt: {total} filer")

    # 3. Processera Behandlade-filer direkt (utan att flytta)
    print("\n" + "=" * 60)
    print("STEG 3: Importerar från Behandlade")
    print("=" * 60)

    parsers = {
        '.mom': (parse_mom_file, save_mom_to_supabase, 'MOM'),
        '.hpr': (parse_hpr_file, save_hpr_to_supabase, 'HPR'),
        '.hqc': (parse_hqc_file, save_hqc_to_supabase, 'HQC'),
        '.fpr': (parse_fpr_file, save_fpr_to_supabase, 'FPR'),
    }

    ok = 0
    fel = 0
    for i, filepath in enumerate(behandlade_files):
        filnamn = os.path.basename(filepath)
        ext = os.path.splitext(filnamn)[1].lower()
        parse_fn, save_fn, filtyp = parsers[ext]

        try:
            data = parse_fn(filepath)
            success = save_fn(data)
            if success:
                ok += 1
                # Logga i meta
                maskin_id = data.get('maskin', {}).get('maskin_id', 'Okand')
                try:
                    requests.post(
                        f"{SUPABASE_URL}/rest/v1/meta_importerade_filer",
                        json={'filnamn': filnamn, 'filtyp': filtyp, 'maskin_id': maskin_id, 'status': 'OK'},
                        headers={**HEADERS_DELETE, "Content-Type": "application/json",
                                 "Prefer": "return=minimal"},
                        timeout=15
                    )
                except:
                    pass
            else:
                fel += 1
                logger.error(f"  Save misslyckades: {filnamn}")
        except Exception as e:
            fel += 1
            logger.error(f"  Fel vid {filnamn}: {e}")

        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{len(behandlade_files)} ({ok} ok, {fel} fel)")

    print(f"\n  Behandlade klar: {ok} ok, {fel} fel av {len(behandlade_files)}")

    # 4. Processera Inkommande-filer (flytta till Behandlade)
    if inkommande_files:
        print("\n" + "=" * 60)
        print("STEG 4: Importerar från Inkommande")
        print("=" * 60)
        ink_ok = 0
        for filepath in inkommande_files:
            try:
                if process_file(filepath):
                    ink_ok += 1
            except Exception as e:
                logger.error(f"  Inkommande fel: {os.path.basename(filepath)}: {e}")
        print(f"  Inkommande klar: {ink_ok}/{len(inkommande_files)}")

    # 5. Verifiera
    print("\n" + "=" * 60)
    print("STEG 5: Verifiering")
    print("=" * 60)
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Prefer": "count=exact"}
    verify_tables = [
        'fakt_tid', 'fakt_produktion', 'fakt_sortiment', 'fakt_lass',
        'fakt_kalibrering', 'detalj_stam', 'detalj_kontroll_stock',
        'meta_importerade_filer'
    ]
    for t in verify_tables:
        try:
            r = requests.head(f"{SUPABASE_URL}/rest/v1/{t}?select=*", headers=h, timeout=15)
            cr = r.headers.get('content-range', '').split('/')[-1]
            print(f"  {t}: {cr} rader")
        except:
            print(f"  {t}: FEL")

    # Krampamåla-verifiering
    print("\n=== Krampamåla (objekt 11118775) ===")
    h2 = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/fakt_tid?objekt_id=eq.11118775&order=datum.asc"
        f"&select=datum,processing_sek,terrain_sek,other_work_sek,kort_stopp_sek,"
        f"maintenance_sek,disturbance_sek,avbrott_sek,rast_sek,bransle_liter",
        headers=h2, timeout=30
    )
    rows = resp.json()
    tp=ts=to=tk=tm=td=ta=tr=tf=0
    for r in rows:
        tp += r.get('processing_sek',0) or 0
        ts += r.get('terrain_sek',0) or 0
        to += r.get('other_work_sek',0) or 0
        tk += r.get('kort_stopp_sek',0) or 0
        tm += r.get('maintenance_sek',0) or 0
        td += r.get('disturbance_sek',0) or 0
        ta += r.get('avbrott_sek',0) or 0
        tr += r.get('rast_sek',0) or 0
        tf += r.get('bransle_liter',0) or 0

    runtime = tp + ts + to
    g0 = runtime - tk
    g15 = runtime
    arb = g15 + tm + td + ta

    def hm(s): return f'{int(s//3600)}:{int((s%3600)//60):02d}'
    print(f"  G0  = {hm(g0)}  (PDF: 31:23)")
    print(f"  G15 = {hm(g15)}  (PDF: 33:27)")
    print(f"  Arb = {hm(arb)}  (PDF: 37:19)")
    print(f"  Rast= {hm(tr)}  (PDF: 0:16)")
    print(f"  Diesel = {tf:.1f}L  (PDF: 649.5L)")

if __name__ == "__main__":
    main()
