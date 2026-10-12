"""Steg 8 DEL C: laddar historikdata in i Skogsystem (tabeller hist_*, bucket "historik"). KÖRS BARA EFTER MARTINS JA.

Läser CSV-filerna i C:/Users/lindq/skogsystem-import/hist_csv/ (byggs av hist_bygg.py) och filerna i pdf/ och bilagor/.
Idempotent: upsert på sha256 / skiftnyckel / stoppnyckel; filer som redan finns i bucketen hoppas över. Kan köras om utan dubbletter.

Lägen
  python importera.py --torrkorning          (standard) validerar CSV mot schemat, räknar, öppnar INGEN nätverksanslutning
  python importera.py --utfor                skriver till databasen + laddar upp filer. Kräver SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY i miljön
                                             OCH HIST_IMPORT_OK=ja (Martins ja). Migrationen 20261009170000_hist_tabeller.sql måste redan vara körd.
  python importera.py --bara-kontroll        kontrolldelen mot databasen (läser bara)
  python importera.py --utfor --utan-filer   bara tabellerna, inte filuppladdning

SÄKERHET (vitlista, allt annat avbryter): bara tabeller som matchar ^hist_[a-z_]+$ och bara bucketen "historik". Skriv- och läsanrop går genom
Vitlista.rest()/Vitlista.lagring(); varje anrop kontrolleras innan det skickas. Nycklar skrivs aldrig ut.
"""
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

IMP = Path("C:/Users/lindq/skogsystem-import")
CSV = IMP / "hist_csv"
BUCKET = "historik"
TABELL_RE = re.compile(r"^hist_[a-z_]+$")
TABELLER = ["hist_maskin", "hist_forare", "hist_rapport", "hist_objekt", "hist_skift", "hist_forare_objekt", "hist_stopp", "hist_korrigering"]

# kolumn -> typ. text | int | num | date | time | bool | arr
SCHEMA = {
    "hist_maskin": dict(namn="text", typ="text", tillverkare="text", identifierare="text", fran="date", till="date", agare="text", maskin_id="text"),
    "hist_forare": dict(namn="text", alias="arr", teknisk="bool"),
    "hist_rapport": dict(sha256="text", format="text", typ="text", maskin_kalla="text", mejldatum="date", avsandare="text", filnamn="text", filtyp="text", storage_path="text",
                         exkluderad="bool", exkluderad_orsak="text", tolkad="bool"),
    "hist_objekt": dict(sha256="text", objekt="text", objektnr="text", startdatum="date", slutdatum="date", rapportdatum="date", atgard="text", atgard_kalla="text", stammar="int",
                        volym_m3fub="num", volym_enhet="text", g15_h="num", g0_h="num", motortid_h="num", bransle_l="num", avbrott_reparation_min="int", avbrott_service_min="int",
                        avbrott_storning_min="int", avbrott_flytt_min="int", avbrott_trailer_min="int", avbrott_varmkorning_min="int", avbrott_ovrigt_min="int",
                        avbrott_totalt_min="int", avbrott_registrerade="text", objekt_nyckel="text", programversion="text", antal_lass="int", volym_kvalitet="text", livstid_h="num", raknas="bool", dubblett_av="text"),
    "hist_skift": dict(datum="date", in_tid="time", ut_tid="time", g15_h="num", g0_h="num", volym="num", volym_enhet="text", stammar="int", bransle_l="num", motortid_h="num",
                       sha256="text", kalla="text", objekt="text", antal_lass="int"),
    "hist_forare_objekt": dict(sha256="text", g15_h="num", volym="num", stammar="int"),
    "hist_stopp": dict(datum="date", tid="time", felkod="text", beskrivning="text", minuter="int", forare="text", sha256="text"),
    "hist_korrigering": dict(sha256="text", falt="text", nytt_varde="text", orsak="text"),
}
KONFLIKT = {"hist_maskin": "namn", "hist_forare": "namn", "hist_rapport": "sha256", "hist_objekt": "sha256", "hist_skift": "hist_maskin_id,hist_forare_id,datum,in_tid",
            "hist_forare_objekt": "sha256,hist_forare_id", "hist_stopp": "hist_maskin_id,datum,tid,felkod", "hist_korrigering": "sha256,falt"}


