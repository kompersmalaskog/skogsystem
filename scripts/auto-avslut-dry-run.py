# TORRKÖRNING (read-only) av auto-avslut-regeln. Kör IMPORTENS EGNA ar_kundjobb + utvardera_avslut (ingen
# duplicerad regel) mot live och listar per objekt vad som skulle sättas. Skriver ALDRIG.
# Ingen backfill — nästa prod-fil gör jobbet skarpt.
#
#   python scripts/auto-avslut-dry-run.py
#
# Läser NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ur .env.local (via importmodulen).
import os
import sys

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
vo_av = {r['objekt_id']: r.get('vo_nummer') for r in imp._rest_get('dim_objekt', {'select': 'objekt_id,vo_nummer', 'limit': '2000'})}
print(f"AUTO_AVSLUT_LAGE={imp.AUTO_AVSLUT_LAGE}. Skräpfilter: bolag satt (dim_objekt eller objekt). "
      f"Utvärderar {len(oids)} objekt med produktion (alla id-former)...\n")


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


kundjobb_rader = []   # (oid, namn, bits, avslutas_nu, ej_numeriskt, saknar_objektrad)
hoppade = []          # skräpfiltret hoppade över men regeln hade annars slagit till
n_kundjobb = n_skrap = 0
for oid in oids:
    vo = vo_av.get(oid) or oid
    kj = imp.ar_kundjobb(oid, vo)
    r = imp.utvardera_avslut(oid, vo)
    bits = _beskriv(r)
    if not kj:
        n_skrap += 1
        if bits or r['blir_avslutat']:
            hoppade.append((oid, r['namn'], bits))
        continue
    n_kundjobb += 1
    ny_flagga = r['satter_skord'] or r['satter_skot']
    statusar = _statusrader(oid, vo)
    # "avslutas nu" = båda flaggor (människa + regel) OCH det finns en objekt-rad vars status faktiskt ändras.
    har_status_att_andra = any(s != 'avslutat' for s in statusar)
    avslutas_nu = r['blir_avslutat'] and har_status_att_andra
    if not ny_flagga and not avslutas_nu:
        continue
    kundjobb_rader.append((oid, r['namn'], bits, avslutas_nu, not imp._har_kontraktsnr(oid), not statusar, r['blir_avslutat']))

print(f"=== SKULLE SÄTTAS / AVSLUTAS (kundjobb, bolag satt) — {len(kundjobb_rader)} objekt ===")
for oid, namn, bits, avslutas_nu, ej_num, saknar_rad, blir in kundjobb_rader:
    rad = ' · '.join(bits) if bits else '(båda flaggor satta av människa)'
    tags = []
    if ej_num:
        tags.append('ej numeriskt id')
    if avslutas_nu:
        tags.append('→ AVSLUTAT (status ändras)')
    elif blir and saknar_rad:
        tags.append('båda flaggor; objekt-rad saknas → ingen status att ändra')
    print(f"  • {namn} [{oid}]: {rad}" + (f"  ({'; '.join(tags)})" if tags else ''))

print(f"\n=== HOPPAS ÖVER av skräpfiltret (bolag tomt) — regeln hade annars slagit till — {len(hoppade)} objekt ===")
for oid, namn, bits in hoppade:
    print(f"  • {namn} [{oid}]: {' · '.join(bits) if bits else '(båda flaggor satta av människa)'}")

nya_flaggor = sum(1 for x in kundjobb_rader if x[2])
avsl = sum(1 for x in kundjobb_rader if x[3])
print(f"\nKundjobb (bolag satt): {n_kundjobb} · hoppade över (bolag tomt): {n_skrap}.")
print(f"{nya_flaggor} kundjobb skulle få minst en ny flagga; {avsl} skulle få status ändrad till avslutat. "
      f"Människans satta flaggor rörs aldrig. Ingen backfill.")
