import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tl: {
          bg: "#0b0e1a",
          panel: "#121729",
          border: "#2a3452",
          text: "#e4e9f7",
          muted: "#8f9bb8",
          accent: "#7c6cff",
          critical: "#ff5d73",
          high: "#ff9a52",
          medium: "#f5b942",
          low: "#5cc8ff",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
