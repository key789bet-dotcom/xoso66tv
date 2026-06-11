/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './views/**/*.ejs',
    './public/js/**/*.js'
  ],
  // Safelist tối thiểu - chỉ các class CHẮC CHẮN dynamic (set bằng JS .className hoặc template literal)
  safelist: [
    // Status badge backgrounds với alpha - được tạo dynamic bởi JS modal/status
    { pattern: /^bg-(emerald|yellow|red|blue|amber|orange|gray)-(400|500|600)\/(10|20|30|40)$/ },
    { pattern: /^text-(emerald|yellow|red|blue|amber|orange|gray)-(300|400|500)$/ },
    { pattern: /^border-(emerald|yellow|red|blue|amber|orange)-500\/(30|40|50)$/ },
    // Toggle classes (JS toggle hidden/show)
    'hidden', 'block', 'flex', 'grid', 'inline-flex', 'inline-block',
    // Active state cho tabs/buttons (set bằng JS)
    'is-active', 'is-scrolling', 'dark',
    // Animate hay dùng dynamic
    'animate-pulse', 'animate-spin', 'animate-pulse-live'
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
