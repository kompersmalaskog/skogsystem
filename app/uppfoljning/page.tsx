'use client';
// Uppföljningens landningssida (telefon + landning på stor skärm) = den DELADE
// menyn i full bredd. Samma komponent står som sidokolumn på stor skärm när ett
// objekt är öppet (UppfoljningRam). En meny, ett ställe, samma design överallt.
import UppfoljningMeny from './UppfoljningMeny';

export default function UppfoljningPage() {
  return <UppfoljningMeny kompakt={false} />;
}
