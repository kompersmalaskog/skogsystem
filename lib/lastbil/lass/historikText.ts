// Rapporten från engångskörningen (historik.ts) som text: en markdown-tabell (GitHub Actions "Summary") och en kort logg.
// Ren modul, så formen kan testas utan nät. Samma kolumner som torrkörningen i SQL: datum, lassa/lossa, plats, vikt, maskin, flytt.

import { sthlmDatum, sthlmKlocka, type HistorikRad, type HistorikRapport } from './historik';

const komma = (x: number): string => String(Math.round(x * 10) / 10).replace('.', ',');
const SAKERHET: Record<string, string> = { hog: 'hög', medel: 'medel', lag: 'låg', okand: 'okänd' };

function plats(namn: string | null, m: number | null): string {
  return namn ? `${namn}${m != null ? ` (${m} m)` : ''}` : '—';
}

function resultatText(r: HistorikRad): string {
  switch (r.utfall) {
    case 'fraga': {
      const sam = r.samtidigaText.join('; ');
      return `FRÅGA${r.orsak ? ` (${r.orsak})` : ''}${sam ? ` · ${sam}` : ''}`;
    }
    case 'matchad': {
      const f = r.flytt;
      const fyller = f?.fyller.length ? `fyller: ${f.fyller.join(', ')}` : 'inget att fylla';
      return `KOPPLA till flytt ${f?.maskin ?? '?'} ${f ? f.id.slice(0, 8) : ''} · ${fyller}${f?.franUtelamnad ? ` · Från lämnas tom (osäker plats: ${f.franUtelamnad})` : ''}`;
    }
    case 'avvisad': return `hoppar över: ${r.orsak}`;
    case 'ej_klar': return `hoppar över: ${r.orsak}`;
    case 'finns_lass': return `hoppar över: ${r.orsak}`;
  }
}

export function historikTabell(rap: HistorikRapport): string {
  const a = rap.antal;
  const rubrik = [
    `### Historiska lass — ${rap.skriv ? 'SKRIV' : 'torrkörning'}`,
    `Intervall: ${rap.fran} till ${rap.till} (exklusiv) · ${rap.rader.length} lass funna`,
    `Frågor: **${a.fraga}** · kopplas till förarens flytt: **${a.matchad}** (fyllde fält på ${rap.fyllda} flyttar) · avvisade: ${a.avvisad} · ej klara: ${a.ej_klar} · fanns redan: ${a.finns_lass}`,
    rap.skriv ? '' : '_Inget skrevs. Kör igen med läget "skriv" när tabellen ser rätt ut._',
    rap.fel.length ? `\n**FEL:**\n${rap.fel.map(f => `- ${f}`).join('\n')}` : '',
    '',
    '| nr | datum | lassa → lossa | från → till | km | last | maskin | resultat |',
    '|---|---|---|---|---|---|---|---|',
  ].filter(x => x !== '').join('\n');
  const rader = rap.rader.map(r => {
    const km = r.km == null ? '—' : `${r.kmOsaker ? 'cirka ' : ''}${komma(r.km)}`;
    const maskin = r.forslagNamn ? `${r.forslagNamn} (${SAKERHET[r.sakerhet]})` : '—';
    return `| ${r.nr} | ${sthlmDatum(r.forstaLastad)} | ${sthlmKlocka(r.forstaLastad)} → ${sthlmKlocka(r.lossning)} | ${plats(r.fran, r.franM)} → ${plats(r.till, r.tillM)} | ${km} | ${komma(r.lastviktKg / 1000)} t | ${maskin} | ${resultatText(r)} |`;
  });
  return `${rubrik}\n${rader.join('\n')}\n`;
}
