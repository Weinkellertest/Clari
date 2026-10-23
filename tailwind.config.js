/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nunito Sans"', 'system-ui', 'sans-serif'],
        display: ['Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#fef7ec',
          100: '#fcecca',
          200: '#f9d894',
          300: '#f5bd5a',
          400: '#f1a531',
          500: '#ec8718',
          600: '#dc6a10',
          700: '#b64e10',
          800: '#913e15',
          900: '#753514',
        },
        sage: {
          50: '#f3f8f4',
          100: '#e2efe5',
          200: '#c6dfcd',
          300: '#9bc7a8',
          400: '#6aa87e',
          500: '#478c60',
          600: '#36714c',
          700: '#2d5a3f',
          800: '#264833',
          900: '#213b2c',
        },
        cream: {
          50: '#fdfcf9',
          100: '#faf6ee',
          200: '#f4ecdc',
        },
      },
      boxShadow: {
        soft: '0 2px 12px rgba(0,0,0,0.06)',
        card: '0 4px 20px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
