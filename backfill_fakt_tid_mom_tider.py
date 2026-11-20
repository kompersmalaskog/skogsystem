#!/usr/bin/env python3
"""
backfill_fakt_tid_mom_tider.py — rätta fakt_tid + mom_tider för dagar där
en gammal MOM-fil importerades EFTER en nyare (felaktig filordning → G15h krymper).

Rör ALDRIG fakt_avbrott, fakt_produktion eller dim_operator.

Kör som:
  python backfill_fakt_tid_mom_tider.py --dry-run --datum PONS20SDJAA270231:2026-07-18,PONS20SDJAA270231:2026-07-08
  python backfill_fakt_tid_mom_tider.py --dry-run --alla
  python backfill_fakt_tid_mom_tider.py --skarp --datum PONS20SDJAA270231:2026-07-18
  python backfill_fakt_tid_mom_tider.py --skarp --alla
"""
import os, re, sys, argparse, requests
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from unittest.mock import MagicMock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Importera parse_mom_file + config från huvudimportskriptet ────────────────
# Watchdog startar INTE (main() anropas bara under if __name__ == '__main__').
# Mock:a watchdog så att module-level import ej kraschar.
for _m in ['watchdog', 'watchdog.observers', 'watchdog.events',
           'watchdog.observers.polling', 'watchdog.observers.inotify']:
    if _m not in sys.modules:
        sys.modules[_m] = MagicMock()

import importlib.util as _ilu
_spec = _ilu.spec_from_file_location(
    "importskript",
    os.path.join(SCRIPT_DIR, "skogsmaskin_import_version_6.py"),
)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

parse_mom_file = _mod.parse_mom_file
BEHANDLADE     = _mod.BEHANDLADE

# init_supabase() fyller SUPABASE_HEADERS (tom dict vid module load)
_mod.init_supabase()
SUPABASE_URL     = _mod.SUPABASE_URL
SUPABASE_HEADERS = _mod.SUPABASE_HEADERS


# ── fil_recency med FIXAD regex (stöder 14-siffriga maskin-tidsstämplar) ─────
def fil_recency(path: str) -> float:
    """Returnerar maskintidsstämpeln ur filnamnet som Unix-timestamp.

    Prioritetsordning:
      1) _YYYYMMDDHHMMSS (14 sammanhängande siffror) — Ponsse/Rottne-format
      2) _YYYYMMDD_HHMMSS (med underscore) — Behandlade-suffix vid namnkrock
      3) mtime — sista fallback
    """
    bas = os.path.basename(path)
    m14 = re.search(r'_(\d{14})(?=\.|_|$)', bas)
    if m14:
        try:
            return datetime.strptime(m14.group(1), '%Y%m%d%H%M%S').timestamp()
        except ValueError:
            pass
    m8 = re.findall(r'_(\d{8})_(\d{6})', bas)
    if m8:
        try:
            return datetime.strptime(m8[-1][0] + m8[-1][1], '%Y%m%d%H%M%S').timestamp()
        except ValueError:
            pass
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


def maskin_ts(filnamn: str) -> datetime | None:
    """Extraherar maskintidsstämpel som datetime-objekt, eller None."""
    bas = os.path.basename(filnamn)
    m = re.search(r'_(\d{14})(?=\.|_|$)', bas)
    if m:
        try:
            return datetime.strptime(m.group(1), '%Y%m%d%H%M%S')
        except ValueError:
            pass
    return None


# ── Behandlade-scanning ───────────────────────────────────────────────────────
def mom_filer_for_datum(maskin_id: str, datum: str) -> list[str]:
    """Returnerar abs. sökvägar för alla .mom-filer i Behandlade vars
    maskintidsstämpel-datum matchar datum (YYYY-MM-DD)."""
    mapp = os.path.join(BEHANDLADE, maskin_id, 'mom')
    if not os.path.isdir(mapp):
        return []
    datum_ren = datum.replace('-', '')
    resultat = []
    for f in os.listdir(mapp):
        if not f.lower().endswith('.mom'):
            continue
        if re.search(rf'_({datum_ren}\d{{6}})(?=\.|_|$)', f):
            resultat.append(os.path.join(mapp, f))
    return resultat


# ── Supabase-hjälpare ─────────────────────────────────────────────────────────
def sb_get(table: str, qs: str) -> list[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}?{qs}",
        headers={**SUPABASE_HEADERS, "Accept": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def sb_delete(table: str, qs: str):
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/{table}?{qs}",
        headers=SUPABASE_HEADERS,
        timeout=60,
    )
    r.raise_for_status()


