
const API = location.origin + '/api';
const token = localStorage.getItem('token'); if(!token) location.href='/';
const user = JSON.parse(localStorage.getItem('user')||'{}');
document.getElementById('who').textContent = `${user.name} · ${user.role}`;
document.getElementById('logout').onclick = ()=>{ localStorage.clear(); location.href='/'; };
if(user.role==='admin') document.getElementById('adminLink').classList.remove('hidden');
if(user.role==='tecnico'||user.role==='admin') document.getElementById('techLink').classList.remove('hidden');

const s = io(); s.on('event', e=>{ pushFeed(`${e.type} • ${JSON.stringify(e.payload)}`); loadRooms(); if(e.type==='reservation_due_soon' && e.payload.user_id===user.id){ $toast('⏰ 5 min para devolver recursos de tu reserva','warning'); }});
function pushFeed(msg){ const f=document.getElementById('feed'); const x=document.createElement('div'); x.className='p-3 rounded-xl bg-slate-900/60 border border-slate-800'; x.textContent=`${new Date().toLocaleTimeString()} — ${msg}`; f.prepend(x); if(f.children.length>20) f.removeChild(f.lastChild); }


async function api(path, opts = {}) {
  const token = localStorage.getItem('token');
  const headers = opts.headers || {};
  const isForm = opts.body instanceof FormData;
  const cfg = {
    ...opts,
    headers: {
      'Authorization': 'Bearer ' + token,
      ...(isForm ? {} : {'Content-Type': 'application/json'}),
      ...headers
    }
  };
  const resp = await fetch('/api' + path, cfg);
  if (resp.status === 401) {
    localStorage.clear();
    if (typeof $toast === 'function') { $toast('Tu sesión expiró. Inicia sesión nuevamente.', 'warning'); }
    setTimeout(()=> location.href='/', 800);
    return null;
  }
  try { return await resp.json(); } catch { return null; }
}

  };
  const resp = await fetch('/api' + path, config);
  if (resp.status === 401) {
    localStorage.clear();
    $toast('Tu sesión expiró. Por favor vuelve a iniciar sesión.', 'warning');
    setTimeout(()=> location.href = '/', 1200);
    return;
  }
  try { return await resp.json(); } catch { return null; }
}){
  const r = await fetch(API+path, { ...opts, headers:{ 'Authorization':'Bearer '+token, ...(opts.headers||{}), 'Content-Type': (opts.body instanceof FormData)? undefined : 'application/json' }});
  return r.json();
}

// Croquis simple (posiciones predefinidas para 5 aulas)
const slots = [
  {id:1,x:20,y:20,w:30,h:25},
  {id:2,x:55,y:20,w:25,h:25},
  {id:3,x:20,y:50,w:25,h:25},
  {id:4,x:50,y:55,w:40,h:18},
  {id:5,x:75,y:20,w:20,h:25},
];


