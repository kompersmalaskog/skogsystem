import type { ReactNode } from 'react';
import GallringRam from '@/components/gallring/GallringRam';

// Listan och trakten i EN ram: på telefon och iPad stående en sak per skärm, från 1100 px listan bredvid trakten.
export default function Layout({ children }: { children: ReactNode }) {
  return <GallringRam>{children}</GallringRam>;
}
