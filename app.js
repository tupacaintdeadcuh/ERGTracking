if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }
const views = ['home','apply','checkin','training','ranks','promote','profile'];
function goto(v){
  views.forEach(id=>document.getElementById('view-'+id)?.classList.add('hidden'));
  document.getElementById('view-'+v)?.classList.remove('hidden');
  if(v==='ranks') renderRanks();
  if(v==='checkin') renderCheckIns();
  if(v==='home') renderHome();
  if(v==='profile') renderProfile();
}
const db = { get(k,def){try{return JSON.parse(localStorage.getItem(k)) ?? def}catch(e){return def}}, set(k,v){localStorage.setItem(k, JSON.stringify(v))} };

let ME=null;
async function fetchMe(){ const r = await fetch('/api/me', {credentials:'include'}); ME = await r.json(); renderAuth(); }
function renderAuth(){
  const loginBtn = document.getElementById('btn-login');
  const logoutBtn = document.getElementById('btn-logout');
  const tag = document.getElementById('me-tag');
  if(ME?.user){
    loginBtn.classList.add('hidden'); logoutBtn.classList.remove('hidden');
    tag.textContent = `${ME.user.username}#${ME.user.discriminator}`;
  } else {
    loginBtn.classList.remove('hidden'); logoutBtn.classList.add('hidden');
    tag.textContent = 'Not signed in';
  }
}
function loginDiscord(){ window.location.href = '/auth/discord'; }
async function logout(){ await fetch('/logout', {method:'POST', credentials:'include'}); await fetchMe(); }

function saveProfile(){
  const p = {
    name: document.getElementById('p-name').value.trim(),
    callsign: document.getElementById('p-callsign').value.trim(),
    platform: document.getElementById('p-platform').value,
    timezone: document.getElementById('p-timezone').value.trim(),
    discordId: ME?.user?.id || document.getElementById('p-discord').value.trim(),
    enlistDate: document.getElementById('p-enlist').value
  };
  db.set('profile', p); alert('Profile saved.'); renderHome();
}
function renderProfile(){
  const p = db.get('profile', {});
  document.getElementById('p-name').value = p.name||'';
  document.getElementById('p-callsign').value = p.callsign||'';
  document.getElementById('p-platform').value = p.platform||'Xbox';
  document.getElementById('p-timezone').value = p.timezone||'';
  document.getElementById('p-discord').value = p.discordId||'';
  document.getElementById('p-enlist').value = p.enlistDate||'';
}
function daysActive(){
  const p = db.get('profile', {});
  if(!p.enlistDate){ return db.get('daysOverride', 0); }
  const start = new Date(p.enlistDate); const now = new Date();
  const ms = now - start; return Math.max(0, Math.floor(ms / 86400000));
}
function setDaysOverride(){ const n = parseInt(prompt('Set days active override:')||'0',10); db.set('daysOverride', isNaN(n)?0:n); renderHome(); renderRanks(); }

// Application
function saveApplication(){
  const application = {
    availability: document.getElementById('app-avail').value.trim(),
    experience: document.getElementById('app-exp').value.trim(),
    preferredFT: document.getElementById('app-ft').value.trim(),
    notes: document.getElementById('app-notes').value.trim(),
    ts: Date.now()
  }; db.set('application', application); alert('Application saved.');
}
async function sendAppServer(){
  const payload = db.get('application', {});
  const r = await fetch('/api/submit/application', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), credentials:'include'});
  if(r.ok) alert('Application submitted.'); else alert('Sign in first.');
}
function exportJSON(key){
  const data = db.get(key, {});
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `erg_${key}.json`; a.click(); URL.revokeObjectURL(url);
}

