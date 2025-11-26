'use client';

import dynamic from 'next/dynamic';

// Dynamically import the entire simulation with controls
// Everything is in the same module scope - no cross-module issues
const SimulationWithControls = dynamic(
  () => import('@/components/SimulationWithControls'),
  { 
    ssr: false,
    loading: () => (
      <div className="loading-placeholder">
        <span>Loading simulation...</span>
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

export default function SimulationPage() {
  return <SimulationWithControls />;
}
