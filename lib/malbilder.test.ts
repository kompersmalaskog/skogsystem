// Målbilderna: innehållet i lib/malbilder.ts är komplett och hänger ihop med kartans typer; ingen bild hämtar något utifrån; filen är ENDA källan till texterna.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MALBILDER, MALBILD_KALLA, MALBILD_KALLA_VARIANT, MALBILD_LINJE, MALBILD_ORDNING, MALBILD_SYMBOL, MALBILD_YTA, malbildInnehall, malbildKalla, malbildNyckel, type Malbild, type MalbildInnehall, type Regelsida,
} from './malbilder';
import { SYMBOL_GRUPP } from './larm/grupper';

const alla = Object.values(MALBILDER) as Malbild[];
/** Varje bild i filen, med namn: huvudbild, felbild, varianter, rollens egna och regelsidornas. */
function allaBilder(): { vad: string; svg: string }[] {
  const ut: { vad: string; svg: string }[] = [];
  const innehall = (vad: string, i: Partial<MalbildInnehall>) => { if (i.bild) ut.push({ vad: vad + ' bild', svg: i.bild }); if (i.fel) ut.push({ vad: vad + ' felbild', svg: i.fel.bild }); };
  for (const m of alla) {
    innehall(m.nyckel, m);
    for (const [roll, i] of Object.entries(m.roll ?? {})) innehall(`${m.nyckel}/${roll}`, i);
    for (const v of m.varianter ?? []) innehall(`${m.nyckel}/${v.nyckel}`, v.innehall);
    if (m.regler) ut.push({ vad: m.nyckel + ' regelbild', svg: m.regler.bild });
  }
  return ut;
}
const allaTexter = (): string[] => {
  const t: string[] = [];
  const innehall = (i: Partial<MalbildInnehall>) => { t.push(...(i.rader ?? [])); if (i.fel) t.push(i.fel.text); };
  const regler = (r: Regelsida) => { t.push(r.titel, r.underrubrik, r.kalla); for (const b of r.block) { t.push(b.rubrik); if (b.slag === 'grupp') for (const x of b.rader) { t.push(x.text); if (x.varde) t.push(x.varde); } if (b.slag === 'rutor') for (const x of b.rutor) t.push(x.text); if (b.slag === 'varning') t.push(b.text); } };
  for (const m of alla) { innehall(m); for (const i of Object.values(m.roll ?? {})) innehall(i); for (const v of m.varianter ?? []) innehall(v.innehall); if (m.regler) regler(m.regler); }
  return t;
};

