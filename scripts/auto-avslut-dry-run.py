# TORRKÖRNING (read-only) av auto-avslut-regeln. Kör IMPORTENS EGNA ar_kundjobb / ar_per_maskin_nyckel /
# utvardera_avslut (ingen duplicerad regel) mot live och listar per objekt vad som skulle sättas. Skriver ALDRIG.
# Ingen backfill — nästa prod-fil gör jobbet skarpt.
#
#   python scripts/auto-avslut-dry-run.py
#
# Läser NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ur .env.local (via importmodulen).
# Visar FÖRE (bolag satt) mot EFTER (bolag satt OCH inte per-maskin-nyckel <maskin_id>_<n>) — alla objekt som
# ändrar utfall listas, med om regeln hade slagit till och om ett kopplat syskon täcker jobbet ändå.
import os
import sys
from concurrent.futures import ThreadPoolExecutor

try:
    sys.stdout.reconfigure(encoding='utf-8')  # Windows-konsol är cp1252 → tvinga UTF-8 för •/→/å
except Exception:
    pass
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo-roten
import skogsmaskin_import_version_6 as imp  # noqa: E402

if not imp.init_supabase():
    print("Kunde inte ansluta till Supabase")
    sys.exit(1)

# Alla objekt med produktion (skörd- eller lass-vyn), ALLA id-former. vo ur dim_objekt (== oid för numeriska).
prod = imp._rest_get('vy_uppf_prod_per_objekt', {'select': 'objekt_id'})
lass = imp._rest_get('vy_uppf_lass_per_objekt', {'select': 'objekt_id'})
oids = sorted({r['objekt_id'] for r in (prod + lass) if r.get('objekt_id')})
dim_rader = imp._rest_get('dim_objekt', {'select': 'objekt_id,vo_nummer,object_name,bolag', 'limit': '2000'})
vo_av = {r['objekt_id']: r.get('vo_nummer') for r in dim_rader}
bolag_av = {r['objekt_id']: (r.get('bolag') or '').strip() for r in dim_rader}
# Kopplade (normal-nyckel) rader per normaliserat namn — visar om ett per-maskin-jobb ändå täcks av en kopplad rad.
kopplade_per_namn = {}
for r in dim_rader:
    if not imp.ar_per_maskin_nyckel(r['objekt_id']):
        nyckel = imp._norm_objektnamn(r.get('object_name'))
        if nyckel:
            kopplade_per_namn.setdefault(nyckel, []).append(r['objekt_id'])
print(f"AUTO_AVSLUT_LAGE={imp.AUTO_AVSLUT_LAGE}. Skräpfilter: bolag satt OCH inte per-maskin-nyckel (<maskin_id>_<n>). "
      f"Utvärderar {len(oids)} objekt med produktion (alla id-former), parallellt...\n")


def _statusrader(oid, vo):
    ors = [f'dim_objekt_id.eq.{oid}']
    if vo:
        ors.insert(0, f'vo_nummer.eq.{vo}')
    return [x.get('status') for x in imp._rest_get('objekt', {'select': 'status', 'or': f"({','.join(ors)})"})]


def _beskriv(r):
    bits = []
    if r['satter_skord']:
        bits.append(f"skordning_avslutad {r['skord_rule']} (skördaren nu på {r['skord_nu_pa']})")
    if r['satter_skot']:
        detalj = 'egen = skördning' if r['egen'] else ('backen %.0f m³' % r['backen'])
        bits.append(f"skotning_avslutad {r['skot_rule']} ({detalj})")
    return bits


def utvardera(oid):
    try:
        vo = vo_av.get(oid) or oid
        pm = imp.ar_per_maskin_nyckel(oid)
        bolag = imp._bolag_satt(oid, vo)          # FÖRE-filtret (förra versionen)
        kj = imp.ar_kundjobb(oid, vo)             # EFTER-filtret (denna version)
        r = imp.utvardera_avslut(oid, vo)
        statusar = _statusrader(oid, vo) if (kj and r['blir_avslutat']) else []
        return {'oid': oid, 'vo': vo, 'pm': pm, 'bolag': bolag, 'kj': kj, 'r': r, 'statusar': statusar,
                'konsistent': kj == (bolag and not pm)}
    except Exception as e:  # ett fel får aldrig tyst ta bort ett objekt ur rapporten
        return {'oid': oid, 'fel': str(e)}


with ThreadPoolExecutor(max_workers=6) as ex:
    res = list(ex.map(utvardera, oids))

fel = [x for x in res if 'fel' in x]
res = [x for x in res if 'fel' not in x]
res.sort(key=lambda x: (x['r']['namn'] or '').lower())
by_oid = {x['oid']: x for x in res}

