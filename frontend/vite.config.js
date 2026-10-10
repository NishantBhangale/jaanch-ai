import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// In development the React app runs on :5173 and forwards API calls to the backend.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://localhost:3000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': backend, '/screenshots': backend },
    },
    // `vite preview` serves the built files in the container.
    // It forwards /api and /screenshots to VITE_BACKEND_URL (set it when you run the container),
    // and allowedHosts lets it answer under your own domain / load balancer name.
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true,
      proxy: { '/api': backend, '/screenshots': backend },
    },
  };
});