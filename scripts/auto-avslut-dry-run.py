# TORRKÖRNING (read-only) av auto-avslut-regeln. Kör IMPORTENS EGEN utvardera_avslut (ingen
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

# Objekt att utvärdera = de med produktion (skörd- eller lass-vyn) + numeriskt kontraktsnr (skräpfilter).
prod = imp._rest_get('vy_uppf_prod_per_objekt', {'select': 'objekt_id'})
lass = imp._rest_get('vy_uppf_lass_per_objekt', {'select': 'objekt_id'})
oids = sorted({r['objekt_id'] for r in (prod + lass) if r.get('objekt_id') and imp._har_kontraktsnr(r['objekt_id'])})
print(f"AUTO_AVSLUT_LAGE={imp.AUTO_AVSLUT_LAGE}. Utvärderar {len(oids)} objekt (numeriskt kontraktsnr, med produktion)...\n")

def _redan_avslutat(oid):
    st = imp._rest_get('objekt', {'select': 'status', 'or': f'(vo_nummer.eq.{oid},dim_objekt_id.eq.{oid})'})
    return bool(st) and all(x.get('status') == 'avslutat' for x in st)

satt = 0
avsl = 0
for oid in oids:
    r = imp.utvardera_avslut(oid, oid)  # importens objekt_id = vo_nummer för numeriska → vo=oid
    ny_flagga = r['satter_skord'] or r['satter_skot']
    # "skulle påverkas" = ny flagga, ELLER båda satta men objektet ännu inte avslutat (status skulle ändras).
    skulle_avsluta = r['blir_avslutat'] and (ny_flagga or not _redan_avslutat(oid))
    if not ny_flagga and not skulle_avsluta:
        continue
    bits = []
    if r['satter_skord']:
        bits.append(f"skordning_avslutad {r['skord_rule']} (skördaren nu på {r['skord_nu_pa']})")
    if r['satter_skot']:
        detalj = 'egen = skördning' if r['egen'] else ('backen %.0f m³' % r['backen'])
        bits.append(f"skotning_avslutad {r['skot_rule']} ({detalj})")
    if ny_flagga:
        satt += 1
    if skulle_avsluta:
        avsl += 1
    rad = ' · '.join(bits) if bits else '(båda flaggor satta av människa, status ej avslutat)'
    tag = '  → AVSLUTAT (båda flaggor)' if skulle_avsluta else ''
    print(f"  • {r['namn']} [{oid}]: {rad}{tag}")

print(f"\n{satt} objekt skulle få minst en ny flagga, varav {avsl} skulle avslutas nu. "
      f"Människans satta flaggor rörs aldrig. Redan avslutade objekt rörs inte. Ingen backfill.")
