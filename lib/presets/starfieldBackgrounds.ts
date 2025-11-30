export interface StarfieldBackground {
  name: string;
  path: string;
  hdr: boolean;
  exposure: number;
}

export const STARFIELD_BACKGROUNDS = {
  milkyWay: { name: 'Milky Way', path: '/textures/starmap_4k.webp', hdr: false, exposure: 0.5 },
  milkyWayHdr: {
    name: 'Milky Way HDR',
    path: '/textures/starmap_2020_4k.exr',
    hdr: true,
    exposure: 0.5,
  },
  nebulaBlue: {
    name: 'Blue Nebula',
    path: '/textures/HDR_rich_blue_nebulae_1_4k.exr',
    hdr: true,
    exposure: 1.0,
  },
  nebulaPlanet: {
    name: 'Planet Nebula',
    path: '/textures/HDR_artificial_planet_4k.exr',
    hdr: true,
    exposure: 1.0,
  },
  nebulaHazy: {
    name: 'Hazy Nebula',
    path: '/textures/HDR_hazy_nebulae_4k.exr',
    hdr: true,
    exposure: 5.0,
  },
  nebulaMulti: {
    name: 'Multi Nebula',
    path: '/textures/HDR_rich_multi_nebulae_2_4k.exr',
    hdr: true,
    exposure: 0.5,
  },
} as const;

export type StarfieldKey = keyof typeof STARFIELD_BACKGROUNDS;