describe('lib/malbilder — innehållet', () => {
  it('de 13 sorterna (14 med Kolbotten) finns och alla står i listan "Alla målbilder"', () => {
    expect(Object.keys(MALBILDER).sort()).toEqual(['avlagg', 'blott', 'evighetstrad', 'fornlamning', 'hansyn', 'hogstubbe', 'kantzon', 'kulturlamning', 'kulturmiljo', 'naturhorna', 'nyckelbiotop', 'stenmur', 'vattenskydd']);
    expect([...MALBILD_ORDNING].sort()).toEqual(Object.keys(MALBILDER).sort());
    expect(MALBILDER.kulturlamning.varianter!.map((v) => v.nyckel)).toEqual(['kolbotten']);
  });
  it('varje sort har en bild, 2–3 korta rader och en felbild med text', () => {
    for (const m of alla) {
      const i = malbildInnehall(m.nyckel, null)!;
      expect(i.bild, m.nyckel).toMatch(/^<svg /);
      expect(i.rader.length, m.nyckel).toBeGreaterThanOrEqual(2);
      expect(i.rader.length, m.nyckel).toBeLessThanOrEqual(3);
      for (const r of i.rader) expect(r.length, `${m.nyckel}: ${r}`).toBeLessThanOrEqual(80);
      expect(i.fel.bild, m.nyckel).toMatch(/^<svg /);
      expect(i.fel.text.length, m.nyckel).toBeGreaterThan(10);
    }
    for (const v of MALBILDER.kulturlamning.varianter!) {
      expect(v.innehall.rader).toHaveLength(3);
      expect(v.innehall.fel.text.length).toBeGreaterThan(10);
    }
  });
  it('bilderna är rena vektorer: inget hämtas utifrån, inget körs, ingen inbäddad rasterbild', () => {
    for (const { vad, svg } of allaBilder()) {
      expect(svg, vad).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
      expect(svg, vad).not.toMatch(/https?:\/\/(?!www\.w3\.org)/i);
      expect(svg, vad).not.toMatch(/<image|<script|<foreignObject|<style|xlink:href|href=|@import|url\((?!#)/i);
      expect(svg, vad).not.toMatch(/data:/i);
      expect(svg, vad).not.toMatch(/NaN|undefined/);
      expect(svg.match(/<svg/g), vad).toHaveLength(1);
    }
  });
  it('varje bild har en text för skärmläsare, och id:n i bilderna krockar aldrig (två bilder kan ligga på samma sida)', () => {
    const ids = new Map<string, string>();
    for (const { vad, svg } of allaBilder()) {
      expect(svg, vad).toMatch(/role="img" aria-label="[^"]{15,}"/);
      for (const m of svg.matchAll(/\bid="([^"]+)"/g)) {
        expect(ids.has(m[1]), `${vad}: id ${m[1]} används också av ${ids.get(m[1])}`).toBe(false);
        ids.set(m[1], vad);
      }
      // varje url(#id) pekar på ett id i SAMMA bild
      for (const u of svg.matchAll(/url\(#([^)]+)\)/g)) expect(svg, `${vad}: url(#${u[1]})`).toContain(`id="${u[1]}"`);
    }
  });
  it('skördare och skotare: bara Blött skiljer, och då i bild, rader och felbild', () => {
    const skord = malbildInnehall('blott', 'skordare')!, skot = malbildInnehall('blott', 'skotare')!;
    expect(skot.bild).not.toBe(skord.bild);
    expect(skot.rader).not.toEqual(skord.rader);
    expect(skot.fel.text).not.toBe(skord.fel.text);
    expect(skot.fel.bild).not.toBe(skord.fel.bild);
    expect(skord.rader[0]).toMatch(/risbädd/);
    expect(skot.rader[0]).toMatch(/risa direkt/);
    expect(malbildInnehall('blott', null)).toEqual(skord);   // utan maskin (planeringsvyn): skördarens
    for (const m of alla.filter((x) => x.nyckel !== 'blott')) expect(malbildInnehall(m.nyckel, 'skotare'), m.nyckel).toEqual(malbildInnehall(m.nyckel, 'skordare'));
  });
  it('Alla regler finns för Avlägg och Blött och bara för dem', () => {
    expect(alla.filter((m) => m.regler).map((m) => m.nyckel).sort()).toEqual(['avlagg', 'blott']);
    const a = MALBILDER.avlagg.regler!;
    expect(a.block.map((b) => b.rubrik)).toEqual(['Traven', 'Till vägkanten', 'Inte här', 'Kraftledning – kranen aldrig närmare', 'Efteråt']);
    const kl = a.block.find((b) => b.slag === 'rutor');
    expect(kl && kl.slag === 'rutor' ? kl.rutor.map((r) => r.varde) : null).toEqual(['2 m', '4 m', '6 m']);
    const b = MALBILDER.blott.regler!;
    expect(b.block.map((x) => x.rubrik)).toEqual(['Laga inte spår nära vatten själv', 'Risa och kör', 'Diken', 'Vatten', 'Allvarlig körskada']);
    expect(b.block[0].slag).toBe('varning');
  });
  it('Kolbotten är en variant av Kulturlämning och nås med variantens nyckel', () => {
    const k = malbildInnehall('kulturlamning', 'skordare', 'kolbotten')!;
    expect(k.rader[0]).toMatch(/Kör inte på/);
    expect(k.bild).not.toBe(malbildInnehall('kulturlamning', 'skordare')!.bild);
    expect(malbildInnehall('kulturlamning', 'skordare', 'finns-inte')).toEqual(malbildInnehall('kulturlamning', 'skordare'));
  });
  it('avläggets rader nämner ingen bestämd väg (appen vet inte vilken väg avlägget ligger vid)', () => {
    expect(MALBILDER.avlagg.rader.join(' ')).not.toMatch(/väg \d|km\/h/);
  });
});

describe('lib/malbilder — vilken typ som får vilken målbild', () => {
  it('varje sort som går att trycka på kartan når sin målbild', () => {
    const fall: [Parameters<typeof malbildNyckel>[0], string, string][] = [
      ['symbol', 'landing', 'avlagg'], ['symbol', 'culturemonument', 'kulturlamning'], ['symbol', 'culturestump', 'kulturlamning'], ['symbol', 'raa_punkt', 'kulturlamning'],
      ['symbol', 'wet', 'blott'], ['symbol', 'eternitytree', 'evighetstrad'], ['symbol', 'highstump', 'hogstubbe'], ['symbol', 'naturecorner', 'naturhorna'],
      ['yta', 'wet', 'blott'], ['yta', 'protected', 'hansyn'], ['yta', 'culture', 'kulturmiljo'], ['yta', 'fornlamning', 'fornlamning'],
      ['yta', 'vida:hansynsyta', 'hansyn'], ['yta', 'hansynsyta', 'hansyn'], ['yta', 'vida:nyckelbiotop', 'nyckelbiotop'], ['yta', 'nyckelbiotop', 'nyckelbiotop'],
      ['yta', 'vida:raa_yta', 'fornlamning'], ['yta', 'raa_yta', 'fornlamning'], ['linje', 'stonewall', 'stenmur'],
    ];
    for (const [kalla, typ, vantat] of fall) expect(malbildNyckel(kalla, typ), `${kalla} ${typ}`).toBe(vantat);
  });
  it('Fara och Info och allt annat utan målbild ger ingen: ingen sektion', () => {
    for (const typ of ['powerline', 'warning', 'huntingtower', 'groundcable', 'steep', 'gate', 'firewood', 'brashpile', 'windfall', 'road', 'turningpoint', 'ditch', 'bridge', 'corduroy', 'trail', 'manualfelling', 'felloutside', 'default', 'okand']) {
      expect(malbildNyckel('symbol', typ), typ).toBeNull();
    }
    for (const typ of ['steep', 'noentry', 'gallring', 'okand']) expect(malbildNyckel('yta', typ), typ).toBeNull();
    for (const typ of ['powerline', 'kraftledning', 'mainRoad', 'sideRoadRed', 'boundary', 'nature', 'ditch', 'trail']) expect(malbildNyckel('linje', typ), typ).toBeNull();
    expect(malbildNyckel('symbol', null)).toBeNull();
    expect(malbildNyckel('yta', undefined)).toBeNull();
  });
  it('tabellerna pekar bara på sorter som finns, och ingen Fara-symbol har en målbild', () => {
    for (const n of [...Object.values(MALBILD_SYMBOL), ...Object.values(MALBILD_YTA), ...Object.values(MALBILD_LINJE)]) expect(MALBILDER[n], n).toBeTruthy();
    for (const typ of Object.keys(MALBILD_SYMBOL)) expect(SYMBOL_GRUPP[typ] === 'fara', `Fara-symbolen ${typ} ska inte ha målbild`).toBe(false);
  });
});

describe('lib/malbilder — enda källan', () => {
  const rot = path.resolve(__dirname, '..');
  const filer: string[] = [];
  const gå = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', '.git', 'tmp-skarm', 'supabase', 'docs', 'public', 'scripts'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) gå(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && p !== path.join(rot, 'lib', 'malbilder.ts')) filer.push(p);
    }
  };
  gå(path.join(rot, 'lib')); gå(path.join(rot, 'components')); gå(path.join(rot, 'app'));

  it('ingen annan källfil innehåller en rad, en felbildstext eller en regel ur målbilderna', () => {
    const texter = allaTexter().filter((t) => t.length >= 18);
    expect(texter.length).toBeGreaterThan(40);
    for (const f of filer) {
      const s = fs.readFileSync(f, 'utf8');
      for (const t of texter) expect(s.includes(t), `${path.relative(rot, f)} har en egen kopia av "${t}" — texten ska bara stå i lib/malbilder.ts`).toBe(false);
    }
  });
  it('ingen annan källfil har en egen SVG med målbildens format (720 × 560 eller 376 × 170)', () => {
    for (const f of filer) {
      const s = fs.readFileSync(f, 'utf8');
      expect(/viewBox="0 0 (720 560|376 170)"/.test(s), path.relative(rot, f)).toBe(false);
    }
  });
});

describe('lib/malbilder — källa per sort (bara en länk, ingen kopierad bild)', () => {
  const SKS = 'https://www.skogsstyrelsen.se/';
  const SAMLING = 'https://www.skogsstyrelsen.se/aga-skog/hansyn-till-miljo-och-skyddade-arter/malbilder-for-god-miljohansyn/';
  const KULTUR = 'https://www.skogsstyrelsen.se/globalassets/mer-om-skog/malbilder-for-god-miljohansyn/malbilder-kulturmiljoer/handledning-for-god-kulturmiljohansyn.pdf';
  it('varje sort utom Vattenskyddsområde har en källa, och inget annat än en målbild har en', () => {
    for (const k of Object.keys(MALBILD_KALLA)) expect(MALBILDER[k], `${k} saknas som målbild`).toBeDefined();
    expect(Object.keys(MALBILDER).filter((k) => !MALBILD_KALLA[k])).toEqual(['vattenskydd']);
    expect(malbildKalla('vattenskydd')).toBeNull();
    expect(malbildKalla('finns-inte')).toBeNull();
    expect(malbildKalla(null)).toBeNull();
  });
  it('källorna per sort är de som Martin bestämt (utgivare, ämne, adress)', () => {
    const rad = (n: string) => { const k = malbildKalla(n)!; return [k.utgivare, k.amne, k.url]; };
    for (const n of ['kulturlamning', 'kulturmiljo', 'fornlamning']) expect(rad(n), n).toEqual(['Skogsstyrelsen', 'Kulturmiljöer', KULTUR]);
    expect(rad('stenmur')).toEqual(['Skogsstyrelsen', 'Odlingsspår', SKS + 'globalassets/mer-om-skog/malbilder-for-god-miljohansyn/malbilder-kulturmiljoer/kulturmiljoer---malbild-odlingsspar.pdf']);
    expect(rad('avlagg')).toEqual(['Trafikverket', 'Upplag av virke vid väg', 'https://www.trafikverket.se/upplag-virke']);
    // ämnen utan egen adress pekar på samlingssidan — aldrig en gissad adress
    for (const n of ['evighetstrad', 'hogstubbe', 'naturhorna']) expect(rad(n), n).toEqual(['Skogsstyrelsen', 'Träd och buskar med naturvärden samt död ved', SAMLING]);
    for (const n of ['nyckelbiotop', 'hansyn']) expect(rad(n), n).toEqual(['Skogsstyrelsen', 'Hänsynskrävande biotoper', SAMLING]);
    expect(rad('blott')).toEqual(['Skogsstyrelsen', 'Körning i skogsmark', SAMLING]);
    expect(rad('kantzon')[1]).toBe('Kantzoner mot sjöar och vattendrag');
    expect(rad('kantzon')[2]).toMatch(/^https:\/\/www\.skogsstyrelsen\.se\/globalassets\/mer-om-skog\/malbilder-for-god-miljohansyn\/malbilder-kantzoner-mot-sjoar-och-vattendrag\/.+\.pdf$/);
  });
  it('bara https, bara utgivarens egna värdar, ingen tom text och inga mellanslag eller sökparametrar i adressen', () => {
    for (const [n, k] of Object.entries(MALBILD_KALLA)) {
      const u = new URL(k.url);
      expect(u.protocol, n).toBe('https:');
      expect(['www.skogsstyrelsen.se', 'www.trafikverket.se'], n).toContain(u.hostname);
      expect(k.url, n).not.toMatch(/\s|\?|#/);
      expect(k.utgivare.length, n).toBeGreaterThan(0);
      expect(k.amne.length, n).toBeGreaterThan(0);
      expect(u.hostname === 'www.trafikverket.se' ? 'Trafikverket' : 'Skogsstyrelsen', n).toBe(k.utgivare);
    }
  });
  it('Kolbotten är en variant av Kulturlämning med EGEN källa (kolningsanläggningar); standardutseendet och okända varianter behåller sortens', () => {
    const KOL = SKS + 'globalassets/mer-om-skog/malbilder-for-god-miljohansyn/malbilder-kulturmiljoer/kulturmiljoer---malbild-kolningsanlaggningar.pdf';
    expect(MALBILD_KALLA.kolbotten).toBeUndefined();                        // ingen egen sort i tabellen — den är en variant
    expect(Object.keys(MALBILD_KALLA_VARIANT)).toEqual(['kulturlamning.kolbotten']);
    const k = malbildKalla('kulturlamning', 'kolbotten')!;
    expect([k.utgivare, k.amne, k.url]).toEqual(['Skogsstyrelsen', 'Kolningsanläggningar', KOL]);
    expect(malbildKalla('kulturlamning', null)!.url).toBe(KULTUR);
    expect(malbildKalla('kulturlamning')!.url).toBe(KULTUR);
    expect(malbildKalla('kulturlamning', 'finns-inte')!.url).toBe(KULTUR);
    expect(malbildKalla('stenmur', 'kolbotten')!.url).toBe(malbildKalla('stenmur')!.url);   // varianten gäller bara sin egen sort
    expect(malbildKalla('kulturmiljo', 'kolbotten')!.url).toBe(KULTUR);
    for (const [n, v] of Object.entries(MALBILD_KALLA_VARIANT)) {
      const [sort, variant] = n.split('.');
      expect(MALBILDER[sort].varianter!.map((x) => x.nyckel), n).toContain(variant);
      expect(new URL(v.url).protocol).toBe('https:');
    }
  });
});
