
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import cors from 'cors';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const PERMITTED_IDS = (process.env.PERMITTED_IDS || '').split(',').map(s=>s.trim()).filter(Boolean);
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'CHANGE_ME';

// DB
const db = new Database(path.join(__dirname, 'erg.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  discriminator TEXT,
  avatar TEXT,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  user_id TEXT,
  payload TEXT,
  created_at INTEGER
);
`);

// Trust proxy for secure cookies on Render/Cloud
app.set('trust proxy', 1);

// CORS (allow frontend origin for credentials)
app.use(cors({
  origin: PUBLIC_ORIGIN,
  credentials: true
}));

// Sessions (secure cookies for cross-site)
app.use(session({
  secret: process.env.SESSION_SECRET || 'erg-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none',
    maxAge: 1000*60*60*24*30
  }
}));

// Passport (Discord)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  try{
    const row = db.prepare("SELECT id, username, discriminator, avatar FROM users WHERE id = ?").get(id);
    if(!row) return done(null, false);
    done(null, row);
  }catch(e){ done(e); }
});

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
  try{
    const { id, username, discriminator, avatar } = profile;
    db.prepare(`INSERT INTO users (id, username, discriminator, avatar, created_at)
                VALUES (@id, @username, @discriminator, @avatar, @created_at)
                ON CONFLICT(id) DO UPDATE SET username=@username, discriminator=@discriminator, avatar=@avatar`)
      .run({ id, username, discriminator, avatar, created_at: Date.now() });
    return done(null, { id, username, discriminator, avatar });
  }catch(e){ return done(e); }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json({ limit: '1mb' }));

// Auth
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/callback',
  passport.authenticate('discord', { failureRedirect: '/?auth=failed' }),
  (req, res) => res.redirect('/'));

app.post('/logout', (req, res) => {
  req.logout(function(){ res.json({ ok: true }); });
});

// Helpers
function requireAuth(req, res, next){
  if(req.isAuthenticated()) return next();
  res.status(401).json({ error: 'unauthenticated' });
}
function isPermitted(userId){
  return PERMITTED_IDS.includes(userId);
}

// Admin passcode gate
app.post('/api/admin/enter', requireAuth, (req, res) => {
  let body=''; req.on('data', c=>body+=c); req.on('end', ()=>{
    try{
      const parsed = JSON.parse(body||'{}');
      if((parsed.passcode||'') !== ADMIN_PASSCODE){ return res.status(403).json({ error: 'invalid passcode' }); }
      req.session.adminPassOk = true;
      res.json({ ok: true });
    }catch(e){
      res.status(400).json({ error: 'bad json' });
    }
  });
});

app.get('/api/me', (req, res) => {
  if(!req.user) return res.json({ user: null });
  res.json({ user: req.user, isPermitted: isPermitted(req.user.id), passOk: !!req.session.adminPassOk });
});

app.get('/api/is-admin', requireAuth, (req, res) => {
  res.json({ ok: !!req.user && isPermitted(req.user.id) && !!req.session.adminPassOk });
});

// Webhook helper
async function maybeWebhook(title, payload){
  if(!WEBHOOK_URL) return;
  try{
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        content: title,
        embeds: [{ title, color: 0x38bdf8, fields: [
          { name: 'Type', value: payload.type },
          { name: 'User', value: payload.user?.username ? `${payload.user.username}#${payload.user.discriminator}` : (payload.user?.id || '-') },
          { name: 'Data', value: '```json\\n' + JSON.stringify(payload.data).slice(0,1500) + '\\n```' }
        ]}]
      })
    });
  }catch(e){
    console.error('Webhook failed', e.message);
  }
}

// Submissions
app.post('/api/submit/:type', requireAuth, async (req, res) => {
  const type = req.params.type; // application/checkin/training/promotion
  let body=''; req.on('data', c=>body+=c); req.on('end', async ()=>{
    let data={}; try{ data = JSON.parse(body||'{}'); }catch(e){}
    db.prepare("INSERT INTO submissions (type, user_id, payload, created_at) VALUES (?, ?, ?, ?)")
      .run(type, req.user.id, JSON.stringify(data), Date.now());
    await maybeWebhook(`ERG ${type} submission`, { type, user: req.user, data });
    res.json({ ok: true });
  });
});

// Admin list
app.get('/api/admin/submissions', requireAuth, (req, res) => {
  if(!isPermitted(req.user.id) || !req.session.adminPassOk) return res.status(403).json({ error: 'forbidden' });
  const rows = db.prepare("SELECT id, type, user_id, payload, created_at FROM submissions ORDER BY id DESC LIMIT 200").all();
  res.json({ rows });
});

// Static client
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`ERG server running on ${PORT} (origin ${PUBLIC_ORIGIN})`));
