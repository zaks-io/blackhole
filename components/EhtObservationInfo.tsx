import { CONFIG } from '@/lib/config';
import { getEhtEquivalentDistanceKm } from '@/lib/physics/eht';

interface EhtObservationInfoProps {
  schwarzschildRadiusKm: number;
  show: boolean;
}

function formatObservationDistance(km: number): string {
  const parsecs = km / 3.0856775814913673e13;
  if (parsecs < 0.1) return `${(km / 9.4607304725808e12).toFixed(2)} light-years`;
  if (parsecs < 1000) return `${(km / 9.4607304725808e12).toFixed(1)} light-years`;
  if (parsecs < 1e6) return `${(parsecs / 1000).toFixed(2)} kpc`;
  return `${(parsecs / 1e6).toFixed(1)} Mpc`;
}

export function EhtObservationInfo({ schwarzschildRadiusKm, show }: EhtObservationInfoProps) {
  if (!show) return null;

  const calibration = CONFIG.ehtBlur;
  const referenceDistanceKm = getEhtEquivalentDistanceKm(
    schwarzschildRadiusKm,
    calibration.referenceRingDiameterMicroarcseconds
  );
  const beamsAcrossRing =
    calibration.referenceRingDiameterMicroarcseconds / calibration.angularResolutionMicroarcseconds;

  return (
    <div className="eht-observation">
      <div className="section-title">EHT 2017 Calibration</div>
      <div className="info-row">
        <span className="label">Angular Resolution</span>
        <span className="value">{calibration.angularResolutionMicroarcseconds} μas</span>
      </div>
      <div className="info-row">
        <span className="label">Reference Ring</span>
        <span className="value">{calibration.referenceRingDiameterMicroarcseconds} μas</span>
      </div>
      <div className="info-row">
        <span className="label">Resolution Elements</span>
        <span className="value">{beamsAcrossRing.toFixed(2)} across</span>
      </div>
      <div className="info-row">
        <span className="label">42 μas Distance</span>
        <span className="value">{formatObservationDistance(referenceDistanceKm)}</span>
      </div>

      <style jsx>{`
        .eht-observation {
          padding: 8px 0 0;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .section-title {
          margin-bottom: 6px;
          color: rgba(255, 140, 66, 0.8);
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 3px 0;
        }

        .label,
        .value {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 10px;
        }

        .label {
          color: rgba(255, 255, 255, 0.7);
        }

        .value {
          color: rgba(255, 255, 255, 0.9);
          text-align: right;
        }
      `}</style>
    </div>
  );
}
