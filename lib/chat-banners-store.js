/**
 * Chat Banners Store - 3 slot banner trên đầu khung chat phòng live
 * Lưu vào data/chat-banners.json
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'chat-banners.json');

const DEFAULT = {
  banners: [
    { id: 'b1', image: '', link: '', enabled: false, label: 'Banner 1' },
    { id: 'b2', image: '', link: '', enabled: false, label: 'Banner 2' },
    { id: 'b3', image: '', link: '', enabled: false, label: 'Banner 3' }
  ]
};

function _ensure(){
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(DEFAULT, null, 2));
}
function load(){
  _ensure();
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(d.banners) || d.banners.length !== 3) return DEFAULT;
    return d;
  } catch(e){ return DEFAULT; }
}
function save(data){
  _ensure();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function list(){
  return load().banners;
}

function update(id, patch){
  const data = load();
  const idx = data.banners.findIndex(b => b.id === id);
  if (idx === -1) return null;
  if (patch.image !== undefined) data.banners[idx].image = String(patch.image).slice(0, 500);
  if (patch.link !== undefined) data.banners[idx].link = String(patch.link).slice(0, 500);
  if (patch.enabled !== undefined) data.banners[idx].enabled = !!patch.enabled;
  if (patch.label !== undefined) data.banners[idx].label = String(patch.label).slice(0, 80);
  data.banners[idx].updatedAt = Date.now();
  save(data);
  return data.banners[idx];
}

// Get banners cho frontend (enabled + có ảnh)
function active(){
  return list().filter(b => b.enabled && b.image);
}

module.exports = { list, update, active };
