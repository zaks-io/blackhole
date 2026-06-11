import { notFound } from 'next/navigation';
import AppViewLazy from '@/components/AppViewLazy';
import { VIEW_SLUGS } from '@/lib/presets';

export function generateStaticParams() {
  return Object.keys(VIEW_SLUGS).map((view) => ({ view }));
}

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const preset = VIEW_SLUGS[view];

  if (!preset) {
    notFound();
  }

  return <AppViewLazy initialView={preset} />;
}
