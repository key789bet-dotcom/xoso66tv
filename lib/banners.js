/**
 * Banner store - lưu vào data/banners.json
 * Seed từ partners.banners nếu file chưa tồn tại
 */
const fs   = require('fs');
const path = require('path');
const partners = require('./partners');

const FILE = path.join(__dirname, '..', 'data', 'banners.json');

function _id(){ return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function load(){
  try {
    if (!fs.existsSync(FILE)) {
      // Seed từ partners.js
      var seed = (partners.banners || []).map(function(b){
        return Object.assign({ id:_id(), active:true, image:'', createdAt: Date.now() }, b);
      });
      save(seed);
      return seed;
    }
    return JSON.parse(fs.readFileSync(FILE, 'utf8') || '[]');
  } catch(e){ console.error('banners.load:', e.message); return []; }
}

function save(list){
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive:true });
    // 🐛 DEBUG: trace ai ghi file + ghi gì + worker nào
    var urls = list.map(function(b){ return b.url || '(no url)'; }).join(' | ');
    var caller = (new Error().stack || '').split('\n').slice(2, 5).map(function(s){ return s.trim(); }).join('\n  ');
    console.log('[banners.save] ' + new Date().toISOString() + ' PID:' + process.pid + ' URLs: ' + urls);
    console.log('[banners.save] caller:\n  ' + caller);
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch(e){ console.error('banners.save:', e.message); return false; }
}

function listActive(){
  return load().filter(function(b){ return b.active !== false; });
}

function create(data){
  var list = load();
  var b = Object.assign({ id:_id(), active:true, createdAt: Date.now() }, data);
  list.push(b);
  save(list);
  return b;
}

function update(id, data){
  var list = load();
  var i = list.findIndex(function(x){ return x.id === id });
  if (i < 0) return null;
  list[i] = Object.assign({}, list[i], data);
  save(list);
  return list[i];
}

function remove(id){
  var list = load();
  var n = list.length;
  list = list.filter(function(x){ return x.id !== id });
  save(list);
  return n - list.length;
}

module.exports = { load, save, listActive, create, update, remove };
