// Symbolerna har EN källa (lib/symboler + lib/larm/grupper): former, glyfer, färger, namn och förklaringar. Kartan, menyn, dockan, korten, briefingen,
// egenkontrollens karta, A4-rapporten och teckenförklaringen läser därifrån. Testerna här vaktar att ingen kopia smyger sig in.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GRUPPER, SYMBOL_GRUPP, SYMBOL_NAMN } from './larm/grupper';
import { FORM_PATH, GLYF, MENY_KATEGORIER, SYMBOL_ALIAS, SYMBOL_FORKLARING, SYMBOL_TYPER, UR_MENYN, symbolDef, symbolDefTyp, symbolSvg } from './symboler';
import { markerIconDefs } from './marker-icons';
import { markeringsStil } from './egenkontrollRapportKarta';
import { TALL_FARG, GROT_FARG, TRADSLAG_STIL } from './tradslag';

const MENY = MENY_KATEGORIER.flatMap((k) => k.symboler);

function kalleFiler(rot: string, ut: string[] = []): string[] {
  for (const f of readdirSync(rot)) {
    if (f === 'node_modules' || f === '.next' || f.startsWith('.')) continue;
    const p = join(rot, f);
    if (statSync(p).isDirectory()) kalleFiler(p, ut);
    else if (/\.(ts|tsx)$/.test(f) && !/\.(test|vakter\.test|render\.test)\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')) ut.push(p);
  }
  return ut;
}

describe('formen säger allvar', () => {
  it('Röd (Fara) = rundad triangel, Lila (Att göra) = rundad ruta, övriga grupper = cirkel', () => {
    expect(GRUPPER.fara.form).toBe('triangel');
    expect(GRUPPER.att_gora.form).toBe('ruta');
    for (const g of ['natur', 'kultur', 'blott', 'info'] as const) expect(GRUPPER[g].form, g).toBe('cirkel');
  });
  it('symbolens form kommer ur gruppen — varje symbol, utan undantag', () => {
    for (const typ of SYMBOL_TYPER) expect(symbolDef(typ).form, typ).toBe(GRUPPER[SYMBOL_GRUPP[typ] ?? 'info'].form);
  });
  it('Jakttorn och Markkabel är Röda (triangel), Grind är Info (cirkel)', () => {
    expect([symbolDef('huntingtower').grupp, symbolDef('huntingtower').form]).toEqual(['fara', 'triangel']);
    expect([symbolDef('groundcable').grupp, symbolDef('groundcable').form]).toEqual(['fara', 'triangel']);
    expect([symbolDef('gate').grupp, symbolDef('gate').form]).toEqual(['info', 'cirkel']);
  });
});

describe('en egen tydlig glyf per symbol', () => {
  it('Avlägg, Ved och Rishög är tre olika bilder (och ingen symbol delar glyf med en annan)', () => {
    expect(new Set([GLYF.landing, GLYF.firewood, GLYF.brashpile]).size).toBe(3);
    const glyfer = SYMBOL_TYPER.map((t) => GLYF[t]);
    expect(new Set(glyfer).size).toBe(glyfer.length);
  });
  it('varje symbol har grupp, namn, förklaring och glyf — inget faller tillbaka på reservbilden', () => {
    for (const typ of SYMBOL_TYPER) {
      const d = symbolDef(typ);
      expect(d.id, typ).toBe(typ);
      expect(SYMBOL_GRUPP[typ], typ).toBeTruthy();
      expect(SYMBOL_NAMN[typ], typ).toBeTruthy();
      expect(SYMBOL_FORKLARING[typ], typ).toBeTruthy();
      expect(d.glyf, typ).not.toBe(GLYF.default);
    }
  });
  it('bilden på kartan (marker-icons) är samma SVG som symbolSvg ger — ingen egen ritning', () => {
    for (const typ of SYMBOL_TYPER) {
      const def = markerIconDefs.find((d) => d.id === typ);
      expect(def, typ).toBeTruthy();
      expect(def!.form).toBe(symbolDef(typ).form);
      expect(def!.bg).toBe(symbolDef(typ).farg);
    }
    expect(symbolSvg('warning', 48)).toContain(FORM_PATH.triangel);
  });
});

describe('symboler ut ur menyn ritas fortfarande', () => {
  it('Kulturstubbe, Dike, Stig och Brant finns inte i menyn men har namn, färg och glyf', () => {
    for (const t of UR_MENYN) {
      expect(MENY, t).not.toContain(t);
      expect(markerIconDefs.some((d) => d.id === t), t).toBe(true);
      expect(symbolDef(t).namn, t).toBeTruthy();
    }
  });
  it('Kulturstubbe slås ihop med Kulturminne som heter Kulturlämning: gamla stubbar ritas och namnges som Kulturlämning', () => {
    expect(SYMBOL_ALIAS.culturestump).toBe('culturemonument');
    expect(symbolDefTyp('culturestump')).toBe('culturemonument');
    expect(SYMBOL_NAMN.culturemonument).toBe('Kulturlämning');
    expect(SYMBOL_NAMN.culturestump).toBe('Kulturlämning');
    expect(symbolDef('culturestump')).toMatchObject({ namn: 'Kulturlämning', glyf: GLYF.culturemonument, farg: GRUPPER.kultur.farg });
    expect(MENY).toContain('culturemonument');
  });
  it('de nya symbolerna finns i menyn: Jakttorn, Markkabel, Grind', () => {
    for (const t of ['huntingtower', 'groundcable', 'gate']) expect(MENY, t).toContain(t);
  });
  it('en okänd typ ritas som en vanlig markering, aldrig som en gissad symbol', () => {
    expect(symbolDefTyp('hittepa')).toBe('default');
    expect(symbolDef('hittepa').namn).toBe('Markering');
  });
});

describe('A4-rapporten följer samma symbolkälla', () => {
  it('namn och färg ur symbolDef; en gammal Kulturstubbe delar nyckel och namn med Kulturlämning', () => {
    const a = markeringsStil('symbol', 'culturestump')!;
    const b = markeringsStil('symbol', 'culturemonument')!;
    expect(a.nyckel).toBe(b.nyckel);
    expect(a.etikett).toBe('Kulturlämning');
    for (const typ of SYMBOL_TYPER) {
      const st = markeringsStil('symbol', typ)!;
      expect([st.etikett, st.farg], typ).toEqual([symbolDef(typ).namn, symbolDef(typ).farg]);
    }
  });
  it('okänd symbol är "Övrig symbol", ritad och namngiven', () => {
    expect(markeringsStil('symbol', 'hittepa')!.etikett).toBe('Övrig symbol');
  });
  it('ytor: de man inte får köra in i är snedstreckade, övriga heldragna', () => {
    for (const z of ['protected', 'fornlamning', 'noentry']) expect(markeringsStil('zon', z)!.snedstreck, z).toBe(true);
    for (const z of ['wet', 'steep', 'culture']) expect(markeringsStil('zon', z)!.snedstreck, z).toBeFalsy();
  });
});

describe('inga kopior av glyfer, former och färger', () => {
  const ALLA = [...kalleFiler('app'), ...kalleFiler('lib'), ...kalleFiler('components')];
  const lasa = (p: string) => readFileSync(p, 'utf8');

  it('en glyf-bana (t.ex. ledningens blixt) eller en form-bana står bara i lib/symboler.ts', () => {
    const sokta = [GLYF.powerline, GLYF.huntingtower, GLYF.groundcable, FORM_PATH.triangel, FORM_PATH.ruta];
    for (const f of ALLA) {
      if (f.endsWith('lib/symboler.ts')) continue;
      const t = lasa(f);
      for (const s of sokta) expect(t.includes(s), `${f} kopierar ${s}`).toBe(false);
    }
  });
  it('de gamla kopiorna är borta: briefingens ICON_SVG/ICON_BG och markeringsikonernas egna SVG-banor', () => {
    const briefing = lasa('app/planering/TraktBriefing.tsx');
    expect(briefing).not.toMatch(/ICON_SVG|ICON_BG\b/);
    expect(lasa('lib/marker-icons.ts')).not.toMatch(/<path d="M/);
  });
  it('symbol- och ytkoden skriver ingen grupp-hex själv (färgen kommer ur lib/larm/grupper)', () => {
    const hexar = Object.values(GRUPPER).map((g) => g.farg.toLowerCase());
    for (const f of ['lib/symboler.ts', 'components/SymbolIkon.tsx', 'lib/marker-icons.ts', 'lib/ytaStil.ts', 'lib/teckenforklaring.ts', 'lib/egenkontrollRapportKartaPdf.ts', 'components/planering/VadBetyderKartan.tsx']) {
      const t = lasa(f).toLowerCase();
      for (const h of hexar) expect(t.includes(h), `${f} har ${h}`).toBe(false);
    }
  });
  it('Tall har EN orange (#FF9F0A, lib/tradslag) — ingen annan tall-orange i kartan, diagrammen eller markägarrapporten', () => {
    expect(TALL_FARG).toBe('#FF9F0A');
    expect(TRADSLAG_STIL.Tall.fyll).toBe(TALL_FARG);
    for (const f of ALLA) {
      const t = lasa(f);
      expect(t, f).not.toMatch(/#e8832a|#FFA726/i);
    }
  });
  it('Tall-pricken i markägarrapportens karta är TALL_FARG (inte #ff9500)', () => {
    expect(lasa('components/markagarrapport/SkogenKarta.tsx')).not.toContain('#ff9500\'');
    expect(lasa('components/markagarrapport/SkogenKarta.tsx')).toContain('COLOR_TALL    = TALL_FARG');
  });
  it('GROT har EN färg, den bruna (#8B5E3C): ingen grot-cirkel eller grot-lista i amber', () => {
    expect(GROT_FARG).toBe('#8B5E3C');
    const t = lasa('app/planering/page.tsx');
    expect(t.match(/#8B5E3C/gi) ?? []).toHaveLength(0);
    const grot = t.slice(t.indexOf("id: 'grot-circle'"), t.indexOf("id: 'grot-label'"));
    expect(grot).toContain('GROT_FARG');
    expect(grot).not.toContain('#f59e0b');
  });
});
