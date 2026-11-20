'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { KRAVTYP_META, type Medarbetare, type UtbildningTyp } from '@/lib/utbildning';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { BockRad, PersonChecklist, PrimaryButton } from './ui';

// Vem en utbildning gäller — det enda som gick att sätta i stunden man skapade
// den, och aldrig ändra efteråt. Fyra av åtta utbildningar stod därför på noll
// personer i prod 2026-10-19, två av dem lagkrav, och gick inte att rätta i appen.
//
// Skriver `utbildning_typ.galler_alla` och raderna i `utbildning_krav`.
export default function GallerSheet({
  open,
  typ,
  medarbetare,
  nuvarande,
  onClose,
  onSaved,
}: {
  open: boolean;
  typ: UtbildningTyp | null;
  medarbetare: Medarbetare[];
  /** Medarbetar-id som står i `utbildning_krav` för den här utbildningen i dag. */
  nuvarande: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [gallerAlla, setGallerAlla] = useState(true);
  const [valda, setValda] = useState<Set<string>>(new Set());
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !typ) return;
    setGallerAlla(typ.galler_alla);
    setValda(new Set(nuvarande));
    setSparar(false);
    setFel(null);
  }, [open, typ, nuvarande]);

  const toggle = (id: string) =>
    setValda((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allaEllerInga = (vald: boolean) =>
    setValda(vald ? new Set(medarbetare.map((m) => m.id)) : new Set());

  async function spara() {
    if (!typ) return;
    const tomtUrval = !gallerAlla && valda.size === 0;
    if (tomtUrval) return;
    setSparar(true);
    setFel(null);

    // ORDNINGEN SPELAR ROLL: kraven först, flaggan sist.
    // Faller kraven medan flaggan redan står på "bara vissa" gäller utbildningen
    // fel personer — eller ingen — utan att någon ser det. Faller flaggan medan
    // kraven är skrivna står den kvar på "alla", och raderna i utbildning_krav
    // läses inte då. Det senare är ofarligt, det förra är precis den bugg vi rättar.
    if (!gallerAlla) {
      // Bara skillnaden skrivs, och raderingen pekar ut DE BORTTAGNA i en vanlig
      // in-lista. Ett negerat filter med hela urvalet inbakat ("allt utom dessa")
      // raderar allt om listan av misstag blir tom — här rör vi inget alls då.
      const borttagna = nuvarande.filter((id) => !valda.has(id));
      if (borttagna.length > 0) {
        const { error: bortErr } = await supabase
          .from('utbildning_krav')
          .delete()
          .eq('utbildning_typ_id', typ.id)
          .in('medarbetare_id', borttagna);
        if (bortErr) {
          setFel(`Kunde inte ta bort gamla val: ${bortErr.message}`);
          setSparar(false);
          return;
        }
      }
      const nya = Array.from(valda)
        .filter((id) => !nuvarande.includes(id))
        .map((id) => ({ utbildning_typ_id: typ.id, medarbetare_id: id }));
      if (nya.length > 0) {
        const { error: insErr } = await supabase.from('utbildning_krav').insert(nya);
        if (insErr) {
          setFel(`Kunde inte spara vilka den gäller: ${insErr.message}`);
          setSparar(false);
          return;
        }
      }
    }

    const { error: typErr } = await supabase
      .from('utbildning_typ')
      .update({ galler_alla: gallerAlla })
      .eq('id', typ.id);
    if (typErr) {
      setFel(`Personerna är sparade, men omfattningen kunde inte ändras: ${typErr.message}`);
      setSparar(false);
      return;
    }

    setSparar(false);
    onSaved();
  }

  if (!open || !typ) return null;

  const tomtUrval = !gallerAlla && valda.size === 0;
  const antal = valda.size;

  return (
    <Ark
      rubrik="Vem gäller den?"
      onStang={onClose}
      fot={
        <>
          {tomtUrval && (
            <p style={{ ...TYP.meta, color: FARG.orange, margin: 0 }}>
              Välj minst en person — annars gäller utbildningen ingen, och appen
              kan varken säga att den saknas eller att den går ut.
            </p>
          )}
          {fel && <p style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
          <PrimaryButton onClick={spara} disabled={sparar || tomtUrval}>
            {sparar ? 'Sparar…' : 'Spara'}
          </PrimaryButton>
        </>
      }
    >
      <Sektion
        rubrik={typ.namn}
        kort={false}
        not={`${KRAVTYP_META[typ.kravtyp].label} · det här styr vem som räknas som att den saknas.`}
      >
        <BockRad
          titel="Alla i företaget"
          under={`${medarbetare.length} personer`}
          vald={gallerAlla}
          onToggle={() => setGallerAlla(true)}
        />
        <BockRad
          titel="Bara vissa"
          under={gallerAlla ? undefined : `${antal} ${antal === 1 ? 'vald' : 'valda'}`}
          vald={!gallerAlla}
          sista={gallerAlla}
          onToggle={() => setGallerAlla(false)}
        />
      </Sektion>

      {!gallerAlla && (
        <Sektion rubrik="Välj personer" kort={false}>
          <PersonChecklist
            medarbetare={medarbetare}
            valda={valda}
            onToggle={toggle}
            onAlla={allaEllerInga}
          />
        </Sektion>
      )}

      <div style={{ height: AVSTAND.s }} />
    </Ark>
  );
}
