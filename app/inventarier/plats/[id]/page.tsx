'use client';

import { useParams } from 'next/navigation';
import PlatsSida from '@/components/inventarier/PlatsSida';

export default function InventariePlatsPage() {
  const { id } = useParams<{ id: string }>();
  return <PlatsSida platsId={id} />;
}
