// Cert — läsning och sparning. cert_krav är SE:s kravlista med två bockar (klar, uppladdad_se). Krav med
// kalla = 'utbildning' läser läget ur Utbildning: utbildning_status (EN källa, samma som Utbildning och Personal),
// cert_se_krav (vilken utbildning som är vilket SE-krav) och cert_se ("Uppladdat hos SE" per intyg).
import { supabase } from '@/lib/supabase';
import { LIGGARE, type Krav, type UtbLage } from './krav';

export type RevisionData = { krav: Krav[]; utb: Record<string, UtbLage> };

function fel(vad: string, e: { message?: string } | null): never {
  throw new Error(`${vad}: ${e?.message ?? 'okänt fel'}`);
}

const GILTIG = new Set(['giltig', 'gar_ut_snart']);

export async function hamtaRevision(): Promise<RevisionData> {
  const [k, se, st] = await Promise.all([
    supabase.from('cert_krav').select('krav_nr, namn, se_sektion_nr, se_sektion, galler_oss, underlag, hur_ofta, var_finns_idag, klar, uppladdad_se, kalla'),
    supabase.from('cert_se_krav').select('utbildning_typ_id, se_krav'),
    supabase.from('utbildning_status').select('utbildning_typ_id, bevis_id, status'),
  ]);
  if (k.error) fel('Kunde inte läsa kravlistan', k.error);
  if (se.error) fel('Kunde inte läsa SE-kraven', se.error);
  if (st.error) fel('Kunde inte läsa Utbildning', st.error);
  const rader = (st.data ?? []) as { utbildning_typ_id: string; bevis_id: string | null; status: string }[];

  const bevisIds = rader.map(r => r.bevis_id).filter((x): x is string => !!x);
  const uppladdat = new Set<string>();
  if (bevisIds.length) {
    const r = await supabase.from('cert_se').select('bevis_id, uppladdad_se').in('bevis_id', bevisIds);
    if (r.error) fel('Kunde inte läsa "Uppladdat hos SE"', r.error);
    for (const x of (r.data ?? []) as { bevis_id: string; uppladdad_se: boolean }[]) if (x.uppladdad_se) uppladdat.add(x.bevis_id);
  }

  const lage = (typId: string | null): UtbLage => {
    const mina = typId ? rader.filter(r => r.utbildning_typ_id === typId) : rader;
    const giltiga = mina.filter(r => GILTIG.has(r.status));
    return {
      typId, antal: mina.length, giltiga: giltiga.length,
      medIntyg: mina.filter(r => !!r.bevis_id).length,
      uppladdade: giltiga.filter(r => r.bevis_id && uppladdat.has(r.bevis_id)).length,
    };
  };
  const utb: Record<string, UtbLage> = { [LIGGARE]: lage(null) };
  for (const x of (se.data ?? []) as { utbildning_typ_id: string; se_krav: string }[]) utb[x.se_krav] = lage(x.utbildning_typ_id);

  const krav: Krav[] = ((k.data ?? []) as any[]).map(r => ({
    kravNr: r.krav_nr, namn: r.namn, sektionNr: r.se_sektion_nr, sektion: r.se_sektion, gallerOss: r.galler_oss,
    underlag: r.underlag, hurOfta: r.hur_ofta, varFinns: r.var_finns_idag, klar: r.klar, uppladdadSe: r.uppladdad_se, kalla: r.kalla,
  }));
  return { krav, utb };
}

/** Sparar ett kravs bockar. Noll rader tillbaka är ett fel (kravet finns inte, eller man är inte admin). */
export async function sparaKrav(kravNr: string, andring: { klar?: boolean; uppladdadSe?: boolean }): Promise<void> {
  const rad: Record<string, unknown> = { andrad: new Date().toISOString() };
  if (andring.klar !== undefined) rad.klar = andring.klar;
  if (andring.uppladdadSe !== undefined) rad.uppladdad_se = andring.uppladdadSe;
  const r = await supabase.from('cert_krav').update(rad).eq('krav_nr', kravNr).select('krav_nr');
  if (r.error || !r.data?.length) fel('Kunde inte spara', r.error);
}

// ---- "Uppladdat hos SE" per intyg — växeln bor i Utbildnings ark (BevisSheet) ----

/** null = utbildningen är inget SE-krav (ingen växel visas). */
export async function lasIntygSe(typId: string, bevisId: string): Promise<boolean | null> {
  const [k, s] = await Promise.all([
    supabase.from('cert_se_krav').select('se_krav').eq('utbildning_typ_id', typId).maybeSingle(),
    supabase.from('cert_se').select('uppladdad_se').eq('bevis_id', bevisId).maybeSingle(),
  ]);
  if (k.error) fel('Kunde inte läsa SE-kravet', k.error);
  if (!k.data) return null;
  if (s.error) fel('Kunde inte läsa "Uppladdat hos SE"', s.error);
  return (s.data as { uppladdad_se: boolean } | null)?.uppladdad_se ?? false;
}

export async function sattIntygSe(bevisId: string, pa: boolean): Promise<void> {
  const r = await supabase.from('cert_se').upsert({ bevis_id: bevisId, uppladdad_se: pa, andrad: new Date().toISOString() }).select('bevis_id');
  if (r.error || !r.data?.length) fel('Kunde inte spara "Uppladdat hos SE"', r.error);
}
