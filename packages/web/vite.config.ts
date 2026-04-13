import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3847,
    open: true,
    proxy: {
      '/api/proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/openai/, ''),
        secure: true,
      },
      '/api/proxy/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/anthropic/, ''),
        secure: true,
      },
      '/api/proxy/github-copilot': {
        target: 'https://api.githubcopilot.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/github-copilot/, ''),
        secure: true,
      },
      '/api/proxy/github-api': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/github-api/, ''),
        secure: true,
      },
      '/api/proxy/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/ollama/, ''),
      },
      '/api/proxy/lmstudio': {
        target: 'http://localhost:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/lmstudio/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
