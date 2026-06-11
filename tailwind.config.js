/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './views/**/*.ejs',
    './public/js/**/*.js'
  ],
  // Safelist các pattern dynamic class có thể được tạo qua template literal
  // hoặc set bằng JS .className - tailwind không scan thấy
  safelist: [
    // Status colors hay được toggle bằng JS (vd badge status)
    { pattern: /^(bg|text|border)-(red|emerald|yellow|amber|blue|green|sky|indigo|rose|pink|purple|fuchsia|orange|cyan|teal|gray|slate)-(100|200|300|400|500|600|700|800|900)(\/\d+)?$/ },
    // Tier colors gift panel
    { pattern: /^(gp-tier|gp-icon)-(common|rare|epic|legendary|vip|royal|legend)$/ },
    // Status badge backgrounds với alpha
    { pattern: /^bg-(emerald|yellow|red|blue|amber|orange|pri|live|gold)\/(10|20|30|40|50|60|70)$/ },
    // hidden/visible toggle classes
    'hidden', 'block', 'inline-block', 'flex', 'grid', 'inline-flex',
    // animate classes hay dùng dynamic
    'animate-pulse', 'animate-spin', 'animate-bounce', 'animate-pulse-live',
    // is-active, is-scrolling, dark
    'is-active', 'is-scrolling', 'dark'
  ],
  theme: {
    extend: {
      colors: {
        bg:    { DEFAULT:'#0e1116', card:'#161a22', soft:'#1c2129', deep:'#262d38' },
        line:  '#2a313d',
        muted: '#8b93a3',
        dim:   '#5c6473',
        pri:   { DEFAULT:'#ff7a18', light:'#ffb14a', dark:'#cc5f00' },
        gold:  '#ffd23f',
        live:  '#ff3b3b',
        pink:  '#e91e63',
        purple:'#8e44ad'
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"','Inter','"Segoe UI"','Roboto','system-ui','-apple-system','"Helvetica Neue"','Arial','sans-serif']
      },
      animation: {
        'pulse-live': 'pulse-live 1.2s ease-in-out infinite',
        'msg-in':     'msg-in .2s ease-out',
        'shimmer':    'shimmer 3s linear infinite',
      },
      keyframes: {
        'pulse-live': { '50%':{opacity:'.4'} },
        'msg-in':     { 'from':{opacity:'0',transform:'translateY(4px)'} },
        'shimmer':    { 'from':{backgroundPosition:'0 0'},'to':{backgroundPosition:'200% 0'} },
      },
      boxShadow: {
        'pri':  '0 4px 12px rgba(255,122,24,.3)',
        'live': '0 4px 16px rgba(255,59,59,.45)',
      },
      gridTemplateColumns: { 'app': '240px 1fr' },
      gridTemplateRows:    { 'app': '64px 1fr' }
    }
  },
  plugins: []
};
