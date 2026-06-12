/**
 * Gifts Store - quản lý quà tặng động (admin upload)
 * Lưu vào data/gifts-custom.json
 * Quà admin upload sẽ APPEND vào pool có sẵn (lib/gifts.js)
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'gifts-custom.json');

function _ensure(){
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ gifts: [] }, null, 2));
}

function load(){
  _ensure();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch(e){ return { gifts: [] }; }
}
function save(data){
  _ensure();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function genId(){
  return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function list(){
  return load().gifts || [];
}

function add(input){
  const data = load();
  const item = {
    id: input.id || genId(),
    name: String(input.name || 'Quà').slice(0, 60),
    image: String(input.image || ''),
    price: Math.max(0, parseInt(input.price, 10) || 0),
    tier: ['common', 'rare', 'epic', 'legendary'].includes(input.tier) ? input.tier : 'common',
    enabled: input.enabled !== false,
    order: parseInt(input.order, 10) || data.gifts.length,
    createdAt: Date.now()
  };
  data.gifts.push(item);
  save(data);
  return item;
}

function update(id, patch){
  const data = load();
  const idx = data.gifts.findIndex(g => g.id === id);
  if (idx === -1) return null;
  ['name', 'image', 'price', 'tier', 'enabled', 'order'].forEach(k => {
    if (patch[k] !== undefined) {
      if (k === 'price' || k === 'order') data.gifts[idx][k] = parseInt(patch[k], 10) || 0;
      else if (k === 'enabled') data.gifts[idx][k] = !!patch[k];
      else data.gifts[idx][k] = String(patch[k]).slice(0, 200);
    }
  });
  data.gifts[idx].updatedAt = Date.now();
  save(data);
  return data.gifts[idx];
}

function remove(id){
  const data = load();
  const before = data.gifts.length;
  data.gifts = data.gifts.filter(g => g.id !== id);
  save(data);
  return data.gifts.length < before;
}

function findById(id){
  return list().find(g => g.id === id) || null;
}

// Get gifts cho gift panel (enabled + sorted)
function activeGifts(){
  return list()
    .filter(g => g.enabled !== false && g.image)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

module.exports = { list, add, update, remove, findById, activeGifts };
