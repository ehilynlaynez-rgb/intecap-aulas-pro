
const API = location.origin + '/api';
function jpost(path, body){
  return fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
}
document.getElementById('loginBtn').onclick = async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if(!email || !password){ $toast('Completa tu correo y contraseña','warning'); return; }
  const res = await jpost('/login', {email,password});
  if(res.token){
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    $toast('Bienvenida, '+res.user.name,'success');
    location.href = '/dashboard.html';
  }else{
    $toast(res.error||'Error al iniciar sesión','error');
  }
};
document.getElementById('registerBtn').onclick = async () => {
  const name = document.getElementById('r_name').value.trim();
  const email = document.getElementById('r_email').value.trim();
  const password = document.getElementById('r_password').value;
  const role = document.getElementById('r_role').value;
  if(!name||!email||!password){ $toast('Completa los campos','warning'); return; }
  const res = await jpost('/register', {name,email,password,role});
  if(res.token){
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    $toast('Cuenta creada ✅','success');
    location.href = '/dashboard.html';
  }else{
    $toast(res.error||'No se pudo registrar','error');
  }
};
document.getElementById('scrollReg').onclick = (e)=>{ e.preventDefault(); document.getElementById('regBox').scrollIntoView({behavior:'smooth'}); };