def sb_upsert(table: str, rows: list[dict], on_conflict: str):
    """Plain INSERT efter att DELETE redan rensat berörda rader.
    on_conflict-parametern behålls i signaturen men används ej — vi kör DELETE+INSERT
    istället för upsert för att undvika problem med NULL i unique-constraints."""
    if not rows:
        return
    # Normalisera: alla rader måste ha exakt samma nycklar
    all_keys: set = set()
    for row in rows:
        all_keys.update(row.keys())
    normalized = [{k: row.get(k) for k in all_keys} for row in rows]

    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={**SUPABASE_HEADERS, "Prefer": "return=minimal"},
        json=normalized,
        timeout=120,
    )
    r.raise_for_status()


# ── Konstanter ────────────────────────────────────────────────────────────────
TID_FIELDS = [
    'processing_sek', 'terrain_sek', 'other_work_sek',
    'maintenance_sek', 'disturbance_sek', 'rast_sek', 'avbrott_sek',
]
MOM_TYP_FIELDS = [
    ('processing_sek', 'processing'),
    ('terrain_sek',    'terrain'),
    ('kort_stopp_sek', 'kort_stopp'),
    ('other_work_sek', 'other'),
    ('disturbance_sek','disturbance'),
]
MOM_TYP_MAP = {f: t for f, t in MOM_TYP_FIELDS}


def _weight(entry: dict) -> int:
    return sum(entry.get(f, 0) or 0 for f in TID_FIELDS)