async function loadRooms(){
  const rooms = await api('/rooms');
  renderMapGrid(rooms);
}
function renderMapGrid(rooms){
  const map=document.getElementById('map'); 
  map.innerHTML='';
  map.className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4';
  rooms.forEach(r=>{
    const card=document.createElement('div');
    card.className='rounded-xl p-4 shadow-lg border border-slate-800 bg-slate-900/70 hover:scale-[1.01] transition cursor-pointer';
    card.innerHTML=`
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="inline-block w-3 h-3 rounded-full" style="background:${r.color}"></span>
          <div class="font-semibold">${r.name}</div>
        </div>
        <div class="text-xs ${r.is_occupied?'text-red-400':'text-emerald-400'}">${r.is_occupied?'Ocupada':'Libre'}</div>
      </div>
      <div class="mt-1 text-xs text-slate-400">${r.module}</div>
      ${r.is_occupied && r.occupied_by_name ? `<div class="text-xs text-slate-400 mt-1">Por: <b>${r.occupied_by_name}</b></div>`:''}
      <div class="mt-3 flex gap-2 flex-wrap">
        ${r.is_occupied? `<button data-act="release" data-id="${r.id}" class="px-3 py-1 rounded-lg bg-slate-800">Liberar</button>`: `<button data-act="reserve" data-id="${r.id}" class="px-3 py-1 rounded-lg bg-cyan-700">Reservar</button>`}
        <button data-act="resources" data-id="${r.id}" class="px-3 py-1 rounded-lg bg-slate-800">Recursos</button>
      </div>`;
    // whole card clickable -> room page
    card.addEventListener('click', (ev)=>{
      const tag = ev.target.tagName.toLowerCase();
      if(tag==='button') return; // buttons keep their handlers
      location.href = `/room.html?id=${r.id}`;
    });
    map.appendChild(card);
  });
  map.querySelectorAll('button').forEach(btn=>{
    btn.onclick = async (ev)=>{
      ev.stopPropagation();
      const id = +btn.dataset.id;
      const act = btn.dataset.act;
      if(act==='reserve') openReserve(id);
      if(act==='resources') location.href = `/room.html?id=${id}`;
      if(act==='release'){
        const hist=await api('/history');
        const resv=(hist.reservations||[]).find(x=>x.room_id===id && x.status==='active');
        if(!resv) return $toast('No hay reserva activa','warning');
        const r=await api('/reservations/'+resv.id+'/release',{method:'PUT'});
        if(r.error) return $toast(r.error,'error'); $toast('Aula liberada','info'); loadRooms();
      }
    };
  });
}
        <button data-act="resources" data-id="${r.id}" class="px-3 py-1 rounded-lg bg-slate-800">Recursos</button>
      </div>`;
    map.appendChild(card);
  });
  map.querySelectorAll('button').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = +btn.dataset.id;
      const act = btn.dataset.act;
      if(act==='reserve') openReserve(id);
      if(act==='resources') openResources(id);
      if(act==='release'){
        const hist=await api('/history');
        const resv=(hist.reservations||[]).find(x=>x.room_id===id && x.status==='active');
        if(!resv) return $toast('No hay reserva activa','warning');
        const r=await api('/reservations/'+resv.id+'/release',{method:'PUT'});
        if(r.error) return $toast(r.error,'error'); $toast('Aula liberada','info'); loadRooms();
      }
    };
  });
}

function openReserve(room_id){
  document.getElementById('res_room').value = room_id;
  const now=new Date(); const s=new Date(now.getTime()+5*60*1000); const e=new Date(s.getTime()+60*60*1000);
  const fmt=d=> new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  document.getElementById('res_start').value=fmt(s); document.getElementById('res_end').value=fmt(e);
  const modal=document.getElementById('reserveModal'); modal.classList.remove('hidden'); modal.classList.add('flex');
  openResources(room_id); // también mostramos recursos dentro del modal
}
document.getElementById('closeReserve').onclick = ()=>{
  const modal=document.getElementById('reserveModal'); modal.classList.add('hidden'); modal.classList.remove('flex');
  document.getElementById('resResources').innerHTML='';
};
document.getElementById('reserveForm').onsubmit = async (e)=>{
  e.preventDefault();
  const room_id=+document.getElementById('res_room').value;
  const start_time=document.getElementById('res_start').value;
  const end_time=document.getElementById('res_end').value;
  const r=await api('/reservations',{method:'POST', body: JSON.stringify({room_id,start_time,end_time})});
  if(r.error){ $toast(r.error,'error'); return; }
  $toast('Reserva creada ✅','success');
  document.getElementById('closeReserve').click();
  loadRooms();
  const t=new Date(end_time).getTime()-Date.now()-5*60*1000; if(t>0) setTimeout(()=> $toast('⏰ 5 min para devolver recursos prestados','warning'), t);
};

async function openResources(room_id){
  const list=await api('/rooms/'+room_id+'/resources');
  const box=document.getElementById('resResources');
  box.innerHTML = `<div class='text-sm text-slate-300 mb-2'>Recursos del aula #${room_id}</div>` + 
    (list.length? list.map(x=>{
      const badge = `<span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${x.origin_color||'#94a3b8'}"></span>`;
      const loan = x.origin==='loan' ? `<span class="ml-2 text-amber-400">prestado</span>` : '';
      return `<div class="flex items-center gap-2 text-sm py-1">${badge}<span>${x.type||x.name}</span><span class="text-slate-400">${x.code||''}</span>${loan}</div>`;
    }).join('') : '<div class="text-slate-500">Sin recursos</div>');
}

loadRooms();