# ------------------------------------------------------------------------------------------------ vitlista
class Avbryt(SystemExit):
    pass


class Vitlista:
    """Enda vägen ut mot Supabase. Kontrollerar tabellnamn och bucket innan något skickas."""

    def __init__(self, url, nyckel):
        self.url = url.rstrip("/")
        self._h = {"apikey": nyckel, "Authorization": f"Bearer {nyckel}"}
        self.antal = Counter()

    def _kolla_tabell(self, t):
        if not TABELL_RE.match(t or ""):
            raise Avbryt(f"AVBRYTER: '{t}' är inte en hist_-tabell (vitlista)")

    def _kolla_bucket(self, b):
        if b != BUCKET:
            raise Avbryt(f"AVBRYTER: bucket '{b}' är inte '{BUCKET}' (vitlista)")

    def _anrop(self, metod, url, data=None, extra=None, tillat404=False):
        h = dict(self._h)
        h.update(extra or {})
        req = urllib.request.Request(url, data=data, headers=h, method=metod)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, r.read(), r.headers
        except urllib.error.HTTPError as e:
            if tillat404 and e.code in (400, 404):
                return e.code, e.read(), e.headers
            raise Avbryt(f"AVBRYTER: HTTP {e.code} {metod} {url.split('?')[0]}: {e.read()[:300]!r}")

    def rest(self, metod, tabell, rader=None, on_conflict=None, query=""):
        self._kolla_tabell(tabell)
        q = f"?on_conflict={on_conflict}" if on_conflict else (f"?{query}" if query else "")
        h = {"Content-Type": "application/json"}
        if metod == "POST":
            h["Prefer"] = "resolution=merge-duplicates,return=minimal"
        data = json.dumps(rader).encode("utf-8") if rader is not None else None
        self.antal[(metod, tabell)] += 1
        if metod not in ("GET", "POST"):
            raise Avbryt("AVBRYTER: bara GET och POST (upsert) tillåts; aldrig PATCH/DELETE")
        return self._anrop(metod, f"{self.url}/rest/v1/{tabell}{q}", data, h)

    def las(self, tabell, select, order, sida=1000):
        ut, off = [], 0
        while True:
            _, body, _ = self.rest("GET", tabell, query=f"select={select}&order={order}&limit={sida}&offset={off}")
            rader = json.loads(body)
            ut += rader
            if len(rader) < sida:
                return ut
            off += sida

    def lagring(self, metod, bucket, sokvag=None, data=None, ctype=None):
        self._kolla_bucket(bucket)
        if metod == "CREATE_BUCKET":
            s, b, _ = self._anrop("POST", f"{self.url}/storage/v1/bucket", json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode(), {"Content-Type": "application/json"}, tillat404=True)
            return s
        if metod == "FINNS":
            s, _, _ = self._anrop("HEAD", f"{self.url}/storage/v1/object/authenticated/{BUCKET}/{urllib.parse.quote(sokvag)}", tillat404=True)
            return s == 200
        if metod == "LISTA":  # sokvag = mapp (år); returnerar [(namn, bytes)]
            ut, off = [], 0
            while True:
                body = json.dumps({"prefix": sokvag, "limit": 1000, "offset": off, "sortBy": {"column": "name", "order": "asc"}}).encode()
                _, b, _ = self._anrop("POST", f"{self.url}/storage/v1/object/list/{BUCKET}", body, {"Content-Type": "application/json"})
                rad = json.loads(b)
                ut += [(f"{sokvag}/{r['name']}", (r.get("metadata") or {}).get("size", 0)) for r in rad if r.get("id")]
                if len(rad) < 1000:
                    return ut
                off += 1000
        if metod == "UPLOAD":
            self.antal[("UPLOAD", BUCKET)] += 1
            self._anrop("POST", f"{self.url}/storage/v1/object/{BUCKET}/{urllib.parse.quote(sokvag)}", data, {"Content-Type": ctype or "application/octet-stream", "x-upsert": "true"})
            return True
        raise Avbryt(f"AVBRYTER: okänd lagringsoperation {metod}")


