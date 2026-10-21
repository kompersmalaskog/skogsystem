// Importera traktfil (envz eller zip) — så skapas objekt. Samma tre steg och samma skydd som förut i /objekt:
//   1. signerad uppladdnings-URL (servern, admin-gated), 2. råfilen direkt till trakt-inbox (kringgår body-gränsen),
//   3. /api/import-trakt läser från storage. Ett svar utan JSON (död funktion) tolkas aldrig som "gick bra", och en importfil som
//   dog klient-sidan loggas till import_fel så den syns i /datahalsa i stället för att bli en föräldralös fil.
import { supabase } from '@/lib/supabase';
import type { Manad } from './manad';

const MAX_MB = 100; // samma tak som trakt-inbox-bucketen + servern (importen varnar redan vid 50 MB)

export type ImportSlag = 'klart' | 'varning' | 'fel';
export interface ImportUtfall { slag: ImportSlag; text: string }

async function loggaMisslyckadImport(sokvag: string | null, feltext: string): Promise<void> {
  try {
    await fetch('/api/import-trakt/logga-fel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sokvag, feltext }) });
  } catch (e) { console.error('Kunde inte logga misslyckad import:', e); }
}

export async function importeraTraktfil(file: File, manad: Manad, status: (text: string) => void): Promise<ImportUtfall> {
  let sokvag: string | null = null;
  if (file.size > MAX_MB * 1024 * 1024) return { slag: 'fel', text: `Filen är för stor (${(file.size / 1e6).toFixed(1)} MB). Max ${MAX_MB} MB.` };

  try {
    status('Förbereder uppladdning…');
    const urlRes = await fetch('/api/import-trakt/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filnamn: file.name, storlek: file.size }) });
    const urlData = await urlRes.json();
    if (!urlRes.ok) return { slag: 'fel', text: urlData.error || 'Kunde inte förbereda uppladdningen. Försök igen.' };

    status('Laddar upp traktfilen…');
    const { error: upErr } = await supabase.storage.from('trakt-inbox').uploadToSignedUrl(urlData.sokvag, urlData.token, file);
    if (upErr) return { slag: 'fel', text: `Uppladdningen misslyckades (${upErr.message}). Försök igen.` };
    sokvag = urlData.sokvag; // filen finns nu i trakt-inbox — kan loggas och köras om

    // Stora trakter kan ta en stund. Routens maxDuration är 300 s; vi ger 310 s och avbryter sedan med ett tydligt besked.
    status('Läser traktfilen (stora trakter kan ta någon minut)…');
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 310_000);
    let res: Response;
    try {
      res = await fetch('/api/import-trakt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sokvag, ar: manad.ar, manad: manad.manad }), signal: ctrl.signal });
    } finally { clearTimeout(timeoutId); }

    let data: any = null;
    try { data = await res.json(); } catch { /* icke-JSON (t.ex. 504) */ }

    if (!res.ok || !data) {
      if (res.status === 409) return { slag: 'fel', text: 'Objektet finns redan.' };
      if (data?.error) return { slag: 'fel', text: data.error };
      await loggaMisslyckadImport(sokvag, `Importen svarade HTTP ${res.status} utan JSON — trolig timeout/OOM.`);
      return { slag: 'fel', text: `Importen svarade inte (${res.status}) — troligen för stor eller för långsam. Filen ligger kvar för omkörning.` };
    }

    if (data.varningarSparade === false) {
      const n = Array.isArray(data.varningar) ? data.varningar.length : 0;
      return { slag: 'varning', text: data.varningarILogg === false
        ? `Objektet är importerat, men ${n} ${n === 1 ? 'notering kunde' : 'noteringar kunde'} inte sparas — de står bara i serverloggen.`
        : `Objektet är importerat, men ${n} ${n === 1 ? 'notering kunde' : 'noteringar kunde'} inte sparas på objektet — de ligger i Datahälsa under "Tappades något vid import?".` };
    }
    return { slag: 'klart', text: data.uppdaterad ? 'Objektet uppdaterades.' : 'Objektet är importerat.' };
  } catch (error: any) {
    console.error('Import error:', error);
    const avbruten = error?.name === 'AbortError';
    if (sokvag) await loggaMisslyckadImport(sokvag, avbruten ? 'Klient-timeout (AbortController, 310 s) — importen svarade aldrig.' : `Nätverksfel mot /api/import-trakt: ${error?.message ?? error}`);
    return { slag: 'fel', text: avbruten
      ? 'Importen tog för lång tid (avbröts efter 5 minuter). Filen ligger kvar för omkörning.'
      : 'Importen nådde inte fram — kolla täckningen och försök igen. Filen ligger kvar om den hann laddas upp.' };
  }
}
