import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-figtree)', 'Figtree', 'sans-serif'],
        figtree: ['var(--font-figtree)', 'Figtree', 'sans-serif'],
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '1.5rem',
          lg: '2rem',
        },
      },
      colors: {
        primary: '#2B8A78',
        secondary: '#EA9B3A',
        dark: '#1A1A1A',
      },
      keyframes: {
        'slow-zoom': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(2)' }
        }
      },
      animation: {
        'slow-zoom': 'slow-zoom 5s ease-out forwards'
      }
    },
  },
  plugins: [],
}

export default config