# ------------------------------------------------------------------------------------------------ CSV -> rader
def las_csv(tabell):
    with open(CSV / f"{tabell}.csv", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def konv(v, typ):
    if typ == "arr":
        return [a for a in (v or "").split("|") if a]
    if v == "" or v is None:
        return None
    if typ == "int":
        return int(round(float(v)))
    if typ == "num":
        return float(v)
    if typ == "bool":
        return v.lower() == "true"
    if typ == "arr":
        return [a for a in v.split("|") if a]
    return v


def tabellrader(tabell, rader):
    sch = SCHEMA[tabell]
    return [{k: konv(r.get(k, ""), t) for k, t in sch.items()} for r in rader]


# ------------------------------------------------------------------------------------------------ torrkörning / konsistens
def kontrollera_csv():
    """Validerar CSV mot schemat och mellan tabellerna. Returnerar (data, fel)."""
    d = {t: las_csv(t) for t in TABELLER}
    fel = []
    for t in TABELLER:
        try:
            tabellrader(t, d[t])
        except Exception as e:
            fel.append(f"{t}: typfel {type(e).__name__}: {e}")
    formler = {"date": re.compile(r"^\d{4}-\d\d-\d\d$"), "time": re.compile(r"^\d\d:\d\d(:\d\d)?$")}
    for t in TABELLER:
        for k, typ in SCHEMA[t].items():
            if typ in formler:
                dalig = [r[k] for r in d[t] if r.get(k) and not formler[typ].match(r[k])]
                if dalig:
                    fel.append(f"{t}.{k}: {len(dalig)} värden är inte {typ}, t.ex. {dalig[:2]}")
            if typ in ("num", "int"):
                stora = [r[k] for r in d[t] if r.get(k) and abs(float(r[k])) >= 1e9]
                if stora:
                    fel.append(f"{t}.{k}: {len(stora)} värden >= 1e9 (numeric-överflöd)")
    maskin = {r["namn"] for r in d["hist_maskin"]}
    forare = {r["namn"] for r in d["hist_forare"]}
    rap = {r["sha256"] for r in d["hist_rapport"]}
    for r in d["hist_rapport"]:
        if r["maskin_namn"] and r["maskin_namn"] not in maskin:
            fel.append(f"hist_rapport {r['sha256'][:8]}: okänd maskin {r['maskin_namn']}")
    for t, nyckel in (("hist_objekt", "sha256"), ("hist_skift", "sha256"), ("hist_forare_objekt", "sha256"), ("hist_stopp", "sha256"), ("hist_korrigering", "sha256")):
        saknas = {r[nyckel] for r in d[t] if r[nyckel] and r[nyckel] not in rap}
        if saknas:
            fel.append(f"{t}: {len(saknas)} sha256 finns inte i hist_rapport")
    for t in ("hist_skift", "hist_forare_objekt"):
        ok = {r["forare_namn"] for r in d[t] if r["forare_namn"] not in forare}
        if ok:
            fel.append(f"{t}: okända förare {sorted(ok)[:5]}")
    for t in ("hist_skift", "hist_stopp"):
        ok = {r["maskin_namn"] for r in d[t] if r["maskin_namn"] not in maskin}
        if ok:
            fel.append(f"{t}: okända maskiner {sorted(ok)[:5]}")
    # unika nycklar (annars kraschar upsert med "affect row a second time")
    for t, kol in (("hist_skift", ("maskin_namn", "forare_namn", "datum", "in_tid")), ("hist_stopp", ("maskin_namn", "datum", "tid", "felkod")),
                   ("hist_forare_objekt", ("sha256", "forare_namn")), ("hist_objekt", ("sha256",)), ("hist_rapport", ("sha256",))):
        c = Counter(tuple(r[k] for k in kol) for r in d[t])
        dubbl = [k for k, v in c.items() if v > 1]
        if dubbl:
            fel.append(f"{t}: {len(dubbl)} dubbletter på nyckeln {kol}")
    return d, fel


def summor(d):
    """(maskin, år) -> antal/volym/G15 ur CSV, för kontrolldelen. Objekt: år ur rapportdatum. Skift: år ur datum."""
    rap_maskin = {r["sha256"]: r["maskin_namn"] for r in d["hist_rapport"]}
    exk = {r["sha256"] for r in d["hist_rapport"] if r["exkluderad"] == "true"}
    ob, sk = defaultdict(lambda: [0, 0.0, 0.0, 0]), defaultdict(lambda: [0, 0.0, 0.0, 0])
    for r in d["hist_objekt"]:
        k = (rap_maskin.get(r["sha256"], ""), r["rapportdatum"][:4])
        a = ob[k]
        a[0] += 1
        a[1] += float(r["volym_m3fub"] or 0)
        a[2] += float(r["g15_h"] or 0)
        a[3] += int(float(r["stammar"] or 0))
    for r in d["hist_skift"]:
        k = (r["maskin_namn"], r["datum"][:4])
        a = sk[k]
        a[0] += 1
        a[1] += float(r["volym"] or 0)
        a[2] += float(r["g15_h"] or 0)
    return ob, sk


RP_SHA = "0e64154b7325b05c508f254608f8536123ccf62ef9d4356a8784f1a2fcb6bdab"   # RP Kompersmåla, Komatsu 941 (facit: 8 201 stammar, 3 739,913 m3fub, G15 138:14)
RP_FACIT = dict(stammar=8201, volym=3739.913, g15_min=138 * 60 + 14)


def kontroll_csv(d):
    r = next(x for x in d["hist_objekt"] if x["sha256"] == RP_SHA)
    min_ = round(float(r["g15_h"]) * 60)
    ok = int(r["stammar"]) == RP_FACIT["stammar"] and abs(float(r["volym_m3fub"]) - RP_FACIT["volym"]) < 0.0005 and min_ == RP_FACIT["g15_min"]
    print(f"  RP Kompersmåla i CSV: stammar {r['stammar']}, m3fub {r['volym_m3fub']}, G15 {min_ // 60}:{min_ % 60:02d}  -> {'OK' if ok else 'AVVIKER'}")
    return ok


def kontroll_db(vl, d):
    """Jämför databasen med CSV: antal rader och summa volym/G15 per maskin och år (objekt + skift) samt RP Kompersmåla."""
    maskiner = {m["id"]: m["namn"] for m in vl.las("hist_maskin", "id,namn", "id")}
    rap = {r["sha256"]: maskiner.get(r["hist_maskin_id"], "") for r in vl.las("hist_rapport", "sha256,hist_maskin_id", "sha256")}
    ob_db = defaultdict(lambda: [0, 0.0, 0.0, 0])
    rp = None
    for r in vl.las("hist_objekt", "sha256,rapportdatum,volym_m3fub,g15_h,stammar", "sha256"):
        a = ob_db[(rap.get(r["sha256"], ""), (r["rapportdatum"] or "")[:4])]
        a[0] += 1
        a[1] += float(r["volym_m3fub"] or 0)
        a[2] += float(r["g15_h"] or 0)
        a[3] += int(r["stammar"] or 0)
        if r["sha256"] == RP_SHA:
            rp = r
    sk_db = defaultdict(lambda: [0, 0.0, 0.0, 0])
    for r in vl.las("hist_skift", "id,hist_maskin_id,datum,volym,g15_h", "id"):
        a = sk_db[(maskiner.get(r["hist_maskin_id"], ""), r["datum"][:4])]
        a[0] += 1
        a[1] += float(r["volym"] or 0)
        a[2] += float(r["g15_h"] or 0)
    ob_csv, sk_csv = summor(d)
    fel = 0
    for namn, a, b in (("hist_objekt", ob_csv, ob_db), ("hist_skift", sk_csv, sk_db)):
        for k in sorted(set(a) | set(b)):
            x, y = a.get(k, [0, 0, 0, 0]), b.get(k, [0, 0, 0, 0])
            if x[0] != y[0] or abs(x[1] - y[1]) > 0.01 or abs(x[2] - y[2]) > 0.01 or (namn == "hist_objekt" and x[3] != y[3]):
                fel += 1
                print(f"  AVVIKER {namn} {k}: CSV {x} DB {y}")
    print(f"  antal maskin/år-grupper som avviker: {fel}")
    if rp is None:
        print("  RP Kompersmåla saknas i databasen")
        return False
    min_ = round(float(rp["g15_h"]) * 60)
    ok = int(rp["stammar"]) == RP_FACIT["stammar"] and abs(float(rp["volym_m3fub"]) - RP_FACIT["volym"]) < 0.0005 and min_ == RP_FACIT["g15_min"]
    print(f"  RP Kompersmåla i databasen: stammar {rp['stammar']}, m3fub {rp['volym_m3fub']}, G15 {min_ // 60}:{min_ % 60:02d} -> {'OK' if ok else 'AVVIKER'}")
    return fel == 0 and ok


# ------------------------------------------------------------------------------------------------ import
def paket(rader, n=400):
    for i in range(0, len(rader), n):
        yield rader[i:i + n]


def lagg_in(vl, d, med_filer):
    print("skapar bucket 'historik' (privat) om den saknas ...")
    s = vl.lagring("CREATE_BUCKET", BUCKET)
    print("  bucket-svar:", s, "(200 = skapad, 400/409 = fanns redan)")
    for t in ("hist_maskin", "hist_forare"):
        for p in paket(tabellrader(t, d[t])):
            vl.rest("POST", t, p, on_conflict=KONFLIKT[t])
    maskin_id = {m["namn"]: m["id"] for m in vl.las("hist_maskin", "id,namn", "id")}
    forare_id = {m["namn"]: m["id"] for m in vl.las("hist_forare", "id,namn", "id")}
    rader = tabellrader("hist_rapport", d["hist_rapport"])
    for r, c in zip(rader, d["hist_rapport"]):
        r["hist_maskin_id"] = maskin_id.get(c["maskin_namn"]) if c["maskin_namn"] else None
    for p in paket(rader):
        vl.rest("POST", "hist_rapport", p, on_conflict=KONFLIKT["hist_rapport"])
    for p in paket(tabellrader("hist_objekt", d["hist_objekt"])):
        vl.rest("POST", "hist_objekt", p, on_conflict=KONFLIKT["hist_objekt"])
    for t, kol in (("hist_skift", "forare_namn"), ("hist_forare_objekt", "forare_namn"), ("hist_stopp", None), ("hist_korrigering", None)):
        rader = tabellrader(t, d[t])
        for r, c in zip(rader, d[t]):
            if "maskin_namn" in c:
                r["hist_maskin_id"] = maskin_id[c["maskin_namn"]]
            if kol:
                r["hist_forare_id"] = forare_id[c[kol]]
        for p in paket(rader):
            vl.rest("POST", t, p, on_conflict=KONFLIKT[t])
        print(f"  {t}: {len(rader)} rader upsertade")
    if med_filer:
        ladda_filer(vl, d)


def ladda_filer(vl, d, trad=3):
    from concurrent.futures import ThreadPoolExecutor
    bil = {os.path.splitext(f)[0]: f for f in os.listdir(IMP / "bilagor")}
    pdf = set(os.listdir(IMP / "pdf"))
    # befintliga filer listas en gång per år (snabbare än ett FINNS-anrop per fil)
    finns = set()
    for a in sorted({r["storage_path"].split("/")[0] for r in d["hist_rapport"]}):
        finns |= {n for n, _ in vl.lagring("LISTA", BUCKET, a)}
    jobb = []
    for r in d["hist_rapport"]:
        sha = r["sha256"]
        lokal = IMP / "bilagor" / bil[sha] if sha in bil else IMP / "pdf" / f"{sha}.pdf" if f"{sha}.pdf" in pdf else None
        if lokal is None:
            raise Avbryt(f"AVBRYTER: fil saknas lokalt för {sha}")
        if r["storage_path"] not in finns:
            jobb.append((r["storage_path"], lokal, {"pdf": "application/pdf", "xps": "application/oxps"}.get(r["filtyp"], "application/octet-stream")))
    print(f"filer: {len(finns)} finns redan i bucketen, {len(jobb)} ska laddas upp ({trad} trådar)", flush=True)
    t0 = time.time()
    klara = [0]

    def ladda(j):
        for forsok in range(8):
            try:
                vl.lagring("UPLOAD", BUCKET, j[0], j[1].read_bytes(), j[2])
                break
            except Avbryt:
                if forsok == 7:
                    raise
                time.sleep(5 * (forsok + 1))
        klara[0] += 1
        if klara[0] % 250 == 0:
            print(f"  uppladdade {klara[0]}/{len(jobb)} ({time.time() - t0:.0f} s)", flush=True)

    with ThreadPoolExecutor(trad) as ex:
        list(ex.map(ladda, jobb))
    print(f"filer: {len(jobb)} nya, {len(finns)} fanns redan", flush=True)


def kontrollera_filer(vl, d):
    """Jämför hist_rapport.storage_path i databasen mot CSV, mot förväntat mönster <år>/<sha256>.<filtyp> och mot det som ligger i bucketen."""
    db = {r["sha256"]: r["storage_path"] for r in vl.las("hist_rapport", "sha256,storage_path", "sha256")}
    csvp = {r["sha256"]: r for r in d["hist_rapport"]}
    fel = [sha for sha, p in db.items() if p != csvp[sha]["storage_path"] or not re.fullmatch(r"(\d{4}|okand)/" + sha + r"\." + csvp[sha]["filtyp"], p or "")]
    print(f"  storage_path i hist_rapport: {len(db)} rader, {len(fel)} avviker från CSV/mönstret <år>/<sha256>.<ext>")
    ar = sorted({p.split("/")[0] for p in db.values()})
    i_bucket = {}
    for a in ar:
        for namn, storlek in vl.lagring("LISTA", BUCKET, a):
            i_bucket[namn] = storlek
    saknas = [sha for sha, p in db.items() if p not in i_bucket]
    extra = set(i_bucket) - set(db.values())
    mb = sum(i_bucket.values()) / 1e6
    lokal = 0
    bil = {os.path.splitext(f)[0]: f for f in os.listdir(IMP / "bilagor")}
    avvik_storlek = 0
    for sha, p in db.items():
        f = IMP / "bilagor" / bil[sha] if sha in bil else IMP / "pdf" / f"{sha}.pdf"
        n = f.stat().st_size
        lokal += n
        if i_bucket.get(p) not in (None, n):
            avvik_storlek += 1
    print(f"  i bucketen: {len(i_bucket)} filer, {mb:.1f} MB (lokalt {lokal / 1e6:.1f} MB); saknas i bucket: {len(saknas)}; extra i bucket: {len(extra)}; storleksavvikelser: {avvik_storlek}")
    for a in ar:
        n = [v for k, v in i_bucket.items() if k.startswith(a + "/")]
        print(f"    {a}: {len(n)} filer, {sum(n) / 1e6:.1f} MB")
    return not fel and not saknas and not extra and avvik_storlek == 0


def main():
    arg = set(sys.argv[1:])
    d, fel = kontrollera_csv()
    print("CSV-rader:", {t: len(d[t]) for t in TABELLER})
    print("konsistensfel i CSV:", fel or "inga")
    ok = kontroll_csv(d)
    ob, sk = summor(d)
    print(f"  maskin/år-grupper att kontrollera: hist_objekt {len(ob)}, hist_skift {len(sk)}")
    if fel or not ok:
        raise Avbryt("AVBRYTER: CSV-filerna är inte konsistenta")
    if not arg & {"--utfor", "--bara-kontroll", "--bara-filer", "--kontrollera-filer"}:
        print("torrkörning klar: ingen nätverksanslutning öppnades, inget skrevs.")
        return
    url, nyckel = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not nyckel:
        raise Avbryt("AVBRYTER: SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY saknas i miljön")
    vl = Vitlista(url, nyckel)
    if "--bara-filer" in arg:
        if os.environ.get("HIST_IMPORT_OK") != "ja":
            raise Avbryt("AVBRYTER: HIST_IMPORT_OK=ja saknas")
        ladda_filer(vl, d)
        print("kontroll av filer:")
        if not kontrollera_filer(vl, d):
            raise Avbryt("FILKONTROLL AVVIKER")
        print("filkontroll OK")
        return
    if "--kontrollera-filer" in arg:
        if not kontrollera_filer(vl, d):
            raise Avbryt("FILKONTROLL AVVIKER")
        return
    if "--utfor" in arg:
        if os.environ.get("HIST_IMPORT_OK") != "ja":
            raise Avbryt("AVBRYTER: HIST_IMPORT_OK=ja saknas (Martins ja krävs före skrivning)")
        lagg_in(vl, d, "--utan-filer" not in arg)
        print("anrop:", dict(vl.antal))
    print("kontroll mot databasen:")
    if not kontroll_db(vl, d):
        raise Avbryt("KONTROLL AVVIKER")
    print("kontroll OK")


if __name__ == "__main__":
    main()
