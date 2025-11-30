import { ShaderChunk } from 'three';

import uniforms from './chunks/uniforms.glsl';
import noise from './chunks/noise.glsl';
import color from './chunks/color.glsl';
import mhd from './chunks/mhd.glsl';
import lod from './chunks/lod.glsl';
import corona from './chunks/corona.glsl';
import jets from './chunks/jets.glsl';
import overlays from './chunks/overlays.glsl';
import disk from './chunks/disk.glsl';
import raymarcher from './chunks/raymarcher.glsl';

let registered = false;

export function registerLensingChunks() {
  if (registered) return;

  const chunks = ShaderChunk as Record<string, string>;

  chunks.lensing_uniforms = uniforms;
  chunks.lensing_noise = noise;
  chunks.lensing_color = color;
  chunks.lensing_mhd = mhd;
  chunks.lensing_lod = lod;
  chunks.lensing_corona = corona;
  chunks.lensing_jets = jets;
  chunks.lensing_overlays = overlays;
  chunks.lensing_disk = disk;
  chunks.lensing_raymarcher = raymarcher;

  registered = true;
}
