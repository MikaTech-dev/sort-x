tailwind.config = {
  theme: {
    extend: {
      colors: {
        sortx: {
          bg: '#000000',
          surface: '#16181c',
          'surface-hover': '#1d1f23',
          border: '#2f3336',
          'text-primary': '#e7e9ea',
          'text-secondary': '#71767b',
          accent: '#1d9bf0',
          'accent-hover': '#1a8cd8',
          'accent-glow': 'rgba(29, 155, 240, 0.35)',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace']
      },
      borderRadius: {
        'sortx': '16px'
      },
      boxShadow: {
        'btn-primary': '0 2px 20px rgba(29, 155, 240, 0.35)',
        'btn-primary-hover': '0 4px 28px rgba(29, 155, 240, 0.35)',
        'tab-active': '0 2px 16px rgba(29, 155, 240, 0.35)',
      },
      animation: {
        'fade-in-tab': 'fadeInTab 0.25s ease-in-out forwards',
      },
      keyframes: {
        fadeInTab: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    }
  }
}
