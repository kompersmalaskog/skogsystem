"""Bevisar att hist-migrationerna bara innehåller tillåtna satser och bara rör hist_* / vy_hist_* (plus EN namngiven policy på storage.objects för bucketen historik).

Tillåtet (exakt dessa former, allt annat => fel):
  CREATE TABLE hist_* (...)                               CREATE INDEX x ON hist_* (...)
  ALTER TABLE hist_* ENABLE ROW LEVEL SECURITY            CREATE POLICY hist_*_las ON hist_* FOR SELECT TO authenticated USING (true | admin)
  ALTER POLICY hist_*_las ON hist_* USING (admin)         CREATE POLICY historik_las_admin ON storage.objects ... bucket_id = 'historik'
  ALTER TABLE hist_objekt ADD COLUMN raknas / dubblett_av ALTER TABLE hist_skift ADD COLUMN antal_lass
  CREATE [OR REPLACE] VIEW vy_hist_* WITH (security_invoker = true) AS SELECT|WITH ...   (får bara läsa hist_* / vy_hist_*, kontrolleras med Postgres-parsern)
Förbjudet: DROP, TRUNCATE, UPDATE, DELETE, INSERT, GRANT, REVOKE, CREATE EXTENSION/FUNCTION/TRIGGER, ALTER COLUMN. Foreign keys får bara peka på hist_*.
Kör: python verifiera_migration.py [sökväg]
"""
import json
import re
import sys
from pathlib import Path

STD = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261009170000_hist_tabeller.sql"
EXTRA = ["20261009180000_hist_objekt_raknas.sql", "20261012100000_hist_vyer.sql", "20261013100000_hist_las_admin.sql",
         "20261014100000_hist_korrigering_lass.sql", "20261014110000_hist_vyer_korrigering.sql", "20261015100000_hist_vyer_regler.sql", "20261015110000_hist_vyer_appen.sql", "20261015120000_hist_maskin_ar_summor.sql",
         "20261016100000_hist_steg13_tu_rapporterad.sql", "20261016110000_hist_skotare_koppling.sql", "20261017100000_hist_tvilling_lastcert.sql"]
ADMIN = r"\(\(select public\.ar_admin\(\)\)\)"

# (regex, etikett, grupp med tabell- eller vynamn)
MONSTER = [
    (r"^create table (hist_\w+) \(", "create table"),
    (r"^create index \w+ on (hist_\w+) \(", "create index"),
    (r"^create policy \w+ on (hist_\w+) for select to authenticated using \(true\)$", "create policy (alla inloggade)"),
    (r"^create policy hist_\w+_las on (hist_\w+) for select to authenticated using " + ADMIN + "$", "create policy (admin)"),
    (r"^alter policy hist_\w+_las on (hist_\w+) using " + ADMIN + "$", "alter policy (admin)"),
    (r"^create policy historik_las_admin on (storage\.objects) for select to authenticated using \(bucket_id = 'historik' and \(select public\.ar_admin\(\)\)\)$",
     "create policy storage.objects (bara bucket historik)"),
    (r"^alter table (hist_objekt) add column (?:if not exists )?(?:raknas boolean not null default false|dubblett_av text|arbetstid_h numeric|tu_rapporterad numeric)$", "add column"),
    (r"^alter table (hist_skift) add column antal_lass integer$", "add column"),
    (r"^alter table (hist_\w+) enable row level security$", "enable rls"),
    (r"^create (?:or replace )?view (vy_hist_\w+) with \(security_invoker = true\) as (?:select|with) ", "create view"),
]
FORBJUDET = ("drop ", "truncate", "update ", "delete ", "insert ", "grant ", "revoke ", "create extension", "create function", "create or replace function",
             "create trigger", "create or replace trigger", "create materialized", "alter column")


def satser(sql):
    sql = re.sub(r"--[^\n]*", "", sql)
    return [s.strip() for s in sql.split(";") if s.strip()]


def vy_ast(sql):
    """Via Postgres-parsern (pglast): varje CREATE VIEW måste vara vy_hist_* med security_invoker=true och får bara läsa hist_* / vy_hist_* (eller sina egna CTE:er)."""
    if "view " not in sql.lower():
        return []
    import pglast
    import pglast.parser
    fel = []

    def gå(n, rv, ctes):
        if isinstance(n, dict):
            if "RangeVar" in n:
                rv.append(n["RangeVar"])
            if "CommonTableExpr" in n:
                ctes.add(n["CommonTableExpr"]["ctename"])
            for v in n.values():
                gå(v, rv, ctes)
        elif isinstance(n, list):
            for v in n:
                gå(v, rv, ctes)

    for st in json.loads(pglast.parser.parse_sql_json(sql))["stmts"]:
        v = st["stmt"].get("ViewStmt")
        if v is None:
            continue
        namn = v["view"]["relname"]
        opts = {o["DefElem"]["defname"]: json.dumps(o["DefElem"].get("arg")) for o in v.get("options", [])}
        if not namn.startswith("vy_hist_"):
            fel.append(f"vy utan prefix vy_hist_: {namn}")
        if "security_invoker" not in opts or "true" not in opts["security_invoker"].lower():
            fel.append(f"{namn}: security_invoker saknas")
        rv, ctes = [], set()
        gå(v["query"], rv, ctes)
        for r in rv:
            if r.get("schemaname"):
                fel.append(f"{namn}: schema-kvalificerad tabell {r['schemaname']}.{r['relname']}")
            elif not (r["relname"].startswith(("hist_", "vy_hist_")) or r["relname"] in ctes):
                fel.append(f"{namn}: läser icke-hist-relation {r['relname']}")
    return fel


def kontrollera(sql):
    fel, rort, antal = [], set(), {}
    for s in satser(sql):
        j = " ".join(s.split())
        low = j.lower()
        traff = None
        for mon, etikett in MONSTER:
            m = re.match(mon, low)
            if m:
                traff = (etikett, m.group(1))
                break
        if not traff:
            fel.append(j[:120])
            continue
        antal[traff[0]] = antal.get(traff[0], 0) + 1
        rort.add(traff[1])
        for ref in re.findall(r"references (\w+)", low):
            if not ref.startswith("hist_"):
                fel.append(f"foreign key mot icke-hist-tabell: {ref}")
    low_all = sql.lower()
    for ord_ in FORBJUDET:
        if ord_ in low_all:
            fel.append(f"förbjudet ord: {ord_.strip()}")
    fel += vy_ast(sql)
    return fel, rort, antal


if __name__ == "__main__":
    filer = [Path(sys.argv[1])] if len(sys.argv) > 1 else [STD] + [STD.parent / n for n in EXTRA if (STD.parent / n).exists()]
    totalt_fel = 0
    for p in filer:
        fel, rort, antal = kontrollera(p.read_text(encoding="utf-8"))
        print("fil:", p.name)
        print("satser per typ:", antal)
        print("objekt som rörs:", sorted(rort))
        ok = not fel and all(t.startswith(("hist_", "vy_hist_", "storage.objects")) for t in rort)
        print("befintliga tabeller/vyer/funktioner som rörs:", "inga (storage.objects: bara den nya historik-policyn)" if ok and "storage.objects" in rort else "inga" if ok else fel)
        totalt_fel += len(fel)
    sys.exit(1 if totalt_fel else 0)
