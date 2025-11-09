
const API = location.origin + '/api';
const token = localStorage.getItem('token'); if(!token) location.href='/';

async function api(path, opts = {}) {
  const token = localStorage.getItem('token');
  const headers = opts.headers || {};
  const isForm = opts.body instanceof FormData;
  const config = {
    ...opts,
    headers: {
      'Authorization': 'Bearer ' + token,
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...headers
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
  const r = await fetch(API+path, { ...opts, headers: { 'Authorization': 'Bearer ' + token, ...(opts.headers||{}) }});
  return r.json();
}
document.getElementById('damageForm').onsubmit = async (e)=>{
  e.preventDefault();
  const fd = new FormData();
  fd.append('room_id', document.getElementById('room_id').value);
  const rid=document.getElementById('resource_id').value; if(rid) fd.append('resource_id', rid);
  fd.append('description', document.getElementById('description').value);
  const file=document.getElementById('image').files[0]; if(file) fd.append('image', file);
  const r = await fetch(API+'/damages', { method:'POST', headers:{ 'Authorization':'Bearer '+token }, body: fd});
  const d = await r.json(); document.getElementById('msg').textContent = d.error? d.error : 'Reporte enviado ✅';
  loadDamages();
};
async function loadDamages(){
  const list=document.getElementById('damageList'); list.innerHTML='';
  const r=await api('/damages'); const me=JSON.parse(localStorage.getItem('user')||'{}');
  (r||[]).forEach(d=>{
    const row=document.createElement('div');
    row.className='flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-sm';
    row.innerHTML=`<div><b>#${d.id}</b> · Aula ${d.room_id||'-'} · Recurso ${d.resource_id||'-'}<div class="text-slate-400">${d.description||''}</div></div>
    <div class="flex items-center gap-2">
      ${d.image_path? `<a class="px-3 py-1 bg-slate-800 rounded" href="${d.image_path}" target="_blank">Foto</a>`:''}
      ${(me.role==='tecnico'||me.role==='admin') && d.status!=='reparado' ? `<button data-id="${d.id}" class="px-3 py-1 bg-emerald-700 rounded">Marcar reparado</button>`:`<span class="text-slate-400">${d.status}</span>`}
    </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('button').forEach(b=> b.onclick = async ()=>{
    const r = await api('/damages/'+b.dataset.id+'/repair', { method:'PUT' });
    if(r.error){ $toast(r.error,'error'); return; }
    $toast('Marcado como reparado','success'); loadDamages();
  });
}
loadDamages();
