import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Schwarzschild Black Hole Lensing',
  description: 'Interactive visualization of gravitational lensing around a Schwarzschild black hole with accretion disk',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

