// Cert › Behörigheter — läsning och sparning. Behörigheterna bor i Utbildnings tabeller (EN källa: Personal och
// Utbildning läser samma rader). Cert äger bara cert_se_krav (vilka utbildningar som är SE-krav) och cert_se
// ("Uppladdat hos SE" per intyg).
import { supabase } from '@/lib/supabase';
import { KOR_MASKIN_KRAV, SE_KRAV, autoGiltigTill, andrad, type Behorighet, type Falt, type Person } from './behorighet';

export const BUCKET = 'utbildningsbevis';

export type Vaxel = { typId: string; seKrav: string; namn: string; giltighetManader: number | null; etikett: string };
export type CertData = { personer: Person[]; vaxlar: Vaxel[] };

function fel(vad: string, e: { message?: string } | null): never {
  throw new Error(`${vad}: ${e?.message ?? 'okänt fel'}`);
}

export async function hamtaCert(): Promise<CertData> {
  const [krav, typer] = await Promise.all([
    supabase.from('cert_se_krav').select('utbildning_typ_id, se_krav'),
    supabase.from('utbildning_typ').select('id, namn, giltighet_manader, aktiv'),
  ]);
  if (krav.error) fel('Kunde inte läsa SE-kraven', krav.error);
  if (typer.error) fel('Kunde inte läsa utbildningarna', typer.error);
  const seKrav = new Map<string, string>((krav.data ?? []).map((k: any) => [k.utbildning_typ_id, k.se_krav]));
  const typ = new Map<string, any>((typer.data ?? []).filter((t: any) => t.aktiv && seKrav.has(t.id)).map((t: any) => [t.id, t]));
  const ids = [...typ.keys()];
  if (ids.length === 0) return { personer: [], vaxlar: [] };

  const status = await supabase.from('utbildning_status')
    .select('medarbetare_id, medarbetare_namn, utbildning_typ_id, bevis_id, genomford_datum, giltig_till, pdf_url')
    .in('utbildning_typ_id', ids);
  if (status.error) fel('Kunde inte läsa intygen', status.error);
  const rader = (status.data ?? []) as any[];

  const bevisIds = rader.map(r => r.bevis_id).filter(Boolean);
  const se = new Map<string, boolean>();
  if (bevisIds.length) {
    const r = await supabase.from('cert_se').select('bevis_id, uppladdad_se').in('bevis_id', bevisIds);
    if (r.error) fel('Kunde inte läsa "Uppladdat hos SE"', r.error);
    for (const x of (r.data ?? []) as any[]) se.set(x.bevis_id, x.uppladdad_se);
  }

  const personer = new Map<string, Person>();
  for (const r of rader) {
    const t = typ.get(r.utbildning_typ_id);
    if (!t) continue;
    const p: Person = personer.get(r.medarbetare_id) ?? { id: r.medarbetare_id, namn: (r.medarbetare_namn ?? '').trim() || 'Namnlös', behorigheter: [] };
    p.behorigheter.push({
      typId: t.id, seKrav: seKrav.get(t.id)!, namn: t.namn, giltighetManader: t.giltighet_manader,
      bevisId: r.bevis_id, kursdatum: r.genomford_datum, giltigTill: r.giltig_till, intygPath: r.pdf_url,
      uppladdadSe: r.bevis_id ? se.get(r.bevis_id) ?? false : false,
    });
    personer.set(p.id, p);
  }
  const ordning = (k: string) => SE_KRAV[k]?.ordning ?? 99;
  const lista = [...personer.values()]
    // Listan = de som kör maskin (har SYN-kravet i Utbildning), oavsett roll.
    .filter(p => p.behorigheter.some(b => b.seKrav === KOR_MASKIN_KRAV));
  for (const p of lista) p.behorigheter.sort((a, b) => ordning(a.seKrav) - ordning(b.seKrav));

  const vaxlar: Vaxel[] = ids
    .map(id => ({ typId: id, seKrav: seKrav.get(id)!, namn: typ.get(id).namn, giltighetManader: typ.get(id).giltighet_manader }))
    .filter(v => SE_KRAV[v.seKrav]?.vaxel)
    .sort((a, b) => ordning(a.seKrav) - ordning(b.seKrav))
    .map(v => ({ ...v, etikett: SE_KRAV[v.seKrav].vaxel! }));
  return { personer: lista, vaxlar };
}

export async function signeraIntyg(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  return error ? null : data?.signedUrl ?? null;
}

export type Andring = { b: Behorighet; f: Falt; foto: Blob | null };

/** Sparar en persons ark. Ordning per intyg: fotot först, sedan raden, sist "Uppladdat hos SE". Kastar vid första felet. */
export async function sparaPerson(
  personId: string, andringar: Andring[], krav: { typId: string; pa: boolean }[], skapadAv: string | null,
): Promise<void> {
  // Växlarna först: slås ett krav av ska dess intyg inte sparas.
  for (const k of krav) {
    const q = k.pa
      ? supabase.from('utbildning_krav').upsert({ utbildning_typ_id: k.typId, medarbetare_id: personId }, { onConflict: 'utbildning_typ_id,medarbetare_id', ignoreDuplicates: true })
      : supabase.from('utbildning_krav').delete().eq('utbildning_typ_id', k.typId).eq('medarbetare_id', personId);
    const { error } = await q;
    if (error) fel('Kunde inte spara vilka behörigheter som gäller', error);
  }
  const avslagna = new Set(krav.filter(k => !k.pa).map(k => k.typId));

  for (const { b, f, foto } of andringar) {
    if (avslagna.has(b.typId) || !andrad(b, f)) continue;
    if (f.taBort) {
      if (!b.bevisId) continue;
      const r = await supabase.from('utbildning_bevis').update({ aktiv: false, borttagen: new Date().toISOString() }).eq('id', b.bevisId).select('id');
      if (r.error || !r.data?.length) fel('Kunde inte ta bort intyget', r.error);
      continue;
    }
    let path = b.intygPath;
    if (foto) {
      const namn = `cert/${personId}/${b.typId}-${Date.now()}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(namn, foto, { contentType: 'image/jpeg' });
      if (up.error) fel('Kunde inte ladda upp fotot', up.error);
      path = up.data?.path ?? namn;
    }
    // giltig_till_manuell sätts bara när datumet avviker från det databasen själv räknar ut.
    const auto = autoGiltigTill(f.kursdatum, b.giltighetManader);
    const rad = { genomford_datum: f.kursdatum, giltig_till_manuell: f.giltigTill && f.giltigTill !== auto ? f.giltigTill : null, pdf_url: path };
    let bevisId = b.bevisId;
    if (bevisId) {
      const r = await supabase.from('utbildning_bevis').update({ ...rad, uppdaterad: new Date().toISOString() }).eq('id', bevisId).select('id');
      if (r.error || !r.data?.length) fel('Kunde inte spara intyget', r.error);
    } else {
      const r = await supabase.from('utbildning_bevis')
        .insert({ ...rad, utbildning_typ_id: b.typId, medarbetare_id: personId, skapad_av: skapadAv }).select('id').single();
      if (r.error || !r.data) fel('Kunde inte spara intyget', r.error);
      bevisId = (r.data as any).id;
    }
    if (f.uppladdadSe !== b.uppladdadSe || (!b.bevisId && f.uppladdadSe)) {
      const r = await supabase.from('cert_se').upsert({ bevis_id: bevisId, uppladdad_se: f.uppladdadSe, andrad: new Date().toISOString() });
      if (r.error) fel('Intyget är sparat, men inte "Uppladdat hos SE"', r.error);
    }
  }
}