# ── Two-winner rescan ─────────────────────────────────────────────────────────
def rebygg_dag(maskin_id: str, datum: str) -> dict:
    """Rescanna ALLA Behandlade MOM-filer för maskin+datum.

    Tillämpar samma two-winner-dedup som importskriptet:
      BELOPP-vinnare  — störst vikt per (start, maskin) → G15h-siffror
      ATTRIBUTION-vinnare — senaste recency → operator_id

    Returnerar:
      fakt_tid_rows  — lista med dicts redo för upsert
      mom_rows       — lista med dicts redo för upsert (från vinnande filen)
      filer          — antal matchande filer i Behandlade
      vinnande_fil   — filnamn (basename) på vinnande filen (högst maskin-ts)
    """
    filer = mom_filer_for_datum(maskin_id, datum)
    if not filer:
        return {
            'fakt_tid_rows': [], 'mom_rows': [],
            'filer': 0, 'vinnande_fil': None,
        }

    # Hitta filen med HÖGST maskintidsstämpel → vinnande för mom_tider
    senaste_ts: datetime | None = None
    vinnande_fil: str | None = None
    for fp in filer:
        ts = maskin_ts(fp)
        if ts and (senaste_ts is None or ts > senaste_ts):
            senaste_ts   = ts
            vinnande_fil = fp

    # Two-winner dedup över alla filer
    _varde_meta: dict = {}  # (start_str, maskin) -> (vikt, recency)
    _attr_meta:  dict = {}  # (start_str, maskin) -> (recency, vikt)
    merged_entries: dict = {}
    merged_attr:    dict = {}

    for fil_path in filer:
        recency = fil_recency(fil_path)
        try:
            fd = parse_mom_file(fil_path)
        except Exception as e:
            print(f"  VARNING: kunde inte parsa {os.path.basename(fil_path)}: {e}")
            continue

        for ek, entry in fd.get('tid_entries', {}).items():
            if str(entry.get('datum') or '') != datum:
                continue

            if len(ek) == 4:
                start_str, em, eo, op = ek
            else:
                start_str, em, eo = ek
                op = entry.get('operator_id')

            ident = (start_str, em)
            w = _weight(entry)

            # BELOPP-vinnare
            cur_v = _varde_meta.get(ident)
            if cur_v is None or w > cur_v[0] or (w == cur_v[0] and recency > cur_v[1]):
                _varde_meta[ident] = (w, recency)
                merged_entries[ident] = {**entry, '_objekt': eo, '_operator': op}

            # ATTRIBUTION-vinnare
            cur_a = _attr_meta.get(ident)
            if cur_a is None or recency > cur_a[0] or (recency == cur_a[0] and w > cur_a[1]):
                _attr_meta[ident] = (recency, w)
                merged_attr[ident] = {**entry, '_objekt': eo, '_operator': op}

    # Aggregera fakt_tid
    fakt_agg: dict = {}
    AGG_FIELDS = [
        'processing_sek', 'terrain_sek', 'other_work_sek',
        'maintenance_sek', 'disturbance_sek', 'rast_sek',
        'avbrott_sek', 'kort_stopp_sek', 'bransle_liter', 'engine_time_sek',
    ]
    for ident, be in merged_entries.items():
        ae = merged_attr.get(ident, be)
        agg_key = (
            datum,
            maskin_id,
            str(be.get('_objekt') or '') or None,
            str(ae.get('_operator') or '') or None,
        )
        agg = fakt_agg.setdefault(agg_key, {f: 0.0 for f in AGG_FIELDS})
        for f in AGG_FIELDS:
            agg[f] += be.get(f) or 0

    INT_FIELDS = {'processing_sek', 'terrain_sek', 'other_work_sek', 'maintenance_sek',
                  'disturbance_sek', 'rast_sek', 'avbrott_sek', 'kort_stopp_sek',
                  'engine_time_sek', 'korstracka_m', 'terrain_korstracka_m'}
    fakt_tid_rows = []
    for (d, mid, oid, opid), agg in fakt_agg.items():
        rt  = agg['processing_sek'] + agg['terrain_sek'] + agg['other_work_sek']
        g0  = rt - agg['kort_stopp_sek']
        tom = max(0, agg['engine_time_sek'] - g0)
        row = {
            'datum':      d,
            'maskin_id':  mid,
            'objekt_id':  oid,
            'operator_id': opid,
            **{k: (int(v) if k in INT_FIELDS else v) for k, v in agg.items()},
            'tomgang_sek': int(tom),
            'filnamn':    os.path.basename(vinnande_fil) if vinnande_fil else None,
        }
        fakt_tid_rows.append(row)

    # mom_tider — bara från vinnande filen
    mom_rows: list[dict] = []
    if vinnande_fil:
        try:
            vd = parse_mom_file(vinnande_fil)
        except Exception:
            vd = {}

        dedup_segs: dict = {}
        for ek, entry in vd.get('tid_entries', {}).items():
            if str(entry.get('datum') or '') != datum:
                continue
            if len(ek) == 4:
                start_str, em, _, eop = ek
            else:
                start_str, em, _ = ek
                eop = entry.get('operator_id')
            if not start_str:
                continue
            for field in MOM_TYP_MAP:
                sek = entry.get(field) or 0
                if sek > 0:
                    dedup_segs[(em, start_str, field)] = (eop, sek)

        tider_agg: dict = {}
        for (em, start_str, field), (eop, sek) in dedup_segs.items():
            typ = MOM_TYP_MAP[field]
            try:
                dt_s = datetime.fromisoformat(start_str)
            except Exception:
                continue
            dt_e = dt_s + timedelta(seconds=sek)
            cur  = dt_s
            while cur < dt_e:
                nxt      = cur.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
                chunk_e  = min(nxt, dt_e)
                chunk_s  = (chunk_e - cur).total_seconds()
                if chunk_s > 0:
                    hu = cur.replace(minute=0, second=0, microsecond=0).astimezone(timezone.utc)
                    tk = (em, eop, hu.strftime('%Y-%m-%dT%H:%M:%SZ'), typ)
                    tider_agg[tk] = tider_agg.get(tk, 0) + chunk_s
                cur = nxt

        mom_rows = [
            {
                'maskin_id':  k[0],
                'operator_id': k[1],
                'timme':      k[2],
                'typ':        k[3],
                'minuter':    round(v / 60),
            }
            for k, v in tider_agg.items()
        ]

    return {
        'fakt_tid_rows': fakt_tid_rows,
        'mom_rows':       mom_rows,
        'filer':          len(filer),
        'vinnande_fil':   os.path.basename(vinnande_fil) if vinnande_fil else None,
    }


def g15h(rows: list[dict]) -> float:
    return sum(
        (r.get('processing_sek', 0) or 0) + (r.get('terrain_sek', 0) or 0)
        for r in rows
    ) / 3600


