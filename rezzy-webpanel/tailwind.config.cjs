/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:"#eef2ff",100:"#e0e7ff",200:"#c7d2fe",300:"#a5b4fc",400:"#818cf8",
          500:"#6366f1",600:"#5458de",700:"#4447c8",800:"#373aa8",900:"#2d3189"
        }
      },
      borderRadius: { "2xl": "1rem" }
    }
  },
  plugins: []
};
