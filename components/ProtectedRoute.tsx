'use client';

import { withAuthenticationRequired } from '@auth0/auth0-react';
import { ComponentType } from 'react';

interface Props {
  component: ComponentType;
}

export function ProtectedRoute({ component: Component }: Props) {
  const Protected = withAuthenticationRequired(Component, {
    onRedirecting: () => (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', monospace",
        fontSize: '14px',
        letterSpacing: '0.1em',
      }}>
        Redirecting to login...
      </div>
    ),
    returnTo: () => typeof window !== 'undefined' ? window.location.pathname : '/',
  });

  return <Protected />;
}
