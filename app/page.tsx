'use client';

import dynamic from 'next/dynamic';

const AppView = dynamic(() => import('@/components/AppView'), {
  ssr: false,
  loading: () => (
    <div className="loading-screen">
      <div className="loading-glow" />
      <span className="loading-text">INITIALIZING</span>
      <style jsx>{`
        .loading-screen {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
        }

        .loading-glow {
          position: absolute;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(255, 140, 66, 0.08) 0%,
            rgba(255, 94, 0, 0.03) 40%,
            transparent 70%
          );
          filter: blur(40px);
        }

        .loading-text {
          position: relative;
          color: rgba(255, 255, 255, 0.5);
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: 13px;
          letter-spacing: 0.2em;
          animation: pulse 1.8s ease-in-out infinite;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  ),
});

export default function Home() {
  return <AppView />;
}
