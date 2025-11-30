'use client';

import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const RenderView = dynamic(
  () => import('@/components/RenderView').then((mod) => mod.RenderView),
  {
    ssr: false,
    loading: () => (
      <div className="loading-placeholder">
        <span>Loading render environment...</span>
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
    ),
  }
);

function RenderContent() {
  return <RenderView />;
}

export default function RenderPage() {
  return <ProtectedRoute component={RenderContent} requiredRole="admin" />;
}
