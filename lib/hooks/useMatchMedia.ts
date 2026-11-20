'use client';
// Om en media query gäller just nu, och när den ändras (iPad som vrids, fönster som dras). Första renderingen är false (servern vet inget om skärmen);
// det som BARA ska se olika ut efter bredd löses i CSS — den här är för det som måste rendera olika saker (panel eller blad).
import { useEffect, useState } from 'react';

export function useMatchMedia(query: string): boolean {
  const [traff, setTraff] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    setTraff(mq.matches);
    const lyssna = (e: MediaQueryListEvent) => setTraff(e.matches);
    mq.addEventListener('change', lyssna);
    return () => mq.removeEventListener('change', lyssna);
  }, [query]);
  return traff;
}
