/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  // Button variants are composed at runtime, so the scanner cannot see these names.
  safelist: ['btn-primary', 'btn-dark', 'btn-ghost', 'btn-soft', 'btn-danger'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#EEECFF', 100: '#DEDAFF', 200: '#BFB8FF', 300: '#9C91FF', 400: '#7B6DFF', 500: '#5B4BFF', 600: '#4436D6', 700: '#3529AE', 800: '#272082', 900: '#14122B' },
        signal: { DEFAULT: '#12A071' },
        ink: { DEFAULT: '#14122B', 2: '#4A4866', 3: '#85839C', 4: '#B9B8C9' },
        mist: '#F6F6FA',
        edge: '#E7E6F0',
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
