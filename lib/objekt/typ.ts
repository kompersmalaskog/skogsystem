// EN typregel för hela appen. Typen HÄRLEDS, den gissas aldrig.
//
//  risskotning = true   → 'grot'            (flaggan ÄR typen)
//  huvudtyp 'Grot'      → 'grot'            (explicit värde, speglar flaggan)
//  huvudtyp gallring    → 'gallring'
//  huvudtyp slutavv.    → 'slutavverkning'
//  huvudtyp saknas      → null → "Typ okänd"
//
// Två poänger:
//  1. Grot är ETT explicit huvudtyp-värde OCH en flagga — de sätts ihop
//     (redigeringssheeten synkar dem) så de aldrig kan säga emot varandra.
//     Klassningen läser BÅDA vägarna → grot; ingen förlitar sig på uteslutning
//     ("varken slut eller gallring"), som felklassar ett objekt som bara
//     saknar huvudtyp.
//  2. Saknad huvudtyp → null, ALDRIG grot och aldrig slutavverkning. Tidigare
//     returnerade härledningen hårdkodat 'slutavverkning' när huvudtyp saknades,
//     vilket fick alla risjobb (och varje nyimporterat objekt innan någon fyllt
//     i typen) att visa "Slutavverkning" — en lögn som såg ut som data. Objekt
//     utan huvudtyp är OFULLSTÄNDIGA (varning i Att åtgärda), inte en typ.

export type ObjektTyp = 'slutavverkning' | 'gallring' | 'grot' | null;

// Är huvudtyp-texten det explicita Grot-värdet? Vallistan skriver exakt 'Grot',
// men vi tål äldre versaler/gemener och ev. blanksteg.
export function arGrotHuvudtyp(huvudtyp: string | null | undefined): boolean {
  return typeof huvudtyp === 'string' && huvudtyp.trim().toLowerCase() === 'grot';
}

export function arRisjobb(
  o: { risskotning?: boolean | null; grotSkotning?: boolean | null; huvudtyp?: string | null } | null | undefined,
): boolean {
  // dim_objekt-raden bär risskotning; uppföljningens listobjekt bär samma
  // fakta som grotSkotning. Den explicita huvudtypen 'Grot' betyder detsamma.
  // Alla tre betyder RISJOBB.
  return o?.risskotning === true || o?.grotSkotning === true || arGrotHuvudtyp(o?.huvudtyp);
}

// Härled typ ur risskotning-flaggan + huvudtyp. Ingen fallback-gissning.
export function harledTyp(risskotning: boolean | null | undefined, huvudtyp: string | null | undefined): ObjektTyp {
  if (risskotning === true) return 'grot';
  if (!huvudtyp) return null;
  if (arGrotHuvudtyp(huvudtyp)) return 'grot';
  return huvudtyp.toLowerCase().includes('gallr') ? 'gallring' : 'slutavverkning';
}

// Lång etikett (rubriker, detaljvy)
export function typLabel(t: ObjektTyp): string {
  return t === 'grot' ? 'Grot'
    : t === 'gallring' ? 'Gallring'
    : t === 'slutavverkning' ? 'Slutavverkning'
    : 'Typ okänd';
}

// Kort etikett (taggar i listor)
export function typKort(t: ObjektTyp): string {
  return t === 'grot' ? 'Grot'
    : t === 'gallring' ? 'Gallring'
    : t === 'slutavverkning' ? 'Slutavv.'
    : 'Okänd';
}
