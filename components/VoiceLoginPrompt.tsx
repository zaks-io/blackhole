'use client';

import { useAuth0 } from '@auth0/auth0-react';

export function VoiceLoginPrompt() {
  const { loginWithRedirect } = useAuth0();

  const handleSignIn = () => {
    loginWithRedirect({
      appState: { returnTo: typeof window !== 'undefined' ? window.location.pathname : '/' }
    });
  };

  return (
    <div className="voice-login-prompt">
      <div className="prompt-header">
        <span className="prompt-title">Voice Guide</span>
      </div>

      <div className="prompt-content">
        <p className="prompt-text">Sign in to unlock the AI voice guide</p>

        <button className="sign-in-btn" onClick={handleSignIn}>
          Sign In
        </button>
      </div>

      <style jsx>{`
        .voice-login-prompt {
          position: fixed;
          bottom: 32px;
          right: 32px;
          width: 220px;
          background: rgba(10, 10, 10, 0.9);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 140, 66, 0.2);
          border-radius: 16px;
          z-index: 150;
          overflow: hidden;
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            0 0 40px rgba(255, 140, 66, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .prompt-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .prompt-title {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.7);
        }

        .prompt-content {
          padding: 20px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .prompt-text {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          text-align: center;
          margin: 0;
          line-height: 1.5;
        }

        .sign-in-btn {
          padding: 10px 32px;
          background: rgba(255, 140, 66, 0.15);
          border: 1px solid rgba(255, 140, 66, 0.3);
          border-radius: 10px;
          color: #ff8c42;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .sign-in-btn:hover {
          background: rgba(255, 140, 66, 0.25);
          border-color: rgba(255, 140, 66, 0.5);
          box-shadow: 0 0 20px rgba(255, 140, 66, 0.15);
        }

        .sign-in-btn:active {
          transform: scale(0.98);
        }

        @media (max-width: 600px) {
          .voice-login-prompt {
            right: 16px;
            bottom: 24px;
            width: 200px;
          }
        }
      `}</style>
    </div>
  );
}
