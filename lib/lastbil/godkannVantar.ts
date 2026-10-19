// Hur många flyttar väntar på att admin godkänner dem? Samma tal som raden "N flyttar väntar på godkännande" på /lastbil
// (app/lastbil/_components/useVantar: aktiva, ogodkända, ofakturerade underlag) — fast här bara antalet, för startsidans Lastbilen.
//
// Läsfel är null (inget märke), aldrig 0. Förare ser inget: fakturaunderlaget är ekonomidata med admin-RLS, så svaret blir 0.

export const flyttarAttGodkannaText = (n: number): string => `${n} ${n === 1 ? 'flytt' : 'flyttar'} att godkänna`;

export async function hamtaAntalAttGodkanna(sb: any): Promise<number | null> {
  try {
    const { count, error } = await sb.from('fakturaunderlag_flytt')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aktiv').is('fakturerad_tid', null).is('godkand_tid', null);
    if (error || typeof count !== 'number') return null;
    return count;
  } catch {
    return null;
  }
}
