'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Link from 'next/link';

const ROLES_CLAIM = 'neuron/roles';

interface UserMenuProps {
  show?: boolean;
}

export function UserMenu({ show = true }: UserMenuProps) {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout } = useAuth0();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  if (isLoading) {
    return null;
  }

  const handleSignIn = () => {
    loginWithRedirect({
      appState: { returnTo: typeof window !== 'undefined' ? window.location.pathname : '/' }
    });
  };

  const handleSignOut = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  const roles = (user?.[ROLES_CLAIM] as string[] | undefined) ?? [];
  const isAdmin = roles.includes('admin');

  return (
    <div ref={menuRef} className={`user-menu ${show ? '' : 'hidden'}`}>
      {!isAuthenticated ? (
        <button className="sign-in-btn" onClick={handleSignIn}>
          Sign In
        </button>
      ) : (
        <div className="avatar-container">
          <button
            className="avatar-btn"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            {user?.picture ? (
              <img src={user.picture} alt={user.name || 'User'} className="avatar-img" />
            ) : (
              <div className="avatar-placeholder">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
              </div>
            )}
          </button>

          {dropdownOpen && (
            <div className="dropdown">
              <div className="dropdown-header">
                <span className="user-name">{user?.name || user?.email}</span>
              </div>
              {isAdmin && (
                <>
                  <Link href="/render" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                    Render
                  </Link>
                  <Link href="/dev" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                    Dev Controls
                  </Link>
                  <div className="dropdown-divider" />
                </>
              )}
              <button className="dropdown-item" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .user-menu {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 150;
          opacity: 1;
          transition: opacity 0.3s ease;
        }

        .user-menu.hidden {
          opacity: 0;
          pointer-events: none;
        }

        .sign-in-btn {
          padding: 10px 20px;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 140, 66, 0.3);
          border-radius: 8px;
          color: #ff8c42;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow:
            0 4px 20px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .sign-in-btn:hover {
          background: rgba(255, 140, 66, 0.15);
          border-color: rgba(255, 140, 66, 0.5);
          box-shadow: 0 0 20px rgba(255, 140, 66, 0.15);
        }

        .sign-in-btn:active {
          transform: scale(0.98);
        }

        .avatar-container {
          position: relative;
        }

        .avatar-btn {
          width: 40px;
          height: 40px;
          padding: 0;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 140, 66, 0.3);
          border-radius: 50%;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow:
            0 4px 20px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .avatar-btn:hover {
          border-color: rgba(255, 140, 66, 0.5);
          box-shadow: 0 0 20px rgba(255, 140, 66, 0.15);
        }

        .avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ff8c42;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 14px;
          font-weight: 500;
          text-transform: uppercase;
        }

        .dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 160px;
          background: rgba(10, 10, 10, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 140, 66, 0.2);
          border-radius: 10px;
          overflow: hidden;
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            0 0 40px rgba(255, 140, 66, 0.05);
          animation: fadeIn 0.15s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-header {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .user-name {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dropdown-item {
          width: 100%;
          padding: 12px 14px;
          background: none;
          border: none;
          text-align: left;
          color: rgba(255, 255, 255, 0.7);
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .dropdown-item:hover {
          background: rgba(255, 140, 66, 0.1);
          color: #ff8c42;
        }

        .dropdown-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
          margin: 4px 0;
        }

        :global(.dropdown-item) {
          display: block;
          width: 100%;
          padding: 12px 14px;
          background: none;
          border: none;
          text-align: left;
          color: rgba(255, 255, 255, 0.7);
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
        }

        :global(.dropdown-item:hover) {
          background: rgba(255, 140, 66, 0.1);
          color: #ff8c42;
        }

        @media (max-width: 600px) {
          .user-menu {
            top: 16px;
            right: 16px;
          }

          .sign-in-btn {
            padding: 8px 16px;
            font-size: 11px;
          }

          .avatar-btn {
            width: 36px;
            height: 36px;
          }
        }
      `}</style>
    </div>
  );
}
