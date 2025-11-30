'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { track } from '@vercel/analytics';
import { useConversation } from '@elevenlabs/react';
import { useAuth0 } from '@auth0/auth0-react';
import { ToggleState } from '@/lib/types';
import { AudioVisualizer } from './AudioVisualizer';

export interface VoiceAgentPopupProps {
  onClose?: () => void;
  onPresetSelect: (preset: string) => void;
  onEhtBlurToggle: (enabled: boolean) => void;
  onOverlayToggle: (toggles: Partial<ToggleState>) => void;
  onContextualUpdateReady?: (sendUpdate: (text: string) => void) => void;
  onConnected?: () => void;
  autoConnect?: boolean;
}

const VALID_PRESETS = [
  'far',
  'default',
  'accretionDisk',
  'topDown',
  'edgeOn',
  'eht',
  'photonSphere',
  'doppler',
  'fallingIn',
];
const VALID_TOGGLE_KEYS: (keyof ToggleState)[] = [
  'isco',
  'eventHorizon',
  'doppler',
  'scale',
  'disk',
  'jets',
];

export function VoiceAgentPopup({
  onClose,
  onPresetSelect,
  onEhtBlurToggle,
  onOverlayToggle,
  onContextualUpdateReady,
  onConnected,
  autoConnect = false,
}: VoiceAgentPopupProps) {
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const hasAutoConnected = useRef(false);
  const { getIdTokenClaims } = useAuth0();

  const conversation = useConversation({
    clientTools: {
      setCameraPreset: ({ preset }: { preset: string }) => {
        if (VALID_PRESETS.includes(preset)) {
          onPresetSelect(preset);
          return `Camera moved to ${preset} view`;
        }
        return `Invalid preset. Valid options: ${VALID_PRESETS.join(', ')}`;
      },
      setEhtBlur: ({ enabled }: { enabled: boolean }) => {
        onEhtBlurToggle(enabled);
        return enabled ? 'EHT blur enabled' : 'EHT blur disabled';
      },
      setOverlays: ({ show, hide }: { show?: string[]; hide?: string[] }) => {
        const updates: Partial<ToggleState> = {};

        if (show) {
          for (const key of show) {
            if (VALID_TOGGLE_KEYS.includes(key as keyof ToggleState)) {
              updates[key as keyof ToggleState] = true;
            }
          }
        }
        if (hide) {
          for (const key of hide) {
            if (VALID_TOGGLE_KEYS.includes(key as keyof ToggleState)) {
              updates[key as keyof ToggleState] = false;
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          onOverlayToggle(updates);
          const enabled =
            show?.filter((k) => VALID_TOGGLE_KEYS.includes(k as keyof ToggleState)) || [];
          const disabled =
            hide?.filter((k) => VALID_TOGGLE_KEYS.includes(k as keyof ToggleState)) || [];
          let msg = '';
          if (enabled.length) msg += `Enabled: ${enabled.join(', ')}. `;
          if (disabled.length) msg += `Disabled: ${disabled.join(', ')}.`;
          return msg || 'No changes made.';
        }
        return `Invalid toggle keys. Valid: ${VALID_TOGGLE_KEYS.join(', ')}`;
      },
    },
    onError: (err) => {
      setError(typeof err === 'string' ? err : 'Connection error');
      setIsConnecting(false);
    },
    onDisconnect: () => {
      setIsConnecting(false);
    },
  });

  const {
    status,
    isSpeaking,
    sendContextualUpdate,
    getInputByteFrequencyData,
    getOutputByteFrequencyData,
  } = conversation;
  const isConnected = status === 'connected';

  useEffect(() => {
    if (onContextualUpdateReady) {
      onContextualUpdateReady(sendContextualUpdate);
    }
  }, [onContextualUpdateReady, sendContextualUpdate]);

  useEffect(() => {
    if (isConnected && onConnected) {
      onConnected();
    }
  }, [isConnected, onConnected]);

  const handleToggle = useCallback(async () => {
    if (isConnected) {
      await conversation.endSession();
    } else {
      setError(null);
      setIsConnecting(true);
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const claims = await getIdTokenClaims();
        const res = await fetch('/api/voice-token', {
          headers: { Authorization: `Bearer ${claims?.__raw}` },
        });
        if (!res.ok) throw new Error('Failed to get token');
        const { token } = await res.json();
        await conversation.startSession({
          conversationToken: token,
          connectionType: 'webrtc',
        });
        track('voice_agent_activated');
        setIsConnecting(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        setIsConnecting(false);
      }
    }
  }, [conversation, isConnected]);

  useEffect(() => {
    if (autoConnect && !hasAutoConnected.current) {
      hasAutoConnected.current = true;
      handleToggle();
    }
  }, [autoConnect, handleToggle]);

  const getStatusText = () => {
    if (isConnecting) return 'Connecting...';
    if (!isConnected) return 'Disconnected';
    if (isSpeaking) return 'Speaking...';
    return 'Listening...';
  };

  return (
    <div className="voice-popup">
      <div className="voice-header">
        <span className="voice-title">Voice Agent</span>
        {onClose && (
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      <div className="voice-content">
        <div className="visualizer-container">
          <AudioVisualizer
            getInputFrequencyData={getInputByteFrequencyData}
            getOutputFrequencyData={getOutputByteFrequencyData}
            isConnected={isConnected}
            isSpeaking={isSpeaking}
          />
          <span className={`status-text ${isConnecting ? 'connecting' : ''}`}>
            {getStatusText()}
          </span>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button
          className={`voice-btn ${isConnected ? 'active' : ''}`}
          onClick={handleToggle}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting...' : isConnected ? 'End' : 'Start'}
        </button>
      </div>

      <style jsx>{`
        .voice-popup {
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

        .voice-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .voice-title {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.7);
        }

        .close-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 18px;
          cursor: pointer;
          padding: 0 4px;
          line-height: 1;
          transition: color 0.2s ease;
        }

        .close-btn:hover {
          color: #ff8c42;
        }

        .voice-content {
          padding: 20px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .visualizer-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .status-text {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
          letter-spacing: 0.05em;
        }

        .status-text.connecting {
          animation: pulse 1s ease-in-out infinite;
        }

        .error-text {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 10px;
          color: #ef4444;
          text-align: center;
          padding: 0 8px;
        }

        .voice-btn {
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

        .voice-btn:hover:not(:disabled) {
          background: rgba(255, 140, 66, 0.25);
          border-color: rgba(255, 140, 66, 0.5);
          box-shadow: 0 0 20px rgba(255, 140, 66, 0.15);
        }

        .voice-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .voice-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .voice-btn.active {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.3);
          color: #ef4444;
        }

        .voice-btn.active:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.5);
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.7;
          }
        }

        @media (max-width: 600px) {
          .voice-popup {
            right: 16px;
            bottom: 24px;
            width: 200px;
          }
        }
      `}</style>
    </div>
  );
}
