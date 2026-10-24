// Källvakter för besöksflödet: det som INTE får hända syns inte i ett beteendetest, så det läses ur källan.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { HYTT_POLL_MS } from './konstanter';

const rot = path.resolve(__dirname, '../..');
const las = (rel: string) => fs.readFileSync(path.join(rot, rel), 'utf8');
const server = las('lib/besok/server.ts');
const middleware = las('middleware.ts');
const migration = las('supabase/migrations/20261022170000_besok_pa_trakten.sql');
const klient = las('components/besok/BesokKlient.tsx');
const page = las('app/planering/page.tsx');

/** Alla kolumnlistor i .select('…') i en källfil. */
const selectLista = (src: string) => Array.from(src.matchAll(/\.select\('([^']*)'/g)).map((m) => m[1]);

describe('besökssidan läser exakt de fält den visar', () => {
  const TILLATET = new Set([
    'objekt_id, aktiv',                                                                     // länken
    'id, namn, vo_nummer, status, bolag, lat, lng, kartbild_bounds, volym, dim_objekt_id',  // objektet (volym används bara för procenten, skickas aldrig ut)
    'typ, data',                                                                            // motorsåg
    'roll, datum, points, uppdaterad_at',                                                   // maskinernas SENASTE punkt
    'id, besokstid',                                                                        // markägarens egen anmälan
    'roll, kvitterad_at',                                                                   // vilka maskiner som sett den
    'id',                                                                                   // räkning av anmälningar i timmen
  ]);
  it('varje select i servern är en av de tillåtna kolumnlistorna', () => {
    for (const lista of selectLista(server)) expect(TILLATET.has(lista), `otillåten select: ${lista}`).toBe(true);
  });
  it('markägarens uppgifter, förare och telefonnummer läses aldrig av den öppna sidan', () => {
    for (const ord of ['markagare', 'forare_id', 'telefon, ', 'tel,', 'info_anteckningar', 'forardirektiv', 'anteckningar']) expect(selectLista(server).join('|'), ord).not.toContain(ord);
  });
  it('svaret byggs av en fast lista fält (ingen spridning av en hel rad)', () => {
    const svar = server.slice(server.indexOf('export async function publikVy'), server.indexOf('// ---- POST'));
    expect(svar).not.toMatch(/\.\.\.o\b|\.\.\.objekt|\.\.\.tung|\.\.\.u\.objekt/);
    expect(svar).toContain('body: {');
  });
  it('servern använder service-klienten och rutterna läser ingen session', () => {
    for (const f of ['app/api/besok/[token]/route.ts', 'app/api/besok/[token]/anmal/route.ts', 'app/api/besok/[token]/karta/route.ts']) {
      const s = las(f);
      expect(s).toContain('tjanstKlient');
      expect(s).not.toMatch(/autentisera|kravInloggad|kravRoll|cookies\(/);
    }
  });
  it('kartrutterna är bakom token och bara ortofoto', () => {
    const k = las('app/api/besok/[token]/karta/route.ts');
    expect(k).toContain('lankGiltig');
    expect(k).toContain('layer=ortofoto');
    expect(k.indexOf('lankGiltig')).toBeLessThan(k.indexOf('forarkarta(new'));
  });
  it('alla svar är no-store och noindex', () => {
    const t = las('lib/besok/tjanst.ts');
    expect(t).toContain("'Cache-Control': 'no-store, max-age=0'");
    expect(t).toContain("'X-Robots-Tag': 'noindex, nofollow'");
    expect(las('app/besok/[token]/page.tsx')).toMatch(/robots: \{ index: false, follow: false/);
  });
});

describe('middleware släpper igenom bara besökssidans adresser, före all inloggningskontroll', () => {
  it('kontrollen sker först i middleware, med bara pathname, och ingen annan rutt görs öppen', () => {
    expect(middleware).toContain("import { arOffentligBesokSokvag } from './lib/besok/offentlig';");
    const i = middleware.indexOf('arOffentligBesokSokvag(request.nextUrl.pathname)');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(middleware.indexOf('createServerClient('));
    expect(middleware).toContain("oppen.headers.set('X-Robots-Tag', 'noindex, nofollow')");
    expect(middleware).not.toMatch(/API_UTAN_SESSION = new Set<string>\(\[[^\]]*besok/);
    expect(middleware.match(/arOffentligBesokSokvag/g)).toHaveLength(2);   // importen + ett anrop
  });
});

describe('ramverket hoppar över appens startare på besökssidan', () => {
  it('AppRamverk returnerar bara innehållet för /besok/<token>, och rotlayouten använder det', () => {
    const r = las('components/AppRamverk.tsx');
    expect(r).toMatch(/if \(arBesoksSida\(pathname\)\) return <>\{children\}<\/>/);
    expect(r.indexOf('arBesoksSida(pathname)')).toBeLessThan(r.indexOf('<TopBar />'));
    expect(las('app/layout.tsx')).toContain('<AppRamverk>{children}</AppRamverk>');
  });
});

describe('besökssidans text', () => {
  it('ingen säkerhetstext skrivs i vyn — den kommer ur lib/besok/sakerhet.ts', () => {
    for (const ord of ['Gå aldrig', 'Träd kan', 'motorsåg', 'Stanna minst', 'Vinka', 'reflexväst', 'backar', 'döda vinkeln']) expect(klient, ord).not.toContain(ord);
    expect(klient).toContain("from '@/lib/besok/sakerhet'");
  });
  it('avstånd skrivs aldrig som tal i komponenter eller sidan — bara konstanterna', () => {
    for (const f of ['components/besok/BesokKlient.tsx', 'components/besok/BesokKarta.tsx', 'components/besok/BesokKortHytt.tsx']) expect(las(f), f).not.toMatch(/\b(70|20|40)\s*(m\b|meter)/);
    expect(page).toContain('HYTT_RING_M');
    expect(las('lib/besok/konstanter.ts')).toContain('skordare: 70, skotare: 20, motorsag: 40');
  });
});

describe('planeringsvyn: besöken syns bara där de ska', () => {
  it('SMS-kortet bara för riktig admin i planeringsläget', () => {
    expect(page).toMatch(/besok: kortRoll === 'planerare' && isAdminRiktig && !maskinlage && !maskinSomParam && valtObjekt\.id/);
  });
  it('hytthooken är aktiv bara i maskinläget (samma villkor som instruktionerna) och kortet viker för larm och lossning', () => {
    expect(page).toMatch(/useBesokHytt\(\{\s*aktiv: instruktionerAktiv,/);
    expect(page).toContain('const besokKortSynligt = besokHytt.vantar.length > 0 && !larm.kort && !lossningVisas;');
    expect(page).toContain('{instruktionerAktiv && besokKortSynligt && (');
  });
  it('instruktionskortet väntar på besökskortet', () => {
    expect(page).toMatch(/lossningVisas \}\) \|\| besokKortSynligt,/);
  });
  it('ringen: egna lager med prefixet larm- (körvyns whitelist), radien ur konstanten, bara medan ett besök är aktivt', () => {
    expect(page).toContain("id: 'larm-besok-ring-fyll'");
    expect(page).toContain("id: 'larm-besok-ring-linje'");
    expect(page).toContain('circlePolygon(pos.lat, pos.lon, HYTT_RING_M, 64)');
    expect(page).toContain('besokHytt.aktiva.length > 0');
  });
  it('Uppfattat sparas på riktigt också i testläget (märkt testlage) — kvittenser sparas inte "torrt" här', () => {
    expect(page).toMatch(/testlage: !!testlage,\s*\n\s*ljudCtx/);
  });
  it('hytten läser minst var 5:e sekund', () => { expect(HYTT_POLL_MS).toBeLessThanOrEqual(5000); });
});

describe('migrationen', () => {
  it('RLS på alla fyra tabeller, ingen policy för anon, anon dras tillbaka', () => {
    for (const t of ['objekt_besok_lank', 'objekt_besok', 'objekt_besok_kvittens', 'objekt_besok_sms']) expect(migration).toContain(`alter table public.${t} enable row level security;`);
    expect(migration).not.toMatch(/create policy[^;]*to anon/i);
    expect(migration).toContain('from anon;');
  });
  it('ingen insert-policy på besök (bara servern skriver), kvittens och SMS bara som sig själv', () => {
    expect(migration).not.toMatch(/create policy \w+ on public\.objekt_besok for insert/);
    expect(migration).toContain('with check (forare_id = public.korvy_min_medarbetare())');
    expect(migration).toContain('with check (oppnad_av = public.korvy_min_medarbetare())');
  });
  it('volymfunktionen bara för service_role; länkfunktionerna kräver admin', () => {
    expect(migration).toContain('grant execute on function public.besok_volymer(uuid, text[]) to service_role;');
    expect(migration).toContain('revoke all on function public.besok_volymer(uuid, text[]) from public, anon, authenticated;');
    expect((migration.match(/m\.roll = 'admin'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('additiv: inget DROP TABLE/COLUMN, ingen ändring av befintliga tabeller', () => {
    expect(migration).not.toMatch(/drop table|drop column|alter table (?!public\.objekt_besok)/i);
  });
});

describe('påminnelsen i flush', () => {
  const flush = las('app/api/notis/flush/route.ts');
  it('köas i flush (ett fel stoppar aldrig kön) och byggs färskt vid utskick', () => {
    expect(flush).toMatch(/try \{\s*const bp = await koaBesokPaminnelser\(supabase\);[\s\S]*?\} catch/);
    expect(flush).toContain('arBesokPaminnelse(n.typ)');
    expect(flush).toContain('byggBesokNotis(n, hamtaBesokObjekt)');
  });
});
