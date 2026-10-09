"""Bevisar att hist-migrationen bara innehåller tillåtna satser och bara rör tabeller som börjar på hist_.

Tillåtet: CREATE TABLE hist_*, CREATE INDEX ... ON hist_*, CREATE POLICY ... ON hist_*, ALTER TABLE hist_* ENABLE ROW LEVEL SECURITY.
Allt annat (DROP, ALTER annat, UPDATE, DELETE, TRUNCATE, INSERT, CREATE EXTENSION/FUNCTION/VIEW/TRIGGER, GRANT ...) => fel.
Foreign keys får bara peka på hist_*. Kör: python verifiera_migration.py [sökväg]
"""
import re
import sys
from pathlib import Path

STD = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261009170000_hist_tabeller.sql"


def satser(sql):
    sql = re.sub(r"--[^\n]*", "", sql)
    return [s.strip() for s in sql.split(";") if s.strip()]


def kontrollera(sql):
    fel, rort, antal = [], set(), {}
    for s in satser(sql):
        j = " ".join(s.split())
        low = j.lower()
        m = (re.match(r"^create table (hist_\w+) \(", low) and ("create table", re.match(r"^create table (hist_\w+) \(", low).group(1))) \
            or (re.match(r"^create index \w+ on (hist_\w+) \(", low) and ("create index", re.match(r"^create index \w+ on (hist_\w+) \(", low).group(1))) \
            or (re.match(r"^create policy \w+ on (hist_\w+) for select to authenticated using \(true\)$", low)
                and ("create policy", re.match(r"^create policy \w+ on (hist_\w+) for", low).group(1))) \
            or (re.match(r"^alter table (hist_\w+) enable row level security$", low) and ("enable rls", re.match(r"^alter table (hist_\w+) enable", low).group(1)))
        if not m:
            fel.append(j[:120])
            continue
        antal[m[0]] = antal.get(m[0], 0) + 1
        rort.add(m[1])
        for ref in re.findall(r"references (\w+)", low):
            if not ref.startswith("hist_"):
                fel.append(f"foreign key mot icke-hist-tabell: {ref}")
    for ord_ in ("drop ", "truncate", "update ", "delete ", "insert ", "grant ", "revoke ", "create extension", "create function", "create view", "create trigger", "alter column"):
        if ord_ in sql.lower():
            fel.append(f"förbjudet ord: {ord_.strip()}")
    return fel, rort, antal


if __name__ == "__main__":
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else STD
    fel, rort, antal = kontrollera(p.read_text(encoding="utf-8"))
    print("fil:", p.name)
    print("satser per typ:", antal)
    print("tabeller som rörs:", sorted(rort))
    print("befintliga tabeller/vyer/funktioner som rörs:", "inga" if not fel and all(t.startswith("hist_") for t in rort) else fel)
    sys.exit(1 if fel else 0)
