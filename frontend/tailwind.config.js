/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0B1535',
          800: '#111E47',
          700: '#172559',
          600: '#1E3070',
        },
        brand: {
          blue:    '#3D72E8',
          'blue-dim': '#2D5ACC',
          red:     '#E8365D',
        },
      },
      backgroundImage: {
        'app-gradient': 'linear-gradient(135deg, #0B1535 0%, #172255 50%, #0E1C48 100%)',
      },
    },
  },
  plugins: [],
};
