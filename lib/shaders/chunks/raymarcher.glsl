// ============================================================================
// Ray Marching
// ============================================================================

// Trace a single ray and return the color + TAA mask in alpha
vec4 traceRay(vec2 uv) {
  // Ray from camera through pixel
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = inverseProjection * clip;
  viewPos = vec4(viewPos.xy, -1.0, 0.0);
  vec3 rayDir = normalize((inverseView * viewPos).xyz);
  vec3 rayPos = cameraPos;

  float camDist = length(cameraPos);
  float lod = calculateLOD(camDist);

  // Per-pixel ray start offset to break banding patterns
  // This desynchronizes sampling shells between neighboring pixels
  if (stepJitter > 0.5) {
    float startOffset = interleavedGradientNoise(uv * resolution) * 0.2;
    rayPos = rayPos + rayDir * startOffset;
  }

  // Ray classification based on impact parameter (b = perpendicular distance to BH)
  // Rays with b > diskOuterRadius cannot hit the disk - use faster path
  float impactParam = computeImpactParameter(rayPos, rayDir);
  float effectiveDiskOuter = binaryEnabled > 0.5 ? circumbinaryOuterRadius : diskOuterRadius;
  bool canHitDisk = impactParam < effectiveDiskOuter * 1.2;
  float stepMultiplier = canHitDisk ? 1.0 : 1.5;
  int effectiveMaxSteps = canHitDisk ? maxSteps : (maxSteps * 2) / 3;

  vec3 color = vec3(0.0);
  vec4 diskAccum = vec4(0.0);
  vec4 overlayAccum = vec4(0.0); // Accumulated overlay contributions
  bool hitHorizon = false;
  bool escaped = false;

  // Track minimum radius for black hole edge mask and photon sphere glow
  float minRadius = 1000.0;

  // Track disk plane crossings for higher-order photon ring images
  int diskCrossings = 0;

  float h = baseStepSize;

  // Precompute loop invariants for performance
  float rsSq = rs * rs;
  float escapeThreshold = max(camDist * 2.0, 100.0);
  float diskInnerSq = diskInnerRadius * diskInnerRadius;
  float diskOuterSq = diskOuterRadius * diskOuterRadius;

  for (int i = 0; i < 300; i++) {
    if (i >= effectiveMaxSteps) break;

    // Use squared distance to avoid sqrt when possible
    float rSq = dot(rayPos, rayPos);
    float r = sqrt(rSq);

    // Track closest approach to black hole (use nearest BH in binary mode)
    if (binaryEnabled > 0.5) {
      float r1 = length(rayPos - getBH1World());
      float r2 = length(rayPos - getBH2World());
      minRadius = min(minRadius, min(r1, r2));
    } else {
      minRadius = min(minRadius, r);
    }

    // Early opacity exit - stop if disk is fully opaque
    if (diskAccum.a > 0.98) break;

    // Event horizon check (single or binary)
    if (binaryEnabled > 0.5) {
      if (checkBinaryHorizon(rayPos)) {
        hitHorizon = true;
        break;
      }
    } else {
      if (rSq < rsSq) {
        hitHorizon = true;
        break;
      }
    }

    vec3 rHat = rayPos / r;
    float radialVel = dot(rayDir, rHat);
    if (r > escapeThreshold && radialVel > 0.0) {
      color = sampleStarfield(rayDir);
      escaped = true;
      break;
    }

    // Gravitational acceleration (single or binary)
    float accel;
    vec3 dv;
    if (binaryEnabled > 0.5) {
      vec3 accelVec = computeBinaryAcceleration(rayPos, rayDir);
      dv = accelVec * h;
      accel = length(accelVec); // Scalar magnitude for curvature adaptation
    } else {
      float vDotR = radialVel;
      float vPerpSq = 1.0 - vDotR * vDotR;
      accel = -1.5 * rs * vPerpSq / rSq;
      dv = accel * rHat * h;
    }
    rayDir = normalize(rayDir + dv);

    float prevY = rayPos.y;

    // Base step size (original distance-based)
    float baseStep = h * max(1.0, (r - rs) / rs);

    // Curvature adaptation - smaller steps in high-curvature regions
    float curvatureMultiplier = 1.0;
    if (curvatureAdaptation > 0.0) {
      float photonSphereCurvature = 1.5 * rs / (2.25 * rs * rs);
      float normalizedCurvature = clamp(abs(accel) / photonSphereCurvature, 0.0, 1.0);
      // More aggressive adaptation: 0.15 minimum multiplier (was 0.3)
      // Higher curvatureAdaptation values push the multiplier lower
      float minMultiplier = max(0.15, 0.4 - curvatureAdaptation * 0.1);
      curvatureMultiplier = mix(1.0, minMultiplier, normalizedCurvature * normalizedCurvature * curvatureAdaptation);
    }

    // Optional jitter to break up banding patterns
    float jitterMultiplier = 1.0;
    if (stepJitter > 0.5) {
      vec2 pixelCoord = vUv * resolution;
      float stepNoise = interleavedGradientNoise(pixelCoord + float(i) * 7.23);
      jitterMultiplier = 0.8 + 0.4 * stepNoise;
    }

    // Combined step (stepMultiplier allows larger steps for rays that won't hit disk)
    float stepSize = baseStep * curvatureMultiplier * jitterMultiplier * stepMultiplier;
    // Minimum 0.01 (was 0.02) allows finer sampling in high-distortion regions
    stepSize = clamp(stepSize, 0.01, 0.75);

    vec3 newPos = rayPos + rayDir * stepSize;
    float currY = newPos.y;

    // Disk plane crossing detection - track multiple crossings for photon rings
    // Skip expensive disk sampling for rays that can't reach the disk
    if (prevY * currY < 0.0 && canHitDisk) {
      float t = abs(prevY) / (abs(prevY) + abs(currY));
      vec3 hitPos = mix(rayPos, newPos, t);
      float hitR = length(hitPos.xz);

      // Binary mode: sample three independent disks and blend additively
      if (binaryEnabled > 0.5) {
        // Sample mini-disk around BH1
        vec4 disk1 = sampleMiniDisk(hitPos, rayDir, bh1Pos, binaryMass1, diskCrossings, lod, minRadius);

        // Sample mini-disk around BH2
        vec4 disk2 = sampleMiniDisk(hitPos, rayDir, bh2Pos, binaryMass2, diskCrossings, lod, minRadius);

        // Sample circumbinary disk (outer disk)
        vec4 diskCB = sampleCircumbinaryDisk(hitPos, rayDir, diskCrossings, lod, minRadius);

        // Additive blend - all are light emitters
        vec4 combined;
        combined.rgb = disk1.rgb * disk1.a + disk2.rgb * disk2.a + diskCB.rgb * diskCB.a;
        combined.a = min(disk1.a + disk2.a + diskCB.a, 0.98);

        if (combined.a > 0.01) {
          float remaining = 1.0 - diskAccum.a;
          diskAccum.rgb += combined.rgb * remaining;
          diskAccum.a += combined.a * remaining;

          if (diskAccum.a > 0.99 && diskCrossings >= 2) break;
        }
      }
      // Single BH mode: original behavior
      else {
        // For direct disk hits (first crossing or within disk bounds)
        if (hitR > diskInnerRadius && hitR < diskOuterRadius) {
          vec4 newDisk = sampleDisk(hitPos, rayDir, hitR, diskCrossings, lod, minRadius);
          float remaining = 1.0 - diskAccum.a;
          diskAccum.rgb += newDisk.rgb * newDisk.a * remaining;
          diskAccum.a += newDisk.a * remaining;

          if (diskAccum.a > 0.99 && diskCrossings >= 2) break;
        }
        // For photon rings: rays that cross near the photon sphere (1.5rs to 3rs)
        // are lensed images of the disk - sample the disk at a mapped radius
        else if (hitR > rs * 1.5 && hitR < diskInnerRadius && diskCrossings > 0) {
          // Use logarithmic mapping to prevent excessive compression near photon sphere
          // This spreads the disk content more evenly across the photon ring
          // Using precomputed log bounds (photonRingLogInner/Outer) for performance
          float logHit = log(hitR);
          float photonRingFrac = (logHit - photonRingLogInner) / (photonRingLogOuter - photonRingLogInner);

          // Map across the full disk range (using precomputed diskRadiusRange)
          float mappedR = diskInnerRadius + photonRingFrac * diskRadiusRange;

          // Create a virtual hit position at the mapped radius
          vec3 virtualHitPos = vec3(hitPos.x, 0.0, hitPos.z) * (mappedR / hitR);

          // Pass minRadius for proper gravitational redshift of photon ring light
          // The crossingIndex and minRadius together handle the dimming physics
          vec4 newDisk = sampleDisk(virtualHitPos, rayDir, mappedR, diskCrossings, lod, minRadius);

          float remaining = 1.0 - diskAccum.a;
          diskAccum.rgb += newDisk.rgb * newDisk.a * remaining;
          diskAccum.a += newDisk.a * remaining;
        }
      }

      // Check disk-plane overlay rings at this crossing (skip if no overlays enabled)
      if (anyOverlayEnabled > 0.5) {
        float ringThickness = 0.15 * rs;

        // ISCO ring (3rs) - Cyan
        if (overlayIsco > 0.0) {
          vec4 ring = renderDiskPlaneRing(newPos, rayPos, 3.0 * rs, ringThickness, vec3(0.0, 0.85, 0.85), overlayIsco);
          overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
          overlayAccum.a = max(overlayAccum.a, ring.a);
        }

        // Event horizon ring - Red - placed at 1.1rs to ensure rays detect it before terminating at horizon
        if (overlayEventHorizon > 0.0) {
          if (binaryEnabled > 0.5) {
            // BH1 horizon ring
            vec3 bh1 = getBH1World();
            vec4 ring1 = renderDiskPlaneRing(newPos - bh1, rayPos - bh1, getBH1Rs() * 1.1, ringThickness, vec3(1.0, 0.15, 0.15), overlayEventHorizon);
            overlayAccum.rgb += ring1.rgb * (1.0 - overlayAccum.a);
            overlayAccum.a = max(overlayAccum.a, ring1.a);

            // BH2 horizon ring
            vec3 bh2 = getBH2World();
            vec4 ring2 = renderDiskPlaneRing(newPos - bh2, rayPos - bh2, getBH2Rs() * 1.1, ringThickness, vec3(1.0, 0.15, 0.15), overlayEventHorizon);
            overlayAccum.rgb += ring2.rgb * (1.0 - overlayAccum.a);
            overlayAccum.a = max(overlayAccum.a, ring2.a);
          } else {
            vec4 ring = renderDiskPlaneRing(newPos, rayPos, rs * 1.1, ringThickness, vec3(1.0, 0.15, 0.15), overlayEventHorizon);
            overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
            overlayAccum.a = max(overlayAccum.a, ring.a);
          }
        }
      }

      // Increment crossing counter regardless of whether we hit the disk
      // This tracks ray orbits around the black hole
      diskCrossings++;
    }

    // Scale rings at 5rs intervals - elevated above disk plane for visibility
    // Only check when ray crosses the scale ring planes (y = ±1.5*rs)
    if (anyOverlayEnabled > 0.5 && overlayScale > 0.0) {
      float scaleHeight = 1.5 * rs;
      float scaleThickness = 0.2 * rs;
      vec3 scaleColor = vec3(0.7, 0.7, 0.75);

      // Check plane crossings (branchless)
      float crossedUpper = step(0.0, -(prevY - scaleHeight) * (currY - scaleHeight));
      float crossedLower = step(0.0, -(prevY + scaleHeight) * (currY + scaleHeight));

      if (crossedUpper > 0.0 || crossedLower > 0.0) {
        // Unrolled loop for 5rs, 10rs, 15rs rings
        // 5rs rings
        vec4 ring5up = renderHorizontalRing(newPos, rayPos, 5.0 * rs, scaleHeight, scaleThickness, scaleColor, overlayScale) * crossedUpper;
        vec4 ring5dn = renderHorizontalRing(newPos, rayPos, 5.0 * rs, -scaleHeight, scaleThickness, scaleColor, overlayScale) * crossedLower;
        // 10rs rings
        vec4 ring10up = renderHorizontalRing(newPos, rayPos, 10.0 * rs, scaleHeight, scaleThickness, scaleColor, overlayScale) * crossedUpper;
        vec4 ring10dn = renderHorizontalRing(newPos, rayPos, 10.0 * rs, -scaleHeight, scaleThickness, scaleColor, overlayScale) * crossedLower;
        // 15rs rings
        vec4 ring15up = renderHorizontalRing(newPos, rayPos, 15.0 * rs, scaleHeight, scaleThickness, scaleColor, overlayScale) * crossedUpper;
        vec4 ring15dn = renderHorizontalRing(newPos, rayPos, 15.0 * rs, -scaleHeight, scaleThickness, scaleColor, overlayScale) * crossedLower;

        // Accumulate all rings
        float remaining = 1.0 - overlayAccum.a;
        overlayAccum.rgb += (ring5up.rgb + ring5dn.rgb + ring10up.rgb + ring10dn.rgb + ring15up.rgb + ring15dn.rgb) * remaining;
        overlayAccum.a = max(overlayAccum.a, max(max(ring5up.a, ring5dn.a), max(max(ring10up.a, ring10dn.a), max(ring15up.a, ring15dn.a))));
      }
    }

    rayPos = newPos;

    // Volumetric disk sampling with configurable thickness
    // Skip for rays that can't reach the disk based on impact parameter
    if (canHitDisk) {
      float effectiveThickness = thickDiskEnabled > 0.5 ? thickDiskHalfThickness : diskHalfThickness;
      float absY = abs(rayPos.y);
      if (absY < effectiveThickness) {
        float hitR = length(rayPos.xz);
        vec2 hitPos2D = rayPos.xz;

        // Check if within disk bounds (single or binary)
        bool inDiskBounds = false;
        if (binaryEnabled > 0.5) {
          // For binary, check against circumbinary outer radius
          inDiskBounds = hitR < circumbinaryOuterRadius;
        } else {
          inDiskBounds = hitR > diskInnerRadius && hitR < diskOuterRadius;
        }

        if (inDiskBounds) {
          float normalizedY = absY / effectiveThickness;

          // Vertical density profile
          float verticalDensity;
          if (thickDiskEnabled > 0.5) {
            // Gaussian profile for thick disk (more realistic puffy appearance)
            float sigma = thickDiskPuffiness;
            verticalDensity = exp(-normalizedY * normalizedY / (2.0 * sigma * sigma));
          } else {
            // Original quadratic falloff for thin disk
            verticalDensity = pow(1.0 - normalizedY, 2.0);
          }

          // LOD-based sample skipping for thick disk
          bool shouldSample = true;
          if (thickDiskEnabled > 0.5 && lod < 0.7) {
            int skipRate = lod < 0.3 ? 3 : 2;
            shouldSample = (i % skipRate == 0);
          }

          if (shouldSample) {
            vec3 projectedPos = vec3(rayPos.x, 0.0, rayPos.z);
            vec4 volColor;

            if (binaryEnabled > 0.5) {
              // Sample all three disks for volumetric
              vec4 vol1 = sampleMiniDisk(projectedPos, rayDir, bh1Pos, binaryMass1, diskCrossings, lod, minRadius);
              vec4 vol2 = sampleMiniDisk(projectedPos, rayDir, bh2Pos, binaryMass2, diskCrossings, lod, minRadius);
              vec4 volCB = sampleCircumbinaryDisk(projectedPos, rayDir, diskCrossings, lod, minRadius);

              // Additive blend
              volColor.rgb = vol1.rgb * vol1.a + vol2.rgb * vol2.a + volCB.rgb * volCB.a;
              volColor.a = min(vol1.a + vol2.a + volCB.a, 0.95);
            } else {
              volColor = sampleDisk(projectedPos, rayDir, hitR, diskCrossings, lod, minRadius);
            }

            // Adjust alpha for sample skipping
            float skipMultiplier = 1.0;
            if (thickDiskEnabled > 0.5 && lod < 0.7) {
              skipMultiplier = lod < 0.3 ? 3.0 : 2.0;
            }

            float volAlpha = volColor.a * verticalDensity * diskVolumeDensity * stepSize * skipMultiplier;
            float remaining = 1.0 - diskAccum.a;
            diskAccum.rgb += volColor.rgb * volAlpha * remaining;
            diskAccum.a += volAlpha * remaining;
          }
        }
      }
    }

    // Corona sampling
    if (coronaEnabled > 0.5) {
      vec4 coronaSample = vec4(0.0);
      if (binaryEnabled > 0.5) {
        // In binary mode, check distance to either BH
        float r1 = length(rayPos - getBH1World());
        float r2 = length(rayPos - getBH2World());
        float minBHDist = min(r1, r2);
        if (minBHDist < coronaRadius * 2.0) {
          coronaSample = sampleBinaryCorona(rayPos, rayDir, lod);
        }
      } else {
        if (r < coronaRadius * 2.0) {
          coronaSample = sampleCorona(rayPos, rayDir, r, lod);
        }
      }
      float coronaContrib = step(0.001, coronaSample.a);
      float remaining = 1.0 - diskAccum.a;
      diskAccum.rgb += coronaSample.rgb * coronaSample.a * remaining * coronaContrib;
      diskAccum.a += coronaSample.a * remaining * coronaContrib;
    }

    // Jets sampling - additive emission (branchless inner alpha check)
    if (jetsEnabled > 0.5 && abs(rayPos.y) > rs * 0.3) {
      vec4 jetSample = sampleJet(rayPos, rayDir, r, lod);
      float jetContrib = step(0.001, jetSample.a);
      // Pure additive blending - jet light adds to whatever is there
      diskAccum.rgb += jetSample.rgb * jetContrib;
      // Small alpha contribution so jets don't disappear entirely
      diskAccum.a = max(diskAccum.a, jetSample.a * 0.3 * jetContrib);
    }
  }

  // Determine background color
  vec3 backgroundColor = vec3(0.0);
  if (!hitHorizon) {
    if (escaped) {
      backgroundColor = color;
    } else {
      backgroundColor = sampleStarfield(rayDir);
    }
  }

  // Composite disk over background
  if (diskAccum.a > 0.0) {
    float remaining = 1.0 - diskAccum.a;
    color = diskAccum.rgb + backgroundColor * remaining;
  } else {
    color = backgroundColor;
  }

  // Photon sphere glow: rays passing near r = 1.5rs (photon sphere)
  // create the bright ring visible in EHT images
  // Skip in binary mode - each BH has natural photon rings from ray tracing
  if (!hitHorizon && minRadius < 2.5 * rs && minRadius > rs && photonSphereIntensity > 0.0 && binaryEnabled < 0.5) {
    float photonSphereRadius = 1.5 * rs;
    float psDistance = abs(minRadius - photonSphereRadius);

    // Gaussian glow centered on photon sphere
    float sigma = 0.15 * rs;
    float psGlow = exp(-psDistance * psDistance / (2.0 * sigma * sigma));

    // Scale by intensity and add warm white glow (slightly orange for hot gas)
    vec3 glowColor = vec3(1.0, 0.92, 0.85) * psGlow * photonSphereIntensity * 0.2;

    // Additive blend - photon sphere is bright!
    color += glowColor;
  }

  // Add accumulated overlay contributions (already computed during ray march)
  if (overlayAccum.a > 0.0) {
    // Additive blend for glowing overlays
    color += overlayAccum.rgb * overlayAccum.a;
  }

  return vec4(color, 1.0);
}

