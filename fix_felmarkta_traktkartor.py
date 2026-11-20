#!/usr/bin/env python3
"""Engångsfix: fyra objekt där traktkartan (TK-PDF) felaktigt sparades som stämplingslängd.

Före envz-importen gjorde route.ts "allt utom _TD" till stämplingslängd, så variant-B-kartan
{nr}_01_TK.pdf hamnade i {nr}_stamplingslangd.pdf. Bevis: {nr}_01_TK.pdf och
{nr}_stamplingslangd.pdf är byte-identiska.

Denna fix, per objekt (882583, 883966, 886465, 887611):
  1. döper om i storage: kartbilder/{nr}_stamplingslangd.pdf -> {nr}_traktkarta.pdf
  2. objekt: stamplingslangd_url = NULL, traktkarta_url = '{nr}_traktkarta.pdf'
  3. läser tillbaka och verifierar BÅDE DB-värdet och att storage-filen finns

Defensiv: hoppar objekt vars rad inte pekar på {nr}_stamplingslangd.pdf (redan fixat eller
omimporterat via envz). Idempotent — kan köras om.

Körning:
  python fix_felmarkta_traktkartor.py            # DRY-RUN (visar bara vad som skulle hända)
  python fix_felmarkta_traktkartor.py --skarp    # utför ändringarna
"""
import os
import sys

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BUCKET = "kartbilder"
TRAKTNR = ["882583", "883966", "886465", "887611"]
DRY = "--skarp" not in sys.argv


def env_local(name):
    if os.environ.get(name):
        return os.environ[name]
    with open(os.path.join(SCRIPT_DIR, ".env.local"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


URL = env_local("NEXT_PUBLIC_SUPABASE_URL")
KEY = env_local("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def storage_finns(path):
    """True om objektet finns i bucketen (list med exakt namnmatch)."""
    r = requests.post(
        f"{URL}/storage/v1/object/list/{BUCKET}",
        headers=H, json={"prefix": "", "search": path, "limit": 100}, timeout=30,
    )
    r.raise_for_status()
    return any(o.get("name") == path for o in r.json())


def storage_move(src, dst):
    r = requests.post(
        f"{URL}/storage/v1/object/move",
        headers=H, json={"bucketId": BUCKET, "sourceKey": src, "destinationKey": dst}, timeout=60,
    )
    return r


def db_get(nr):
    r = requests.get(
        f"{URL}/rest/v1/objekt?traktnr=eq.{nr}&select=id,traktnr,stamplingslangd_url,traktkarta_url",
        headers=H, timeout=30,
    )
    r.raise_for_status()
    return r.json()


def db_update(row_id, dst):
    r = requests.patch(
        f"{URL}/rest/v1/objekt?id=eq.{row_id}",
        headers={**H, "Prefer": "return=representation"},
        json={"stamplingslangd_url": None, "traktkarta_url": dst}, timeout=30,
    )
    r.raise_for_status()
    return r.json()


def main():
    print(f"{'DRY-RUN' if DRY else 'SKARP'} — bucket={BUCKET}\n")
    for nr in TRAKTNR:
        src, dst = f"{nr}_stamplingslangd.pdf", f"{nr}_traktkarta.pdf"
        rader = db_get(nr)
        if not rader:
            print(f"{nr}: INGEN objekt-rad med traktnr={nr} — hoppar.")
            continue
        traff = [r for r in rader if r.get("stamplingslangd_url") == src]
        if not traff:
            nuv = [r.get("stamplingslangd_url") for r in rader]
            print(f"{nr}: raden pekar inte på {src} (är: {nuv}) — redan fixat/omimporterat, hoppar.")
            continue
        row = traff[0]
        print(f"{nr}: rad {row['id']}  stamplingslangd_url={src} -> flytta till {dst} + peka traktkarta_url")
        if DRY:
            print(f"     [dry-run] storage move {src} -> {dst}; UPDATE stamplingslangd_url=NULL, traktkarta_url={dst}")
            continue

        # 1. storage move (om src finns; annars kontrollera att dst redan finns)
        if storage_finns(src):
            mv = storage_move(src, dst)
            if mv.status_code not in (200, 201):
                print(f"     FEL storage move: {mv.status_code} {mv.text[:150]} — hoppar DB-update.")
                continue
        elif not storage_finns(dst):
            print(f"     FEL: varken {src} eller {dst} finns i storage — hoppar.")
            continue
        else:
            print(f"     {src} redan flyttad ({dst} finns).")

        # 2. DB-update
        db_update(row["id"], dst)

        # 3. verifiera på INNEHÅLL
        efter = db_get(nr)[0]
        ok_db = efter.get("stamplingslangd_url") is None and efter.get("traktkarta_url") == dst
        ok_st = storage_finns(dst) and not storage_finns(src)
        print(f"     verifierat: DB {'OK' if ok_db else 'FEL'} (sl={efter.get('stamplingslangd_url')}, "
              f"tk={efter.get('traktkarta_url')}) | storage {'OK' if ok_st else 'FEL'}")

    print("\nKlart." + ("  (dry-run — inget ändrat)" if DRY else ""))


if __name__ == "__main__":
    main()
