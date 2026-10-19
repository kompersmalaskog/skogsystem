// Svaren på "Vilken maskin?": besvara_lass skapar flytten (samma funktion som cron:en använder), avvisa_lass markerar att det inte var
// en maskinflytt. Första svaret vinner — ett andra får veta vem som hann före (typ 'redan').

import { supabase } from '@/lib/supabase';
import { tolkaSvar, type SvarUtfall, type Val } from './lass';

export async function besvaraLass(lassId: string, v: Val, externVald: boolean): Promise<SvarUtfall> {
  try {
    const { data, error } = await supabase.rpc('besvara_lass', {
      p_lass: lassId,
      p_maskin_id: externVald ? null : v.maskinId,
      p_extern_maskin: externVald ? v.extern.trim() : null,
      p_kund: v.kund.trim() || null,
    });
    return tolkaSvar(data, error);
  } catch (e: any) {
    return { typ: 'fel', fel: e?.message || 'Nätverksfel. Försök igen.' };
  }
}

export async function avvisaLass(lassId: string): Promise<SvarUtfall> {
  try {
    const { data, error } = await supabase.rpc('avvisa_lass', { p_lass: lassId, p_orsak: 'ingen_maskinflytt' });
    return tolkaSvar(data, error);
  } catch (e: any) {
    return { typ: 'fel', fel: e?.message || 'Nätverksfel. Försök igen.' };
  }
}