// Simple hash function for jitter
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  return vec2(
    fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453)
  );
}

// Quick trace to detect if near black hole edge (returns minRadius)
float traceEdgeDetect(vec2 uv) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = inverseProjection * clip;
  viewPos = vec4(viewPos.xy, -1.0, 0.0);
  vec3 rayDir = normalize((inverseView * viewPos).xyz);
  vec3 rayPos = cameraPos;

  float camDist = length(cameraPos);
  float minR = 1000.0;
  float h = 0.3; // Larger step for speed

  // Quick march with fewer steps
  for (int i = 0; i < 80; i++) {
    float r = length(rayPos);
    minR = min(minR, r);

    if (r < rs) return minR; // Hit horizon
    if (r > max(camDist * 2.0, 100.0)) return minR; // Escaped

    vec3 rHat = rayPos / r;
    float vDotR = dot(rayDir, rHat);
    float vPerpSq = 1.0 - vDotR * vDotR;
    float accel = -1.5 * rs * vPerpSq / (r * r);

    rayDir = normalize(rayDir + accel * rHat * h);
    rayPos += rayDir * h;
  }
  return minR;
}

void main() {
  vec4 result;
  vec2 pixelSize = 1.0 / resolution;

  if (supersampleLevel <= 1) {
    // No supersampling requested, but check if we're near the BH edge
    // If bhEdgeSoftness > 0, do adaptive edge supersampling
    if (bhEdgeSoftness > 0.0) {
      float minR = traceEdgeDetect(vUv);
      float photonSphere = rs * 1.5;
      float edgeThreshold = rs * (2.0 + bhEdgeSoftness * 2.0); // 2-4 rs range

      // Near the photon sphere = potential edge aliasing
      if (minR < edgeThreshold && minR > rs * 0.5) {
        // Adaptive 2x2 supersampling for edge pixels
        vec4 accum = vec4(0.0);
        vec2 pixelCoord = vUv * resolution;

        for (int sy = 0; sy < 2; sy++) {
          for (int sx = 0; sx < 2; sx++) {
            vec2 cellIndex = vec2(float(sx), float(sy));
            vec2 jitter = hash2(pixelCoord + cellIndex * 17.31) - 0.5;
            vec2 offset = (cellIndex + 0.5 + jitter * 0.6) / 2.0 - 0.5;
            accum += traceRay(vUv + offset * pixelSize);
          }
        }
        result = accum / 4.0;
      } else {
        result = traceRay(vUv);
      }
    } else {
      result = traceRay(vUv);
    }
  } else {
    // Full supersampling with NxN jittered grid
    result = vec4(0.0);
    float n = float(supersampleLevel);
    float sampleCount = n * n;

    // Base pixel coordinate for consistent jitter pattern
    vec2 pixelCoord = vUv * resolution;

    for (int sy = 0; sy < 4; sy++) {
      if (sy >= supersampleLevel) break;
      for (int sx = 0; sx < 4; sx++) {
        if (sx >= supersampleLevel) break;

        // Stratified jitter: random offset within each grid cell
        // This breaks up regular aliasing patterns
        vec2 cellIndex = vec2(float(sx), float(sy));
        vec2 jitter = hash2(pixelCoord + cellIndex * 13.37) - 0.5; // -0.5 to 0.5

        // Sample position: grid cell center + jitter within cell
        vec2 cellOffset = (cellIndex + 0.5 + jitter * 0.8) / n - 0.5;
        vec2 sampleUv = vUv + cellOffset * pixelSize;

        result += traceRay(sampleUv);
      }
    }

    result /= sampleCount;
  }

  gl_FragColor = result;
}