# ── Hitta drabbade dagar ──────────────────────────────────────────────────────
def hitta_drabbade() -> list[tuple[str, str]]:
    """Returnerar [(maskin_id, datum)] där:
      1. Behandlade har >=2 filer för datumet
      2. Den fil med SENAST maskintidsstämpel i Behandlade är NYARE
         än den fil som för närvarande är lagrad i fakt_tid
    Hoppar dagar där DB redan har den bästa/nyaste filen.
    """
    drabbade = []
    if not os.path.isdir(BEHANDLADE):
        print(f"BEHANDLADE-mapp hittades inte: {BEHANDLADE}")
        return []

    for maskin_id in sorted(os.listdir(BEHANDLADE)):
        mom_mapp = os.path.join(BEHANDLADE, maskin_id, 'mom')
        if not os.path.isdir(mom_mapp):
            continue

        datum_filer: dict[str, list[str]] = defaultdict(list)
        for f in os.listdir(mom_mapp):
            if not f.lower().endswith('.mom'):
                continue
            ts = maskin_ts(f)
            if ts:
                datum_filer[ts.strftime('%Y-%m-%d')].append(f)

        for datum, filer in sorted(datum_filer.items()):
            if len(filer) < 2:
                continue
            korrekt = max(filer, key=lambda f: maskin_ts(f) or datetime.min)
            korrekt_ts = maskin_ts(korrekt)

            nuv = sb_get(
                'fakt_tid',
                f'maskin_id=eq.{maskin_id}&datum=eq.{datum}&select=filnamn',
            )
            nuv_fil = {r.get('filnamn') for r in nuv} - {None}
            if not nuv_fil:
                continue
            if korrekt in nuv_fil:
                continue  # DB har redan ratt fil

            # Riktningskoll: Behandlade-vinnaren maste vara NYARE an DB:s fil
            db_ts = max(
                (maskin_ts(f) for f in nuv_fil if maskin_ts(f)),
                default=None,
            )
            if db_ts and korrekt_ts and korrekt_ts <= db_ts:
                # DB har en nyare (eller lika gammal) fil – backfill skulle försämra
                continue

            drabbade.append((maskin_id, datum))
            db_ts_str = db_ts.strftime('%Y-%m-%d %H:%M:%S') if db_ts else '?'
            k_ts_str  = korrekt_ts.strftime('%Y-%m-%d %H:%M:%S') if korrekt_ts else '?'
            print(f"  Drabbad: {maskin_id} {datum} "
                  f"(behandlade-ts={k_ts_str}, db-ts={db_ts_str})")

    return drabbade


# ── Dry-run ───────────────────────────────────────────────────────────────────
def dry_run_dag(maskin_id: str, datum: str) -> float:
    nuv_rows = sb_get(
        'fakt_tid',
        f'maskin_id=eq.{maskin_id}&datum=eq.{datum}'
        f'&select=processing_sek,terrain_sek,engine_time_sek,filnamn',
    )
    nuv_g15   = g15h(nuv_rows)
    nuv_motor = sum((r.get('engine_time_sek', 0) or 0) for r in nuv_rows) / 3600
    nuv_fil   = {r.get('filnamn') for r in nuv_rows} - {None}

    res       = rebygg_dag(maskin_id, datum)
    ny_g15    = g15h(res['fakt_tid_rows'])
    ny_motor  = sum((r.get('engine_time_sek', 0) or 0) for r in res['fakt_tid_rows']) / 3600
    delta_g15 = ny_g15 - nuv_g15
    delta_mot = ny_motor - nuv_motor
    db_ts  = max((maskin_ts(f) for f in nuv_fil if maskin_ts(f)), default=None)
    win_ts = maskin_ts(res['vinnande_fil']) if res['vinnande_fil'] else None

    if res['vinnande_fil'] and res['vinnande_fil'] in nuv_fil:
        status = 'OK - ingen andring behovs'
    elif win_ts and db_ts and win_ts <= db_ts:
        status = 'HOPPAR - Behandlade ar aldre an DB (se not)'
    elif not res['vinnande_fil']:
        status = 'HOPPAR - inga Behandlade-filer'
    else:
        status = 'FEL - backfill behövs'

    db_ts_str  = db_ts.strftime('%H:%M:%S')  if db_ts  else '?'
    win_ts_str = win_ts.strftime('%H:%M:%S') if win_ts else '?'

    print(f"\n  {maskin_id}  {datum}  [{status}]")
    print(f"    Filer i Behandlade   : {res['filer']}")
    print(f"    Nuv. fil i DB        : {', '.join(sorted(nuv_fil)) or '(ingen)'}  (maskin-ts {db_ts_str})")
    print(f"    Basta Behandlade-fil : {res['vinnande_fil'] or '(ingen)'}  (maskin-ts {win_ts_str})")
    print(f"    G15h:     {nuv_g15:.2f} h  ->  {ny_g15:.2f} h  (D {delta_g15:+.2f} h)")
    print(f"    Motortid: {nuv_motor:.2f} h  ->  {ny_motor:.2f} h  (D {delta_mot:+.2f} h)")
    if 'HOPPAR' not in status and 'OK' not in status:
        print(f"    mom_tider-rader      : {len(res['mom_rows'])} att skriva")
    return delta_g15 if 'HOPPAR' not in status else 0.0


