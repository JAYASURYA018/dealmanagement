/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#4285F4', // Google Blue ish
        'brand-gray': '#F1F3F4',
      }
    },
  },
  plugins: [],
}
