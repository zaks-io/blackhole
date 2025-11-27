'use client';

import { useRef, useEffect, useState } from 'react';

interface AudioVisualizerProps {
  getInputFrequencyData: (() => Uint8Array | undefined) | undefined;
  getOutputFrequencyData: (() => Uint8Array | undefined) | undefined;
  isConnected: boolean;
  isSpeaking: boolean;
  size?: number;
}

const PARTICLE_COUNT = 24;
const SMOOTHING = 0.15;
const SPEAKING_DEBOUNCE_MS = 400;

const COLORS = {
  input: {
    base: [74, 222, 128] as const, // Green for user
    glow: 'rgba(74, 222, 128, 0.5)',
  },
  output: {
    base: [255, 140, 66] as const,
    glow: 'rgba(255, 140, 66, 0.5)',
  },
  center: {
    connected: '#4ade80',
    speaking: '#ff8c42',
    disconnected: 'rgba(255, 255, 255, 0.3)',
  },
};

function sampleFrequencyData(data: Uint8Array | undefined, count: number): number[] {
  if (!data || data.length === 0) {
    return new Array(count).fill(0);
  }
  const step = Math.floor(data.length / count);
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = i * step;
    result.push(data[idx] / 255);
  }
  return result;
}

export function AudioVisualizer({
  getInputFrequencyData,
  getOutputFrequencyData,
  isConnected,
  isSpeaking,
  size = 120,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const smoothedInputRef = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT));
  const smoothedOutputRef = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT));
  const rotationRef = useRef({ inner: 0, outer: 0 });

  // Debounce isSpeaking to prevent flickering between paragraphs
  const [debouncedSpeaking, setDebouncedSpeaking] = useState(false);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isSpeaking) {
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
        speakingTimeoutRef.current = null;
      }
      setDebouncedSpeaking(true);
    } else {
      speakingTimeoutRef.current = setTimeout(() => {
        setDebouncedSpeaking(false);
      }, SPEAKING_DEBOUNCE_MS);
    }

    return () => {
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, [isSpeaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;
    const eventHorizonRadius = 10;
    const innerRingRadius = 22;
    const outerRingRadius = 38;

    const drawEventHorizon = () => {
      // Solid center circle
      let fillColor: string;
      let glowColor: string;
      if (debouncedSpeaking) {
        fillColor = COLORS.center.speaking;
        glowColor = 'rgba(255, 140, 66, 0.6)';
      } else if (isConnected) {
        fillColor = COLORS.center.connected;
        glowColor = 'rgba(74, 222, 128, 0.5)';
      } else {
        fillColor = COLORS.center.disconnected;
        glowColor = 'transparent';
      }

      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(centerX, centerY, eventHorizonRadius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.restore();
    };

    const drawRing = (
      radius: number,
      data: Float32Array,
      rotation: number,
      colorBase: readonly [number, number, number],
      glowColor: string,
      isActive: boolean
    ) => {
      const baseOpacity = isActive ? 0.2 : 0.1;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const value = data[i];
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + rotation;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        const particleSize = 2 + value * 4;
        const opacity = baseOpacity + value * 0.8;

        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 6 + value * 10;

        ctx.beginPath();
        ctx.arc(x, y, particleSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colorBase[0]}, ${colorBase[1]}, ${colorBase[2]}, ${opacity})`;
        ctx.fill();
        ctx.restore();
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, size, size);

      // Get frequency data
      const inputData = getInputFrequencyData?.();
      const outputData = getOutputFrequencyData?.();

      const rawInput = sampleFrequencyData(inputData, PARTICLE_COUNT);
      const rawOutput = sampleFrequencyData(outputData, PARTICLE_COUNT);

      // Apply smoothing
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        smoothedInputRef.current[i] =
          smoothedInputRef.current[i] * (1 - SMOOTHING) + rawInput[i] * SMOOTHING;
        smoothedOutputRef.current[i] =
          smoothedOutputRef.current[i] * (1 - SMOOTHING) + rawOutput[i] * SMOOTHING;
      }

      // Update rotation only when connected
      if (isConnected) {
        rotationRef.current.inner -= 0.008;
        rotationRef.current.outer += 0.005;
      }

      // Draw outer ring (AI output - orange)
      drawRing(
        outerRingRadius,
        smoothedOutputRef.current,
        rotationRef.current.outer,
        COLORS.output.base,
        COLORS.output.glow,
        debouncedSpeaking
      );

      // Draw inner ring (User input - green)
      drawRing(
        innerRingRadius,
        smoothedInputRef.current,
        rotationRef.current.inner,
        COLORS.input.base,
        COLORS.input.glow,
        isConnected
      );

      // Draw event horizon
      drawEventHorizon();

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [size, isConnected, debouncedSpeaking, getInputFrequencyData, getOutputFrequencyData]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: 'block' }}
    />
  );
}
