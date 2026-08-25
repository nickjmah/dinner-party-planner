import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/dinner-party-planner/',
  build: { sourcemap: true },
});

