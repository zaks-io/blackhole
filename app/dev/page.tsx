'use client';

import dynamic from 'next/dynamic';

// Dynamically import the simulation component with SSR disabled
// Three.js requires browser APIs (window, document, WebGL)
const BlackHoleSimulation = dynamic(
  () => import('@/components/BlackHoleSimulation'),
  { 
    ssr: false,
    loading: () => (
      <div className="loading-placeholder">
        <span>Loading dev environment...</span>
        <style jsx>{`
          .loading-placeholder {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
            color: #fff;
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
            font-size: 14px;
            letter-spacing: 0.1em;
          }
        `}</style>
      </div>
    )
  }
);

export default function DevPage() {
  return <BlackHoleSimulation showDevControls={true} showStats={true} />;
}

