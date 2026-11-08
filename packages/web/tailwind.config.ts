import type { Config } from 'tailwindcss';

// Design tokens : cognac / vert poker / or. Aucune police distante : la sobriété d'une banque privée
// passe par une typographie à empattements pour les titres et le sans-serif du système pour l'interface.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Fond du jeu, du plus profond (950) à la teinte d'accent des bordures (500). Les valeurs viennent de
        // l'ambiance choisie dans les Paramètres (variables CSS, voir styles.css) ; cognac par défaut.
        ink: { 950: 'rgb(var(--ink-950) / <alpha-value>)', 900: 'rgb(var(--ink-900) / <alpha-value>)', 800: 'rgb(var(--ink-800) / <alpha-value>)', 700: 'rgb(var(--ink-700) / <alpha-value>)', 600: 'rgb(var(--ink-600) / <alpha-value>)', 500: 'rgb(var(--ink-500) / <alpha-value>)' },
        felt: { 900: '#06261c', 800: '#0a3325', 700: '#0e4130', 600: '#13543f', 500: '#1a6b51' },
        gold: { 300: '#e6cf9c', 400: '#d8b872', 500: '#c9a25a', 600: '#a9843f', 700: '#846531' },
        ivory: { 50: '#fbf8f1', 100: '#f4efe4', 200: '#e8e0cf', 300: '#cfc6b1' },
        ruby: { 950: '#2a0a0d', 600: '#8f1a22', 500: '#b3202a', 300: '#ef6a73', 200: '#f3939a', 100: '#f8c2c6' },
        // Jade et ambre : succès et avertissement, prélevés sur des teintes déjà présentes ailleurs dans
        // l'interface (avatar « émeraude », avatar « ambre », minuteur à 10 s) plutôt qu'empruntés aux
        // couleurs par défaut de Tailwind — pour que tout indicateur reste dans la même famille chromatique.
        jade: { 950: '#0c2b22', 500: '#3fae86', 400: '#5bc79f', 300: '#8fd9bc', 100: '#def3e7' },
        amber: { 950: '#2e1d08', 500: '#d9933a', 400: '#f0b25c', 200: '#f7d3a0', 100: '#fbe4c2' },
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
