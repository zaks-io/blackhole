export interface HDRSupport {
  hdr: boolean;
  colorGamut: 'srgb' | 'p3' | 'rec2020';
  details: string[];
}

export function detectHDRSupport(): HDRSupport {
  const details: string[] = [];

  // Check dynamic range via CSS media query
  const hdrMediaQuery = window.matchMedia('(dynamic-range: high)');
  const hasHighDynamicRange = hdrMediaQuery.matches;
  details.push(`Dynamic range: ${hasHighDynamicRange ? 'high' : 'standard'}`);

  // Check color gamut
  let colorGamut: 'srgb' | 'p3' | 'rec2020' = 'srgb';
  if (window.matchMedia('(color-gamut: rec2020)').matches) {
    colorGamut = 'rec2020';
  } else if (window.matchMedia('(color-gamut: p3)').matches) {
    colorGamut = 'p3';
  }
  details.push(`Color gamut: ${colorGamut}`);

  // Check for HDR canvas support (Chrome 94+)
  let canvasHDR = false;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { colorSpace: 'display-p3' });
    canvasHDR = ctx !== null;
    details.push(`Canvas P3: ${canvasHDR ? 'yes' : 'no'}`);
  } catch {
    details.push('Canvas P3: no');
  }

  return {
    hdr: hasHighDynamicRange,
    colorGamut,
    details,
  };
}
