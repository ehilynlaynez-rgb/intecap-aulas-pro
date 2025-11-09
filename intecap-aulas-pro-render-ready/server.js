
require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors:{ origin:'*' } });
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'intecap_pro_secret';

app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(path.join(__dirname,'db.sqlite'));
function runSql(file){ db.exec(fs.readFileSync(file,'utf-8'), e=> e&&console.error(e)); }
runSql(path.join(__dirname,'schema.sql'));
db.get("SELECT COUNT(*) c FROM users", (e,r)=>{ if(!e && r && r.c===0) runSql(path.join(__dirname,'seed.sql')); });

// Uploads (damage photos)
const storage = multer.diskStorage({
  destination: (req,file,cb)=> cb(null, path.join(__dirname,'uploads')),
  filename: (req,file,cb)=>{
    const uid = Date.now()+'-'+Math.round(Math.random()*1e9);
    cb(null, 'damage-'+uid+path.extname(file.originalname).toLowerCase());
  }
});
const upload = multer({ storage });

// Helpers
function auth(req,res,next){
  const h = req.headers.authorization||'';
  const t = h.startsWith('Bearer ')? h.slice(7): null;
  if(!t) return res.status(401).json({error:'No autorizado'});
  try{ req.user = jwt.verify(t, JWT_SECRET); next(); } catch(e){ return res.status(401).json({error:'Token inválido'}); }
}
function requireRole(role){
  return (req,res,next)=>{
    if(req.user.role==='admin' || req.user.role===role) return next();
    res.status(403).json({error:'Permisos insuficientes'});
  };
}
function notify(type,payload){
  io.emit('event',{type,payload,at:new Date().toISOString()});
  db.run("INSERT INTO notifications(type,payload)VALUES(?,?)",[type,JSON.stringify(payload)]);
}

// Auth
app.post('/api/register', async (req,res)=>{
  const {name,email,password,role} = req.body;
  if(!name||!email||!password||!role) return res.status(400).json({error:'Campos requeridos'});
  const hash = await bcrypt.hash(password,10);
  db.run("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",[name,email,hash,role], function(err){
    if(err) return res.status(400).json({error:'Email ya registrado'});
    const user = {id:this.lastID,name,email,role};
    const token = jwt.sign(user, JWT_SECRET, {expiresIn:'7d'});
    res.json({token,user});
  });
});
app.post('/api/login', (req,res)=>{
  const {email,password} = req.body;
  db.get("SELECT * FROM users WHERE email=?",[email], async (e,u)=>{
    if(e||!u) return res.status(401).json({error:'Credenciales inválidas'});
    const ok = await bcrypt.compare(password, u.password_hash);
    if(!ok) return res.status(401).json({error:'Credenciales inválidas'});
    const user = {id:u.id,name:u.name,email:u.email,role:u.role};
    const token = jwt.sign(user, JWT_SECRET, {expiresIn:'7d'});
    res.json({token,user});
  });
});

// Rooms
app.get('/api/rooms', auth, (req,res)=>{
  const q = `SELECT r.*, u.name as occupied_by_name FROM rooms r LEFT JOIN users u ON u.id=r.occupied_by_user_id ORDER BY r.id`;
  db.all(q, [], (e,rows)=> res.json(rows||[]));
});
app.post('/api/rooms', auth, requireRole('admin'), (req,res)=>{
  const {name,module,color} = req.body;
  db.run("INSERT INTO rooms(name,module,color)VALUES(?,?,?)",[name,module,color||'#3b82f6'], function(e){
    if(e) return res.status(500).json({error:'Error DB'});
    notify('room_created',{id:this.lastID,name,module,color});
    res.json({id:this.lastID,name,module,color});
  });
});
app.put('/api/rooms/:id', auth, requireRole('admin'), (req,res)=>{
  const {name,module,color} = req.body;
  db.run("UPDATE rooms SET name=?,module=?,color=? WHERE id=?",[name,module,color,req.params.id], function(e){
    if(e) return res.status(500).json({error:'Error DB'});
    notify('room_updated',{id:req.params.id});
    res.json({ok:true});
  });
});
app.delete('/api/rooms/:id', auth, requireRole('admin'), (req,res)=>{
  db.run("DELETE FROM rooms WHERE id=?",[req.params.id], function(e){
    if(e) return res.status(500).json({error:'Error DB'});
    notify('room_deleted',{id:req.params.id});
    res.json({ok:true});
  });
});

