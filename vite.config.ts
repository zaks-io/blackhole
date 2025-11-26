import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext'
  }
});

