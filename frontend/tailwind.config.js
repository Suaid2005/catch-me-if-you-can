/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Game colour palette
        "game-dark": "#0f0f1a",
        "game-card": "#1a1a2e",
        "game-accent": "#e94560",
        "game-gold": "#f5a623",
        "game-green": "#00d4aa",
        "role-impostor": "#e94560",
        "role-detective": "#4a90d9",
        "role-civilian": "#7ed321",
        "role-informant": "#9b59b6",
      },
      fontFamily: {
        game: ["'Exo 2'", "system-ui", "sans-serif"],
      },
      animation: {
        "card-flip": "cardFlip 0.6s ease-in-out",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        cardFlip: {
          "0%": { transform: "rotateY(0deg)" },
          "50%": { transform: "rotateY(90deg)" },
          "100%": { transform: "rotateY(0deg)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 5px rgba(233,69,96,0.3)" },
          "50%": { boxShadow: "0 0 20px rgba(233,69,96,0.8)" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