// Resources & assignments
app.get('/api/resources', auth, (req,res)=>{
  db.all("SELECT * FROM resources ORDER BY id", [], (e,rows)=> res.json(rows||[]));
});
app.post('/api/resources', auth, requireRole('admin'), (req,res)=>{
  const {name,code,type} = req.body;
  db.run("INSERT INTO resources(name,code,type)VALUES(?,?,?)",[name,code||null,type||null], function(e){
    if(e) return res.status(400).json({error:'Código duplicado o error'});
    notify('resource_created',{id:this.lastID,name,code,type});
    res.json({id:this.lastID,name,code,type});
  });
});
app.post('/api/rooms/:roomId/resources/:resourceId', auth, requireRole('admin'), (req,res)=>{
  db.run("INSERT INTO room_resources(room_id,resource_id)VALUES(?,?)",[req.params.roomId,req.params.resourceId], function(e){
    if(e) return res.status(400).json({error:'Error de asignación'});
    notify('resource_assigned',{room_id:req.params.roomId,resource_id:req.params.resourceId});
    res.json({ok:true});
  });
});

// Resources by room (own + loans)
app.get('/api/rooms/:roomId/resources', auth, (req,res)=>{
  const roomId = +req.params.roomId;
  const ownQ = `
    SELECT res.*, rr.room_id as origin_room_id, ro.color as origin_color, NULL as loan_id, NULL as to_room_id, 'own' as origin
    FROM room_resources rr
    JOIN resources res ON res.id=rr.resource_id
    JOIN rooms ro ON ro.id = rr.room_id
    WHERE rr.room_id = ? AND NOT EXISTS (
      SELECT 1 FROM resource_loans l WHERE l.resource_id = res.id AND l.status='active' AND l.to_room_id != ?
    )`;
  const loanQ = `
    SELECT res.*, l.from_room_id as origin_room_id, ro.color as origin_color, l.id as loan_id, l.to_room_id, 'loan' as origin
    FROM resource_loans l
    JOIN resources res ON res.id = l.resource_id
    JOIN rooms ro ON ro.id = l.from_room_id
    WHERE l.to_room_id = ? AND l.status='active'`;
  db.all(ownQ, [roomId, roomId], (e,own)=>{
    if(e) return res.status(500).json({error:'Error DB'});
    db.all(loanQ, [roomId], (e2,loans)=>{
      if(e2) return res.status(500).json({error:'Error DB'});
      res.json([...(own||[]), ...(loans||[])]);
    });
  });
});

// Reservations (no overlap)
app.post('/api/reservations', auth, (req,res)=>{
  const {room_id,start_time,end_time} = req.body;
  if(!room_id||!start_time||!end_time) return res.status(400).json({error:'Datos incompletos'});
  const q = `SELECT 1 FROM reservations WHERE room_id=? AND status='active' AND NOT( end_time<=? OR start_time>=? ) LIMIT 1`;
  db.get(q,[room_id,start_time,end_time], (e,r)=>{
    if(e) return res.status(500).json({error:'Error DB'});
    if(r) return res.status(400).json({error:'El aula ya está reservada en ese horario'});
    db.run("INSERT INTO reservations(room_id,user_id,start_time,end_time,status)VALUES(?,?,?,?, 'active')",
      [room_id, req.user.id, start_time, end_time], function(err2){
        if(err2) return res.status(500).json({error:'Error DB'});
        db.run("UPDATE rooms SET is_occupied=1, occupied_by_user_id=? WHERE id=?", [req.user.id, room_id]);
        notify('room_reserved',{reservation_id:this.lastID,room_id,user_id:req.user.id,start_time,end_time});
        res.json({id:this.lastID});
      });
  });
});
app.put('/api/reservations/:id/release', auth, (req,res)=>{
  const id = req.params.id;
  db.get("SELECT * FROM reservations WHERE id=?", [id], (e,r)=>{
    if(e||!r) return res.status(404).json({error:'No existe'});
    if(r.status==='released') return res.status(400).json({error:'Ya liberada'});
    db.run("UPDATE reservations SET status='released' WHERE id=?", [id], (e2)=>{
      if(e2) return res.status(500).json({error:'Error DB'});
      db.run("UPDATE rooms SET is_occupied=0, occupied_by_user_id=NULL WHERE id=?", [r.room_id]);
      notify('room_released',{reservation_id:id,room_id:r.room_id,user_id:r.user_id});
      res.json({ok:true});
    });
  });
});
app.get('/api/history', auth, (req,res)=>{
  const out = {};
  db.all("SELECT * FROM reservations ORDER BY id DESC LIMIT 200", [], (e,r)=>{
    out.reservations=r||[];
    db.all("SELECT * FROM damage_reports ORDER BY id DESC LIMIT 200", [], (e2,r2)=>{
      out.damage_reports=r2||[]; res.json(out);
    });
  });
});

