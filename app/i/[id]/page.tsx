'use client';

// /i/<rad_id> — adressen i QR-koderna på lådorna (lib/inventarier/qr.ts). Kort med flit: mindre kod, tätare QR.
import { useParams } from 'next/navigation';
import Skanning from '@/components/inventarier/Skanning';

export default function SkanningPage() {
  const { id } = useParams<{ id: string }>();
  return <Skanning radId={id} />;
}
