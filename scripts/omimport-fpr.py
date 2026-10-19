#!/usr/bin/env python3
"""Omimport av FPR-filer (skotarlass) efter sortiments- och tidsfixen 2026-10-19.

Koden lagar bara nya importer. Två saker ligger fel i databasen för filer som lästes in före fixen:

  1. fakt_lass_sortiment saknas för filer där två PartialLoad hade samma produkt i ett lass (hela filens sortiment
     avvisades av Postgres: "ON CONFLICT DO UPDATE command cannot affect row a second time"). Kända filer 2026-10-19:
     Rössmåla_gallring_2024-020926-164111, GROT_Kroksjömåla_1_23_A_A-061026-150840, Brokamåla_L_S_Lev__25-200226-112802,
     Kjell_Erik_Lindström_Steglehylte-130326-123830, Steglehylte_gallring_2025-040326-094841.
  2. Tiderna: databasens fpr_tider_till_utc() har redan flyttat lossnings_tid/start_tid till verklig UTC, och en omimport
     skriver samma värde (offseten ur filen) — den ändrar alltså inget där, men lägger tid_ar_utc = true.

Omimporten är en upsert på samma nycklar som den vanliga importen: inga dubbletter, ingen radering, filen markeras inte
som importerad en gång till (meta_importerade_filer rörs inte). Statusautomatiken (planerad→pågående, avslut) körs INTE —
en gammal fil ska inte flytta ett objekt i dag.

    python scripts/omimport-fpr.py --lista                 # filerna i Behandlade, vad de ger, och vad databasen har
    python scripts/omimport-fpr.py --torrkor FIL.fpr       # tolka, visa, skriv inget
    python scripts/omimport-fpr.py FIL.fpr [FIL2.fpr ...]  # skriv
    python scripts/omimport-fpr.py --alla-utan-sortiment   # alla filer vars lass saknar sortimentsrader i databasen

Facit efter körning: för varje fil är antalet rader i fakt_lass_sortiment med filnamnet lika med antalet unika
(lass, sortiment) i filen. Skriptet kontrollerar det och stannar vid avvikelse.
"""
import argparse
import importlib.util
import os
import sys

import requests

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BEHANDLADE = r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer\Behandlade"


def ladda_importmodul():
    spec = importlib.util.spec_from_file_location('imp6', os.path.join(ROT, 'skogsmaskin_import_version_6.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not mod.init_supabase():
        raise SystemExit('FEL: kunde inte ansluta till Supabase — avbryter utan att röra något')
    # En gammal fil får inte flytta ett objekts status.
    mod.auto_status_pagaende = lambda data: None
    mod.auto_avslut = lambda data: None
    return mod


def fpr_filer():
    ut = []
    if not os.path.isdir(BEHANDLADE):
        return ut
    for maskin in sorted(os.listdir(BEHANDLADE)):
        for sub in ('FPR', 'fpr'):
            d = os.path.join(BEHANDLADE, maskin, sub)
            if os.path.isdir(d):
                ut += [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.lower().endswith('.fpr')]
                break
    return ut


def forvantat(mod, data):
    """(antal lass, antal unika (lass, sortiment)-rader) som filen ska ge."""
    rader = []
    for l in data['lass']:
        if not l.get('objekt_id'):
            continue
        for s in l.get('sortiment', []):
            if s.get('sortiment_id') and ((s.get('volym_m3sob') or 0) > 0 or (s.get('volym_m3sub') or 0) > 0):
                rader.append({'maskin_id': l['maskin_id'], 'objekt_id': l['objekt_id'], 'datum': l['datum'],
                              'lass_nummer': l['lass_nummer'], 'sortiment_id': s['sortiment_id'],
                              'volym_m3sob': s.get('volym_m3sob'), 'volym_m3sub': s.get('volym_m3sub')})
    return len([l for l in data['lass'] if l.get('objekt_id')]), len(mod.aggregera_lass_sortiment(rader))


def antal_i_db(mod, tabell, filnamn):
    h = dict(mod.SUPABASE_HEADERS)
    h['Prefer'] = 'count=exact'
    h['Range'] = '0-0'
    r = requests.get(f'{mod.SUPABASE_URL}/rest/v1/{tabell}?select=id&filnamn=eq.{requests.utils.quote(filnamn)}',
                     headers=h, timeout=60)
    if r.status_code not in (200, 206):
        raise RuntimeError(f'{tabell}: {r.status_code} {r.text[:200]}')
    return int(r.headers['Content-Range'].split('/')[1])


def kor(mod, sokvag, skriv):
    filnamn = os.path.basename(sokvag)
    data = mod.parse_fpr_file(sokvag)
    n_lass, n_sort = forvantat(mod, data)
    db_lass, db_sort = antal_i_db(mod, 'fakt_lass', filnamn), antal_i_db(mod, 'fakt_lass_sortiment', filnamn)
    print(f'{filnamn}: filen ger {n_lass} lass / {n_sort} sortimentsrader — databasen har {db_lass} / {db_sort}')
    if not skriv:
        return True
    if not mod.save_fpr_to_supabase(data):
        print('  ✗ sparandet misslyckades — se loggen och import_fel')
        return False
    efter = antal_i_db(mod, 'fakt_lass_sortiment', filnamn)
    ok = efter == n_sort
    print(f'  {"✓" if ok else "✗"} fakt_lass_sortiment efter körning: {efter} (väntat {n_sort})')
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('filer', nargs='*')
    ap.add_argument('--lista', action='store_true')
    ap.add_argument('--torrkor', action='store_true')
    ap.add_argument('--alla-utan-sortiment', action='store_true')
    a = ap.parse_args()
    mod = ladda_importmodul()
    if a.lista or a.alla_utan_sortiment:
        todo = []
        for f in fpr_filer():
            data = mod.parse_fpr_file(f)
            n_lass, n_sort = forvantat(mod, data)
            db_sort = antal_i_db(mod, 'fakt_lass_sortiment', os.path.basename(f))
            marke = '  <-- saknar sortiment' if db_sort < n_sort else ''
            if a.lista:
                print(f'{os.path.basename(f)}: {n_lass} lass, {n_sort} sortimentsrader väntat, {db_sort} i databasen{marke}')
            if db_sort < n_sort:
                todo.append(f)
        if not a.alla_utan_sortiment:
            return
        a.filer = todo
    if not a.filer:
        raise SystemExit('Inga filer angivna.')
    alla_ok = True
    for f in a.filer:
        alla_ok &= kor(mod, f if os.path.isabs(f) else os.path.join(os.getcwd(), f), skriv=not a.torrkor)
    if not alla_ok:
        raise SystemExit('Minst en fil gav inte väntat resultat — stannar.')


if __name__ == '__main__':
    main()
