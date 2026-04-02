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

SETTLE_DELAY = 5  # sekunder att vänta innan import (fil kanske inte skrivits klart)

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
            timeout=600,
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


def is_duplicate(filepath: str) -> bool:
    """Kolla om filen redan processats nyligen."""
    now = time.time()
    basename = os.path.basename(filepath).lower()
    if basename in _processed_files:
        if now - _processed_files[basename] < DEDUP_WINDOW:
            return True
    _processed_files[basename] = now
    return False


# ============================================================
# WATCHDOG EVENT HANDLER
# ============================================================

class IncomingFileHandler(FileSystemEventHandler):
    """Reagerar på nya filer i Inkommande-mappen."""

    def on_created(self, event):
        if event.is_directory:
            return
        self._handle(event.src_path)

    def on_moved(self, event):
        if event.is_directory:
            return
        self._handle(event.dest_path)

    def _handle(self, filepath: str):
        ext = os.path.splitext(filepath)[1].lower()
        basename = os.path.basename(filepath)

        if ext not in (".mom", ".hpr"):
            return

        if is_duplicate(filepath):
            logger.info(f"Hoppar över (redan processad nyligen): {basename}")
            return

        logger.info(f"Ny fil detekterad: {basename}")
        logger.info(f"Väntar {SETTLE_DELAY}s för att filen ska skrivas klart...")
        time.sleep(SETTLE_DELAY)

        if ext == ".mom":
            logger.info(f">>> Kör MOM-import för: {basename}")
            run_mom_import()
            notify_vercel()
            # Kör HPR-import efteråt (MOM-import flyttar filer till Behandlade)
            logger.info(f">>> Kör HPR-import (efter MOM-flytt)")
            run_hpr_import()

        elif ext == ".hpr":
            logger.info(f">>> Kör HPR-import för: {basename}")
            run_hpr_import()


# ============================================================
# HUVUDPROGRAM
# ============================================================

def main():
    logger.info("=" * 60)
    logger.info("AUTO IMPORT WATCH — Startar")
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
