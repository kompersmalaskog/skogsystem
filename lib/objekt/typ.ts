// EN typregel för hela appen. Typen HÄRLEDS, den gissas aldrig.
//
//  risskotning = true  → 'grot'            (flaggan ÄR typen)
//  huvudtyp gallring   → 'gallring'
//  huvudtyp slutavv.   → 'slutavverkning'
//  huvudtyp saknas     → null → "Typ okänd"
//
// Den sista raden är poängen: tidigare returnerade härledningen hårdkodat
// 'slutavverkning' när huvudtyp saknades, vilket fick alla 11 risjobb (och
// varje nyimporterat objekt innan någon fyllt i typen) att visa
// "Slutavverkning" — en lögn som såg ut som data.

export type ObjektTyp = 'slutavverkning' | 'gallring' | 'grot' | null;

export function arRisjobb(
  o: { risskotning?: boolean | null; grotSkotning?: boolean | null } | null | undefined,
): boolean {
  // dim_objekt-raden bär risskotning; uppföljningens listobjekt bär samma
  // fakta som grotSkotning. Båda betyder RISJOBB.
  return o?.risskotning === true || o?.grotSkotning === true;
}

// Härled typ ur risskotning-flaggan + huvudtyp. Ingen fallback-gissning.
export function harledTyp(risskotning: boolean | null | undefined, huvudtyp: string | null | undefined): ObjektTyp {
  if (risskotning === true) return 'grot';
  if (!huvudtyp) return null;
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
