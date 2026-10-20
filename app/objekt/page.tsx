import dynamic from 'next/dynamic';

// Läser månaden ur adressen och datumet ur klockan — bara i webbläsaren (annars skiljer serverns och klientens första rendering).
const ObjektVy = dynamic(() => import('./_components/ObjektVy'), { ssr: false });

// Objekt och beställning i EN vy (omtaget 2026-10-19; ersätter /objekt-formuläret och /bestallningar).
// Beställningen är behållaren, objekten raderna under. Uppföljning, trend och "kvar att köra" bor i andra vyer.
export default function ObjektPage() {
  return <ObjektVy />;
}
