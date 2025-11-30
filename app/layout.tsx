import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { Auth0ProviderWrapper } from '@/components/Auth0ProviderWrapper';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://blackhole.zaks.io'),
  title: 'Schwarzschild Black Hole Lensing',
  description:
    'Interactive visualization of gravitational lensing around a Schwarzschild black hole with accretion disk',
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: '/blackhole-icon.webp',
    apple: '/blackhole-icon.webp',
  },
  openGraph: {
    title: 'Schwarzschild Black Hole Lensing',
    description:
      'Interactive visualization of gravitational lensing around a Schwarzschild black hole with accretion disk',
    type: 'website',
    siteName: 'Black Hole Simulation',
    images: ['/blackhole-warp.webp'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Schwarzschild Black Hole Lensing',
    description:
      'Interactive visualization of gravitational lensing around a Schwarzschild black hole with accretion disk',
    images: ['/blackhole-warp.webp'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Auth0ProviderWrapper>{children}</Auth0ProviderWrapper>
        <Analytics />
      </body>
    </html>
  );
}