// Check-ins
function saveCheckIn(){
  const arr = db.get('checkins', []);
  const week = document.getElementById('ci-week').value;
  const acts = document.getElementById('ci-acts').value.trim();
  const issues = document.getElementById('ci-issues').value.trim();
  if(!week){alert('Select a date'); return;}
  const rec = {week, acts, issues, ts: Date.now()};
  arr.unshift(rec); db.set('checkins', arr); renderCheckIns(); alert('Check‑in submitted.');
}
function renderCheckIns(){
  const arr = db.get('checkins', []);
  const tbody = document.querySelector('#ci-table tbody'); if(!tbody) return; tbody.innerHTML='';
  arr.forEach(r=>{ const tr = document.createElement('tr'); tr.innerHTML = `<td>${r.week}</td><td>${(r.acts||'').slice(0,80)}${(r.acts||'').length>80?'…':''}</td>`; tbody.appendChild(tr); });
}
async function sendLastCheckInServer(){
  const arr = db.get('checkins', []); if(!arr.length){ alert('No check‑ins yet'); return; }
  const r = await fetch('/api/submit/checkin', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(arr[0]), credentials:'include'});
  if(r.ok) alert('Check‑in submitted.'); else alert('Sign in first.');
}

// Training
function saveTraining(){
  const t = {
    lead: document.getElementById('t-lead').checked,
    med: document.getElementById('t-med').checked,
    nav: document.getElementById('t-nav').checked,
    recruit: document.getElementById('t-recruit').checked,
    nine: document.getElementById('t-nine').checked,
    notes: document.getElementById('t-notes').value.trim()
  }; db.set('training', t); alert('Training saved.');
}
async function sendTrainingServer(){
  const r = await fetch('/api/submit/training', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(db.get('training', {})), credentials:'include'});
  if(r.ok) alert('Training submitted.'); else alert('Sign in first.');
}

// Ranks
const RANKS = [
  {rank:'E-1 Recruit', days:0, req:'—'},
  {rank:'E-2 Private', days:30, req:'—'},
  {rank:'E-3 PFC', days:65, req:'—'},
  {rank:'E-4 Specialist/Corporal', days:100, req:'—'},
  {rank:'E-5 Sergeant', days:145, req:'Leadership + Basic Medical + Basic Land Nav + SOCOM Admin & FTL Board approval'},
  {rank:'E-6 Staff Sergeant', days:205, req:'Recruitment Course'},
  {rank:'E-7 Sergeant First Class', days:280, req:'—'},
  {rank:'E-8 Master Sergeant/1SG', days:370, req:'—'},
  {rank:'E-9 Sergeant Major', days:490, req:'NINE‑LINE MEDEVAC Certification'}
];
function renderRanks(){
  const days = daysActive();
  const body = document.getElementById('rank-body'); if(!body) return; body.innerHTML='';
  RANKS.forEach(r=>{ const tr = document.createElement('tr'); tr.innerHTML = `<td>${r.rank}</td><td>${r.days}</td><td>${r.req}</td>`; if(days>=r.days) tr.style.color = '#22c55e'; body.appendChild(tr); });
}

// Promotion
function exportPromotion(){
  const p = db.get('profile', {}); const t = db.get('training', {});
  const pay = { profile: p, training: t, statement: document.getElementById('pr-statement').value.trim(), desiredRank: document.getElementById('pr-rank').value, ts: Date.now() };
  const blob = new Blob([JSON.stringify(pay,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'erg_promotion_request.json'; a.click(); URL.revokeObjectURL(url);
}
async function sendPromotionServer(){
  const payload = { desiredRank: document.getElementById('pr-rank').value, statement: document.getElementById('pr-statement').value.trim() };
  const r = await fetch('/api/submit/promotion', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), credentials:'include'});
  if(r.ok) alert('Promotion submitted.'); else alert('Sign in first.');
}

// Home
function renderHome(){
  document.getElementById('kpi-days').textContent = daysActive();
  const d = daysActive(); let current = 'E-1 Recruit'; for(const r of RANKS){ if(d>=r.days) current = r.rank; } document.getElementById('kpi-rank').textContent = current;
}

// Init
fetchMe().then(()=>{ goto('home'); renderHome(); renderCheckIns(); renderRanks(); renderProfile(); });
