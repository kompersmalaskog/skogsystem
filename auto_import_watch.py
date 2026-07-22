#!/usr/bin/env python3
"""
auto_import_watch.py — Bevakar Inkommande-mappen i realtid.
Triggar MOM-import (skogsmaskin_import_version_6.py) och HPR-import (import_hpr.py)
automatiskt när nya filer dyker upp.

Körs som bakgrundsprocess via auto_import_watch.bat eller Windows Autostart.
"""

import os
import sys
import time
import subprocess
import logging
import threading
import socket
import errno
from datetime import datetime
from pathlib import Path

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except ImportError:
    print("Saknat bibliotek. Kör: python -m pip install watchdog")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("Saknat bibliotek. Kör: python -m pip install requests")
    sys.exit(1)

# ============================================================
# KONFIGURATION
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

WATCH_DIR = r"C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer\Inkommande"

MOM_IMPORT_SCRIPT = os.path.join(SCRIPT_DIR, "skogsmaskin_import_version_6.py")
HPR_IMPORT_SCRIPT = os.path.join(SCRIPT_DIR, "import_hpr.py")

LOG_FILE = os.path.join(SCRIPT_DIR, "import_logg.txt")

VERCEL_API_URL = "https://skogsystem.vercel.app/api/mom-import"

# Fördelningsuppföljningen (etapp 1.5): varje ny .hpr POST:as även till
# /api/hpr-import. Vercel kapar request-bodies vid ~4,5 MB, så filen laddas
# först upp till Supabase Storage (raw-files/incoming/) och API:et får bara
# sökvägen. Nycklar läses ur miljön/.env.local — saknas de loggas en varning
# och steget hoppas över. FÅR ALDRIG stoppa arkiveringsflödet.
FORDELNING_API_URL = os.environ.get(
    "FORDELNING_API_URL", "https://skogsystem.vercel.app/api/hpr-import"
)

SETTLE_DELAY = 5  # sekunder att vänta innan import (fil kanske inte skrivits klart)

PERIODIC_SCAN_INTERVAL = 300  # 5 min — skyddsnät om watchdog missar events

PYTHON_EXE = sys.executable  # samma python som kör detta script

# ============================================================
# LOGGNING
# ============================================================

logger = logging.getLogger("auto_import_watch")
logger.setLevel(logging.INFO)

formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
fh.setFormatter(formatter)
logger.addHandler(fh)

ch = logging.StreamHandler()
ch.setFormatter(formatter)
logger.addHandler(ch)


def _git_commit_short():
    """Kort git-hash för katalogen skriptet ligger i. 'unknown' om ej git-repo
    (t.ex. en lös kopia utanför repot — avslöjar att fel skript kört)."""
    try:
        import subprocess
        here = os.path.dirname(os.path.abspath(__file__))
        out = subprocess.run(['git', '-C', here, 'rev-parse', '--short', 'HEAD'],
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or 'unknown'
    except Exception:
        return 'unknown'


def _git_dirty():
    """Ändrade/otrackade (ej ignorerade) filer i skriptets katalog, enligt
    git status --porcelain. None = kunde inte avgöra (ej git-repo m.m.).
    Smutsigt tree i drift betyder att koden som kör inte är den commitade
    (handpatchar) — det var så deploy-klonen gled isär från main juli 2026."""
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        out = subprocess.run(['git', '-C', here, 'status', '--porcelain'],
                             capture_output=True, text=True, timeout=5)
        if out.returncode != 0:
            return None
        return [l.strip() for l in out.stdout.splitlines() if l.strip()]
    except Exception:
        return None


# Single-instance-lås: bind en fast localhost-port. Bara EN process kan hålla porten
# åt gången; OS:et släpper den automatiskt vid exit/krasch (inget stale-lås). Hindrar
# att två watchdoggar kör samtidigt även om två tasks/launchers fyrar — rotorsaken till
# den dubbel-import vi sett.
_SINGLE_INSTANCE_PORT = 49281   # godtyckligt högt privat-portnummer, enbart för låset
_lock_socket = None


def _acquire_single_instance(port: int = _SINGLE_INSTANCE_PORT) -> bool:
    """True = vi fick låset (eller kunde ej sätta upp det -> blockera inte importen).
    False = en annan instans håller redan låset (porten upptagen)."""
    global _lock_socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('127.0.0.1', port))
    except OSError as e:
        try:
            s.close()
        except Exception:
            pass
        if getattr(e, 'errno', None) in (errno.EADDRINUSE, 10048, 48):
            return False  # porten upptagen = annan instans kör redan
        logger.warning(f"Single-instance-lås kunde ej tas (oväntat fel: {e}) — fortsätter UTAN lås.")
        return True
    _lock_socket = s  # håll socketen öppen processen ut (frigörs av OS vid exit)
    return True


