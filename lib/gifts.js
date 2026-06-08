/**
 * Bộ sưu tập quà tặng X COIN cho Idol Live
 * Mỗi quà: { id, name, icon, price, tier, anim, msg }
 *  - tier: common (xám) / rare (xanh) / epic (tím) / legendary (cam-vàng)
 *  - anim: tên class animation khi gửi (zoom, fly, explode, ring)
 *  - msg: text shoutout vào chat khi gửi
 */
const GIFTS = [
  // ===== COMMON (1-50 X COIN) =====
  { id:'rose',     name:'Hoa hồng',     icon:'🌹', price:1,    tier:'common', anim:'zoom',    msg:'tặng hoa hồng' },
  { id:'heart',    name:'Trái tim',     icon:'❤️',  price:2,    tier:'common', anim:'zoom',    msg:'gửi trái tim yêu thương' },
  { id:'kiss',     name:'Nụ hôn',       icon:'💋', price:5,    tier:'common', anim:'zoom',    msg:'tặng nụ hôn ngọt ngào' },
  { id:'icecream', name:'Kem que',      icon:'🍦', price:10,   tier:'common', anim:'zoom',    msg:'mời ăn kem' },
  { id:'milktea',  name:'Trà sữa',      icon:'🧋', price:15,   tier:'common', anim:'zoom',    msg:'mời ly trà sữa' },
  { id:'cake',     name:'Bánh kem',     icon:'🍰', price:50,   tier:'common', anim:'zoom',    msg:'tặng bánh sinh nhật' },

  // ===== RARE (100-500 X COIN) =====
  { id:'bouquet',  name:'Bó hồng',      icon:'💐', price:100,  tier:'rare',   anim:'fly',     msg:'tặng cả bó hoa hồng' },
  { id:'ring',     name:'Nhẫn vàng',    icon:'💍', price:200,  tier:'rare',   anim:'ring',    msg:'cầu hôn idol bằng nhẫn vàng' },
  { id:'champagne',name:'Champagne',    icon:'🍾', price:300,  tier:'rare',   anim:'explode', msg:'mở Champagne ăn mừng' },
  { id:'crown',    name:'Vương miện',   icon:'👑', price:500,  tier:'rare',   anim:'ring',    msg:'tôn vinh Idol bằng vương miện' },

  // ===== EPIC (1.000-10.000 X COIN) =====
  { id:'diamond',  name:'Kim cương',    icon:'💎', price:1000, tier:'epic',   anim:'explode', msg:'tặng viên kim cương lấp lánh' },
  { id:'car',      name:'Siêu xe',      icon:'🏎️', price:3000, tier:'epic',   anim:'fly',     msg:'tặng siêu xe Ferrari' },
  { id:'castle',   name:'Lâu đài',      icon:'🏰', price:5000, tier:'epic',   anim:'explode', msg:'xây tặng cả lâu đài' },
  { id:'plane',    name:'Máy bay',      icon:'✈️', price:8000, tier:'epic',   anim:'fly',     msg:'thuê máy bay riêng đưa Idol đi chơi' },

  // ===== LEGENDARY (50.000+ X COIN) =====
  { id:'yacht',    name:'Du thuyền',    icon:'🛥️', price:30000, tier:'legendary', anim:'fly',     msg:'tặng du thuyền siêu sang' },
  { id:'rocket',   name:'Tên lửa',      icon:'🚀', price:100000,tier:'legendary', anim:'explode', msg:'bắn tên lửa lên vũ trụ để dành tặng Idol!' }
];

const TIER_STYLE = {
  common:    { ring:'from-gray-500 to-gray-700',    bg:'bg-bg-soft',           glow:'',                                  label:'Phổ thông' },
  rare:      { ring:'from-sky-400 to-blue-600',     bg:'bg-sky-500/10',        glow:'shadow-[0_0_20px_rgba(56,189,248,.4)]', label:'Hiếm' },
  epic:      { ring:'from-purple-400 to-fuchsia-600',bg:'bg-purple-500/10',    glow:'shadow-[0_0_22px_rgba(168,85,247,.5)]', label:'Sử thi' },
  legendary: { ring:'from-yellow-300 via-orange-500 to-red-600', bg:'bg-orange-500/10', glow:'shadow-[0_0_28px_rgba(255,165,0,.65)]', label:'Huyền thoại' }
};

module.exports = { GIFTS, TIER_STYLE };
