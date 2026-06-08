/**
 * Promo cards (trang Sự kiện & Khuyến mãi)
 * Lưu data/promos.json, seed 6 promo mặc định
 */
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'promos.json');

function _id(){ return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

var DEFAULT = [
  { title:'VÉ CƯỢC THUA THỂ THAO ĐẦU TIÊN', desc:'Hoàn 100% tối đa 5.000.000đ cho vé cược thua đầu tiên', cta:'Nhận ngay', url:'https://xoso66tv.com/promo/refund?ref=live', bg:'linear-gradient(135deg,#c0392b,#e67e22,#f1c40f)', image:'', active:true },
  { title:'NẠP LẦN ĐẦU - THƯỞNG 100%',      desc:'Nhận thêm 1.000.000đ khi nạp tiền lần đầu tiên tại Xoso66',     cta:'Nạp ngay',  url:'https://xoso66tv.com/promo/first-deposit?ref=live', bg:'linear-gradient(135deg,#1e8449,#27ae60,#f1c40f)', image:'', active:true },
  { title:'IDOL LIVE 24/7 - HOTGIRL ĐỘC QUYỀN', desc:'Hàng trăm idol xinh đẹp đang chờ bạn trong phòng riêng',  cta:'Vào phòng', url:'https://xoso66tv.com/idol?ref=live', bg:'linear-gradient(135deg,#8e44ad,#e91e63,#f1c40f)', image:'', active:true },
  { title:'HOÀN 10% NẠP THẺ HÀNG NGÀY',     desc:'Mỗi ngày hoàn lại 10% tổng tiền nạp (max 500K)',              cta:'Tham gia', url:'https://xoso66tv.com/promo/daily-cashback?ref=live', bg:'linear-gradient(135deg,#16a085,#27ae60,#f1c40f)', image:'', active:true },
  { title:'VÒNG QUAY MAY MẮN - TRÚNG TIỀN', desc:'Quay miễn phí 3 lần/ngày, trúng tới 10 triệu',                cta:'Quay ngay', url:'https://xoso66tv.com/promo/spin?ref=live', bg:'linear-gradient(135deg,#3498db,#9b59b6,#e91e63)', image:'', active:true },
  { title:'MỜI BẠN - NHẬN 200K/NGƯỜI',      desc:'Mỗi người bạn mời thành công, bạn nhận 200K vào ví',          cta:'Mời ngay',  url:'https://xoso66tv.com/promo/invite?ref=live', bg:'linear-gradient(135deg,#d35400,#e67e22,#f1c40f)', image:'', active:true }
];

function load(){
  try {
    if (!fs.existsSync(FILE)) {
      var seed = DEFAULT.map(function(p){ return Object.assign({ id:_id(), createdAt:Date.now() }, p); });
      save(seed);
      return seed;
    }
    return JSON.parse(fs.readFileSync(FILE, 'utf8') || '[]');
  } catch(e){ console.error('promos.load:', e.message); return []; }
}

function save(list){
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive:true });
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch(e){ console.error('promos.save:', e.message); return false; }
}

function listActive(){ return load().filter(function(p){ return p.active !== false; }); }
function create(data){ var l = load(); var p = Object.assign({ id:_id(), active:true, createdAt:Date.now() }, data); l.push(p); save(l); return p; }
function update(id, data){ var l = load(); var i = l.findIndex(function(x){return x.id===id}); if(i<0) return null; l[i] = Object.assign({}, l[i], data); save(l); return l[i]; }
function remove(id){ var l = load(); var n = l.length; l = l.filter(function(x){return x.id!==id}); save(l); return n - l.length; }

module.exports = { load, save, listActive, create, update, remove };
