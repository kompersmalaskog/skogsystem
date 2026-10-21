import dynamic from 'next/dynamic';

const FilenGavVy = dynamic(() => import('../_components/FilenGavVy'), { ssr: false });

// Ett objekt: vad traktfilen gav oss. All data finns redan sparad av importen — inget här skrivs till importflödet.
export default function ObjektFilenGav({ params }: { params: { id: string } }) {
  return <FilenGavVy objektId={params.id} />;
}
