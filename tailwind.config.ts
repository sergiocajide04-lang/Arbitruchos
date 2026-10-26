import type { Config } from 'tailwindcss';

// Los colores se definen como variables CSS en src/styles/index.css (tema oscuro y claro).
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        fg: token('fg'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        'accent-text': token('accent-text'),
        danger: token('danger'),
        warning: token('warning'),
        info: token('info'),
        success: token('success'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Barlow Condensed"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 10px 30px -18px rgb(0 0 0 / 0.6)',
        glow: '0 0 0 1px rgb(var(--c-accent) / 0.35), 0 10px 30px -10px rgb(var(--c-accent) / 0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'loading-bar': {
          '0%': { transform: 'translateX(-110%)' },
          '100%': { transform: 'translateX(330%)' },
        },
        stride: {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(4px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        stride: 'stride 1.1s ease-in-out infinite',
        'loading-bar': 'loading-bar 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
