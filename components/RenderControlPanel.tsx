'use client';

import { RENDER_PRESETS, DEFAULT_PRESET } from '@/lib/render/renderConfig';
import type { RenderProgress, RenderStatus, RenderQualityPreset } from '@/lib/render/types';
import type { CameraSequence } from '@/lib/camera/CameraController';

interface RenderControlPanelProps {
  sequences: Record<string, CameraSequence>;
  selectedSequence: string;
  selectedPreset: string;
  status: RenderStatus;
  progress: RenderProgress | null;
  onSequenceChange: (key: string) => void;
  onPresetChange: (key: string) => void;
  onStartRender: () => void;
  onCancelRender: () => void;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getSequenceDuration(sequence: CameraSequence): number {
  return sequence.steps.reduce((total, step) => total + (step.duration || 0), 0);
}

export function RenderControlPanel({
  sequences,
  selectedSequence,
  selectedPreset,
  status,
  progress,
  onSequenceChange,
  onPresetChange,
  onStartRender,
  onCancelRender,
}: RenderControlPanelProps) {
  const preset = RENDER_PRESETS[selectedPreset];
  const sequence = sequences[selectedSequence];
  const duration = sequence ? getSequenceDuration(sequence) : 0;
  const totalFrames = Math.ceil(duration * preset.fps);
  const isRendering = status === 'rendering';

  const progressPercent = progress ? (progress.currentFrame / progress.totalFrames) * 100 : 0;

  return (
    <div className="render-control-panel">
      <h2>Offline Render</h2>

      <div className="control-group">
        <label htmlFor="sequence-select">Sequence</label>
        <select
          id="sequence-select"
          value={selectedSequence}
          onChange={(e) => onSequenceChange(e.target.value)}
          disabled={isRendering}
        >
          {Object.entries(sequences).map(([key, seq]) => (
            <option key={key} value={key}>
              {seq.name} ({getSequenceDuration(seq)}s)
            </option>
          ))}
        </select>
      </div>

      <div className="control-group">
        <label htmlFor="preset-select">Quality</label>
        <select
          id="preset-select"
          value={selectedPreset}
          onChange={(e) => onPresetChange(e.target.value)}
          disabled={isRendering}
        >
          {Object.entries(RENDER_PRESETS).map(([key, p]) => (
            <option key={key} value={key}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="info-section">
        <div className="info-row">
          <span>Resolution</span>
          <span>
            {preset.resolution.width} x {preset.resolution.height}
          </span>
        </div>
        <div className="info-row">
          <span>Frame Rate</span>
          <span>{preset.fps} fps</span>
        </div>
        <div className="info-row">
          <span>Duration</span>
          <span>{duration}s</span>
        </div>
        <div className="info-row">
          <span>Total Frames</span>
          <span>{totalFrames}</span>
        </div>
        <div className="info-row">
          <span>Ray Steps</span>
          <span>{preset.rayMarching.maxSteps}</span>
        </div>
      </div>

      {isRendering && progress && (
        <div className="progress-section">
          <div className="progress-header">
            <span>Rendering...</span>
            <span>{progressPercent.toFixed(1)}%</span>
          </div>

          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>

          <div className="progress-details">
            <div className="progress-row">
              <span>Frame</span>
              <span>
                {progress.currentFrame + 1} / {progress.totalFrames}
              </span>
            </div>
            <div className="progress-row">
              <span>Elapsed</span>
              <span>{formatTime(progress.elapsedMs)}</span>
            </div>
            <div className="progress-row">
              <span>ETA</span>
              <span>{formatTime(progress.estimatedRemainingMs)}</span>
            </div>
            <div className="progress-row">
              <span>Speed</span>
              <span>{progress.framesPerSecond.toFixed(2)} fps</span>
            </div>
          </div>
        </div>
      )}

      {status === 'completed' && (
        <div className="status-message success">
          Render complete! Frames downloaded to your browser.
        </div>
      )}

      {status === 'cancelled' && <div className="status-message warning">Render cancelled.</div>}

      <div className="button-group">
        {!isRendering ? (
          <button className="start-button" onClick={onStartRender}>
            Start Render
          </button>
        ) : (
          <button className="cancel-button" onClick={onCancelRender}>
            Cancel
          </button>
        )}
      </div>

      <div className="help-text">
        <p>Frames will download automatically as they render.</p>
        <p>Set your browser to auto-download without prompts.</p>
        <p>
          To encode:{' '}
          <code>
            ffmpeg -framerate {preset.fps} -i frame_%05d.png -c:v libx264 -crf 18 -pix_fmt yuv420p
            output.mp4
          </code>
        </p>
      </div>

      <style jsx>{`
        .render-control-panel {
          position: fixed;
          top: 80px;
          left: 24px;
          width: 320px;
          background: rgba(10, 10, 10, 0.9);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 140, 66, 0.2);
          border-radius: 12px;
          padding: 20px;
          color: #fff;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 12px;
          z-index: 100;
        }

        h2 {
          margin: 0 0 16px 0;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #ff8c42;
        }

        .control-group {
          margin-bottom: 12px;
        }

        label {
          display: block;
          margin-bottom: 4px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        select {
          width: 100%;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 140, 66, 0.3);
          border-radius: 6px;
          color: #fff;
          font-family: inherit;
          font-size: 12px;
          cursor: pointer;
        }

        select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .info-section {
          margin: 16px 0;
          padding: 12px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-row span:first-child {
          color: rgba(255, 255, 255, 0.6);
        }

        .progress-section {
          margin: 16px 0;
          padding: 12px;
          background: rgba(255, 140, 66, 0.1);
          border: 1px solid rgba(255, 140, 66, 0.3);
          border-radius: 8px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .progress-bar {
          height: 8px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #ff8c42, #ffb366);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .progress-details {
          font-size: 11px;
        }

        .progress-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
        }

        .progress-row span:first-child {
          color: rgba(255, 255, 255, 0.6);
        }

        .status-message {
          margin: 16px 0;
          padding: 12px;
          border-radius: 8px;
          text-align: center;
        }

        .status-message.success {
          background: rgba(76, 175, 80, 0.2);
          border: 1px solid rgba(76, 175, 80, 0.4);
          color: #81c784;
        }

        .status-message.warning {
          background: rgba(255, 193, 7, 0.2);
          border: 1px solid rgba(255, 193, 7, 0.4);
          color: #ffd54f;
        }

        .button-group {
          margin-top: 16px;
        }

        button {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .start-button {
          background: linear-gradient(135deg, #ff8c42, #ff6b1a);
          color: #fff;
        }

        .start-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(255, 140, 66, 0.4);
        }

        .cancel-button {
          background: rgba(255, 82, 82, 0.2);
          border: 1px solid rgba(255, 82, 82, 0.4);
          color: #ff5252;
        }

        .cancel-button:hover {
          background: rgba(255, 82, 82, 0.3);
        }

        .help-text {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 10px;
          color: rgba(255, 255, 255, 0.5);
          line-height: 1.5;
        }

        .help-text p {
          margin: 4px 0;
        }

        .help-text code {
          display: block;
          margin-top: 8px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 4px;
          font-size: 9px;
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}
