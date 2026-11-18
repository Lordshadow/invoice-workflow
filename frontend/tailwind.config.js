/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        crystal: {
          bg: "#f3f0f7",
          glass: "rgba(255, 255, 255, 0.55)",
          glassHover: "rgba(255, 255, 255, 0.75)",
          card: "rgba(255, 255, 255, 0.60)",
          border: "rgba(255, 255, 255, 0.75)",
          borderSubtle: "rgba(255, 255, 255, 0.45)",
          textPrimary: "#1e1b4b",
          textSecondary: "#475569",
          textMuted: "#64748b",
        },
        prism: {
          purple: "#8b5cf6",
          pink: "#ec4899",
          blue: "#3b82f6",
          cyan: "#06b6d4",
          amber: "#f59e0b",
          coral: "#f43f5e",
          emerald: "#10b981",
        }
      },
      borderRadius: {
        'squircle-sm': '14px',
        'squircle': '20px',
        'squircle-lg': '28px',
        'squircle-xl': '36px',
      },
      boxShadow: {
        'crystal-board': '0 30px 60px -15px rgba(120, 100, 180, 0.18), inset 0 2px 2px 0 rgba(255, 255, 255, 0.95), inset 0 -2px 4px 0 rgba(200, 180, 240, 0.25)',
        'crystal-card': '0 12px 30px -8px rgba(100, 80, 160, 0.12), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.9)',
        'crystal-glow-purple': '0 10px 25px -5px rgba(139, 92, 246, 0.4)',
        'crystal-glow-blue': '0 10px 25px -5px rgba(59, 130, 246, 0.4)',
        'crystal-glow-pink': '0 10px 25px -5px rgba(236, 72, 153, 0.4)',
        'crystal-glow-coral': '0 10px 25px -5px rgba(244, 63, 94, 0.4)',
      },
      backdropBlur: {
        'crystal': '28px',
      }
    },
  },
  plugins: [],
}
