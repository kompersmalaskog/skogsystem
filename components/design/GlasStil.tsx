'use client';

// Klassen `.glas` (lib/design/tokens GLAS_CSS) som en <style>. Läggs en gång i varje vy som ritar flytande kartkontroller;
// en dubblett skadar inte (samma regler). Glas eller solid avgörs av body[data-glas] (lib/glasLage).

import { GLAS_CSS } from '@/lib/design/tokens';

export default function GlasStil() {
  return <style>{GLAS_CSS}</style>;
}