# ============================================================
# IMPORT-FUNKTIONER
# ============================================================

# Deduplicering: undvik att samma fil triggar import flera gånger
_processed_files: dict[str, float] = {}
DEDUP_WINDOW = 60  # sekunder — ignorera samma fil inom detta fönster

# UTF-8 environment för subprocess (fixar encoding på Windows)
_env = os.environ.copy()
_env['PYTHONUTF8'] = '1'


def run_mom_import():
    """Kör skogsmaskin_import_version_6.py icke-interaktivt."""
    logger.info("Startar MOM-import: skogsmaskin_import_version_6.py")
    try:
        result = subprocess.run(
            [PYTHON_EXE, MOM_IMPORT_SCRIPT],
            cwd=SCRIPT_DIR,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=600,
            input="n\n",  # svara nej på "Starta övervakning?" prompten
            env=_env,
        )
        if result.returncode == 0:
            logger.info("MOM-import klar (OK)")
        else:
            logger.error(f"MOM-import avslutades med kod {result.returncode}")
        if result.stderr:
            for line in result.stderr.strip().split("\n")[-5:]:
                logger.warning(f"  stderr: {line}")
    except subprocess.TimeoutExpired:
        logger.error("MOM-import timeout (>600s)")
    except Exception as e:
        logger.error(f"MOM-import fel: {e}")


def run_hpr_import():
    """Kör import_hpr.py."""
    logger.info("Startar HPR-import: import_hpr.py")
    try:
        result = subprocess.run(
            [PYTHON_EXE, HPR_IMPORT_SCRIPT],
            cwd=SCRIPT_DIR,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=1800,  # marginal för stora HPR (senaste-per-objekt gör körningen liten)
            env=_env,
        )
        if result.returncode == 0:
            logger.info("HPR-import klar (OK)")
        else:
            logger.error(f"HPR-import avslutades med kod {result.returncode}")
        if result.stderr:
            for line in result.stderr.strip().split("\n")[-5:]:
                logger.warning(f"  stderr: {line}")
    except subprocess.TimeoutExpired:
        logger.error("HPR-import timeout (>600s)")
    except Exception as e:
        logger.error(f"HPR-import fel: {e}")


def notify_vercel():
    """Anropa Vercel API med dagens datum efter MOM-import."""
    today = datetime.now().strftime("%Y-%m-%d")
    logger.info(f"Notifierar Vercel API: {VERCEL_API_URL} (datum={today})")
    try:
        resp = requests.post(
            VERCEL_API_URL,
            json={"datum": today},
            timeout=30,
        )
        logger.info(f"Vercel API svar: {resp.status_code}")
    except Exception as e:
        logger.warning(f"Vercel API fel (ej kritiskt): {e}")


# ============================================================
# FÖRDELNINGSUPPFÖLJNING (etapp 1.5)
# ============================================================

def _env_local(name: str) -> str | None:
    """Miljövariabel, med fallback till SCRIPT_DIR/.env.local (samma fil som
    import_hpr.py läser). Returnerar None om nyckeln inte finns någonstans."""
    if os.environ.get(name):
        return os.environ[name]
    try:
        env_path = os.path.join(SCRIPT_DIR, ".env.local")
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return None


# Hindra att periodisk scan laddar upp samma fil om och om igen medan den
# ligger kvar i Inkommande. Serverns filhash-dedupe är sista försvar.
_fordelning_posted: set[tuple[str, int]] = set()


def post_hpr_fordelning(filepath: str):
    """Ladda upp .hpr till raw-files/incoming/ och peka /api/hpr-import dit.
    Självständig och ofarlig: varje fel loggas och sväljs — arkiveringen
    (MOM/HPR-importen) fortsätter alltid oavsett vad som händer här."""
    try:
        basename = os.path.basename(filepath)
        try:
            data = open(filepath, "rb").read()
        except OSError as e:
            logger.warning(f"Fördelning: kunde inte läsa {basename} ({e}) — "
                           f"backfill_fordelning_hpr.py tar den från Behandlade senare.")
            return
        cache_key = (basename.lower(), len(data))
        if cache_key in _fordelning_posted:
            return
        supabase_url = _env_local("NEXT_PUBLIC_SUPABASE_URL") or _env_local("SUPABASE_URL")
        service_key = _env_local("SUPABASE_SERVICE_ROLE_KEY")
        import_key = _env_local("HPR_IMPORT_KEY")
        if not (supabase_url and service_key and import_key):
            logger.warning("Fördelning: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/"
                           "HPR_IMPORT_KEY saknas i miljö/.env.local — hoppar över POST.")
            return

        import hashlib
        digest = hashlib.sha256(data).hexdigest()
        storage_path = f"incoming/{digest}.hpr"
        up = requests.post(
            f"{supabase_url}/storage/v1/object/raw-files/{storage_path}",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/xml",
                "x-upsert": "true",
            },
            data=data,
            timeout=300,
        )
        if up.status_code not in (200, 201):
            logger.warning(f"Fördelning: storage-uppladdning misslyckades för {basename}: "
                           f"{up.status_code} {up.text[:200]}")
            return
        resp = requests.post(
            FORDELNING_API_URL,
            params={"key": import_key},
            json={"storage_path": storage_path},
            timeout=120,
        )
        if resp.status_code == 200:
            status = (resp.json() or {}).get("status", "?")
            logger.info(f"Fördelning: {basename} → {status}")
            _fordelning_posted.add(cache_key)
        else:
            logger.warning(f"Fördelning: import-API svarade {resp.status_code} för "
                           f"{basename}: {resp.text[:200]}")
    except Exception as e:
        # requests-fel kan innehålla URL:en inkl ?key=... — släpp aldrig nyckeln till loggen
        import re as _re
        msg = _re.sub(r"key=[^&\s']+", "key=***", str(e))
        logger.warning(f"Fördelning: oväntat fel för {os.path.basename(filepath)} "
                       f"(ej kritiskt, arkiveringen påverkas inte): {msg}")


