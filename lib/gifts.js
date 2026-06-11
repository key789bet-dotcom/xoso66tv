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

/**
 * QUÀ THẬT - mua bằng VND nạp từ xoso66. Streamer được hưởng commission.
 * Mỗi quà:
 *   - priceVnd: giá tiền VND user phải trả
 *   - streamerCut: % hoa hồng cho idol/BLV (số thực 0..1)
 *   - tier: vip / royal / legend (tương ứng độ sang)
 */
// Fluent Emoji 3D (Microsoft - open source MIT license)
// CDN: https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/
const FLUENT_3D = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/';

const PREMIUM_GIFTS = [
  { id:'p_rose',    name:'Hoa hồng VIP',  icon:'🌹', img3d: FLUENT_3D+'Rose/3D/rose_3d.png',
    priceVnd:10000,   streamerCut:0.70, tier:'vip',    anim:'zoom',    msg:'tặng bó hoa hồng VIP' },
  { id:'p_bear',    name:'Gấu bông sang', icon:'🧸', img3d: FLUENT_3D+'Teddy%20bear/3D/teddy_bear_3d.png',
    priceVnd:20000,   streamerCut:0.70, tier:'vip',    anim:'zoom',    msg:'tặng gấu bông siêu cute' },
  { id:'p_cake',    name:'Bánh kem 3 tầng',icon:'🎂',img3d: FLUENT_3D+'Birthday%20cake/3D/birthday_cake_3d.png',
    priceVnd:50000,   streamerCut:0.72, tier:'vip',    anim:'zoom',    msg:'tặng bánh kem 3 tầng' },
  { id:'p_ring',    name:'Nhẫn kim cương',icon:'💍',img3d: FLUENT_3D+'Ring/3D/ring_3d.png',
    priceVnd:100000,  streamerCut:0.72, tier:'royal',  anim:'ring',    msg:'cầu hôn idol bằng nhẫn kim cương 💍' },
  { id:'p_crown',   name:'Vương miện vàng',icon:'👑',img3d: FLUENT_3D+'Crown/3D/crown_3d.png',
    priceVnd:200000, streamerCut:0.75, tier:'royal',  anim:'ring',    msg:'tôn vinh Idol bằng vương miện vàng' },
  { id:'p_ferrari', name:'Siêu xe Ferrari',icon:'🏎️',img3d: FLUENT_3D+'Racing%20car/3D/racing_car_3d.png',
    priceVnd:500000, streamerCut:0.75, tier:'royal',  anim:'fly',     msg:'tặng siêu xe Ferrari đỏ rực' },
  { id:'p_yacht',   name:'Du thuyền sang',icon:'🛥️',img3d: FLUENT_3D+'Motor%20boat/3D/motor_boat_3d.png',
    priceVnd:1000000,streamerCut:0.78, tier:'legend', anim:'fly',     msg:'tặng du thuyền siêu sang ra Phú Quốc' },
  { id:'p_rocket',  name:'Tên lửa vũ trụ',icon:'🚀',img3d: FLUENT_3D+'Rocket/3D/rocket_3d.png',
    priceVnd:2000000,streamerCut:0.80, tier:'legend', anim:'explode', msg:'bắn tên lửa vũ trụ! Idol là số 1 🚀' }
];

const TIER_STYLE = {
  common:    { ring:'from-gray-500 to-gray-700',    bg:'bg-bg-soft',           glow:'',                                  label:'Phổ thông' },
  rare:      { ring:'from-sky-400 to-blue-600',     bg:'bg-sky-500/10',        glow:'shadow-[0_0_20px_rgba(56,189,248,.4)]', label:'Hiếm' },
  epic:      { ring:'from-purple-400 to-fuchsia-600',bg:'bg-purple-500/10',    glow:'shadow-[0_0_22px_rgba(168,85,247,.5)]', label:'Sử thi' },
  legendary: { ring:'from-yellow-300 via-orange-500 to-red-600', bg:'bg-orange-500/10', glow:'shadow-[0_0_28px_rgba(255,165,0,.65)]', label:'Huyền thoại' },
  vip:       { ring:'from-pink-400 to-rose-600',    bg:'bg-pink-500/10',       glow:'shadow-[0_0_18px_rgba(244,114,182,.45)]', label:'VIP' },
  royal:     { ring:'from-amber-400 to-yellow-600', bg:'bg-amber-500/10',      glow:'shadow-[0_0_24px_rgba(245,158,11,.55)]', label:'Hoàng gia' },
  legend:    { ring:'from-rose-500 via-amber-400 to-yellow-500', bg:'bg-rose-500/10', glow:'shadow-[0_0_30px_rgba(244,63,94,.7)]',  label:'Huyền thoại' }
};

function findGift(id) {
  return GIFTS.find(g => g.id === id) || PREMIUM_GIFTS.find(g => g.id === id) || null;
}
function findPremium(id) {
  return PREMIUM_GIFTS.find(g => g.id === id) || null;
}

module.exports = { GIFTS, PREMIUM_GIFTS, TIER_STYLE, findGift, findPremium };
