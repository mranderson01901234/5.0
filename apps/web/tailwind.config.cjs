module.exports = {
  darkMode: "class",
  content: ["./index.html","./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        text: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)"
      },
      boxShadow: {
        glow: "0 8px 32px var(--glow)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: []
}