# ── A. kundjobb som skulle få flagga / avslutas ──
print("=== SKULLE SÄTTAS / AVSLUTAS (kundjobb) ===")
a = 0
for x in res:
    if not x['kj']:
        continue
    r = x['r']
    ny_flagga = r['satter_skord'] or r['satter_skot']
    har_status_att_andra = any(s != 'avslutat' for s in x['statusar'])
    avslutas_nu = r['blir_avslutat'] and har_status_att_andra
    if not ny_flagga and not avslutas_nu:
        continue
    a += 1
    bits = _beskriv(r)
    tags = []
    if avslutas_nu:
        tags.append('→ AVSLUTAT (status ändras)')
    elif r['blir_avslutat'] and not x['statusar']:
        tags.append('båda flaggor; objekt-rad saknas → ingen status att ändra')
    print(f"  • {r['namn']} [{x['oid']}]: {' · '.join(bits) if bits else '(båda flaggor satta av människa)'}"
          + (f"  ({'; '.join(tags)})" if tags else ''))
print(f"  → {a} objekt\n")

# ── B. bolag tomt (oförändrat mot förra versionen) ──
bolag_tomt = [x for x in res if not x['pm'] and not x['bolag']]
print(f"=== HOPPAS ÖVER: bolag tomt (oförändrat mot förra versionen) — {len(bolag_tomt)} objekt ===")
for x in bolag_tomt:
    bits = _beskriv(x['r'])
    print(f"  • {x['r']['namn']} [{x['oid']}]" + (f": regeln hade annars slagit till — {' · '.join(bits)}" if bits else ''))
print()

# ── C. per-maskin-nycklar ──
pm_alla = [x for x in res if x['pm']]
andrar = [x for x in pm_alla if x['bolag']]       # var kundjobb förra versionen → ändrar utfall
redan = [x for x in pm_alla if not x['bolag']]    # hoppades redan över på bolag tomt → oförändrat
print(f"=== HOPPAS ÖVER: per-maskin-nyckel (<maskin_id>_<n>) — {len(pm_alla)} objekt ===")
print(f"--- C1. ÄNDRAR UTFALL (bolag satt → var kundjobb förra versionen, nu aldrig) — {len(andrar)} objekt ---")
utan_syskon = []
for x in andrar:
    r = x['r']
    bits = _beskriv(r)
    syskon = kopplade_per_namn.get(imp._norm_objektnamn(r['namn']), [])
    syskon_kj = [s for s in syskon if by_oid.get(s, {}).get('kj')]
    if syskon_kj:
        sy = f"täcks av kopplad rad {', '.join(syskon_kj)}"
    elif syskon:
        sy = f"kopplad rad {', '.join(syskon)} finns men är inte kundjobb/ej i prod"
    else:
        sy = 'INGEN kopplad rad med samma namn'
        utan_syskon.append(x)
    slog = f"regeln hade slagit till: {' · '.join(bits)}" if bits else 'regeln hade inte slagit till'
    print(f"  • {r['namn']} [{x['oid']}] bolag={bolag_av.get(x['oid']) or '—'} — {slog} · {sy}")
print(f"--- C2. oförändrat (bolag tomt redan) — {len(redan)} objekt ---")
for x in redan:
    print(f"  • {x['r']['namn']} [{x['oid']}]")

# ── Sammanfattning ──
fore = [x for x in res if x['bolag']]
efter = [x for x in res if x['kj']]
tappade = [x for x in fore if not x['kj']]
tappade_kopplade = [x for x in tappade if not x['pm']]
hade_slagit_till = [x for x in andrar if _beskriv(x['r'])]
inkonsistenta = [x for x in res if not x['konsistent']]
print("\n=== SAMMANFATTNING ===")
print(f"Kundjobb före (bolag satt): {len(fore)} → efter (bolag satt OCH inte per-maskin-nyckel): {len(efter)}  (Δ {len(tappade)}).")
print(f"Alla {len(tappade)} som ändrar utfall är per-maskin-nycklar med bolag satt: {'JA' if not tappade_kopplade else 'NEJ — ' + ', '.join(x['oid'] for x in tappade_kopplade)}.")
print(f"Kopplade (normala) kundjobb som faller bort: {len(tappade_kopplade)}.")
print(f"Av de {len(tappade)} hade regeln slagit till idag för: {len(hade_slagit_till)}"
      + (f" ({', '.join(x['r']['namn'] + ' [' + x['oid'] + ']' for x in hade_slagit_till)})" if hade_slagit_till else '') + '.')
print(f"Per-maskin-nycklar (bolag satt) utan kopplad rad med samma namn — enda vägen till avslut är planeringens knapp: {len(utan_syskon)}.")
if inkonsistenta:
    print(f"VARNING: {len(inkonsistenta)} objekt där ar_kundjobb != (bolag och inte per-maskin): {', '.join(x['oid'] for x in inkonsistenta)}")
if fel:
    print(f"VARNING: {len(fel)} objekt kunde inte utvärderas: " + '; '.join(f"{x['oid']}: {x['fel']}" for x in fel))
print("Människans satta flaggor rörs aldrig. Ingen backfill.")
