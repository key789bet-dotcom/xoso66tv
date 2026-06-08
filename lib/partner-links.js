/**
 * Partner links store - admin có thể chỉnh URL liên kết
 * Lưu data/partner-links.json, fallback partners.js
 */
const fs   = require('fs');
const path = require('path');
const defaults = require('./partners').partner;

const FILE = path.join(__dirname, '..', 'data', 'partner-links.json');

// Metadata cho UI (label + mô tả + nhóm)
var META = {
  home:     { label:'Trang chủ',        group:'Chính',      desc:'Link landing page chính của xoso66' },
  register: { label:'Đăng ký',          group:'Chính',      desc:'Link form đăng ký tài khoản mới' },
  login:    { label:'Đăng nhập',        group:'Chính',      desc:'Link form đăng nhập' },
  download: { label:'Tải App',          group:'Chính',      desc:'Link download app Android/iOS' },
  cskh:     { label:'CSKH',             group:'Chính',      desc:'Link chat support / live chat' },
  telegram: { label:'Telegram CSKH',    group:'Chính',      desc:'Link Telegram channel/bot CSKH 24/7' },
  sportbet: { label:'Cá cược thể thao', group:'Sản phẩm',   desc:'Link sảnh thể thao - dùng cho nút "Đặt cược"' },
  casino:   { label:'Casino',           group:'Sản phẩm',   desc:'Link sảnh casino live dealer' },
  idol:     { label:'Idol Live',        group:'Sản phẩm',   desc:'Link sảnh idol live show' },
  minigame: { label:'Mini Game',        group:'Sản phẩm',   desc:'Link sảnh mini game (Tài Xỉu, Bắn cá...)' },
  promo:    { label:'Khuyến mãi',       group:'Marketing',  desc:'Link trang khuyến mãi - dùng cho hero banner CTA' },
  gift:     { label:'Quà tặng',         group:'Marketing',  desc:'Link trang quà tặng - dùng cho vòng quay xoso66' }
};

function load(){
  try {
    if (!fs.existsSync(FILE)) { save(defaults); return Object.assign({}, defaults); }
    return Object.assign({}, defaults, JSON.parse(fs.readFileSync(FILE, 'utf8')||'{}'));
  } catch(e){ console.error('partner-links load:', e.message); return Object.assign({}, defaults); }
}
function save(data){
  try { fs.mkdirSync(path.dirname(FILE), { recursive:true }); fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); return true; }
  catch(e){ console.error('partner-links save:', e.message); return false; }
}
function update(patch){
  var cur = load();
  Object.keys(patch).forEach(function(k){ if (META[k] && patch[k]) cur[k] = String(patch[k]).trim(); });
  save(cur);
  return cur;
}
function resetDefaults(){
  save(defaults);
  return Object.assign({}, defaults);
}
function listGrouped(){
  var cur = load();
  var groups = {};
  Object.keys(META).forEach(function(k){
    var g = META[k].group;
    if (!groups[g]) groups[g] = [];
    groups[g].push({ key: k, value: cur[k] || '', label: META[k].label, desc: META[k].desc, defaultValue: defaults[k] });
  });
  return groups;
}

module.exports = { load, save, update, resetDefaults, listGrouped, META, defaults };
