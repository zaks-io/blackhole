'use client';

import dynamic from 'next/dynamic';

const AppView = dynamic(
  () => import('@/components/AppView'),
  {
    ssr: false,
    loading: () => (
      <div className="loading-placeholder">
        <span>Loading...</span>
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

export default function AppPage() {
  return <AppView />;
}
