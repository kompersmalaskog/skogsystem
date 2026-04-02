# Regler för skogsystem

## Databas - KRITISKA REGLER

### fakt_produktion och fakt_tid får ALDRIG joinas direkt
fakt_produktion har många rader per dag (en per trädslag/sortiment/operator).
fakt_tid har en eller få rader per dag (en per operator).
En direkt JOIN multiplicerar tidsdatan och ger helt fel siffror.

ALLTID göra så här:
1. Hämta fakt_produktion separat - summera per datum eller operator_id
2. Hämta fakt_tid separat - summera per datum eller operator_id  
3. Merga i JavaScript med Map<datum, data>

### Tabellstruktur
- dim_maskin: maskin_id (text), tillverkare, modell, maskin_typ
- fakt_produktion: datum, maskin_id, operator_id, objekt_id, tradslag_id, stammar, volym_m3sub, volym_m3sob
- fakt_tid: datum, maskin_id, operator_id, processing_sek, terrain_sek, other_work_sek, disturbance_sek, maintenance_sek, avbrott_sek, tomgang_sek, kort_stopp_sek, rast_sek, engine_time_sek, bransle_liter
- dim_operator: operator_id, operator_namn, maskin_id
- dim_objekt: objekt_id, object_name, vo_nummer

### Maskiner med data
- PONS20SDJAA270231 = Ponsse Scorpion Giant 8W (Harvester, slutavverkning)
- R64101 = Rottne H8E (Harvester, gallring)
- A030353 = Ponsse Wisent 2015 (Forwarder)
- A110148 = Ponsse Elephant King AF (Forwarder)

### Medelstamsklasser
- Gallringsskördare (R64101): 0.00-0.03, 0.03-0.05, 0.05-0.07, 0.07-0.09, 0.09-0.12, 0.12+
- Slutavverkning (PONS20SDJAA270231): 0.0-0.1, 0.1-0.2, 0.2-0.3, 0.3-0.4, 0.4-0.5, 0.5-0.7, 0.7+

### Beräkningar
- G15h = (processing_sek + terrain_sek) / 3600
- m³/G15h = SUM(volym_m3sub) / SUM(g15_h) — viktat snitt, aldrig snitt av snitt
- L/m³ = SUM(bransle_liter) / SUM(volym_m3sub) — viktat snitt
- Medelstam per objekt = SUM(volym_m3sub) / SUM(stammar)

## Import
- Huvudskript: skogsmaskin_import_version_6.py
- Filer: MOM, HPR, HQC, FPR — aldrig PRL
- OneDrive-mapp: Maskindata - Dokument/MOM-filer/Inkommande

## Repo
- GitHub: kompersmalaskog/skogsystem
- Vercel bygger automatiskt vid push till main
- Rätt repo: C:\Kompersmåla Skog\Kompersmåla Skog\Appen\skogsystem-claude
