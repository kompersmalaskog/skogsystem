'use client';

// Startar bakgrundskön för skotarens lass (lib/skotarLass/koKopplad): lass som sparats utan täckning skickas när nätet finns — även om appen
// öppnas på startsidan. Ritar ingenting.

import { useEffect } from 'react';
import { startaLassKoTriggers } from '@/lib/skotarLass/koKopplad';

export default function SkotarLassStartare() {
  useEffect(() => startaLassKoTriggers(), []);
  return null;
}
