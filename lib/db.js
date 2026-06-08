/**
 * Database JSON-file don gian cho admin panel.
 * Tu dong tao data/db.json voi seed neu chua co.
 */
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');

const VIP_TIERS = [
  { id:0, name:'Thuong',    color:'#8b93a3', minDeposit:0 },
  { id:1, name:'Silver',    color:'#c0c0c0', minDeposit:5000000 },
  { id:2, name:'Gold',      color:'#f1c40f', minDeposit:20000000 },
  { id:3, name:'Platinum',  color:'#9b59b6', minDeposit:50000000 },
  { id:4, name:'Diamond',   color:'#1abc9c', minDeposit:200000000 },
  { id:5, name:'Royal',     color:'#ff3b3b', minDeposit:1000000000 }
];

function seed() {
  const now = Date.now();
  return {
    users: [
      { id:'u1', username:'sang_user',   fullname:'Nguyen Van Sang',  phone:'0912345678', email:'sang@x.vn',   vip:0, balance:50000,    status:'active', joinedAt: now-86400000*30 },
      { id:'u2', username:'mai_chi',     fullname:'Tran Mai Chi',     phone:'0987654321', email:'mai@x.vn',    vip:2, balance:25000000, status:'active', joinedAt: now-86400000*60 },
      { id:'u3', username:'thanh_long',  fullname:'Pham Thanh Long',  phone:'0911223344', email:'long@x.vn',   vip:1, balance:7500000,  status:'active', joinedAt: now-86400000*15 },
      { id:'u4', username:'bo_gia_88',   fullname:'Le Van Boss',      phone:'0922334455', email:'boss@x.vn',   vip:5, balance:1500000000,status:'active', joinedAt: now-86400000*120 },
      { id:'u5', username:'spam_acc',    fullname:'Account spam',     phone:'0933445566', email:'',            vip:0, balance:0,        status:'banned', joinedAt: now-86400000*3, banReason:'Gian lan nap thuong' },
      { id:'u6', username:'hot_idol',    fullname:'Nguyen Mai Phuong',phone:'0944556677', email:'mp@x.vn',     vip:3, balance:75000000, status:'active', joinedAt: now-86400000*45 }
    ],
    blvs: [
      { id:'b1', name:'BLV Anh Quan',     userId:'u3', avatar:'https://i.pravatar.cc/80?img=11', rating:4.8, followers:12500, status:'active',  liveNow:true,  totalStreams:342, registeredAt: now-86400000*100 },
      { id:'b2', name:'BLV Tung Mom',     userId:'u2', avatar:'https://i.pravatar.cc/80?img=12', rating:4.6, followers:8200,  status:'active',  liveNow:false, totalStreams:215, registeredAt: now-86400000*80 },
      { id:'b3', name:'BLV Quang Huy',    userId:'u4', avatar:'https://i.pravatar.cc/80?img=13', rating:4.9, followers:32000, status:'active',  liveNow:true,  totalStreams:580, registeredAt: now-86400000*150 },
      { id:'b4', name:'BLV Tan Binh',     userId:'u1', avatar:'https://i.pravatar.cc/80?img=14', rating:0,   followers:0,     status:'pending', liveNow:false, totalStreams:0,   registeredAt: now-3600000*5,    note:'Co kinh nghiem 2 nam' },
      { id:'b5', name:'BLV Hoang Hai',    userId:null, avatar:'https://i.pravatar.cc/80?img=15', rating:0,   followers:0,     status:'pending', liveNow:false, totalStreams:0,   registeredAt: now-3600000*12,   note:'Pham vi: NBA, La Liga' }
    ],
    idols: [
      { id:'i1', name:'Linh Trang',  userId:'u6', avatar:'https://i.pravatar.cc/80?img=21', age:22, viewers:3420, status:'active',  liveNow:true,  totalStreams:120, registeredAt: now-86400000*40 },
      { id:'i2', name:'Mai Chi',     userId:'u2', avatar:'https://i.pravatar.cc/80?img=22', age:24, viewers:5180, status:'active',  liveNow:true,  totalStreams:230, registeredAt: now-86400000*70 },
      { id:'i3', name:'Thao Vy',     userId:null, avatar:'https://i.pravatar.cc/80?img=23', age:21, viewers:1280, status:'active',  liveNow:false, totalStreams:45,  registeredAt: now-86400000*20 },
      { id:'i4', name:'Bao Chau',    userId:null, avatar:'https://i.pravatar.cc/80?img=24', age:20, viewers:0,    status:'pending', liveNow:false, totalStreams:0,   registeredAt: now-3600000*3, note:'Sinh vien nam 3, IELTS 7.0' },
      { id:'i5', name:'Khanh Linh',  userId:null, avatar:'https://i.pravatar.cc/80?img=25', age:23, viewers:0,    status:'pending', liveNow:false, totalStreams:0,   registeredAt: now-3600000*8, note:'Cua hang thoi trang chu' }
    ],
    obs: [
      { id:'o1', requesterType:'blv',  requesterId:'b4', requesterName:'BLV Tan Binh',  rtmpServer:'',  streamKey:'',                            status:'pending',  createdAt: now-3600000*2,  ip:'113.190.x.x',  device:'OBS Studio 30.1.2',     note:'Stream tran MU vs Liverpool toi nay' },
      { id:'o2', requesterType:'idol', requesterId:'i4', requesterName:'Idol Bao Chau', rtmpServer:'',  streamKey:'',                            status:'pending',  createdAt: now-3600000*1,  ip:'171.244.x.x',  device:'XSplit Broadcaster',    note:'Show ra mat' },
      { id:'o3', requesterType:'blv',  requesterId:'b1', requesterName:'BLV Anh Quan',  rtmpServer:'rtmp://stream.xoso66tv.com/live', streamKey:'sk_anhquan_a8f3kx9p', status:'approved', createdAt: now-86400000*5,  approvedAt: now-86400000*5+3600000, ip:'14.241.x.x', device:'OBS Studio 30.1.0' },
      { id:'o4', requesterType:'idol', requesterId:'i1', requesterName:'Idol Linh Trang',rtmpServer:'rtmp://stream.xoso66tv.com/live', streamKey:'sk_linhtrang_q9j2mt7r', status:'approved', createdAt: now-86400000*7,  approvedAt: now-86400000*7+1800000, ip:'42.117.x.x', device:'OBS Studio 30.0.2' },
      { id:'o5', requesterType:'blv',  requesterId:'b2', requesterName:'BLV Tung Mom',  rtmpServer:'',  streamKey:'',                            status:'rejected', createdAt: now-86400000*2,  rejectedAt: now-86400000*2+7200000, ip:'27.65.x.x',  device:'Unknown', rejectReason:'Thieu kinh nghiem stream the thao' }
    ],
    auditLog: []
  };
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE))  fs.writeFileSync(DB_FILE, JSON.stringify(seed(), null, 2));
}

function load() {
  ensureFile();
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { console.error('[DB] load failed', e); return seed(); }
}

function save(db) {
  ensureFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function genId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 10); }
function genStreamKey(name) {
  var s = (name||'').toLowerCase().replace(/[^a-z0-9]/g, '');
  return 'sk_' + s.slice(0, 12) + '_' + Math.random().toString(36).slice(2, 10);
}

function audit(db, action, target, byUser) {
  db.auditLog.unshift({ id: genId('a'), at: Date.now(), action: action, target: target, by: byUser || 'admin' });
  if (db.auditLog.length > 500) db.auditLog = db.auditLog.slice(0, 500);
}

module.exports = { load, save, seed, VIP_TIERS, genId, genStreamKey, audit };
