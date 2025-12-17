'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { BinaryAudioController } from '@/lib/audio';

interface SoundToggleButtonProps {
  onToggle: (enabled: boolean) => void;
  defaultEnabled?: boolean;
  audioController?: BinaryAudioController | null;
}

export function SoundToggleButton({
  onToggle,
  defaultEnabled = false,
  audioController,
}: SoundToggleButtonProps) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [audioLevel, setAudioLevel] = useState(0);
  const rafRef = useRef<number | null>(null);

  const handleClick = useCallback(() => {
    const newState = !enabled;
    setEnabled(newState);
    onToggle(newState);
  }, [enabled, onToggle]);

  // Poll audio level for visualization
  useEffect(() => {
    if (!enabled || !audioController) {
      return;
    }

    const updateLevel = () => {
      const level = audioController.getAudioLevel();
      setAudioLevel(level);
      rafRef.current = requestAnimationFrame(updateLevel);
    };

    rafRef.current = requestAnimationFrame(updateLevel);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        setAudioLevel(0);
      }
    };
  }, [enabled, audioController]);

  const glowIntensity = Math.min(audioLevel * 3, 1);
  const glowSize = 8 + audioLevel * 24;

  return (
    <button
      onClick={handleClick}
      className="sound-toggle"
      aria-label={enabled ? 'Mute sound' : 'Enable sound'}
      title={enabled ? 'Mute sound' : 'Enable sound'}
      style={
        enabled
          ? {
              boxShadow: `0 0 ${glowSize}px rgba(100, 200, 255, ${glowIntensity * 0.6})`,
            }
          : undefined
      }
    >
      {enabled ? (
        <svg
          width="24"
          height="24"
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
          width="24"
          height="24"
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
      <style jsx>{`
        .sound-toggle {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition:
            background 0.2s ease,
            border-color 0.2s ease,
            transform 0.2s ease;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }
        .sound-toggle:hover {
          background: rgba(0, 0, 0, 0.8);
          border-color: rgba(255, 255, 255, 0.4);
          transform: scale(1.05);
        }
        .sound-toggle:active {
          transform: scale(0.95);
        }
      `}</style>
    </button>
  );
}
