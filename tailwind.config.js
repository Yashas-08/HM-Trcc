/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#222222',
        canvas: '#F4F4F4',
        surface: '#FFFFFF',
        pastel: {
          blue: '#B5DDEC',
          lime: '#DDF58A',
          lavender: '#CEB5EF',
        },
        ink: {
          primary: '#292929',
          secondary: '#777777',
        },
        line: '#E9E9E9',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        slab: ['"Roboto Slab"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

