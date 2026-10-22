/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#EA580C", // Orange-600
        secondary: "#1F2937", // Gray-800
      }
    },
  },
  plugins: [],
}