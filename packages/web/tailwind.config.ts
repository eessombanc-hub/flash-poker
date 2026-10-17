import type { Config } from 'tailwindcss';

// Design tokens : noir / anthracite / vert poker / or. Aucune police distante : la sobriété d'une banque privée
// passe par une typographie à empattements pour les titres et le sans-serif du système pour l'interface.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0d0f', 900: '#101316', 800: '#161a1e', 700: '#1e2328', 600: '#2a3037', 500: '#3a424b' },
        felt: { 900: '#06261c', 800: '#0a3325', 700: '#0e4130', 600: '#13543f', 500: '#1a6b51' },
        gold: { 300: '#e6cf9c', 400: '#d8b872', 500: '#c9a25a', 600: '#a9843f', 700: '#846531' },
        ivory: { 50: '#fbf8f1', 100: '#f4efe4', 200: '#e8e0cf', 300: '#cfc6b1' },
        ruby: { 500: '#b3202a', 600: '#8f1a22' },
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', '"Book Antiqua"', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,.6) inset, 0 6px 14px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.6)',
        gold: '0 0 0 2px #c9a25a, 0 10px 22px rgba(201,162,90,.28)',
        panel: '0 18px 50px rgba(0,0,0,.45)',
      },
      keyframes: {
        pulseRing: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
      },
      animation: { pulseRing: 'pulseRing 1s ease-in-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;
