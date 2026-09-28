/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        black: '#000000',
        white: '#FFFFFF',
        'off-white': '#FAFAFA',
        background: {
          light: "#FFFFFF",
          dark: "#000000",
        },
        foreground: {
          light: "#111111",
          dark: "#F5F5F5",
        },
        gray: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB', // 11.5:1 on black (WCAG AA pass)
          400: '#525866', // 5.2:1 on white (WCAG AA pass, replaces low-contrast default #9CA3AF)
          500: '#4B5563', // 7.0:1 on white
          600: '#374151', // 9.0:1 on white
          700: '#1F2937', // 13.0:1 on white
          800: '#111827', // 16.0:1 on white
          900: '#0F172A',
        },
        placeholder: {
          DEFAULT: '#525866', // 5.2:1 on white
          dark: '#D1D5DB',    // 11.5:1 on black
        },
      },
      boxShadow: {
        'brutalist': '4px 4px 0px 0px rgba(0,0,0,1)',
        'brutalist-lg': '6px 6px 0px 0px rgba(0,0,0,1)',
        'brutalist-sm': '2px 2px 0px 0px rgba(0,0,0,1)',
        'brutalist-dark': '4px 4px 0px 0px rgba(255,255,255,1)',
        'brutalist-lg-dark': '6px 6px 0px 0px rgba(255,255,255,1)',
        'brutalist-sm-dark': '2px 2px 0px 0px rgba(255,255,255,1)',
        'brutal-lg': '6px 6px 0px 0px rgba(0,0,0,1)',
        'brutal-lg-dark': '6px 6px 0px 0px rgba(255,255,255,1)',
      },
      borderWidth: {
        '3': '3px',
      },
      fontFamily: {
        'sans': ['Inter', 'Space Grotesk', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    function({ addBase }) {
      addBase({
        '::placeholder': {
          color: '#525866',
        },
        '.dark ::placeholder': {
          color: '#D1D5DB',
        },
        'input::placeholder': {
          color: '#525866',
        },
        '.dark input::placeholder': {
          color: '#D1D5DB',
        },
        'textarea::placeholder': {
          color: '#525866',
        },
        '.dark textarea::placeholder': {
          color: '#D1D5DB',
        },
      });
    },
  ],
}
