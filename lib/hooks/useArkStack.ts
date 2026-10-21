'use client';
/**
 * EN STAPEL ARK — nästlade ark där det översta visas och "‹ <föregående rubrik>" går ett steg tillbaka, medan stängning
 * tar hela stapeln (kalibreringsvyns modalstack, flyttad ur app/kalibrering/page.tsx; ritningen sker i components/kalibrering).
 */
import { useCallback, useState } from 'react';

export type ArkSteg<T> = { post: T; foregaende: T | null };

export function useArkStack<T>() {
  const [stack, setStack] = useState<ArkSteg<T>[]>([]);
  const lagg = useCallback((post: T) => {
    setStack(prev => [...prev, { post, foregaende: prev.length ? prev[prev.length - 1].post : null }]);
  }, []);
  /** Byt det översta arket mot ett annat utan att röra "‹"-länken (stam → stam i samma kontroll). */
  const byt = useCallback((post: T) => {
    setStack(prev => prev.length ? [...prev.slice(0, -1), { post, foregaende: prev[prev.length - 1].foregaende }] : prev);
  }, []);
  const tillbaka = useCallback(() => setStack(prev => prev.slice(0, -1)), []);
  const stang = useCallback(() => setStack([]), []);
  return { oversta: stack.length ? stack[stack.length - 1] : null, lagg, byt, tillbaka, stang };
}
