/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fleet: {
          bg: 'var(--fleet-bg)',
          surface: 'var(--fleet-surface)',
          panel: 'var(--fleet-panel)',
          border: 'var(--fleet-border)',
          accent: 'var(--fleet-accent)',
          text: 'var(--fleet-text)',
          muted: 'var(--fleet-muted)',
          deep: 'var(--fleet-deep)',
          trigger: '#10b981',
          agent: '#6366f1',
          llm: '#f59e0b',
          splitter: '#06b6d4',
          merger: '#8b5cf6',
          condition: '#ef4444',
          human: '#ec4899',
          tool: '#14b8a6',
          output: '#22c55e',
          group: '#64748b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 15px rgba(99, 102, 241, 0.5)',
        'neon-green': '0 0 15px rgba(16, 185, 129, 0.5)',
        'neon-amber': '0 0 15px rgba(245, 158, 11, 0.5)',
        'neon-red': '0 0 15px rgba(239, 68, 68, 0.5)',
        'neon-pink': '0 0 15px rgba(236, 72, 153, 0.5)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'flow-dash': 'flow-dash 1s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'flow-dash': {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
      },
    },
  },
  plugins: [],
};
