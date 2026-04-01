#!/usr/bin/env python3
"""
Rensa fakt_tid och kör om import av alla MOM-filer.
Alla entries samlas i minnet, dedupliceras per MonitoringStartTime,
aggregeras per (datum, maskin_id, objekt_id), skrivs i en batch.
"""

import os, sys, glob, requests
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skogsmaskin_import_version_6 import (
    SUPABASE_URL, SUPABASE_KEY, BEHANDLADE,
    init_supabase, parse_mom_file, upsert_data, SUPABASE_HEADERS, logger
)

FIELDS = ['processing_sek', 'terrain_sek', 'other_work_sek',
          'maintenance_sek', 'disturbance_sek', 'rast_sek',
          'avbrott_sek', 'kort_stopp_sek', 'bransle_liter',
          'engine_time_sek', 'korstracka_m',
          'terrain_korstracka_m', 'terrain_bransle_liter']

def main():
    if not init_supabase():
        print("Kunde inte ansluta till Supabase")
        return

    # 1. Rensa fakt_tid
    print("Rensar fakt_tid...")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer": "return=minimal"
    }
    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/fakt_tid?datum=gte.2000-01-01",
        headers=headers, timeout=30
    )
    print(f"  DELETE fakt_tid: {resp.status_code}")

    mom_files = sorted(glob.glob(os.path.join(BEHANDLADE, "**", "*.mom"), recursive=True))
    print(f"\nHittade {len(mom_files)} MOM-filer")

    # 2a. Populera dim-tabeller (dim_maskin, dim_objekt etc) via normal parse
    print("Populerar dim-tabeller...")
    from skogsmaskin_import_version_6 import save_mom_to_supabase
    for i, filepath in enumerate(mom_files):
        try:
            data = parse_mom_file(filepath)
            # Spara bara dim-data, inte fakt_tid
            if data.get('maskin'):
                upsert_data('dim_maskin', [data['maskin']], ['maskin_id'])
            if data.get('objekt'):
                for obj in data['objekt']:
                    obj_clean = {k: v for k, v in obj.items() if v not in (None, '')}
                    obj_clean['objekt_id'] = obj['objekt_id']
                    obj_clean['maskin_id'] = obj['maskin_id']
                    obj_clean['vo_nummer'] = obj.get('vo_nummer', '')
                    upsert_data('dim_objekt', [obj_clean], ['objekt_id'])
        except Exception:
            pass
        if (i + 1) % 100 == 0:
            print(f"  dim: {i+1}/{len(mom_files)}...")
    print("  Dim-tabeller klara")

    # Enklare approach: modifiera inte parse_mom_file, kör istället en
    # lättviktig XML-parser som bara samlar tid-entries.
    import xml.etree.ElementTree as ET
    from skogsmaskin_import_version_6 import (
        get_namespace, find_all_elements, find_element, get_text,
        safe_int, safe_float, parse_datetime, normalize_maskin_id, make_objekt_id
    )

    global_entries = {}
    ok = 0

    for i, filepath in enumerate(mom_files):
        try:
            filnamn = os.path.basename(filepath)
            tree = ET.parse(filepath)
            root = tree.getroot()
            ns = get_namespace(root)

            for machine in find_all_elements(root, 'Machine', ns):
                # Resolva maskin_id exakt som parse_mom_file gör
                maskin_id = get_text(machine, 'BaseMachineManufacturerID', ns)
                if not maskin_id:
                    mk = find_element(machine, 'MachineKey', ns)
                    maskin_id = mk.text.strip() if mk is not None and mk.text else None
                if not maskin_id:
                    continue
                tillverkare = get_text(machine, 'MachineBaseManufacturer', ns) or ''
                maskin_id = normalize_maskin_id(maskin_id, tillverkare)

                # Object key mapping — exakt samma logik som parse_mom_file
                obj_key_map = {}
                for obj_def in find_all_elements(machine, 'ObjectDefinition', ns):
                    okey = get_text(obj_def, 'ObjectKey', ns)
                    contract_number = get_text(obj_def, 'ContractNumber', ns)
                    vo_nummer = contract_number if contract_number else get_text(obj_def, 'ObjectUserID', ns)
                    objekt_id = make_objekt_id(vo_nummer or '', maskin_id, okey or '')
                    if okey:
                        obj_key_map[okey] = objekt_id

                # IndividualMachineWorkTime
                for wt in find_all_elements(machine, 'IndividualMachineWorkTime', ns):
                    start_time = get_text(wt, 'MonitoringStartTime', ns)
                    duration = safe_int(get_text(wt, 'MonitoringTimeLength', ns))
                    obj_key = get_text(wt, 'ObjectKey', ns)
                    op_key = get_text(wt, 'OperatorKey', ns)

                    start_dt = parse_datetime(start_time)
                    if not start_dt:
                        continue
                    datum = start_dt.date()
                    objekt_id = obj_key_map.get(obj_key, f"{maskin_id}_{obj_key}")

                    entry_key = (start_time, maskin_id, objekt_id)

                    entry = {
                        'datum': datum, 'maskin_id': maskin_id, 'objekt_id': objekt_id,
                        'operator_id': f"{maskin_id}_{op_key}" if op_key else None,
                        'processing_sek': 0, 'terrain_sek': 0, 'other_work_sek': 0,
                        'maintenance_sek': 0, 'disturbance_sek': 0, 'rast_sek': 0,
                        'avbrott_sek': 0, 'kort_stopp_sek': 0, 'bransle_liter': 0,
                        'engine_time_sek': 0, 'korstracka_m': 0,
                        'terrain_korstracka_m': 0, 'terrain_bransle_liter': 0.0,
                        'filnamn': filnamn,
                    }

                    other_data = find_element(wt, 'OtherMachineData', ns)
                    if other_data is not None:
                        fuel = safe_float(get_text(other_data, 'FuelConsumption', ns))
                        if fuel < 10000:
                            entry['bransle_liter'] = fuel
                        entry['engine_time_sek'] = safe_int(get_text(other_data, 'EngineTime', ns))
                        entry['korstracka_m'] = safe_int(get_text(other_data, 'DrivenDistance', ns))

                    run_cat = find_element(wt, 'IndividualMachineRunTimeCategory', ns)
                    down_time = find_element(wt, 'IndividualMachineDownTime', ns)
                    unutilized = find_element(wt, 'IndividualUnutilizedTimeCategory', ns)

                    if run_cat is not None and run_cat.text:
                        cat = run_cat.text
                        if cat == 'Processing':
                            entry['processing_sek'] = duration
                        elif cat == 'Terrain travel':
                            entry['terrain_sek'] = duration
                            if other_data is not None:
                                entry['terrain_korstracka_m'] = safe_int(get_text(other_data, 'DrivenDistance', ns))
                                t_fuel = safe_float(get_text(other_data, 'FuelConsumption', ns))
                                if t_fuel < 10000:
                                    entry['terrain_bransle_liter'] = t_fuel
                        else:
                            entry['other_work_sek'] = duration
                    elif down_time is not None:
                        maint = find_element(down_time, 'Maintenance', ns)
                        dist = find_element(down_time, 'Disturbance', ns)
                        if maint is not None:
                            entry['maintenance_sek'] = duration
                        elif dist is not None:
                            entry['disturbance_sek'] = duration
                        else:
                            entry['avbrott_sek'] = duration
                    elif unutilized is not None:
                        entry['rast_sek'] = duration

                    # Senaste fil vinner (filer sorterade kronologiskt)
                    global_entries[entry_key] = entry

                # IndividualShortDownTime
                for sd in find_all_elements(machine, 'IndividualShortDownTime', ns):
                    start_time = get_text(sd, 'MonitoringStartTime', ns)
                    duration = safe_int(get_text(sd, 'MonitoringTimeLength', ns))
                    obj_key = get_text(sd, 'ObjectKey', ns)
                    op_key = get_text(sd, 'OperatorKey', ns)

                    start_dt = parse_datetime(start_time)
                    if not start_dt:
                        continue
                    datum = start_dt.date()
                    objekt_id = obj_key_map.get(obj_key, f"{maskin_id}_{obj_key}")

                    entry_key = (start_time, maskin_id, objekt_id)
                    if entry_key in global_entries:
                        global_entries[entry_key]['kort_stopp_sek'] = duration
                    else:
                        global_entries[entry_key] = {
                            'datum': datum, 'maskin_id': maskin_id, 'objekt_id': objekt_id,
                            'operator_id': f"{maskin_id}_{op_key}" if op_key else None,
                            'processing_sek': 0, 'terrain_sek': 0, 'other_work_sek': 0,
                            'maintenance_sek': 0, 'disturbance_sek': 0, 'rast_sek': 0,
                            'avbrott_sek': 0, 'kort_stopp_sek': duration, 'bransle_liter': 0,
                            'engine_time_sek': 0, 'korstracka_m': 0,
                            'terrain_korstracka_m': 0, 'terrain_bransle_liter': 0.0,
                            'filnamn': filnamn,
                        }

            ok += 1
        except Exception as e:
            logger.error(f"Fel vid {os.path.basename(filepath)}: {e}")

        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(mom_files)} filer lästa...")

    print(f"\n{ok}/{len(mom_files)} filer lästa, {len(global_entries)} unika entries")

    # 3. Aggregera per (datum, maskin_id, objekt_id)
    agg = defaultdict(lambda: {f: 0 for f in FIELDS})
    agg_meta = {}  # (datum,maskin,objekt) -> {operator_id, filnamn}

    for entry_key, entry in global_entries.items():
        dag_key = (str(entry['datum']), entry['maskin_id'], entry['objekt_id'])
        for f in FIELDS:
            agg[dag_key][f] += (entry.get(f) or 0)
        agg_meta[dag_key] = {
            'operator_id': entry.get('operator_id'),
            'filnamn': entry.get('filnamn'),
        }

    # Bygg rader
    rows = []
    for dag_key, values in agg.items():
        datum, maskin, objekt = dag_key
        runtime = values['processing_sek'] + values['terrain_sek'] + values['other_work_sek']
        g0 = runtime - values['kort_stopp_sek']
        tomgang = max(0, values['engine_time_sek'] - g0)
        meta = agg_meta.get(dag_key, {})
        rows.append({
            'datum': datum,
            'maskin_id': maskin,
            'objekt_id': objekt,
            'operator_id': meta.get('operator_id'),
            **values,
            'tomgang_sek': tomgang,
            'filnamn': meta.get('filnamn'),
        })

    print(f"Aggregerade till {len(rows)} dag-rader")

    # 4. Hämta giltiga maskin_ids från dim_maskin (FK-constraint)
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/dim_maskin?select=maskin_id",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=30
    )
    valid_maskin = set(m['maskin_id'] for m in resp.json()) if resp.status_code == 200 else set()
    rows_filtered = [r for r in rows if r['maskin_id'] in valid_maskin]
    skipped = len(rows) - len(rows_filtered)
    if skipped:
        print(f"  Hoppar över {skipped} rader med okänd maskin_id")
    print(f"  {len(rows_filtered)} rader att skriva")

    # Skriv till Supabase i batchar
    batch_size = 200
    written = 0
    for i in range(0, len(rows_filtered), batch_size):
        batch = rows_filtered[i:i+batch_size]
        n = upsert_data('fakt_tid', batch, ['datum', 'maskin_id', 'objekt_id'])
        written += n
        print(f"  Batch {i//batch_size + 1}: {n} rader")

    print(f"\nTotalt {written} rader skrivna till fakt_tid")

    # 5. Verifiera objekt 11118775
    print("\n=== Verifiering: objekt_id=11118775 (Krampamåla) ===")
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/fakt_tid?objekt_id=eq.11118775&order=datum.asc"
        f"&select=datum,filnamn,processing_sek,terrain_sek,other_work_sek,"
        f"kort_stopp_sek,maintenance_sek,disturbance_sek,rast_sek,bransle_liter",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=30
    )
    rows_v = resp.json()
    total_arb_sek = 0
    total_diesel = 0
    for r in rows_v:
        arb = sum(r.get(k, 0) or 0 for k in [
            'processing_sek', 'terrain_sek', 'other_work_sek',
            'kort_stopp_sek', 'maintenance_sek', 'disturbance_sek', 'rast_sek'
        ])
        diesel = r.get('bransle_liter', 0) or 0
        total_arb_sek += arb
        total_diesel += diesel
        print(f"  {r['datum']} | arb: {arb/3600:.1f}h | diesel: {diesel:.0f}L")

    print(f"\n  TOTALT: arbetstid {total_arb_sek/3600:.1f} tim, diesel {total_diesel:.0f} liter")
    print(f"  FORVANTAT: ~37 tim, ~650 liter")

    # 6. Trigga automatisk arbetsdag-skapning
    print("\n=== Skapar arbetsdagar från skiftdata ===")
    try:
        app_url = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
        resp = requests.post(f"{app_url}/api/mom-import", json={}, timeout=30)
        if resp.status_code == 200:
            result = resp.json()
            print(f"  ✓ {result.get('created', 0)} arbetsdagar skapade, {result.get('skipped', 0)} redan fanns")
        else:
            print(f"  ⚠ mom-import API svarade {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"  ⚠ Kunde inte nå mom-import API: {e}")
        print(f"    (Appen kanske inte körs — kör manuellt: POST {app_url}/api/mom-import)")

if __name__ == "__main__":
    main()
