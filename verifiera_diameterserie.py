"""Grinden efter importen: täckte de valda filerna ALLA stammar per objekt?

Testar filurvalet, inte skrivningen. Urvalsregeln — läs filen med FLEST
stammar per (objekt, maskin), utom vid 4 000-taket då alla filer läses — är
det enda stället där stammar kan försvinna tyst.

Jämför, per (objekt_id, maskin_id):

    unionen av StemKey över ALLA parets filer
  mot
    unionen av StemKey över de filer importen valde

Noll differens, annars stopp.

Nycklarna attribueras till rätt objekt via StemKey/ObjectKey-paret, inte via
filen som helhet — en fil kan bära flera objekt, och då hade en filnivå-union
blåst upp jämförelsen och dolt ett verkligt tapp.

Föregående version föll på två fel som den här jämförelsen fångade:
  två maskiner på samma trakt  -> 9 050 stammar utanför urvalet
  urval på bytes i stället för antal -> 452 till
"""
import os, sys, glob, time, json, io, collections, importlib.util

HAR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HAR)
_spec = importlib.util.spec_from_file_location(
    'diamimp', os.path.join(HAR, 'import_diameterserie.py'))
D = importlib.util.module_from_spec(_spec)
try:
    _spec.loader.exec_module(D)
except SystemExit:
    pass


def nycklar_per_objekt(f):
    """StemKey grupperade på ObjectKey."""
    par = collections.defaultdict(set)
    rest = b''
    with open(f, 'rb') as fh:
        while True:
            b = fh.read(1 << 22)
            if not b:
                break
            d = rest + b
            for m in D.RE_PAR.finditer(d):
                par[m.group(2).decode('utf-8', 'replace')].add(m.group(1))
            rest = d[-256:]
    return par


def main():
    alla = glob.glob(os.path.join(D.BAS, '*', 'HPR', '*.hpr'))
    CACHE = os.path.join(HAR, '.diameter_huvud.json')
    ANTAL = os.path.join(HAR, '.diameter_antal.json')
    cache = json.load(io.open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    antal = json.load(io.open(ANTAL, encoding='utf-8')) if os.path.exists(ANTAL) else {}

    per_par = collections.defaultdict(list)
    kartor = {}
    for f in alla:
        if f in cache:
            maskin, karta = cache[f]
        else:
            maskin, karta, fel = D.huvud(f)
            if fel or not karta:
                continue
        kartor[f] = karta
        for objekt_id in set(karta.values()):
            if objekt_id:
                per_par[(objekt_id, maskin)].append(f)
    print('objekt x maskin: %d   filer: %d' % (len(per_par), len(alla)))

    t0 = time.time()
    brott = []
    rader = []
    for n, ((objekt_id, maskin_id), fs) in enumerate(sorted(per_par.items()), 1):
        karta_for = lambda f: kartor.get(f, {})

        def antal_for(f):
            k = karta_for(f)
            return sum(c for ok, c in antal.get(f, {}).items() if k.get(ok) == objekt_id)

        # SPEGLAR importens regel exakt. Härleds den om, mäter grinden något
        # annat än det som faktiskt kördes.
        storst = max(fs, key=antal_for)
        valda = set(fs) if antal_for(storst) == D.TAK else {storst}

        union = set()
        sedda = set()
        for f in fs:
            k = karta_for(f)
            per_ok = nycklar_per_objekt(f)
            mina = set()
            for ok, keys in per_ok.items():
                if k.get(ok) == objekt_id:
                    mina |= keys
            union |= mina
            if f in valda:
                sedda |= mina
        saknas = union - sedda
        rader.append({'objekt_id': objekt_id, 'maskin_id': maskin_id, 'filer': len(fs),
                      'valda': len(valda), 'union': len(union), 'sedda': len(sedda),
                      'saknas': len(saknas)})
        if saknas:
            brott.append(rader[-1])
            print('  BROTT %s / %s  union %6d  sedda %6d  saknas %5d'
                  % (objekt_id, maskin_id, len(union), len(sedda), len(saknas)))
        if n % 20 == 0:
            print('  ...%d/%d (%.0f s)' % (n, len(per_par), time.time() - t0))

    io.open('diameter_verifiering.json', 'w', encoding='utf-8').write(
        json.dumps(rader, ensure_ascii=False, indent=1))
    print('\ntid %.0f s' % (time.time() - t0))
    print('par: %d   hela: %d   BROTT: %d' % (len(rader), len(rader) - len(brott), len(brott)))
    print('stammar i unionen: %d   sedda av importen: %d   differens: %d'
          % (sum(r['union'] for r in rader), sum(r['sedda'] for r in rader),
             sum(r['union'] - r['sedda'] for r in rader)))
    if brott:
        print('\nSTOPP: filurvalet täcker inte alla stammar.')
        return 1
    print('\nGRINDEN PASSERAD: noll differens.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