def is_duplicate(filepath: str) -> bool:
    """Kolla om filen redan processats nyligen."""
    now = time.time()
    basename = os.path.basename(filepath).lower()
    if basename in _processed_files:
        if now - _processed_files[basename] < DEDUP_WINDOW:
            return True
    _processed_files[basename] = now
    return False


def periodic_scan():
    """Skyddsnät: var 5:e minut, kolla Inkommande och trigga import om filer
    ligger där men inga events kommit in. OneDrive-sync triggar inte alltid
    on_created/on_modified, så detta fångar tappade events.

    Säker i.o.m. att skogsmaskin_import_version_6.py:s is_file_already_imported
    skipper redan-importerade filer."""
    while True:
        time.sleep(PERIODIC_SCAN_INTERVAL)
        try:
            mom_files = list(Path(WATCH_DIR).glob("*.mom")) + list(Path(WATCH_DIR).glob("*.MOM"))
            hpr_files = list(Path(WATCH_DIR).glob("*.hpr")) + list(Path(WATCH_DIR).glob("*.HPR"))
            other = list(Path(WATCH_DIR).glob("*.hqc")) + list(Path(WATCH_DIR).glob("*.HQC"))
            other += list(Path(WATCH_DIR).glob("*.fpr")) + list(Path(WATCH_DIR).glob("*.FPR"))
            total = len(mom_files) + len(hpr_files) + len(other)
            if total == 0:
                continue
            logger.info(
                f"Periodisk scan [skyddsnät]: {len(mom_files)} .mom, "
                f"{len(hpr_files)} .hpr, {len(other)} .hqc/.fpr i Inkommande"
            )
            for f in sorted(mom_files + hpr_files + other):
                logger.info(f"    - {f.name}")
            if mom_files or other:
                logger.info(">>> Periodisk scan: kör MOM-import")
                run_mom_import()
                notify_vercel()
            if hpr_files:
                for f in hpr_files:
                    post_hpr_fordelning(str(f))  # sväljer egna fel, se funktionen
                logger.info(">>> Periodisk scan: kör HPR-import")
                run_hpr_import()
        except Exception as e:
            logger.error(f"Periodisk scan-fel: {e}")


# ============================================================
# WATCHDOG EVENT HANDLER
# ============================================================

class IncomingFileHandler(FileSystemEventHandler):
    """Reagerar på nya filer i Inkommande-mappen.
    Lyssnar på on_created, on_modified och on_moved — OneDrive-sync triggar
    inte alltid on_created vid SMB-style synk. on_modified+on_moved är
    skyddsnät. is_duplicate() dedupar inom DEDUP_WINDOW (60s)."""

    def on_created(self, event):
        if event.is_directory:
            return
        self._handle(event.src_path, 'created')

    def on_modified(self, event):
        if event.is_directory:
            return
        self._handle(event.src_path, 'modified')

    def on_moved(self, event):
        if event.is_directory:
            return
        self._handle(event.dest_path, 'moved')

    def _handle(self, filepath: str, event_type: str):
        ext = os.path.splitext(filepath)[1].lower()
        basename = os.path.basename(filepath)

        if ext not in (".mom", ".hpr"):
            return

        if is_duplicate(filepath):
            logger.info(f"Hoppar över [{event_type}] (redan processad nyligen): {basename}")
            return

        logger.info(f"Ny fil detekterad [{event_type}]: {basename}")
        logger.info(f"Väntar {SETTLE_DELAY}s för att filen ska skrivas klart...")
        time.sleep(SETTLE_DELAY)

        if ext == ".mom":
            # MOM-importen flyttar ALLA filtyper till Behandlade — .hpr-filer
            # vars events inte hunnit fyra måste POST:as till fördelningen
            # INNAN de flyttas (lokala cachen gör om-POST billig/ofarlig).
            for hpr in list(Path(WATCH_DIR).glob("*.hpr")) + list(Path(WATCH_DIR).glob("*.HPR")):
                post_hpr_fordelning(str(hpr))
            logger.info(f">>> Kör MOM-import för: {basename}")
            run_mom_import()
            notify_vercel()
            # Kör HPR-import efteråt (MOM-import flyttar filer till Behandlade)
            logger.info(f">>> Kör HPR-import (efter MOM-flytt)")
            run_hpr_import()

        elif ext == ".hpr":
            # Fördelningsuppföljningen först, medan filen ännu ligger i
            # Inkommande (importen nedan flyttar den till Behandlade).
            # Fel härifrån stoppar aldrig importen.
            post_hpr_fordelning(filepath)
            logger.info(f">>> Kör HPR-import för: {basename}")
            run_hpr_import()


