// Mutationskontroll för skiftimporten (R64428 2026-10-12): en ny MOM-fil får bara UTÖKA ett befintligt pass i fakt_skift.
// Testnivå full (lön). Motorn: scripts/mutationsmotor.mjs (ändrar EN sak i taget, kör testerna, kräver rött; återställer filen).
// Testerna är Python (scripts/test_skift_kuvert.py), så motorn får ett eget testkommando i stället för vitest.
//
// Kör:  node scripts/mutationskontroll-skift.mjs      (kräver python3 + pip install watchdog; EN tung körning åt gången)
import { kor } from "./mutationsmotor.mjs";

const IMP = "skogsmaskin_import_version_6.py";

const M = [
  // ── sammanslagningen: bara utöka ──
  ["merge: inloggning ändras aldrig (ingen jämförelse)", "if b_in and (not ny.get('inloggning_tid') or b_in < ny['inloggning_tid']):", "if False:"],
  ["merge: inloggning tar SENASTE (< → >)", "or b_in < ny['inloggning_tid']):", "or b_in > ny['inloggning_tid']):"],
  ["merge: utloggning ändras aldrig", "if b_ut and (not ny.get('utloggning_tid') or b_ut > ny['utloggning_tid']):", "if False:"],
  ["merge: utloggning tar TIDIGASTE (> → <)", "or b_ut > ny['utloggning_tid']):", "or b_ut < ny['utloggning_tid']):"],
  ["merge: maskininloggningen i databasen glöms", "if b_mask and (not ny.get('maskin_inloggning_tid') or b_mask < ny['maskin_inloggning_tid']):", "if False:"],
  ["merge: maskininloggning tar senaste (< → >)", "or b_mask < ny['maskin_inloggning_tid']):", "or b_mask > ny['maskin_inloggning_tid']):"],
  ["merge: längden räknas inte om efter utökningen", "ny['langd_sek'] = int((ny['utloggning_tid'] - ny['inloggning_tid']).total_seconds())", "pass"],
  ["merge: ändrar indatan på plats (ingen kopia)", "    ny = dict(rad)\n    if befintlig:", "    ny = rad\n    if befintlig:"],
  ["flödet: sammanslagningen anropas aldrig (filens rad skrivs rakt)", "skift_att_skriva.append(sla_ihop_skift_kuvert(rad, bef))", "skift_att_skriva.append(rad)"],
  ["läsningen begär inte maskininloggningen", "'select': 'inloggning_tid,utloggning_tid,maskin_inloggning_tid'},", "'select': 'inloggning_tid,utloggning_tid'},"],

  // ── läsningen: aldrig blind skrivning ──
  ["läsfel: ett HTTP-fel tolkas som 'passet finns inte' (blind skrivning)", "                orsak = f\"HTTP {resp.status_code}\"\n                continue", "                return 'ok', None"],
  ["läsfel: ett undantag (timeout) tolkas som 'passet finns inte'", "            orsak = f\"{type(e).__name__}: {e}\"\n            continue", "            return 'ok', None"],
  ["läsfel: raden skrivs ändå när läsningen fallerat", "                if status == 'fel':\n                    hoppade.append((rad, bef))\n                    continue", "                if status == 'fel':\n                    hoppade.append((rad, bef))\n                    skift_att_skriva.append(rad)\n                    continue"],
  ["läsfel: bara ett försök (ett enstaka nätfel stoppar importen i onödan)", "SKIFT_LAS_FORSOK = 3", "SKIFT_LAS_FORSOK = 1"],
  ["läsfel: fem försök (hänger på ett nedtimat nät)", "SKIFT_LAS_FORSOK = 3", "SKIFT_LAS_FORSOK = 5"],
  ["läsfel: en otolkbar tid i databasen räknas som 'saknas'", "if r.get(k) and v is None:", "if False:"],
  ["läsfel: ingen rapport till import_fel", "_rapportera_import_fel('fakt_skift', hoppade[0][0].get('filnamn'), len(hoppade),", "(lambda *a, **k: None)('fakt_skift', hoppade[0][0].get('filnamn'), len(hoppade),"],
  ["läsfel: fel felkod i import_fel", "'skift_kuvert_las'", "'annat'"],
  ["läsfel: ett ologsbart pass stoppar alla i filen (break i stället för continue)", "                if status == 'fel':\n                    hoppade.append((rad, bef))\n                    continue", "                if status == 'fel':\n                    hoppade.append((rad, bef))\n                    break"],

  // ── tidstolkningen ──
  ["tolkning: parse_datetime hoppar över normaliseraren", "        dt_str = normalisera_sekundbrak(dt_str)\n        return datetime.fromisoformat(dt_str)", "        return datetime.fromisoformat(dt_str)"],
  ["tolkning: sekundbråket fylls inte ut", "'.' + m.group(1)[:6].ljust(6, '0')", "'.' + m.group(1)[:6]"],
  ["tolkning: sekundbråket fylls ut till 5", "'.' + m.group(1)[:6].ljust(6, '0')", "'.' + m.group(1)[:6].ljust(5, '0')"],
  ["tolkning: sekundbråket klipps inte till 6", "'.' + m.group(1)[:6].ljust(6, '0')", "'.' + m.group(1).ljust(6, '0')"],
].map(([namn, fran, till]) => [namn, fran, till, IMP]);

kor({
  filer: [IMP],
  tester: [],
  standardFil: IMP,
  kommando: ["python3", "scripts/test_skift_kuvert.py"],
  mutationer: M,
});