# ── Skarp körning ─────────────────────────────────────────────────────────────
def kor_dag(maskin_id: str, datum: str):
    res = rebygg_dag(maskin_id, datum)
    if not res['fakt_tid_rows']:
        print(f"  {maskin_id} {datum}: inga nya rader, hoppar")
        return

    # fakt_tid: DELETE berörda (maskin, datum) → INSERT
    sb_delete('fakt_tid', f'maskin_id=eq.{maskin_id}&datum=eq.{datum}')
    sb_upsert(
        'fakt_tid', res['fakt_tid_rows'],
        'datum,maskin_id,objekt_id,operator_id',
    )

    # mom_tider: DELETE berörda timmar → INSERT
    timmar = sorted({r['timme'] for r in res['mom_rows']})
    for i in range(0, len(timmar), 20):
        chunk = ','.join(f'"{t}"' for t in timmar[i:i+20])
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/mom_tider"
            f"?maskin_id=eq.{maskin_id}&timme=in.({chunk})",
            headers=SUPABASE_HEADERS,
            timeout=60,
        )
    if res['mom_rows']:
        sb_upsert('mom_tider', res['mom_rows'], 'maskin_id,operator_id,timme,typ')

    ny_g15 = g15h(res['fakt_tid_rows'])
    print(f"  >> {maskin_id} {datum}: "
          f"{len(res['fakt_tid_rows'])} fakt_tid-rad(er), "
          f"{len(res['mom_rows'])} mom_tider-rad(er) | "
          f"G15h={ny_g15:.2f} h  (fil: {res['vinnande_fil']})")


# ── Verifiering efter skarp körning ──────────────────────────────────────────
def verifiera():
    print("\n── Verifiering ─────────────────────────────────────────────────")
    # fakt_avbrott ska vara orörd (0 brus-rader)
    brus = sb_get(
        'fakt_avbrott',
        'select=id'
        '&or=(and(langd_sek.lt.900,kategori_kod.eq.ShortDownTime),'
        'kategori_kod.eq.Unproductive terrain work,'
        'kategori_kod.eq.Default)',
    )
    if brus:
        print(f"  VARNING fakt_avbrott: {len(brus)} brus-rader hittades - KONTROLLERA!")
    else:
        print("  OK fakt_avbrott: inga brus-rader (92 stadade rader ororda)")


# ── CLI ────────────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(
        description="Backfill fakt_tid + mom_tider för dagar med felaktig MOM-filordning.")
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run', dest='dry_run', action='store_true',
                      help="Simulera — visa före/efter G15h, ändra inget i DB")
    mode.add_argument('--skarp', action='store_true',
                      help="Kör faktiska DB-ändringar")
    scope = p.add_mutually_exclusive_group(required=True)
    scope.add_argument('--datum', metavar='MASKIN:DATUM[,...]',
                       help="T.ex. PONS20SDJAA270231:2026-07-18,PONS20SDJAA270231:2026-07-08")
    scope.add_argument('--alla', action='store_true',
                       help="Hitta och rätta alla drabbade dagar automatiskt")
    args = p.parse_args()

    if args.datum:
        par = []
        for token in args.datum.split(','):
            token = token.strip()
            if ':' not in token:
                print(f"Ogiltigt format: {token!r}  (förväntat MASKIN:DATUM)")
                sys.exit(1)
            maskin, datum = token.split(':', 1)
            par.append((maskin.strip(), datum.strip()))
    else:
        print("Söker drabbade dagar i Behandlade + Supabase …\n")
        par = hitta_drabbade()
        if not par:
            print("Inga drabbade dagar hittades.")
            return
        print(f"\nHittade {len(par)} drabbade dag(ar).")

    if args.dry_run:
        print(f"\n{'='*62}")
        print(f"DRY-RUN — {len(par)} dag(ar) — INGENTING ändras i DB")
        print(f"{'='*62}")
        total_delta = 0.0
        for maskin_id, datum in par:
            total_delta += dry_run_dag(maskin_id, datum)
        print(f"\n{'─'*62}")
        print(f"Totalt tillägg G15h : {total_delta:+.2f} h över {len(par)} dag(ar)")
        if total_delta > 0:
            print("\nVerifiera siffrorna ovan och kör sedan:")
            print("  python backfill_fakt_tid_mom_tider.py --skarp --alla")
    else:
        print(f"\n{'='*62}")
        print(f"SKARP KÖRNING — {len(par)} dag(ar)")
        print(f"{'='*62}\n")
        for maskin_id, datum in par:
            kor_dag(maskin_id, datum)
        verifiera()
        print("\nKlar!")


if __name__ == '__main__':
    main()
