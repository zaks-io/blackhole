'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { track } from '@vercel/analytics';
import gsap from 'gsap';

const features = [
  {
    title: 'Real-time Physics',
    description:
      'Schwarzschild geodesic ray-marching simulates how light bends around the event horizon in real-time.',
  },
  {
    title: 'AI Voice Guide',
    description:
      'An AI companion explains the physics as you explore different viewpoints around the black hole.',
  },
  {
    title: 'Interactive Controls',
    description:
      'Cinematic camera presets and overlays reveal the photon sphere, ISCO, and relativistic effects.',
  },
];

const techStack = ['WebGL2', 'Three.js', 'Ray Marching', 'GSAP'];

export default function Home() {
  const heroRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.fromTo('.hero-bg', { scale: 1.05, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.5 })
        .fromTo(titleRef.current, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1 }, '-=0.8')
        .fromTo(
          subtitleRef.current,
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8 },
          '-=0.6'
        )
        .fromTo(ctaRef.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, '-=0.4')
        .fromTo(scrollRef.current, { opacity: 0 }, { opacity: 1, duration: 0.5 }, '-=0.2');

      gsap.to(scrollRef.current, {
        y: 8,
        duration: 1.2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    });

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cards = entry.target.querySelectorAll('.feature-card');
            gsap.fromTo(
              cards,
              { y: 40, opacity: 0 },
              {
                y: 0,
                opacity: 1,
                duration: 0.6,
                stagger: 0.15,
                ease: 'power2.out',
              }
            );
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    if (featuresRef.current) {
      observer.observe(featuresRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <main className="bg-black text-white">
      {/* Hero Section */}
      <section ref={heroRef} className="relative min-h-screen">
        {/* Fixed Background Container - clips at section boundary */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="/blackhole-side-view.webp"
            alt=""
            className="hero-bg fixed inset-0 w-full h-screen object-cover"
          />
          {/* Gradient Overlay */}
          <div className="fixed inset-0 h-screen bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex items-center min-h-screen px-8 md:px-16 lg:px-24">
          <div className="max-w-xl">
            <h1
              ref={titleRef}
              className="text-[clamp(2.5rem,7vw,4.5rem)] font-extralight tracking-[0.15em] uppercase leading-[1.2] mb-8 bg-gradient-to-br from-white via-[#ff8c42] to-[#ff5e00] bg-clip-text text-transparent"
            >
              Explore a Black Hole
            </h1>
            <p
              ref={subtitleRef}
              className="text-[clamp(0.9rem,2vw,1.2rem)] font-light tracking-[0.2em] uppercase text-neutral-400 mb-12 leading-relaxed"
            >
              A Voice-Guided Journey Through Spacetime
            </p>
            <Link
              ref={ctaRef}
              href="/app"
              onClick={() => track('get_started_click')}
              className="group inline-flex items-center gap-5 py-5 px-12 bg-transparent border border-[rgba(255,140,66,0.4)] text-[#ff8c42] text-sm font-normal tracking-[0.2em] uppercase no-underline cursor-pointer transition-all duration-300 hover:bg-[rgba(255,140,66,0.1)] hover:border-[#ff8c42] hover:shadow-[0_0_30px_rgba(255,140,66,0.2)]"
            >
              <span>Get Started</span>
              <span className="transition-transform duration-300 group-hover:translate-x-1.5">
                &rarr;
              </span>
            </Link>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div
          ref={scrollRef}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-neutral-500"
        >
          <span className="text-xs tracking-[0.2em] uppercase">Scroll</span>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </section>

      {/* Content sections wrapper - covers the fixed hero background */}
      <div className="relative z-10 bg-black">
        {/* Features Section */}
        <section ref={featuresRef} className="py-24 md:py-32 px-8 md:px-16 bg-[#050505]">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-center text-[clamp(1.5rem,4vw,2.5rem)] font-extralight tracking-[0.15em] uppercase mb-4 text-white">
              What You&apos;ll Experience
            </h2>
            <p className="text-center text-neutral-500 mb-16 max-w-2xl mx-auto">
              An interactive simulation powered by real physics
            </p>
            <div className="grid md:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="feature-card p-8 rounded-xl border border-neutral-800/50 bg-neutral-900/30 backdrop-blur-sm transition-all duration-300 hover:border-[rgba(255,140,66,0.3)] hover:bg-neutral-900/50"
                >
                  <h3 className="text-lg font-light tracking-[0.1em] uppercase text-[#ff8c42] mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-neutral-400 leading-relaxed text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Section */}
        <section className="py-24 md:py-32 px-8 md:px-16 bg-black">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-[clamp(1.5rem,4vw,2.5rem)] font-extralight tracking-[0.15em] uppercase mb-6 text-white">
              Powered by WebGL2
            </h2>
            <p className="text-neutral-400 leading-relaxed mb-12 max-w-2xl mx-auto">
              Real-time ray marching through curved spacetime using Schwarzschild geodesics. Light
              paths are computed per-pixel to accurately simulate gravitational lensing, the photon
              sphere, and relativistic Doppler effects.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="px-5 py-2 text-xs tracking-[0.15em] uppercase border border-neutral-800 text-neutral-500 rounded-full"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-24 md:py-32 px-8 bg-gradient-to-b from-black to-[#0a0a0a]">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-[clamp(1.5rem,5vw,3rem)] font-extralight tracking-[0.1em] uppercase mb-6 bg-gradient-to-br from-white via-[#ff8c42] to-[#ff5e00] bg-clip-text text-transparent">
              Ready to Begin?
            </h2>
            <p className="text-neutral-500 mb-10">
              Step into the simulation and let your AI guide show you around
            </p>
            <Link
              href="/app"
              onClick={() => track('final_cta_click')}
              className="group inline-flex items-center gap-4 py-5 px-12 bg-[rgba(255,140,66,0.1)] border border-[#ff8c42] text-[#ff8c42] text-base font-normal tracking-[0.2em] uppercase no-underline cursor-pointer transition-all duration-300 hover:bg-[rgba(255,140,66,0.2)] hover:shadow-[0_0_40px_rgba(255,140,66,0.25)]"
            >
              <span>Begin Your Journey</span>
              <span className="transition-transform duration-300 group-hover:translate-x-2">
                &rarr;
              </span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
