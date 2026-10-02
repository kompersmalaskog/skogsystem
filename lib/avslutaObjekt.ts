// DELAD AVSLUT-REGEL — en enda funktion för "objektet är klart".
// Konsekvensen av avslut: objekt.status='avslutat' + avslutad_timestamp, och objektet UR ALLA
// maskin_ko (alla maskiner) — men BARA i själva övergången till avslutat. Ett objekt som redan är
// avslutat får sina köer i fred: GROT-arket i /oversikt-v2 köar avslutade trakter för skotare (GROT), och redigeringen
// anropar den här funktionen vid VARJE spar av ett avslutat objekt — utan den gränsen hade varje
// spar raderat GROT-köraden. Med `sattFlaggor` fylls dessutom dim_objekt.skordning_avslutad /
// skotning_avslutad till DAGENS datum — men BARA där de är NULL (en människas satta datum skrivs
// aldrig över). Planeringens Avsluta-knapp (manuellt, ett tryck) sätter flaggor; redigeringen gör
// det inte (där har användaren redan satt dem vid spar) utan återanvänder bara status+kö-delen.
//
// Status är härledd, inte huvuddata → funktionen kastar ALDRIG; den returnerar {ok,message} och
// anroparen kan välja att ignorera ett fel (redigeringen gör det — ett avslut-fel får ej fälla saven).
// `supabase` injiceras (browser-klienten) så lib:et slipper egen klient och förblir testbart.

export async function avslutaObjekt(
  supabase: any,
  args: { objektId?: string | null; voNummer?: string | number | null; sattFlaggor?: boolean },
): Promise<{ ok: boolean; message: string }> {
  const vo = args.voNummer == null ? null : String(args.voNummer);
  if (!vo && !args.objektId) return { ok: true, message: '' };
  try {
    // 1) Flaggor (endast med vo + sattFlaggor): fyll NULL till dagens datum, aldrig skriv över.
    if (args.sattFlaggor && vo) {
      const dag = new Date().toISOString().slice(0, 10);
      const { data: dimRader } = await supabase.from('dim_objekt').select('objekt_id').eq('vo_nummer', vo);
      const dimIds = (dimRader || []).map((d: any) => d.objekt_id);
      if (dimIds.length) {
        await supabase.from('dim_objekt').update({ skordning_avslutad: dag }).in('objekt_id', dimIds).is('skordning_avslutad', null);
        await supabase.from('dim_objekt').update({ skotning_avslutad: dag }).in('objekt_id', dimIds).is('skotning_avslutad', null);
      }
    }
    // 2) Status + ur ALLA köer. Nyckel: vo_nummer (som redigeringen); id som reserv om vo saknas.
    const objFraga = supabase.from('objekt').select('id, status');
    const { data: objRader } = await (vo ? objFraga.eq('vo_nummer', vo) : objFraga.eq('id', args.objektId));
    const ids = (objRader || []).map((o: any) => o.id);
    // Övergången: minst en rad är inte avslutad ännu. Bara då ändras status OCH köerna töms.
    if ((objRader || []).some((o: any) => o.status !== 'avslutat')) {
      const upd = supabase.from('objekt').update({ status: 'avslutat', avslutad_timestamp: new Date().toISOString() }).neq('status', 'avslutat');
      await (vo ? upd.eq('vo_nummer', vo) : upd.eq('id', args.objektId));
      if (ids.length) await supabase.from('maskin_ko').delete().in('objekt_id', ids);
    }
    return { ok: true, message: '' };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'avslut misslyckades' };
  }
}
