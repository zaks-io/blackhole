'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useConversation } from '@elevenlabs/react';
import { OverlayState } from '@/lib/types';

export interface VoiceAgentPopupProps {
  onClose: () => void;
  onPresetSelect: (preset: string) => void;
  onEhtBlurToggle: (enabled: boolean) => void;
  onOverlayToggle: (toggles: Partial<OverlayState>) => void;
  onContextualUpdateReady?: (sendUpdate: (text: string) => void) => void;
  onConnected?: () => void;
  autoConnect?: boolean;
}

const VALID_PRESETS = ['distant', 'orbit', 'flybyClose', 'topDown', 'edgeOn', 'eht', 'photonSphere', 'doppler', 'fallingIn'];
const VALID_OVERLAY_KEYS: (keyof OverlayState)[] = ['isco', 'photonSphere', 'eventHorizon', 'shadowEdge', 'doppler', 'scale'];

export function VoiceAgentPopup({ onClose, onPresetSelect, onEhtBlurToggle, onOverlayToggle, onContextualUpdateReady, onConnected, autoConnect = false }: VoiceAgentPopupProps) {
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const hasAutoConnected = useRef(false);

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
        const updates: Partial<OverlayState> = {};

        if (show) {
          for (const key of show) {
            if (VALID_OVERLAY_KEYS.includes(key as keyof OverlayState)) {
              updates[key as keyof OverlayState] = true;
            }
          }
        }
        if (hide) {
          for (const key of hide) {
            if (VALID_OVERLAY_KEYS.includes(key as keyof OverlayState)) {
              updates[key as keyof OverlayState] = false;
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          onOverlayToggle(updates);
          const enabled = show?.filter(k => VALID_OVERLAY_KEYS.includes(k as keyof OverlayState)) || [];
          const disabled = hide?.filter(k => VALID_OVERLAY_KEYS.includes(k as keyof OverlayState)) || [];
          let msg = '';
          if (enabled.length) msg += `Enabled: ${enabled.join(', ')}. `;
          if (disabled.length) msg += `Disabled: ${disabled.join(', ')}.`;
          return msg || 'No changes made.';
        }
        return `Invalid overlay keys. Valid: ${VALID_OVERLAY_KEYS.join(', ')}`;
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

  const { status, isSpeaking, sendContextualUpdate } = conversation;
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
        const res = await fetch('/api/voice-token');
        if (!res.ok) throw new Error('Failed to get token');
        const { token } = await res.json();
        await conversation.startSession({
          conversationToken: token,
          connectionType: 'webrtc',
        });
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
    if (isSpeaking) return 'Speaking...';
    if (isConnected) return 'Listening...';
    return 'Disconnected';
  };

  return (
    <div className="voice-popup">
      <div className="voice-header">
        <span className="voice-title">Voice Agent</span>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="voice-content">
        <div
          className={`status-indicator ${isConnected ? 'connected' : ''} ${isSpeaking ? 'speaking' : ''} ${isConnecting ? 'connecting' : ''}`}
        >
          <span className="status-dot" />
          <span className="status-text">{getStatusText()}</span>
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
          bottom: 100px;
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

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          transition: all 0.3s ease;
        }

        .status-indicator.connecting .status-dot {
          background: #ffa500;
          animation: pulse 1s ease-in-out infinite;
        }

        .status-indicator.connected .status-dot {
          background: #4ade80;
          box-shadow: 0 0 12px rgba(74, 222, 128, 0.5);
        }

        .status-indicator.speaking .status-dot {
          background: #ff8c42;
          box-shadow: 0 0 12px rgba(255, 140, 66, 0.5);
          animation: pulse 0.8s ease-in-out infinite;
        }

        .status-text {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
          letter-spacing: 0.05em;
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
            bottom: 90px;
            width: 200px;
          }
        }
      `}</style>
    </div>
  );
}
