import forms from '@tailwindcss/forms';
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#171714',
        coal: '#22221e',
        parchment: '#f1eadb',
        brass: '#c39a55',
        terracotta: '#c26849',
        sage: '#829779',
      },
      fontFamily: {
        display: ['Georgia', 'Cambria', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 18px 45px rgba(0,0,0,.18)',
      },
    },
  },
  plugins: [forms],
};