# ============================================================
# HUVUDPROGRAM
# ============================================================

def main():
    logger.info("=" * 60)
    logger.info("AUTO IMPORT WATCH — Startar")
    logger.info(f"Version: git={_git_commit_short()} "
                f"| script={os.path.abspath(__file__)} | py={PYTHON_EXE}")
    dirty = _git_dirty()
    if dirty:
        logger.warning(f"VARNING: working tree i {SCRIPT_DIR} är SMUTSIGT ({len(dirty)} filer) — "
                       f"koden som kör kan avvika från commitad version (handpatchar?): "
                       + ', '.join(dirty[:10]))
    if not _acquire_single_instance():
        logger.warning("En annan auto_import_watch-instans håller redan single-instance-låset "
                       "— avslutar (ingen dubbel-bevakning).")
        sys.exit(0)
    logger.info(f"Bevakar: {WATCH_DIR}")
    logger.info(f"MOM-script: {MOM_IMPORT_SCRIPT}")
    logger.info(f"HPR-script: {HPR_IMPORT_SCRIPT}")
    logger.info(f"Logg: {LOG_FILE}")
    logger.info(f"Python: {PYTHON_EXE}")
    logger.info("=" * 60)

    # Verifiera att allt finns
    if not os.path.isdir(WATCH_DIR):
        logger.error(f"Bevakad mapp finns inte: {WATCH_DIR}")
        logger.info("Skapar mappen...")
        os.makedirs(WATCH_DIR, exist_ok=True)

    if not os.path.isfile(MOM_IMPORT_SCRIPT):
        logger.error(f"MOM-import script saknas: {MOM_IMPORT_SCRIPT}")
        sys.exit(1)

    if not os.path.isfile(HPR_IMPORT_SCRIPT):
        logger.error(f"HPR-import script saknas: {HPR_IMPORT_SCRIPT}")
        sys.exit(1)

    # Processa befintliga filer först
    existing_mom = list(Path(WATCH_DIR).glob("*.mom")) + list(Path(WATCH_DIR).glob("*.MOM"))
    existing_hpr = list(Path(WATCH_DIR).glob("*.hpr")) + list(Path(WATCH_DIR).glob("*.HPR"))

    logger.info(f"Befintliga filer i Inkommande:")
    logger.info(f"  .mom: {len(existing_mom)} st")
    for f in sorted(existing_mom):
        logger.info(f"    - {f.name}")
    logger.info(f"  .hpr: {len(existing_hpr)} st")
    for f in sorted(existing_hpr):
        logger.info(f"    - {f.name}")

    if existing_mom:
        logger.info(f"Kör MOM-import för {len(existing_mom)} filer...")
        run_mom_import()
        notify_vercel()

    if existing_hpr:
        logger.info(f"Kör HPR-import för {len(existing_hpr)} filer...")
        run_hpr_import()

    # Starta watchdog-övervakning
    event_handler = IncomingFileHandler()
    observer = Observer()
    observer.schedule(event_handler, WATCH_DIR, recursive=False)
    observer.start()

    # Skyddsnät: periodisk scan var 5:e minut för missade events (OneDrive-sync)
    scan_thread = threading.Thread(target=periodic_scan, daemon=True, name='periodic-scan')
    scan_thread.start()
    logger.info(
        f"Periodisk scan startad (var {PERIODIC_SCAN_INTERVAL}s) "
        f"— skyddsnät för missade watchdog-events"
    )

    logger.info(f"Övervakning aktiv — väntar på nya filer...")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Avbryter övervakning...")
        observer.stop()

    observer.join()
    logger.info("Auto import watch avslutad.")


if __name__ == "__main__":
    main()
