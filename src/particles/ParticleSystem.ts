import * as THREE from 'three';
import {
  ParticleParams,
  defaultParticleParams,
  Particle,
  keplerianAngularVelocity,
  keplerianVelocity,
  gaussianRandom,
  generateBiasedRadius,
} from './particleTypes';

/**
 * Particle system for black hole visualization
 * 
 * Creates fuzzy particles that orbit the black hole in Keplerian orbits,
 * with some particles on escape trajectories. Particles are encoded into
 * data textures for sampling in the lensing shader.
 */
export class ParticleSystem {
  private particles: Particle[] = [];
  private params: ParticleParams;
  
  // Data textures for shader
  private positionTexture: THREE.DataTexture;
  private propertyTexture: THREE.DataTexture;
  
  // Texture data arrays
  private positionData: Float32Array;
  private propertyData: Float32Array;
  
  // Maximum particle count (texture size)
  private readonly maxParticles = 512;
  
  constructor(params: Partial<ParticleParams> = {}) {
    this.params = { ...defaultParticleParams, ...params };
    
    // Initialize data arrays for textures
    this.positionData = new Float32Array(this.maxParticles * 4);
    this.propertyData = new Float32Array(this.maxParticles * 4);
    
    // Create data textures (Nx1 RGBA float textures)
    this.positionTexture = new THREE.DataTexture(
      this.positionData as unknown as BufferSource,
      this.maxParticles,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.positionTexture.needsUpdate = true;
    
    this.propertyTexture = new THREE.DataTexture(
      this.propertyData as unknown as BufferSource,
      this.maxParticles,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.propertyTexture.needsUpdate = true;
    
    // Initialize particles
    this.initializeParticles();
  }
  
  /**
   * Initialize all particles with random positions and orbital elements
   */
  private initializeParticles(): void {
    this.particles = [];
    
    const {
      count,
      escapePercentage,
      sizeMin,
      sizeMax,
      brightness,
      verticalSpread,
      edgeBias,
      diskInnerRadius,
      diskOuterRadius,
      rs,
      escapeSpeed,
    } = this.params;
    
    const actualCount = Math.min(count, this.maxParticles);
    const escapeCount = Math.floor(actualCount * escapePercentage);
    
    for (let i = 0; i < actualCount; i++) {
      const isEscaping = i < escapeCount;
      
      // Generate orbital radius with edge bias
      const orbitalRadius = generateBiasedRadius(
        diskInnerRadius,
        diskOuterRadius,
        edgeBias
      );
      
      // Random initial phase
      const orbitalPhase = Math.random() * Math.PI * 2;
      
      // Gaussian vertical offset
      const verticalOffset = gaussianRandom(0, verticalSpread * rs);
      
      // Random size within range
      const size = sizeMin + Math.random() * (sizeMax - sizeMin);
      
      // Temperature based on radius (like disk temperature gradient)
      const radialFraction = (orbitalRadius - diskInnerRadius) / (diskOuterRadius - diskInnerRadius);
      const temperature = 10000 - radialFraction * 7000; // 10000K inner to 3000K outer
      
      // Calculate initial position
      const x = orbitalRadius * Math.cos(orbitalPhase);
      const z = orbitalRadius * Math.sin(orbitalPhase);
      const y = verticalOffset;
      
      // For escaping particles, calculate escape velocity
      let escapeVelocityX = 0;
      let escapeVelocityY = 0;
      let escapeVelocityZ = 0;
      
      if (isEscaping) {
        // Tangential velocity from Keplerian orbit, plus radial kick
        const tangentSpeed = keplerianVelocity(orbitalRadius, rs);
        const radialKick = tangentSpeed * (0.3 + Math.random() * 0.4) * escapeSpeed;
        
        // Tangent direction (perpendicular to radius in disk plane)
        const tangentX = -Math.sin(orbitalPhase);
        const tangentZ = Math.cos(orbitalPhase);
        
        // Radial direction
        const radialX = Math.cos(orbitalPhase);
        const radialZ = Math.sin(orbitalPhase);
        
        // Combine tangential and radial components
        escapeVelocityX = tangentX * tangentSpeed + radialX * radialKick;
        escapeVelocityZ = tangentZ * tangentSpeed + radialZ * radialKick;
        
        // Small vertical component for variety
        escapeVelocityY = gaussianRandom(0, 0.1) * tangentSpeed;
      }
      
      const particle: Particle = {
        x,
        y,
        z,
        size,
        brightness: brightness * (0.7 + Math.random() * 0.6),
        temperature,
        isEscaping,
        orbitalRadius,
        orbitalPhase,
        verticalOffset,
        escapeVelocityX,
        escapeVelocityY,
        escapeVelocityZ,
      };
      
      this.particles.push(particle);
    }
    
    // Update textures with initial data
    this.updateTextures();
  }
  
  /**
   * Update particle positions based on elapsed time
   */
  update(deltaTime: number, elapsedTime: number): void {
    const { rs, orbitSpeedMultiplier } = this.params;
    
    for (const particle of this.particles) {
      if (particle.isEscaping) {
        // Update escaping particle with linear motion
        particle.x += particle.escapeVelocityX * deltaTime * orbitSpeedMultiplier;
        particle.y += particle.escapeVelocityY * deltaTime * orbitSpeedMultiplier;
        particle.z += particle.escapeVelocityZ * deltaTime * orbitSpeedMultiplier;
        
        // Check if particle has escaped too far - respawn near outer edge
        const r = Math.sqrt(particle.x * particle.x + particle.z * particle.z);
        if (r > 50 * rs || r < rs) {
          this.respawnEscapingParticle(particle);
        }
      } else {
        // Update bound particle with Keplerian orbit
        const omega = keplerianAngularVelocity(particle.orbitalRadius, rs);
        particle.orbitalPhase += omega * deltaTime * orbitSpeedMultiplier;
        
        // Keep phase in [0, 2π]
        particle.orbitalPhase = particle.orbitalPhase % (Math.PI * 2);
        
        // Update Cartesian position
        particle.x = particle.orbitalRadius * Math.cos(particle.orbitalPhase);
        particle.z = particle.orbitalRadius * Math.sin(particle.orbitalPhase);
        particle.y = particle.verticalOffset;
        
        // Add small vertical oscillation for variety
        particle.y += Math.sin(elapsedTime * 0.5 + particle.orbitalPhase * 2) * 0.05 * rs;
      }
    }
    
    // Update textures with new positions
    this.updateTextures();
  }
  
  /**
   * Respawn an escaping particle near the disk outer edge
   */
  private respawnEscapingParticle(particle: Particle): void {
    const { diskOuterRadius, rs, verticalSpread, escapeSpeed } = this.params;
    
    // Respawn near outer edge
    particle.orbitalRadius = diskOuterRadius * (0.85 + Math.random() * 0.15);
    particle.orbitalPhase = Math.random() * Math.PI * 2;
    particle.verticalOffset = gaussianRandom(0, verticalSpread * rs);
    
    // Calculate new position
    particle.x = particle.orbitalRadius * Math.cos(particle.orbitalPhase);
    particle.z = particle.orbitalRadius * Math.sin(particle.orbitalPhase);
    particle.y = particle.verticalOffset;
    
    // Calculate new escape velocity
    const tangentSpeed = keplerianVelocity(particle.orbitalRadius, rs);
    const radialKick = tangentSpeed * (0.3 + Math.random() * 0.4) * escapeSpeed;
    
    const tangentX = -Math.sin(particle.orbitalPhase);
    const tangentZ = Math.cos(particle.orbitalPhase);
    const radialX = Math.cos(particle.orbitalPhase);
    const radialZ = Math.sin(particle.orbitalPhase);
    
    particle.escapeVelocityX = tangentX * tangentSpeed + radialX * radialKick;
    particle.escapeVelocityZ = tangentZ * tangentSpeed + radialZ * radialKick;
    particle.escapeVelocityY = gaussianRandom(0, 0.1) * tangentSpeed;
  }
  
  /**
   * Update data textures with current particle state
   */
  private updateTextures(): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const idx = i * 4;
      
      // Position texture: x, y, z, size
      this.positionData[idx + 0] = p.x;
      this.positionData[idx + 1] = p.y;
      this.positionData[idx + 2] = p.z;
      this.positionData[idx + 3] = p.size;
      
      // Property texture: brightness, temperature (normalized), isEscaping, unused
      this.propertyData[idx + 0] = p.brightness;
      this.propertyData[idx + 1] = (p.temperature - 1000) / 14000; // Normalize to 0-1
      this.propertyData[idx + 2] = p.isEscaping ? 1.0 : 0.0;
      this.propertyData[idx + 3] = 0.0;
    }
    
    // Zero out unused particle slots
    for (let i = this.particles.length; i < this.maxParticles; i++) {
      const idx = i * 4;
      this.positionData[idx + 0] = 0;
      this.positionData[idx + 1] = 0;
      this.positionData[idx + 2] = 0;
      this.positionData[idx + 3] = 0;
      
      this.propertyData[idx + 0] = 0;
      this.propertyData[idx + 1] = 0;
      this.propertyData[idx + 2] = 0;
      this.propertyData[idx + 3] = 0;
    }
    
    this.positionTexture.needsUpdate = true;
    this.propertyTexture.needsUpdate = true;
  }
  
  /**
   * Update parameters and reinitialize if count changed
   */
  updateParams(params: Partial<ParticleParams>): void {
    const oldCount = this.params.count;
    this.params = { ...this.params, ...params };
    
    // Reinitialize if count changed significantly
    if (Math.abs(this.params.count - oldCount) > 10) {
      this.initializeParticles();
    }
  }
  
  /**
   * Get position data texture for shader
   */
  getPositionTexture(): THREE.DataTexture {
    return this.positionTexture;
  }
  
  /**
   * Get property data texture for shader
   */
  getPropertyTexture(): THREE.DataTexture {
    return this.propertyTexture;
  }
  
  /**
   * Get current particle count
   */
  getParticleCount(): number {
    return this.particles.length;
  }
  
  /**
   * Get current params
   */
  getParams(): ParticleParams {
    return { ...this.params };
  }
  
  /**
   * Dispose of textures
   */
  dispose(): void {
    this.positionTexture.dispose();
    this.propertyTexture.dispose();
  }
}

