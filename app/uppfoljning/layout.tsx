// Ramen kring hela /uppfoljning: på stor skärm står objektlistan som sidokolumn
// bredvid objektet (bara på objekt-rutten). Index och underrutter är oförändrade.
// Se UppfoljningRam för reglerna.
import type { ReactNode } from 'react';
import UppfoljningRam from './UppfoljningRam';

export default function UppfoljningLayout({ children }: { children: ReactNode }) {
  return <UppfoljningRam>{children}</UppfoljningRam>;
}
