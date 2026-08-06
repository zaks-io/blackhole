'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { track } from '@vercel/analytics';
import { useConversation } from '@elevenlabs/react';
import { useAuth0 } from '@auth0/auth0-react';
import { ToggleState } from '@/lib/types';
import { AudioVisualizer } from './AudioVisualizer';
import type { BinaryAudioController } from '@/lib/audio';

export interface VoiceAgentPopupProps {
  onClose?: () => void;
  onPresetSelect: (preset: string) => void;
  onEhtBlurToggle: (enabled: boolean) => void;
  onOverlayToggle: (toggles: Partial<ToggleState>) => void;
  onContextualUpdateReady?: (sendUpdate: (text: string) => void) => void;
  onConnected?: () => void;
  autoConnect?: boolean;
  audioController?: BinaryAudioController | null;
  onSoundToggle?: (enabled: boolean) => void;
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
  'eventHorizon',
  'disk',
  'audio',
  'binary',
  'wormhole',
];

export function VoiceAgentPopup({
  onClose,
  onPresetSelect,
  onEhtBlurToggle,
  onOverlayToggle,
  onContextualUpdateReady,
  onConnected,
  autoConnect = false,
  audioController,
  onSoundToggle,
}: VoiceAgentPopupProps) {
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const hasAutoConnected = useRef(false);
  const audioRafRef = useRef<number | null>(null);
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

  // Poll audio level for visualization
  useEffect(() => {
    if (!soundEnabled || !audioController) {
      return;
    }

    const updateLevel = () => {
      const level = audioController.getAudioLevel();
      setAudioLevel(level);
      audioRafRef.current = requestAnimationFrame(updateLevel);
    };

    audioRafRef.current = requestAnimationFrame(updateLevel);

    return () => {
      if (audioRafRef.current) {
        cancelAnimationFrame(audioRafRef.current);
        setAudioLevel(0);
      }
    };
  }, [soundEnabled, audioController]);

  const handleSoundToggle = useCallback(() => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    onSoundToggle?.(newState);
  }, [soundEnabled, onSoundToggle]);

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
        <div className="header-actions">
          {onSoundToggle && (
            <button
              className={`sound-btn ${soundEnabled ? 'active' : ''}`}
              onClick={handleSoundToggle}
              aria-label={soundEnabled ? 'Mute background music' : 'Enable background music'}
              title="Background"
              style={
                soundEnabled
                  ? {
                      boxShadow: `0 0 ${8 + audioLevel * 24}px rgba(100, 200, 255, ${Math.min(audioLevel * 3, 1) * 0.6})`,
                    }
                  : undefined
              }
            >
              {soundEnabled ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              )}
            </button>
          )}
          {onClose && (
            <button className="close-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
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

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sound-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition:
            color 0.2s ease,
            background 0.2s ease;
        }

        .sound-btn:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.1);
        }

        .sound-btn.active {
          color: rgba(100, 200, 255, 0.9);
        }

        .sound-btn.active:hover {
          color: rgba(100, 200, 255, 1);
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
