'use client';

import { useAuth0 } from '@auth0/auth0-react';
import { ComponentType } from 'react';

const ROLES_CLAIM = 'neuron/roles';

interface Props {
  component: ComponentType;
  requiredRole?: string;
}

function LoadingScreen({ message }: { message: string }) {
  return (
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
      {message}
    </div>
  );
}

function PendingApproval() {
  const { logout } = useAuth0();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#000',
      color: '#fff',
      fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', monospace",
      padding: '2rem',
      textAlign: 'center',
    }}>
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 300,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        marginBottom: '1.5rem',
        background: 'linear-gradient(to bottom right, #fff, #ff8c42, #ff5e00)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Account Pending Approval
      </h1>
      <p style={{
        fontSize: '14px',
        color: '#999',
        maxWidth: '400px',
        lineHeight: 1.6,
        marginBottom: '2rem',
      }}>
        Your account has been registered. Once approved, you&apos;ll have access to the black hole simulation.
      </p>
      <button
        onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        style={{
          padding: '12px 24px',
          background: 'transparent',
          border: '1px solid rgba(255, 140, 66, 0.4)',
          color: '#ff8c42',
          fontSize: '12px',
          fontFamily: 'inherit',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.3s',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'rgba(255, 140, 66, 0.1)';
          e.currentTarget.style.borderColor = '#ff8c42';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'rgba(255, 140, 66, 0.4)';
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

function AccessDenied() {
  const { logout } = useAuth0();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#000',
      color: '#fff',
      fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', monospace",
      padding: '2rem',
      textAlign: 'center',
    }}>
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 300,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        marginBottom: '1.5rem',
        color: '#ff5e00',
      }}>
        Access Denied
      </h1>
      <p style={{
        fontSize: '14px',
        color: '#999',
        maxWidth: '400px',
        lineHeight: 1.6,
        marginBottom: '2rem',
      }}>
        You don&apos;t have permission to access this page.
      </p>
      <button
        onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        style={{
          padding: '12px 24px',
          background: 'transparent',
          border: '1px solid rgba(255, 140, 66, 0.4)',
          color: '#ff8c42',
          fontSize: '12px',
          fontFamily: 'inherit',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.3s',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'rgba(255, 140, 66, 0.1)';
          e.currentTarget.style.borderColor = '#ff8c42';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'rgba(255, 140, 66, 0.4)';
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

export function ProtectedRoute({ component: Component, requiredRole = 'Blackhole' }: Props) {
  const { isAuthenticated, isLoading, loginWithRedirect, user } = useAuth0();

  if (isLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (!isAuthenticated) {
    loginWithRedirect({
      appState: { returnTo: typeof window !== 'undefined' ? window.location.pathname : '/' }
    });
    return <LoadingScreen message="Redirecting to login..." />;
  }

  const roles = (user?.[ROLES_CLAIM] as string[] | undefined) ?? [];
  const hasBlackholeRole = roles.includes('Blackhole');
  const hasRequiredRole = roles.includes(requiredRole);

  if (!hasBlackholeRole) {
    return <PendingApproval />;
  }

  if (!hasRequiredRole) {
    return <AccessDenied />;
  }

  return <Component />;
}
