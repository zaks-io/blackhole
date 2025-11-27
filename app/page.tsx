'use client';

import Link from 'next/link';
import { track } from '@vercel/analytics';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#0a0a0a_0%,#000_70%)] text-white p-8">
      <div className="max-w-[600px] text-center">
        <h1 className="text-[clamp(2.5rem,8vw,4.5rem)] font-extralight tracking-[0.15em] uppercase mb-2 bg-linear-to-br from-white via-[#ff8c42] to-[#ff5e00] bg-clip-text text-transparent">
          Explore a Black Hole
        </h1>
        <p className="text-[clamp(0.9rem,2.5vw,1.1rem)] font-light tracking-[0.25em] uppercase text-neutral-500 mb-12">
          A Voice-Guided Journey Through Spacetime
        </p>

        <div className="text-lg leading-relaxed text-neutral-400 mb-12">
          <p>
            Step into an interactive simulation of a black hole with an AI guide
            who explains the physics as you explore. Watch light bend around the
            event horizon and see the universe distort in real-time.
          </p>
        </div>

        <Link
          href="/simulation"
          onClick={() => track('get_started_click')}
          className="group inline-flex items-center gap-4 py-5 px-12 bg-transparent border border-[rgba(255,140,66,0.4)] text-[#ff8c42] text-base font-normal tracking-[0.2em] uppercase no-underline cursor-pointer transition-all duration-300 hover:bg-[rgba(255,140,66,0.1)] hover:border-[#ff8c42] hover:shadow-[0_0_30px_rgba(255,140,66,0.2)]"
        >
          <span>Get Started</span>
          <span className="transition-transform duration-300 group-hover:translate-x-1.5">→</span>
        </Link>
      </div>
    </main>
  );
}