// Loans
app.post('/api/loans', auth, (req,res)=>{
  const {resource_id, from_room_id, to_room_id, due_time} = req.body;
  if(!resource_id||!from_room_id||!to_room_id||!due_time) return res.status(400).json({error:'Datos incompletos'});
  db.run("INSERT INTO resource_loans(resource_id,from_room_id,to_room_id,user_id,due_time)VALUES(?,?,?,?,?)",
    [resource_id,from_room_id,to_room_id,req.user.id,due_time], function(e){
      if(e) return res.status(500).json({error:'Error DB'});
      notify('resource_loaned',{id:this.lastID,resource_id,from_room_id,to_room_id,due_time});
      res.json({id:this.lastID});
    });
});
app.put('/api/loans/:id/return', auth, (req,res)=>{
  db.run("UPDATE resource_loans SET status='returned' WHERE id=?", [req.params.id], function(e){
    if(e||this.changes===0) return res.status(400).json({error:'No se pudo actualizar'});
    notify('resource_returned',{id:req.params.id}); res.json({ok:true});
  });
});

// Damage
app.get('/api/damages', auth, (req,res)=>{
  db.all("SELECT * FROM damage_reports ORDER BY id DESC LIMIT 100", [], (e,r)=> res.json(r||[]));
});
app.post('/api/damages', auth, upload.single('image'), (req,res)=>{
  const {room_id,resource_id,description} = req.body;
  if(!room_id||!description) return res.status(400).json({error:'room_id y description requeridos'});
  const image_path = req.file? '/uploads/'+path.basename(req.file.path) : null;
  db.run("INSERT INTO damage_reports(room_id,resource_id,user_id,description,image_path,status)VALUES(?,?,?,?,?, 'reportado')",
    [room_id,resource_id||null,req.user.id,description,image_path], function(e){
      if(e) return res.status(500).json({error:'Error DB'});
      notify('damage_reported',{id:this.lastID,room_id,resource_id});
      res.json({id:this.lastID});
    });
});
app.put('/api/damages/:id/repair', auth, requireRole('tecnico'), (req,res)=>{
  db.run("UPDATE damage_reports SET status='reparado', repaired_by_user_id=?, repaired_at=CURRENT_TIMESTAMP WHERE id=?",
    [req.user.id, req.params.id], function(e){
      if(e||this.changes===0) return res.status(400).json({error:'No se pudo actualizar'});
      notify('damage_repaired',{id:req.params.id}); res.json({ok:true});
    });
});

app.get('*', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

http.listen(PORT, ()=> console.log('Intecap Aulas PRO v6 -> http://localhost:'+PORT));

// Resources with origin mapping
app.get('/api/resources/with-origin', auth, (req,res)=>{
  const q = `SELECT res.*, rr.room_id as origin_room_id, ro.name as origin_room_name, ro.color as origin_color
             FROM resources res
             JOIN room_resources rr ON rr.resource_id = res.id
             JOIN rooms ro ON ro.id = rr.room_id
             ORDER BY res.id`;
  db.all(q, [], (e,rows)=> res.json(rows||[]));
});
