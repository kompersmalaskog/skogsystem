"""Ändringsvakten sedd från Python (migration 20261122180000_fart_andringsvakt.sql).

Efterberäkningarna (berakna_rotkap.py m.fl.) räknade förut om ALLT vid varje körning för att se om något ändrats — 4 s
databastid per anrop, hundratals anrop per dygn. Databasen noterar nu vid skrivningen vilka objekt som fått nya,
borttagna eller flyttade stockar/stammar/serier (detalj_smutsig) och vilken version som senast räknades klart per
konsument (berakna_version). Här: läs det, och räkna bara det som ändrats.

Fail-soft, som resten av importen: saknas tabellerna (migrationen ej körd) eller svarar databasen inte, ger `plan` läget
'full' — det gamla beteendet, allt räknas. Aldrig tyst "inget att göra" på ett läsfel.

    plan = vakt.plan('rotkap', tvinga=alla or bara)
    plan['lage']      'full' | 'objekt' | 'inget'
    plan['ids']       set med smutsiga objekt_id (bara när lage == 'objekt')
    plan['version']   versionen att notera NÄR allt är räknat (None = ingen vakt, notera inget)
    vakt.notera('rotkap', plan['version'])
"""
import requests

CHUNK = 40          # objekt-id per in.()-filter (URL-längd)


class Vakt:
    def __init__(self, url, headers, http=requests, timeout=60):
        self.url, self.http, self.timeout = url, http, timeout
        self.h = {k: v for k, v in headers.items() if k != 'Prefer'}

    def _get(self, vag):
        r = self.http.get('%s/rest/v1/%s' % (self.url, vag), headers=self.h, timeout=self.timeout)
        if r.status_code != 200:
            raise RuntimeError('%s svarade %s' % (vag, r.status_code))
        return r.json()

    def version(self):
        """Nuvarande detalj_version, eller None om vakten inte finns/inte går att läsa."""
        try:
            rader = self._get('detalj_version?select=v')
            return int(rader[0]['v']) if rader else None
        except Exception:
            return None

    def sedd(self, namn):
        try:
            rader = self._get('berakna_version?select=v&namn=eq.%s' % namn)
            return int(rader[0]['v']) if rader else None
        except Exception:
            return None

    def smutsiga(self, sedd):
        """Objekt som ändrats efter version `sedd` (None vid läsfel — anroparen räknar då allt)."""
        try:
            ut, start = set(), 0
            while True:
                rader = self._get('detalj_smutsig?select=objekt_id&v=gt.%d&order=objekt_id.asc&limit=1000&offset=%d' % (sedd, start))
                ut.update(r['objekt_id'] for r in rader)
                if len(rader) < 1000:
                    return ut
                start += 1000
        except Exception:
            return None

    def plan(self, namn, tvinga=False):
        nu = self.version()
        if nu is None:
            return {'lage': 'full', 'ids': None, 'version': None}
        if tvinga:
            return {'lage': 'full', 'ids': None, 'version': nu}
        sedd = self.sedd(namn)
        if sedd is None:
            return {'lage': 'full', 'ids': None, 'version': nu}
        ids = self.smutsiga(sedd)
        if ids is None:
            return {'lage': 'full', 'ids': None, 'version': nu}
        if nu == sedd and not ids:
            return {'lage': 'inget', 'ids': set(), 'version': nu}
        return {'lage': 'objekt', 'ids': ids, 'version': nu}

    def notera(self, namn, version):
        """Anteckna att allt är räknat t.o.m. `version`. Ett fel här är ofarligt: nästa körning räknar bara om i onödan."""
        if version is None:
            return False
        try:
            r = self.http.post('%s/rest/v1/berakna_version?on_conflict=namn' % self.url,
                               headers=dict(self.h, **{'Prefer': 'resolution=merge-duplicates,return=minimal'}),
                               json={'namn': namn, 'v': version}, timeout=self.timeout)
            return r.status_code in (200, 201, 204)
        except Exception:
            return False


def in_filter(ids):
    """['a','b'] → 'objekt_id=in.("a","b")' — en bit i taget (se CHUNK)."""
    ids = sorted(ids)
    return ['objekt_id=in.(%s)' % ','.join('"%s"' % i for i in ids[i:i + CHUNK]) for i in range(0, len(ids), CHUNK)]


def finns_flera(url, headers, filnamn, finns_en, http=requests, timeout=120):
    """Vilka av `filnamn` har serier i detalj_stam_diameter? EN fråga (RPC diameter_filer) i stället för en per fil.

    Går RPC:n inte att nå (migrationen ej körd, nät) används `finns_en(filnamn)` per fil — som förut, långsamt men rätt."""
    filnamn = list(filnamn)
    if not filnamn:
        return set()
    h = {k: v for k, v in headers.items() if k != 'Prefer'}
    try:
        r = http.post('%s/rest/v1/rpc/diameter_filer' % url, headers=h, json={'p_filnamn': filnamn}, timeout=timeout)
        if r.status_code == 200:
            return set(r.json())
    except Exception:
        pass
    return {f for f in filnamn if finns_en(f)}
