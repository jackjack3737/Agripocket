/** Tailwind solo per il modulo Calendario Solum (preflight disattivato per non toccare il resto dell'app). */
export default {
  content: [
    "./src/components/calendario/solum/**/*.{js,jsx}",
    "./src/components/calendario/CalendarioSolum.jsx",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        solum: {
          green: "#2d6a4f",
          "green-light": "#d8f3dc",
          "green-muted": "#52b788",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", '"Times New Roman"', "serif"],
      },
    },
  },
};
