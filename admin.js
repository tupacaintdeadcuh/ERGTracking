async function enterAdmin(){
  const meRes = await fetch('/api/me', {credentials:'include'});
  const me = await meRes.json();
  if(!me.user){ document.getElementById('need-login').classList.remove('hidden'); return false; }
  if(!me.isPermitted){ document.getElementById('denied').classList.remove('hidden'); return false; }
  const code = prompt('Enter admin passcode:');
  if(!code) return false;
  const r = await fetch('/api/admin/enter', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({passcode: code}), credentials:'include'});
  if(!r.ok){ alert('Invalid passcode'); return false; }
  document.getElementById('need-login').classList.add('hidden');
  document.getElementById('denied').classList.add('hidden');
  document.getElementById('board').classList.remove('hidden');
  return true;
}

async function loadSubs(){
  const r = await fetch('/api/admin/submissions', {credentials:'include'});
  if(!r.ok){ alert('Access error'); return; }
  const j = await r.json();
  const tb = document.querySelector('#tbl-subs tbody'); tb.innerHTML='';
  j.rows.forEach(row=>{
    const tr = document.createElement('tr');
    const data = JSON.parse(row.payload||'{}');
    tr.innerHTML = `<td>${row.id}</td><td>${row.type}</td><td>${row.user_id}</td><td>${new Date(row.created_at).toLocaleString()}</td><td><pre style="white-space:pre-wrap">${JSON.stringify(data,null,2)}</pre></td>`;
    tb.appendChild(tr);
  });
}

document.getElementById('btn-login').onclick = ()=>{ window.location.href='/auth/discord'; };
document.getElementById('btn-logout').onclick = async ()=>{ await fetch('/logout',{method:'POST', credentials:'include'}); location.reload(); };
document.getElementById('btn-enter').onclick = async ()=>{ const ok = await enterAdmin(); if(ok) loadSubs(); };
document.getElementById('btn-refresh').onclick = loadSubs;
