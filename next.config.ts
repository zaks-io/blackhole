import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack configuration for GLSL files
  turbopack: {
    rules: {
      '*.glsl': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
  // Webpack configuration for GLSL shader files (fallback)
  webpack: (config) => {
    config.module.rules.push({
      test: /\.glsl$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;
