'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#0a0a0a_0%,#000_70%)] text-white p-8">
      <div className="max-w-[700px] text-center">
        <h1 className="text-[clamp(2.5rem,8vw,4.5rem)] font-extralight tracking-[0.15em] uppercase mb-2 bg-linear-to-br from-white via-[#ff8c42] to-[#ff5e00] bg-clip-text text-transparent">
          Schwarzschild Black Hole
        </h1>
        <p className="text-[clamp(1rem,3vw,1.25rem)] font-light tracking-[0.3em] uppercase text-neutral-500 mb-12">
          Gravitational Lensing Simulation
        </p>

        <div className="text-lg leading-relaxed text-neutral-400 mb-12">
          <p>
            Experience the warping of spacetime around a non-rotating black hole.
            Watch light bend, stars distort, and an accretion disk glow with
            MHD turbulence effects.
          </p>
        </div>

        <Link
          href="/simulation"
          className="group inline-flex items-center gap-4 py-5 px-12 bg-transparent border border-[rgba(255,140,66,0.4)] text-[#ff8c42] text-base font-normal tracking-[0.2em] uppercase no-underline cursor-pointer transition-all duration-300 mb-16 hover:bg-[rgba(255,140,66,0.1)] hover:border-[#ff8c42] hover:shadow-[0_0_30px_rgba(255,140,66,0.2)]"
        >
          <span>Enter Simulation</span>
          <span className="transition-transform duration-300 group-hover:translate-x-1.5">→</span>
        </Link>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-8 text-left">
          <div>
            <h3 className="text-sm font-medium tracking-widest uppercase text-[#ff8c42] mb-2">
              Ray Marching
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Real-time geodesic tracing through curved spacetime
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium tracking-widest uppercase text-[#ff8c42] mb-2">
              Accretion Disk
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Temperature-mapped blackbody radiation with Doppler effects
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium tracking-widest uppercase text-[#ff8c42] mb-2">
              MHD Turbulence
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Spiral density waves and orbiting hotspots
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
