import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pages serwuje projekt pod ścieżką /Productiveness-calendar/.
// Lokalnie (npm run dev) baza to '/', żeby dev server działał normalnie.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Productiveness-calendar/' : '/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
}));
