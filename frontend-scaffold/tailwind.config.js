/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        black: '#000000',
        white: '#FFFFFF',
        'off-white': '#FAFAFA',
      },
      boxShadow: {
        'brutalist': '4px 4px 0px 0px rgba(0,0,0,1)',
        'brutalist-lg': '6px 6px 0px 0px rgba(0,0,0,1)',
        'brutalist-sm': '2px 2px 0px 0px rgba(0,0,0,1)',
      },
      borderWidth: {
        '3': '3px',
      },
      fontFamily: {
        'sans': ['Inter', 'Space Grotesk', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
