"""Bevisar att hist-migrationen bara innehåller tillåtna satser och bara rör tabeller som börjar på hist_.

Tillåtet: CREATE TABLE hist_*, CREATE INDEX ... ON hist_*, CREATE POLICY ... ON hist_*, ALTER TABLE hist_* ENABLE ROW LEVEL SECURITY.
Allt annat (DROP, ALTER annat, UPDATE, DELETE, TRUNCATE, INSERT, CREATE EXTENSION/FUNCTION/VIEW/TRIGGER, GRANT ...) => fel.
Foreign keys får bara peka på hist_*. Kör: python verifiera_migration.py [sökväg]
"""
import re
import sys
from pathlib import Path

STD = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261009170000_hist_tabeller.sql"
EXTRA = ["20261009180000_hist_objekt_raknas.sql", "20261012100000_hist_vyer.sql", "20261013100000_hist_las_admin.sql"]


def satser(sql):
    sql = re.sub(r"--[^\n]*", "", sql)
    return [s.strip() for s in sql.split(";") if s.strip()]


def vy_ast(sql):
    """Via Postgres-parsern (pglast): varje CREATE VIEW måste vara vy_hist_* med security_invoker=true och får bara läsa hist_* / vy_hist_* (eller sina egna CTE:er)."""
    if "create view" not in sql.lower():
        return []
    import json
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
        m = (re.match(r"^create table (hist_\w+) \(", low) and ("create table", re.match(r"^create table (hist_\w+) \(", low).group(1))) \
            or (re.match(r"^create index \w+ on (hist_\w+) \(", low) and ("create index", re.match(r"^create index \w+ on (hist_\w+) \(", low).group(1))) \
            or (re.match(r"^create policy \w+ on (hist_\w+) for select to authenticated using \(true\)$", low)
                and ("create policy", re.match(r"^create policy \w+ on (hist_\w+) for", low).group(1))) \
            or (re.match(r"^alter table hist_objekt add column (raknas boolean not null default false|dubblett_av text)$", low) and ("add column", "hist_objekt"))             or (re.match(r"^create view (vy_hist_\w+) with \(security_invoker = true\) as select|^create view (vy_hist_\w+) with \(security_invoker = true\) as with ", low)
                and ("create view", re.match(r"^create view (vy_hist_\w+)", low).group(1)))             or (re.match(r"^alter policy (hist_\w+_las) on (hist_\w+) using \(\(select public\.ar_admin\(\)\)\)$", low)
                and ("alter policy", re.match(r"^alter policy hist_\w+_las on (hist_\w+)", low).group(1)))             or (re.match(r"^create policy historik_las_admin on storage\.objects for select to authenticated using \(bucket_id = 'historik' and \(select public\.ar_admin\(\)\)\)$", low)
                and ("create policy storage.objects (bara bucket historik)", "hist_storage"))             or (re.match(r"^alter table (hist_\w+) enable row level security$", low) and ("enable rls", re.match(r"^alter table (hist_\w+) enable", low).group(1)))
        if not m:
            fel.append(j[:120])
            continue
        antal[m[0]] = antal.get(m[0], 0) + 1
        rort.add(m[1])
        for ref in re.findall(r"references (\w+)", low):
            if not ref.startswith("hist_"):
                fel.append(f"foreign key mot icke-hist-tabell: {ref}")
    for ord_ in ("drop ", "truncate", "update ", "delete ", "insert ", "grant ", "revoke ", "create extension", "create function", "create or replace", "create trigger", "create materialized", "alter column"):
        if ord_ in sql.lower():
            fel.append(f"förbjudet ord: {ord_.strip()}")
    fel += vy_ast(sql)
    return fel, rort, antal


if __name__ == "__main__":
    filer = [Path(sys.argv[1])] if len(sys.argv) > 1 else [STD] + [STD.parent / n for n in EXTRA]
    totalt_fel = 0
    for p in filer:
        fel, rort, antal = kontrollera(p.read_text(encoding="utf-8"))
        print("fil:", p.name)
        print("satser per typ:", antal)
        print("tabeller som rörs:", sorted(rort))
        print("befintliga tabeller/vyer/funktioner som rörs:", "inga" if not fel and all(t.startswith(("hist_", "vy_hist_")) for t in rort) else fel)
        totalt_fel += len(fel)
    sys.exit(1 if totalt_fel else 0)
