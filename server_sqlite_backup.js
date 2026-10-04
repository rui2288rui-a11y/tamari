// Tamari サーバー(外部部品なし。Node.js 22.13 以上、できれば 24 で動きます)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.PORT || 3000;
const ADMIN_KEY = (process.env.ADMIN_KEY || '').trim();
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // nginx / Cloudflare などの後ろで動かすときだけ 1 にする
let FILE_CFG = {}; try { FILE_CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch (e) { console.log('config.json を読めませんでした(なくても動きます)'); }
const CFG = { reportUrl: process.env.REPORT_FORM_URL || FILE_CFG.REPORT_FORM_URL || '', contactUrl: process.env.CONTACT_FORM_URL || FILE_CFG.CONTACT_FORM_URL || '' };
const DATA = process.env.DATA_DIR || __dirname, UP = path.join(DATA, 'uploads'), PUB = path.join(__dirname, 'public');
fs.mkdirSync(UP, { recursive: true });
if (!fs.existsSync(path.join(PUB, 'index.html'))) console.log('【注意】 public フォルダに index.html が見つかりません。画面用のファイルは public フォルダに入れてください。');

// ---------- データベース ----------
const db = new DatabaseSync(path.join(DATA, 'tamari.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, display TEXT NOT NULL, pw TEXT NOT NULL, bio TEXT DEFAULT '', likes TEXT DEFAULT '', interests TEXT DEFAULT '', avatar TEXT DEFAULT '', bg TEXT DEFAULT '', status TEXT DEFAULT 'ok', created INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS chats(id INTEGER PRIMARY KEY, a INTEGER, b INTEGER, created INTEGER, last INTEGER, UNIQUE(a,b));
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, chat INTEGER, user INTEGER, body TEXT, image TEXT, created INTEGER, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS follows(a INTEGER, b INTEGER, PRIMARY KEY(a,b)); -- 「つながり」。a が b に「また話したい」を伝えた記録。お互いにあるとつながり成立
CREATE TABLE IF NOT EXISTS blocks(a INTEGER, b INTEGER, PRIMARY KEY(a,b));`);
const one = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a), run = (s, ...a) => db.prepare(s).run(...a);
for (const c of ["status_line TEXT DEFAULT ''", "quote TEXT DEFAULT ''", "hobbies TEXT DEFAULT ''", "accent TEXT DEFAULT 'gray'", "layout TEXT DEFAULT ''", "video TEXT DEFAULT ''", "inbox TEXT DEFAULT 'all'", "home_visible INTEGER DEFAULT 1"]) { try { db.exec('ALTER TABLE users ADD COLUMN ' + c); } catch (e) { /* すでにある */ } }
db.exec(`CREATE TABLE IF NOT EXISTS links(id INTEGER PRIMARY KEY, user INTEGER, title TEXT, url TEXT, sort INTEGER);
CREATE TABLE IF NOT EXISTS shots(user INTEGER PRIMARY KEY, day TEXT, image TEXT, caption TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS diaries(id INTEGER PRIMARY KEY, user INTEGER, body TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS replies(id INTEGER PRIMARY KEY, diary INTEGER, user INTEGER, stamp TEXT, body TEXT, created INTEGER, UNIQUE(diary,user));
CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY, user INTEGER, kind TEXT, data TEXT, created INTEGER, seen INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS i_msg ON messages(chat,id); CREATE INDEX IF NOT EXISTS i_msg_user ON messages(user);
CREATE INDEX IF NOT EXISTS i_fol_b ON follows(b); CREATE INDEX IF NOT EXISTS i_blk_b ON blocks(b);
CREATE INDEX IF NOT EXISTS i_ses ON sessions(user); CREATE INDEX IF NOT EXISTS i_not ON notices(user,id);
CREATE INDEX IF NOT EXISTS i_dia ON diaries(user); CREATE INDEX IF NOT EXISTS i_rep ON replies(diary);
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY,
  user INTEGER NOT NULL,
  body TEXT DEFAULT '',
  image TEXT DEFAULT '',
  video TEXT DEFAULT '',
  created INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS post_reactions(
  post INTEGER NOT NULL,
  user INTEGER NOT NULL,
  kind TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY(post,user)
);
CREATE TABLE IF NOT EXISTS post_replies(
  id INTEGER PRIMARY KEY,
  post INTEGER NOT NULL,
  user INTEGER NOT NULL,
  body TEXT NOT NULL,
  created INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS i_posts_user ON posts(user,id);
CREATE TABLE IF NOT EXISTS post_reactions(
  post INTEGER NOT NULL,
  user INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'いいね',
  created INTEGER NOT NULL,
  PRIMARY KEY(post,user)
);
CREATE INDEX IF NOT EXISTS i_pr_post ON post_reactions(post);
CREATE INDEX IF NOT EXISTS i_pp_post ON post_replies(post,id);
CREATE TABLE IF NOT EXISTS post_reply_reactions(
  reply INTEGER NOT NULL,
  user INTEGER NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY(reply,user)
);
CREATE INDEX IF NOT EXISTS i_prr_reply ON post_reply_reactions(reply);`);
db.exec(`CREATE TABLE IF NOT EXISTS message_reads(chat INTEGER NOT NULL,user INTEGER NOT NULL,read_at INTEGER NOT NULL,PRIMARY KEY(chat,user));`);
try { db.exec('ALTER TABLE post_replies ADD COLUMN parent INTEGER DEFAULT NULL'); } catch (e) { if (!/duplicate column name/i.test(e.message)) console.error('post_replies migration:', e.message); }


// ---------- 小さな道具 ----------
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const cleanML = (s, n) => String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, n);
const HOUR = 36e5, DAY = 24 * HOUR;
const hits = new Map();
const rl = (k, max, ms) => { const t = Date.now(), a = (hits.get(k) || []).filter(x => t - x < ms); if (a.length >= max) { hits.set(k, a); return false; } a.push(t); hits.set(k, a); return true; };
const tooMany = (k, max, ms) => (hits.get(k) || []).filter(x => Date.now() - x < ms).length >= max;
const hashPw = pw => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
const checkPw = (pw, st) => { try { const [s, h] = String(st).split(':'), x = crypto.scryptSync(pw, s, 32), y = Buffer.from(h, 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); } catch (e) { return false; } };
const DUMMY_PW = hashPw('dummy-password-for-timing');
const blockedPair = (a, b) => !!one('SELECT 1 x FROM blocks WHERE (a=? AND b=?) OR (a=? AND b=?)', a, b, b, a);
const mutualPair = (a, b) => !!one('SELECT 1 x FROM follows f JOIN follows g ON g.a=f.b AND g.b=f.a WHERE f.a=? AND f.b=?', a, b);
const visible = (me, u) => u && u.status === 'ok' && !blockedPair(me, u.id);
const BLOCKS = ['status', 'bio', 'shot', 'video', 'likes', 'hobbies', 'interests', 'quote', 'diary', 'links', 'follow'], ACCENTS = ['gray', 'blue', 'purple', 'green', 'orange', 'red'];
const STAMPS = ['わかる', 'おつかれさま', 'おもしろい', 'ありがとう', 'すごい'], INBOX = ['all', 'mutual', 'off'];
const RESERVED = /^(admin|administrator|tamari|support|staff|system|root|official|moderator|mod|info|help|null|undefined|api|uploads)$/i;
const IMPERSONATE = /運営|管理人|管理者|tamari|たまり運営/i;
const dayKey = () => new Date(Date.now() + 9 * HOUR).toISOString().slice(0, 10);
function normLayout(raw) { let a = []; try { a = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { /* 空でよい */ } if (!Array.isArray(a)) a = []; const seen = new Set(), out = []; for (const x of a) if (x && BLOCKS.includes(x.id) && !seen.has(x.id)) { seen.add(x.id); out.push({ id: x.id, show: x.show !== false }); } for (const id of BLOCKS) if (!seen.has(id)) out.push({ id, show: true }); return out; }
// 相手に見せてよい最小限のプロフィール(非表示にした項目は含めない)
const card = u => { const hid = new Set(normLayout(u.layout).filter(x => !x.show).map(x => x.id)); return { username: u.username, display: u.display, avatar: u.avatar, bio: hid.has('bio') ? '' : u.bio, likes: hid.has('likes') ? '' : u.likes, interests: hid.has('interests') ? '' : u.interests, statusLine: hid.has('status') ? '' : (u.status_line || ''), online: conns.has(u.id) }; };

// ---------- 画像・動画の検査と保存 ----------
function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
  if (b.subarray(0, 3).toString() === 'GIF') return 'gif';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
function imgSize(b, ext) { // 画像の縦横(ピクセル)をファイルの先頭から読む。読めなければ null
  try {
    if (ext === 'png') return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (ext === 'gif') return [b.readUInt16LE(6), b.readUInt16LE(8)];
    if (ext === 'webp') { const t = b.subarray(12, 16).toString();
      if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
      if (t === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
      if (t === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1]; return null; }
    let i = 2; while (i + 9 < b.length) { if (b[i] !== 0xFF) { i++; continue; } const k = b[i + 1];
      if (k >= 0xC0 && k <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(k)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      if (k === 0xD8 || k === 0x01 || (k >= 0xD0 && k <= 0xD7)) { i += 2; continue; } i += 2 + b.readUInt16BE(i + 2); }
  } catch (e) { /* 読めない */ }
  return null;
}
function saveImage(data, maxBytes) {
  const mm = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(data || '')); if (!mm) throw new Error('画像の形式が正しくありません。別の画像でお試しください');
  const buf = Buffer.from(mm[1], 'base64'); if (buf.length > maxBytes) throw new Error('画像は' + (maxBytes / 1048576) + 'MB以下にしてください');
  const ext = sniff(buf); if (!ext) throw new Error('png / jpg / gif / webp の画像だけ使えます');
  const sz = imgSize(buf, ext); if (!sz || !sz[0] || !sz[1]) throw new Error('画像のサイズを確認できませんでした。別の画像でお試しください');
  if (sz[0] > 8000 || sz[1] > 8000 || sz[0] * sz[1] > 40e6) throw new Error('画像が大きすぎます(縦横8000px以内にしてください)');
  const name = crypto.randomBytes(16).toString('hex') + '.' + ext; fs.writeFileSync(path.join(UP, name), buf); return '/uploads/' + name;
}
function checkVideo(buf) { // MP4(スマホの動画)だけ。長さは 30 秒まで
  if (buf.length < 32 || buf.subarray(4, 8).toString() !== 'ftyp') return '動画はMP4形式(スマホで撮った動画など)だけ使えます';
  try {
    const i = buf.indexOf('mvhd'); if (i < 0) return '動画の長さを確認できませんでした。別の動画でお試しください';
    const v = buf[i + 4]; let ts, du;
    if (v === 1) { ts = buf.readUInt32BE(i + 24); du = Number(buf.readBigUInt64BE(i + 28)); } else { ts = buf.readUInt32BE(i + 16); du = buf.readUInt32BE(i + 20); }
    if (!ts || !du) return '動画の長さを確認できませんでした。別の動画でお試しください';
    if (du / ts > 31) return '動画は30秒以内にしてください';
  } catch (e) { return '動画の長さを確認できませんでした。別の動画でお試しください'; }
  return null;
}
const rmImg = i => { if (i && /^\/uploads\/[a-f0-9]{32}\.(png|jpg|gif|webp|mp4)$/.test(i)) fs.unlink(path.join(UP, path.basename(i)), () => {}); };
function safeUrl(s) { // http / https のWebページだけ許可。javascript: や IPアドレス直打ち、localhost は拒否
  s = String(s || '').trim(); if (!s || s.length > 200 || /[\s\u0000-\u001f]/.test(s)) return null; let u; try { u = new URL(s); } catch (e) { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null; const h = u.hostname;
  if (h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || !h.includes('.') || /\.(local|internal|localhost)$/.test(h)) return null; return u.href;
}

// ---------- ライブ接続・相手探し ----------
const conns = new Map();   // uid -> Set(res)
const queue = new Map();   // 相手探し中: uid -> 開始時刻
const pending = new Map(); // 見つかった直後の「話してみる/やめる」待ち: id -> {a,b,ok:Set,t}
const userMatch = new Map(), recentSkip = new Map(); const activeChat = new Map(); let matchSeq = 1;
const pairKey = (x, y) => Math.min(x, y) + ':' + Math.max(x, y);
const stats = () => ({ online: conns.size, total: one('SELECT COUNT(*) c FROM messages WHERE deleted=0').c, today: one('SELECT COUNT(*) c FROM messages WHERE deleted=0 AND created>?', Date.now() - DAY).c });
const emitTo = (uid, ev, data) => { for (const r of conns.get(uid) || []) r.write('event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n'); };
function endMatch(id, reason, except) {
  const mt = pending.get(id); if (!mt) return; pending.delete(id); userMatch.delete(mt.a); userMatch.delete(mt.b);
  for (const uid of [mt.a, mt.b]) if (uid !== except && reason) emitTo(uid, 'matchend', { reason });
}
function endChatFor(uid, chatId, message='相手が退出しました') {
  const c = one('SELECT * FROM chats WHERE id=? AND (a=? OR b=?)', chatId, uid, uid);
  if (!c) return;
  const oid = c.a === uid ? c.b : c.a;
  for (const m of all('SELECT image FROM messages WHERE chat=?', c.id)) rmImg(m.image);
  emitTo(oid, 'chatend', { chat:c.id, username:one('SELECT username FROM users WHERE id=?',uid)?.username || '', display:one('SELECT display FROM users WHERE id=?',uid)?.display || '', message });
  emitTo(uid, 'chatend', { chat:c.id, message:'チャットから退出しました' });
  emitTo(oid, 'chatremoved', { chat:c.id });
  emitTo(uid, 'chatremoved', { chat:c.id });
  run('DELETE FROM messages WHERE chat=?', c.id);
  run('DELETE FROM chats WHERE id=?', c.id);
  if (activeChat.get(uid) === c.id) activeChat.delete(uid);
  if (activeChat.get(oid) === c.id) activeChat.delete(oid);
}
function dropLive(uid, end) { queue.delete(uid); const m = userMatch.get(uid); if (m) endMatch(m, 'declined', uid); if (end) { const cid=activeChat.get(uid); if(cid) endChatFor(uid,cid); for (const r of conns.get(uid) || []) r.end(); conns.delete(uid); } }
function notify(uid, kind, data) { // 通知は同じ内容を1日1回までに抑える
  const d = JSON.stringify(data); if (one('SELECT 1 x FROM notices WHERE user=? AND kind=? AND data=? AND created>?', uid, kind, d, Date.now() - DAY)) return;
  run('INSERT INTO notices(user,kind,data,created) VALUES(?,?,?,?)', uid, kind, d, Date.now()); emitTo(uid, 'notice', { kind, ...data });
}
setInterval(() => {
  const s = stats(); for (const uid of conns.keys()) emitTo(uid, 'stats', s);
  const t = Date.now();
  for (const [uid, st] of queue) if (t - st > 3 * 60000) { queue.delete(uid); emitTo(uid, 'searchend', {}); }
  for (const [id, mt] of pending) if (t - mt.t > 90000) endMatch(id, 'timeout');
  for (const [k, v] of recentSkip) if (v < t) recentSkip.delete(k);
}, 5000);
function openChat(x, y) {
  const a = Math.min(x, y), b = Math.max(x, y), t = Date.now();
  // Tamariのチャットは一時セッション。過去の会話を次のセッションへ持ち込まない。
  for (const old of all('SELECT id FROM chats WHERE a=? AND b=?', a, b)) {
    for (const m of all('SELECT image FROM messages WHERE chat=?', old.id)) rmImg(m.image);
    run('DELETE FROM messages WHERE chat=?', old.id);
    run('DELETE FROM chats WHERE id=?', old.id);
  }
  return Number(run('INSERT INTO chats(a,b,created,last) VALUES(?,?,?,?)', a, b, t, t).lastInsertRowid);
}
function tryMatch(uid) { // ブロック関係がなく、接続中で、できれば初めての相手を選ぶ
  let first = null, any = null;
  for (const other of queue.keys()) {
    if (other === uid || !conns.has(other) || blockedPair(uid, other) || (recentSkip.get(pairKey(uid, other)) || 0) > Date.now()) continue;
    const u = one('SELECT status FROM users WHERE id=?', other); if (!u || u.status !== 'ok') continue;
    if (!any) any = other;
    if (!one('SELECT 1 x FROM chats WHERE a=? AND b=?', Math.min(uid, other), Math.max(uid, other))) { first = other; break; }
  }
  const o = first || any; if (!o) return false;
  queue.delete(uid); queue.delete(o); const id = matchSeq++;
  pending.set(id, { a: uid, b: o, ok: new Set(), t: Date.now() }); userMatch.set(uid, id); userMatch.set(o, id);
  emitTo(uid, 'matched', { match: id, user: card(one('SELECT * FROM users WHERE id=?', o)) });
  emitTo(o, 'matched', { match: id, user: card(one('SELECT * FROM users WHERE id=?', uid)) }); return true;
}

// ---------- 削除・定期そうじ ----------
function deleteUser(id) { // 関係するデータとファイルをすべて消す
  const u = one('SELECT * FROM users WHERE id=?', id); if (!u) return;
  dropLive(id, true);
  rmImg(u.avatar); rmImg(u.bg); rmImg(u.video); const sh = one('SELECT image FROM shots WHERE user=?', id); if (sh) rmImg(sh.image);
  for (const c of all('SELECT id FROM chats WHERE a=? OR b=?', id, id)) { for (const m of all('SELECT image FROM messages WHERE chat=?', c.id)) rmImg(m.image); run('DELETE FROM messages WHERE chat=?', c.id); }
  run('DELETE FROM chats WHERE a=? OR b=?', id, id);
  run('DELETE FROM replies WHERE user=? OR diary IN (SELECT id FROM diaries WHERE user=?)', id, id);
  for (const t of ['shots', 'links', 'diaries', 'sessions', 'notices']) run('DELETE FROM ' + t + ' WHERE user=?', id);
  run('DELETE FROM follows WHERE a=? OR b=?', id, id); run('DELETE FROM blocks WHERE a=? OR b=?', id, id); run('DELETE FROM users WHERE id=?', id);
}
function purge() { // 24時間たった日記、前日の「きょうの一枚」、期限切れのログイン・通知を削除
  run('DELETE FROM diaries WHERE created<?', Date.now() - DAY); run('DELETE FROM replies WHERE diary NOT IN (SELECT id FROM diaries)');
  for (const x of all('SELECT image FROM shots WHERE day<>?', dayKey())) rmImg(x.image); run('DELETE FROM shots WHERE day<>?', dayKey());
  run('DELETE FROM sessions WHERE created<?', Date.now() - 30 * DAY); run('DELETE FROM notices WHERE created<?', Date.now() - 14 * DAY);
  const t = Date.now(); for (const [k, a] of hits) { const f = a.filter(x => t - x < HOUR); if (f.length) hits.set(k, f); else hits.delete(k); }
}
purge(); setInterval(() => { try { purge(); } catch (e) { console.error(e); } }, 10 * 60000);

// ---------- HTTP の道具 ----------
const send = (res, code, obj, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(obj)); };
const err = (res, code, m) => send(res, code, { error: m });
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => { const i = c.indexOf('='); return i < 0 ? [] : [c.slice(0, i).trim(), c.slice(i + 1).trim()]; }).filter(a => a[0]));
const ip = req => (TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '';
const auth = req => { const t = cookies(req).sid; return t ? one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.created>?', sha(t), Date.now() - 30 * DAY) || null : null; };
function readBody(req, limit, asJson) {
  return new Promise((ok, ng) => {
    if (+req.headers['content-length'] > limit) { req.resume(); return ng(new Error('big')); }
    let n = 0, over = false; const ch = [];
    req.on('data', c => { n += c.length; if (n > limit * 3) req.destroy(); else if (n > limit) over = true; else ch.push(c); });
    req.on('end', () => { if (over) return ng(new Error('big')); const buf = Buffer.concat(ch); if (!asJson) return ok(buf); try { ok(buf.length ? JSON.parse(buf) : {}); } catch (e) { ng(new Error('bad')); } });
    req.on('error', () => ng(new Error('bad')));
  });
}

async function api(req, res, p, q) {
  const m = req.method;
  if (p === '/api/config') return send(res, 200, CFG);
  if (p === '/api/stats') return send(res, 200, stats());
  if (m !== 'GET' && req.headers['x-requested-with'] !== 'tamari') return err(res, 403, '不正なリクエストです。ページを読み込み直してください');
  const origin = req.headers.origin;
  if (origin && m !== 'GET') { let h = ''; try { h = new URL(origin).host; } catch (e) { /* 不正 */ } if (h !== req.headers.host) return err(res, 403, '不正なリクエストです。ページを読み込み直してください'); }
  let b = {};
  if (m !== 'GET' && p !== '/api/me/video') { try { b = await readBody(req, 3.2e6, true); } catch (e) { return err(res, 400, e.message === 'big' ? '送信内容が大きすぎます。画像は2MB以下にしてください' : '送信内容の形式が正しくありません。もう一度お試しください'); } }
  const secure = TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  const login = uid => { const t = crypto.randomBytes(32).toString('base64url'); run('INSERT INTO sessions(token,user,created) VALUES(?,?,?)', sha(t), uid, Date.now()); return { 'Set-Cookie': 'sid=' + t + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000' + secure }; };
  const ok = {};

  if (p === '/api/register' && m === 'POST') {
    if (!rl('reg' + ip(req), 5, HOUR) || !rl('regall', 200, HOUR)) return err(res, 429, '登録が多すぎます。しばらくしてからお試しください');
    const username = clean(b.username, 16), display = clean(b.display, 20), pw = String(b.password || '');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return err(res, 400, 'ユーザー名は英数字と _ の3〜16文字にしてください');
    if (RESERVED.test(username)) return err(res, 400, 'そのユーザー名は使えません。別の名前にしてください');
    if (!display) return err(res, 400, '表示名を入力してください');
    if (IMPERSONATE.test(display)) return err(res, 400, '運営と紛らわしい表示名は使えません');
    if (pw.length < 8 || pw.length > 100) return err(res, 400, 'パスワードは8文字以上にしてください');
    if (pw.toLowerCase() === username.toLowerCase()) return err(res, 400, 'ユーザー名と同じパスワードは使えません');
    let id; try { id = Number(run('INSERT INTO users(username,display,pw,created) VALUES(?,?,?,?)', username, display, hashPw(pw), Date.now()).lastInsertRowid); }
    catch (e) { return err(res, 409, 'そのユーザー名はすでに使われています。別の名前にしてください'); }
    return send(res, 200, { ok: true }, login(id));
  }
  if (p === '/api/login' && m === 'POST') {
    const k = 'login' + ip(req); if (tooMany(k, 10, 10 * 60000)) return err(res, 429, '試行回数が多すぎます。10分ほど待ってからもう一度お試しください');
    const u = one('SELECT * FROM users WHERE username=?', clean(b.username, 16)), pw = String(b.password || '').slice(0, 100);
    const good = u ? checkPw(pw, u.pw) : (checkPw(pw, DUMMY_PW), false); // ユーザー名の有無を時間差で当てられないようにする
    if (!good) { rl(k, 1e9, 10 * 60000); return err(res, 401, 'ユーザー名またはパスワードが違います'); }
    if (u.status !== 'ok') return err(res, 403, 'このアカウントは現在利用できません。詳しくはお問い合わせください');
    return send(res, 200, { ok: true }, login(u.id));
  }
  if (p === '/api/logout' && m === 'POST') { const t = cookies(req).sid; if (t) run('DELETE FROM sessions WHERE token=?', sha(t)); return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); }

  const me = auth(req);
  if (!me) return err(res, 401, 'ログインが必要です。もう一度ログインしてください');
  if (me.status !== 'ok') return err(res, 403, 'このアカウントは停止されています');

  // ---- 自分の情報・設定 ----
  if (p === '/api/me' && m === 'GET') return send(res, 200, { username: me.username, display: me.display, bio: me.bio, avatar: me.avatar, bg: me.bg, inbox: me.inbox || 'all' });
  if (p === '/api/settings' && m === 'PUT') { if (!INBOX.includes(b.inbox)) return err(res, 400, '設定の値が正しくありません'); run('UPDATE users SET inbox=? WHERE id=?', b.inbox, me.id); return send(res, 200, ok); }
  if (p === '/api/me/password' && m === 'POST') {
    if (!rl('pw' + me.id, 5, HOUR)) return err(res, 429, '変更の試行が多すぎます。しばらくしてからお試しください');
    if (!checkPw(String(b.current || '').slice(0, 100), me.pw)) return err(res, 400, '現在のパスワードが違います');
    const nw = String(b.next || ''); if (nw.length < 8 || nw.length > 100) return err(res, 400, '新しいパスワードは8文字以上にしてください');
    run('UPDATE users SET pw=? WHERE id=?', hashPw(nw), me.id); const t = cookies(req).sid; run('DELETE FROM sessions WHERE user=? AND token<>?', me.id, sha(t)); return send(res, 200, ok);
  }
  if (p === '/api/me/delete' && m === 'POST') {
    if (!rl('del' + me.id, 5, HOUR)) return err(res, 429, '試行が多すぎます。しばらくしてからお試しください');
    if (!checkPw(String(b.password || '').slice(0, 100), me.pw)) return err(res, 400, 'パスワードが違います');
    deleteUser(me.id); return send(res, 200, ok, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (p === '/api/me/image' && m === 'PUT') {
    const kind = b.kind === 'bg' ? 'bg' : b.kind === 'avatar' ? 'avatar' : null; if (!kind) return err(res, 400, '画像の種類が正しくありません');
    if (!rl('img' + me.id, 10, HOUR)) return err(res, 429, '画像の変更が多すぎます。しばらくしてからお試しください');
    let url = ''; if (b.image) { try { url = saveImage(b.image, kind === 'bg' ? 2 * 1048576 : 1048576); } catch (e) { return err(res, 400, e.message); } }
    rmImg(me[kind]); run('UPDATE users SET ' + kind + '=? WHERE id=?', url, me.id); return send(res, 200, { url });
  }
  if (p === '/api/me/video' && m === 'PUT') { // 動画は生のデータで受け取る(10MBまで・30秒まで・MP4のみ)
    if (!rl('vid' + me.id, 5, HOUR)) return err(res, 429, '動画の変更が多すぎます。しばらくしてからお試しください');
    let buf; try { buf = await readBody(req, 10 * 1048576, false); } catch (e) { return err(res, 400, '動画は10MB以下にしてください'); }
    const bad = checkVideo(buf); if (bad) return err(res, 400, bad);
    const name = crypto.randomBytes(16).toString('hex') + '.mp4'; fs.writeFileSync(path.join(UP, name), buf);
    rmImg(me.video); run('UPDATE users SET video=? WHERE id=?', '/uploads/' + name, me.id); return send(res, 200, { url: '/uploads/' + name });
  }
  if (p === '/api/me/video' && m === 'DELETE') { rmImg(me.video); run("UPDATE users SET video='' WHERE id=?", me.id); return send(res, 200, ok); }

  if (p === '/api/live' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.write('retry: 3000\nevent: stats\ndata: ' + JSON.stringify(stats()) + '\n\n');
    if (!conns.has(me.id)) conns.set(me.id, new Set()); conns.get(me.id).add(res);
    req.on('close', () => { const s = conns.get(me.id); if (s) { s.delete(res); if (!s.size) { conns.delete(me.id); dropLive(me.id); } } }); return;
  }

  // ---- 相手探し ----
  if (p === '/api/match/start' && m === 'POST') {
    if (!conns.has(me.id)) return err(res, 409, '接続を確認できませんでした。ページを読み込み直してください');
    if (!rl('mt' + me.id, 30, 10 * 60000)) return err(res, 429, '少し時間をおいてからもう一度お試しください');
    const old = userMatch.get(me.id); if (old) endMatch(old, 'declined', me.id);
    queue.set(me.id, Date.now()); tryMatch(me.id); return send(res, 200, ok);
  }
  if (p === '/api/match/cancel' && m === 'POST') { queue.delete(me.id); return send(res, 200, ok); }
  if (p === '/api/match/answer' && m === 'POST') {
    const mt = pending.get(+b.match); if (!mt || (mt.a !== me.id && mt.b !== me.id)) return err(res, 404, 'この相手とのマッチはすでに終わりました。もう一度探してみてください');
    const other = mt.a === me.id ? mt.b : mt.a;
    if (!b.accept) { recentSkip.set(pairKey(mt.a, mt.b), Date.now() + 10 * 60000); endMatch(mt.id, 'declined', me.id); return send(res, 200, ok); }
    mt.ok.add(me.id);
    if (mt.ok.size < 2) return send(res, 200, { waiting: true });
    const o = one('SELECT * FROM users WHERE id=?', other);
    if (!visible(me.id, o)) { endMatch(mt.id, 'declined'); return err(res, 400, 'この相手とは話せなくなりました。もう一度探してみてください'); }
    endMatch(mt.id); const chat = openChat(mt.a, mt.b); emitTo(mt.a, 'matchstart', { chat }); emitTo(mt.b, 'matchstart', { chat }); return send(res, 200, { chat });
  }

  // ---- プロフィール ----
  let r;
  if ((r = /^\/api\/user\/([A-Za-z0-9_]{1,16})$/.exec(p)) && m === 'GET') {
    const u = one('SELECT * FROM users WHERE username=?', r[1]); const iBlock = u && !!one('SELECT 1 x FROM blocks WHERE a=? AND b=?', me.id, u.id);
    if (!u || u.status !== 'ok' || (!iBlock && blockedPair(me.id, u.id))) return err(res, 404, 'ユーザーが見つかりません');
    const self = u.id === me.id, lay = normLayout(u.layout), hid = new Set(lay.filter(x => !x.show).map(x => x.id)), H = (id, v, empty) => (!self && hid.has(id)) ? empty : v;
    const shot = one('SELECT image,caption FROM shots WHERE user=? AND day=?', u.id, dayKey()) || null;
    const conn = all(`SELECT x.username,x.display,x.avatar FROM follows f JOIN follows g ON g.a=f.b AND g.b=f.a JOIN users x ON x.id=f.b WHERE f.a=? AND x.status='ok' AND x.id NOT IN (SELECT b FROM blocks WHERE a=?) AND x.id NOT IN (SELECT a FROM blocks WHERE b=?) ORDER BY f.rowid DESC LIMIT 12`, u.id, me.id, me.id);
    const diaries = H('diary', all('SELECT id,body,created FROM diaries WHERE user=? ORDER BY id DESC', u.id), []).map(d => self
      ? { ...d, replies: all(`SELECT r.id,r.stamp,r.body,r.created,x.username,x.display,x.avatar FROM replies r JOIN users x ON x.id=r.user WHERE r.diary=? AND x.status='ok' AND x.id NOT IN (SELECT b FROM blocks WHERE a=?) AND x.id NOT IN (SELECT a FROM blocks WHERE b=?) ORDER BY r.id`, d.id, me.id, me.id) }
      : { ...d, mine: one('SELECT stamp,body FROM replies WHERE diary=? AND user=?', d.id, me.id) || null });
    return send(res, 200, { username: u.username, display: u.display, avatar: u.avatar, bg: u.bg, created: u.created, accent: u.accent || 'gray', layout: lay,
      statusLine: H('status', u.status_line || '', ''), quote: H('quote', u.quote || '', ''), hobbies: H('hobbies', u.hobbies || '', ''), bio: H('bio', u.bio, ''), likes: H('likes', u.likes, ''), interests: H('interests', u.interests, ''),
      shot: H('shot', shot, null), video: H('video', u.video || '', ''), diaries, links: H('links', all('SELECT id,title,url FROM links WHERE user=? ORDER BY sort', u.id), []),
      connections: H('follow', conn, null), online: conns.has(u.id), homeVisible: !!u.home_visible, iConnect: !!one('SELECT 1 x FROM follows WHERE a=? AND b=?', me.id, u.id), mutual: mutualPair(me.id, u.id), iBlock, self });
  }
  if (p === '/api/profile' && m === 'PUT') {
    const display = clean(b.display, 20) || me.display; if (IMPERSONATE.test(display)) return err(res, 400, '運営と紛らわしい表示名は使えません');
    const links = []; for (const l of (Array.isArray(b.links) ? b.links.slice(0, 6) : [])) { if (!clean(l && l.url, 200)) continue; const url = safeUrl(l.url); if (!url) return err(res, 400, '使えないURLがあります。http:// または https:// で始まるWebページだけ登録できます'); links.push({ title: clean(l.title, 30) || new URL(url).hostname, url }); }
    run('UPDATE users SET display=?,bio=?,likes=?,interests=?,hobbies=?,status_line=?,quote=?,accent=?,layout=?,home_visible=? WHERE id=?', display, cleanML(b.bio, 200), clean(b.likes, 100), clean(b.interests, 100), clean(b.hobbies, 100), clean(b.statusLine, 60), clean(b.quote, 80), ACCENTS.includes(b.accent) ? b.accent : 'gray', JSON.stringify(normLayout(b.layout)), b.homeVisible === false ? 0 : 1, me.id);
    run('DELETE FROM links WHERE user=?', me.id); links.forEach((l, i) => run('INSERT INTO links(user,title,url,sort) VALUES(?,?,?,?)', me.id, l.title, l.url, i)); return send(res, 200, ok);
  }
  if (p === '/api/shot' && m === 'POST') {
    if (!rl('shot' + me.id, 10, HOUR)) return err(res, 429, '変更が多すぎます。しばらくしてからお試しください'); let image; try { image = saveImage(b.image, 2 * 1048576); } catch (e) { return err(res, 400, e.message); }
    const old = one('SELECT image FROM shots WHERE user=?', me.id); if (old) rmImg(old.image); run('INSERT OR REPLACE INTO shots(user,day,image,caption,created) VALUES(?,?,?,?,?)', me.id, dayKey(), image, clean(b.caption, 60), Date.now()); return send(res, 200, ok);
  }
  if (p === '/api/shot' && m === 'DELETE') { const old = one('SELECT image FROM shots WHERE user=?', me.id); if (old) rmImg(old.image); run('DELETE FROM shots WHERE user=?', me.id); return send(res, 200, ok); }
  if (p === '/api/diary' && m === 'POST') {
    const text = cleanML(b.body, 300); if (text.length < 2) return err(res, 400, '日記を2文字以上で書いてください');
    if (one('SELECT COUNT(*) c FROM diaries WHERE user=?', me.id).c >= 3) return err(res, 400, '今日の日記は3件までです。古いものを削除してください');
    if (!rl('dia' + me.id, 10, HOUR)) return err(res, 429, '投稿が多すぎます。しばらくしてからお試しください');
    run('INSERT INTO diaries(user,body,created) VALUES(?,?,?)', me.id, text, Date.now()); return send(res, 200, ok);
  }
  if ((r = /^\/api\/diary\/(\d+)$/.exec(p)) && m === 'DELETE') { run('DELETE FROM replies WHERE diary IN (SELECT id FROM diaries WHERE id=? AND user=?)', +r[1], me.id); run('DELETE FROM diaries WHERE id=? AND user=?', +r[1], me.id); return send(res, 200, ok); }
  if ((r = /^\/api\/diary\/(\d+)\/reply$/.exec(p))) { // 日記へのひとこと(数は表示せず、日記の持ち主だけが読める。そこから話しかけられる)
    const d = one('SELECT * FROM diaries WHERE id=?', +r[1]);
    if (m === 'DELETE') { if (d) run('DELETE FROM replies WHERE diary=? AND user=?', d.id, me.id); return send(res, 200, ok); }
    if (m === 'POST') {
      const o = d && one('SELECT * FROM users WHERE id=?', d.user); if (!d || !o || o.id === me.id || !visible(me.id, o)) return err(res, 400, 'ひとことを送れません。日記がすでに消えているかもしれません');
      if (!rl('rp' + me.id, 30, HOUR)) return err(res, 429, '送信が多すぎます。しばらくしてからお試しください');
      const stamp = STAMPS.includes(b.stamp) ? b.stamp : '', text = clean(b.body, 60); if (!stamp && !text) return err(res, 400, 'スタンプを選ぶか、ひとことを書いてください');
      run('INSERT OR REPLACE INTO replies(diary,user,stamp,body,created) VALUES(?,?,?,?,?)', d.id, me.id, stamp, text, Date.now());
      notify(o.id, 'reply', { username: me.username, display: me.display }); return send(res, 200, ok);
    }
  }


  // ---- プロフィール投稿 ----
  if (p === '/api/posts' && m === 'GET') {
    const name = clean(q.get('username') || me.username, 16);
    const u = one('SELECT id,username,status FROM users WHERE username=?', name);
    if (!u || u.status !== 'ok' || !visible(me.id, u)) return err(res, 404, '投稿を読み込めません');
    let rows = [];
    try {
      // 投稿本体の取得と「自分が♡したか」の判定を分離。
      // SQLiteのバインド数不一致で投稿一覧全体が落ちないようにする。
      rows = all(`
        SELECT p.id,p.body,p.image,p.video,p.created,p.user,
               u.username,u.display,u.avatar,
               (SELECT COUNT(*) FROM post_reactions pr WHERE pr.post=p.id) likes
        FROM posts p JOIN users u ON u.id=p.user
        WHERE p.user=? AND p.deleted=0
        ORDER BY p.id DESC LIMIT 30`, u.id);
      if (rows.length) {
        const placeholders = rows.map(() => '?').join(',');
        const likedRows = all(
          `SELECT post FROM post_reactions WHERE user=? AND post IN (${placeholders})`,
          me.id, ...rows.map(x => x.id)
        );
        const likedSet = new Set(likedRows.map(x => x.post));
        rows.forEach(x => { x.liked = likedSet.has(x.id) ? 1 : 0; });
      }
    } catch (e) {
      // 旧DBでも投稿一覧を止めない。必要な補助テーブルは起動時に作成済み。
      console.error('posts GET:', e.message);
      try {
        rows = all(`SELECT p.id,p.body,p.image,p.video,p.created,p.user,u.username,u.display,u.avatar
                    FROM posts p JOIN users u ON u.id=p.user
                    WHERE p.user=? AND p.deleted=0 ORDER BY p.id DESC LIMIT 30`, u.id)
          .map(x => ({...x, likes: 0, liked: 0}));
      } catch (_) { return err(res, 500, '投稿を読み込めませんでした'); }
    }
    const ids = rows.map(x => x.id);
    let replies = [];
    if (ids.length) {
      try {
        replies = all(`
          SELECT r.id,r.post,r.parent,r.body,r.created,u.username,u.display,u.avatar
          FROM post_replies r JOIN users u ON u.id=r.user
          WHERE r.post IN (${ids.map(()=>'?').join(',')}) AND r.deleted=0
            AND u.status='ok'
          ORDER BY r.id ASC`, ...ids);
      } catch (_) { replies = []; }
    }
    if (replies.length) {
      const rids = replies.map(r=>r.id);
      const ph = rids.map(()=>'?').join(',');
      const counts = all(`SELECT reply,COUNT(*) likes FROM post_reply_reactions WHERE reply IN (${ph}) GROUP BY reply`, ...rids);
      const mine = all(`SELECT reply FROM post_reply_reactions WHERE user=? AND reply IN (${ph})`, me.id, ...rids);
      const cm = new Map(counts.map(x=>[x.reply,Number(x.likes)]));
      const mm = new Set(mine.map(x=>x.reply));
      replies.forEach(r=>{ r.likes=cm.get(r.id)||0; r.liked=mm.has(r.id)?1:0; });
    }
    const by = new Map();
    replies.forEach(r => { if (!by.has(r.post)) by.set(r.post, []); by.get(r.post).push(r); });
    rows.forEach(r => r.replies = by.get(r.id) || []);
    return send(res, 200, rows);
  }
  if (p === '/api/posts' && m === 'POST') {
    if (!rl('post' + me.id, 20, HOUR)) return err(res, 429, '投稿が多すぎます。少し時間を置いてください');
    const body = cleanML(b.body, 1000);
    let image = '', video = '';
    if (b.image) { try { image = saveImage(b.image, 3 * 1048576); } catch (e) { return err(res, 400, e.message); } }
    if (b.video) {
      let buf;
      try { buf = Buffer.from(String(b.video).replace(/^data:video\/mp4;base64,/, ''), 'base64'); } catch (e) { return err(res,400,'動画を読み込めません'); }
      if (buf.length > 10 * 1048576) return err(res,400,'動画は10MB以下にしてください');
      const bad = checkVideo(buf); if (bad) return err(res,400,bad);
      const name = crypto.randomBytes(16).toString('hex') + '.mp4';
      fs.writeFileSync(path.join(UP,name),buf); video='/uploads/'+name;
    }
    if (!body && !image && !video) return err(res,400,'文章・画像・動画のいずれかを追加してください');
    const id = Number(run('INSERT INTO posts(user,body,image,video,created) VALUES(?,?,?,?,?)', me.id, body, image, video, Date.now()).lastInsertRowid);
    return send(res,200,{id});
  }
  if ((r = /^\/api\/posts\/(\d+)$/.exec(p)) && m === 'DELETE') {
    const post = one('SELECT * FROM posts WHERE id=? AND user=? AND deleted=0', +r[1], me.id);
    if (!post) return err(res,404,'投稿が見つかりません');
    run('UPDATE posts SET deleted=1 WHERE id=?',post.id);
    rmImg(post.image); rmImg(post.video);
    run('UPDATE post_replies SET deleted=1 WHERE post=?',post.id);
    return send(res,200,ok);
  }
  if ((r = /^\/api\/posts\/(\d+)\/reaction$/.exec(p)) && m === 'POST') {
    const post = one('SELECT * FROM posts WHERE id=? AND deleted=0', +r[1]);
    if (!post || !visible(me.id, one('SELECT * FROM users WHERE id=?',post.user))) return err(res,404,'投稿が見つかりません');
    const existing = one('SELECT 1 x FROM post_reactions WHERE post=? AND user=?',post.id,me.id);
    if (existing) {
      run('DELETE FROM post_reactions WHERE post=? AND user=?',post.id,me.id);
    } else {
      run('INSERT INTO post_reactions(post,user,kind,created) VALUES(?,?,?,?)',post.id,me.id,'いいね',Date.now());
      const owner = one('SELECT id FROM users WHERE id=?', post.user);
      if (owner && owner.id !== me.id) {
        notify(owner.id, 'postlike', { username: me.username, display: me.display, post: post.id });
      }
    }
    return send(res,200,{liked:!existing,likes:one('SELECT COUNT(*) c FROM post_reactions WHERE post=?',post.id).c});
  }
  if ((r = /^\/api\/posts\/(\d+)\/reply$/.exec(p)) && m === 'POST') {
    const post = one('SELECT * FROM posts WHERE id=? AND deleted=0', +r[1]);
    const owner = post && one('SELECT * FROM users WHERE id=?',post.user);
    if (!post || !owner || !visible(me.id,owner)) return err(res,404,'返信できません');
    const body = cleanML(b.body,300);
    if (!body) return err(res,400,'返信を入力してください');
    if (!rl('postreply'+me.id,30,HOUR)) return err(res,429,'返信が多すぎます。少し待ってください');
    const parent = b.parent ? one('SELECT * FROM post_replies WHERE id=? AND post=? AND deleted=0', Number(b.parent), post.id) : null;
    if (b.parent && !parent) return err(res,404,'返信先が見つかりません');
    const mention = parent ? '@' + parent.username + ' ' : '';
    const finalBody = mention && !body.startsWith(mention) ? mention + body : body;
    const id=Number(run('INSERT INTO post_replies(post,user,parent,body,created) VALUES(?,?,?,?,?)',post.id,me.id,parent ? parent.id : null,finalBody,Date.now()).lastInsertRowid);
    if (parent && parent.user !== me.id) notify(parent.user,'postreply',{username:me.username,display:me.display,post:post.id,reply:id,parent:parent.id});
    if (owner.id !== me.id && (!parent || parent.user === owner.id)) notify(owner.id,'postreply',{username:me.username,display:me.display,post:post.id,reply:id,parent:parent ? parent.id : null});
    return send(res,200,{id,body:finalBody,parent:parent ? parent.id : null});
  }
  if ((r = /^\/api\/posts\/replies\/(\d+)\/reaction$/.exec(p)) && m === 'POST') {
    const reply = one('SELECT * FROM post_replies WHERE id=? AND deleted=0', +r[1]);
    if (!reply) return err(res,404,'返信が見つかりません');
    const post = one('SELECT * FROM posts WHERE id=? AND deleted=0', reply.post);
    const owner = post && one('SELECT * FROM users WHERE id=?', post.user);
    if (!post || !owner || !visible(me.id,owner)) return err(res,404,'返信に反応できません');
    const existing = one('SELECT 1 x FROM post_reply_reactions WHERE reply=? AND user=?', reply.id, me.id);
    if (existing) run('DELETE FROM post_reply_reactions WHERE reply=? AND user=?', reply.id, me.id);
    else {
      run('INSERT INTO post_reply_reactions(reply,user,created) VALUES(?,?,?)', reply.id, me.id, Date.now());
      const replyOwner = one('SELECT id FROM users WHERE id=?', reply.user);
      if (replyOwner && replyOwner.id !== me.id) notify(replyOwner.id,'replylike',{username:me.username,display:me.display,post:reply.post,reply:reply.id});
    }
    return send(res,200,{liked:!existing,likes:one('SELECT COUNT(*) c FROM post_reply_reactions WHERE reply=?',reply.id).c});
  }
  if ((r = /^\/api\/posts\/replies\/(\d+)$/.exec(p)) && m === 'DELETE') {
    const x=one('SELECT * FROM post_replies WHERE id=? AND user=?',+r[1],me.id);
    if (!x) return err(res,404,'返信が見つかりません');
    run('UPDATE post_replies SET deleted=1 WHERE id=?',x.id);
    return send(res,200,ok);
  }

  // ---- つながり(お互いに「また話したい」と思ったら成立) ----
  if (p === '/api/connections' && m === 'GET') {
    const okU = "x.status='ok' AND x.id NOT IN (SELECT b FROM blocks WHERE a=?) AND x.id NOT IN (SELECT a FROM blocks WHERE b=?)";
    return send(res, 200, {
      mutual: all(`SELECT x.username,x.display,x.avatar FROM follows f JOIN follows g ON g.a=f.b AND g.b=f.a JOIN users x ON x.id=f.b WHERE f.a=? AND ${okU} ORDER BY f.rowid DESC`, me.id, me.id, me.id),
      mine: all(`SELECT x.username,x.display,x.avatar FROM follows f JOIN users x ON x.id=f.b WHERE f.a=? AND ${okU} AND NOT EXISTS (SELECT 1 FROM follows g WHERE g.a=f.b AND g.b=f.a) ORDER BY f.rowid DESC`, me.id, me.id, me.id) });
  }
  if (p === '/api/connect' && m === 'POST') {
    const t = one('SELECT * FROM users WHERE username=?', clean(b.username, 16)); if (!t || t.id === me.id || !visible(me.id, t)) return err(res, 400, 'つながれません');
    if (!rl('cn' + me.id, 30, HOUR)) return err(res, 429, '操作が多すぎます。しばらくしてからお試しください');
    if (one('SELECT COUNT(*) c FROM follows WHERE a=?', me.id).c >= 300) return err(res, 400, 'つながり希望は300人までです。整理してからお試しください');
    run('INSERT OR IGNORE INTO follows(a,b) VALUES(?,?)', me.id, t.id);
    const mutual = mutualPair(me.id, t.id);
    if (mutual) { notify(t.id, 'connected', { username: me.username, display: me.display }); notify(me.id, 'connected', { username: t.username, display: t.display }); }
    else notify(t.id, 'connect_request', { username: me.username, display: me.display });
    return send(res, 200, { mutual });
  }
  if ((r = /^\/api\/connect\/([A-Za-z0-9_]{1,16})$/.exec(p)) && m === 'DELETE') { const t = one('SELECT id FROM users WHERE username=?', r[1]); if (t) run('DELETE FROM follows WHERE a=? AND b=?', me.id, t.id); return send(res, 200, ok); }

  // ---- ブロック ----
  if (p === '/api/block' && m === 'POST') {
    const t = one('SELECT id FROM users WHERE username=?', clean(b.username, 16)); if (!t || t.id === me.id) return err(res, 400, 'ブロックできません');
    run('INSERT OR IGNORE INTO blocks(a,b) VALUES(?,?)', me.id, t.id); run('DELETE FROM follows WHERE (a=? AND b=?) OR (a=? AND b=?)', me.id, t.id, t.id, me.id);
    if (queue.delete(t.id)) emitTo(t.id, 'searchend', {}); const mid = userMatch.get(me.id); if (mid && userMatch.get(t.id) === mid) endMatch(mid, 'declined', me.id);
    return send(res, 200, ok); // 相手には通知しません
  }
  if ((r = /^\/api\/block\/([A-Za-z0-9_]{1,16})$/.exec(p)) && m === 'DELETE') { const t = one('SELECT id FROM users WHERE username=?', r[1]); if (t) run('DELETE FROM blocks WHERE a=? AND b=?', me.id, t.id); return send(res, 200, ok); }
  if (p === '/api/blocks') return send(res, 200, all("SELECT u.username,u.display,u.avatar FROM blocks k JOIN users u ON u.id=k.b WHERE k.a=?", me.id));

  // ---- 通知 ----
  if (p === '/api/notices' && m === 'GET') {
    const out = []; for (const n of all('SELECT id,kind,data,created,seen FROM notices WHERE user=? ORDER BY id DESC LIMIT 30', me.id)) {
      let d = {}; try { d = JSON.parse(n.data); } catch (e) { continue; } const u = one('SELECT * FROM users WHERE username=?', d.username || ''); if (!u || !visible(me.id, u)) continue;
      out.push({ id: n.id, kind: n.kind, created: n.created, seen: !!n.seen, username: u.username, display: u.display, chat: d.chat || null, post: d.post || null }); if (out.length >= 10) break;
    } return send(res, 200, out);
  }
  if ((r = /^\/api\/notices\/(\d+)\/read$/.exec(p)) && m === 'POST') { run('DELETE FROM notices WHERE id=? AND user=?', +r[1], me.id); return send(res,200,ok); }
  if (p === '/api/notices/seen' && m === 'POST') { run('DELETE FROM notices WHERE user=?', me.id); return send(res, 200, ok); }

  if ((r = /^\/api\/chats\/(\d+)\/read$/.exec(p)) && m === 'POST') {
    const c=one('SELECT * FROM chats WHERE id=? AND (a=? OR b=?)',+r[1],me.id,me.id); if(!c) return err(res,404,'チャットが見つかりません');
    const now=Date.now(); run('INSERT INTO message_reads(chat,user,read_at) VALUES(?,?,?) ON CONFLICT(chat,user) DO UPDATE SET read_at=excluded.read_at',c.id,me.id,now);
    emitTo(c.a===me.id?c.b:c.a,'read',{chat:c.id,readAt:now,reader:me.username}); return send(res,200,ok);
  }
  if ((r = /^\/api\/chats\/(\d+)\/typing$/.exec(p)) && m === 'POST') {
    const c=one('SELECT * FROM chats WHERE id=? AND (a=? OR b=?)',+r[1],me.id,me.id); if(!c) return err(res,404,'チャットが見つかりません');
    const oid=c.a===me.id?c.b:c.a; emitTo(oid,'typing',{chat:c.id,username:me.username,typing:!!b.typing}); return send(res,200,ok);
  }
  // ---- チャット ----
  if (p === '/api/home-posts' && m === 'GET') {
    const start = Date.parse(dayKey() + 'T00:00:00+09:00');
    const rows = all(`SELECT p.id,p.body,p.image,p.video,p.created,p.user,u.username,u.display,u.avatar,
      (SELECT COUNT(*) FROM post_reactions pr WHERE pr.post=p.id) likes
      FROM posts p JOIN users u ON u.id=p.user
      WHERE p.deleted=0 AND u.status='ok' AND u.home_visible=1 AND p.created>=? AND p.created<?
        AND u.id<>? AND u.id NOT IN (SELECT b FROM blocks WHERE a=?) AND u.id NOT IN (SELECT a FROM blocks WHERE b=?)
      ORDER BY likes DESC, p.id DESC LIMIT 50`, start, start + DAY, me.id, me.id, me.id);
    if (!rows.length) return send(res,200,[]);
    const ph=rows.map(()=>'?').join(',');
    const liked=all(`SELECT post FROM post_reactions WHERE user=? AND post IN (${ph})`,me.id,...rows.map(x=>x.id));
    const set=new Set(liked.map(x=>x.post)); rows.forEach(x=>{x.liked=set.has(x.id)?1:0;x.replies=[];});
    return send(res,200,rows);
  }
  if (p === '/api/home-search' && m === 'GET') {
    const q = String(new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().slice(0,80);
    if (!q) return send(res,200,{users:[],posts:[]});
    const uq = q.replace(/^@+/, '').slice(0,16);
    const like = '%' + q.replace(/[\%_]/g, c => '\\' + c) + '%';
    const users = all(`SELECT username,display,avatar FROM users WHERE status='ok' AND username LIKE ? ESCAPE '\\' ORDER BY CASE WHEN username=? THEN 0 WHEN username LIKE ? THEN 1 ELSE 2 END, username LIMIT 20`, '%' + uq + '%', uq, uq+'%');
    const posts = all(`SELECT p.id,p.body,p.image,p.video,p.created,p.user,u.username,u.display,u.avatar,(SELECT COUNT(*) FROM post_reactions pr WHERE pr.post=p.id) likes
      FROM posts p JOIN users u ON u.id=p.user
      WHERE p.deleted=0 AND u.status='ok' AND u.home_visible=1 AND (p.body LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.display LIKE ? ESCAPE '\\')
        AND u.id NOT IN (SELECT b FROM blocks WHERE a=?) AND u.id NOT IN (SELECT a FROM blocks WHERE b=?)
      ORDER BY p.created DESC LIMIT 30`, like, like, like, me.id, me.id);
    return send(res,200,{users,posts});
  }
  if (p === '/api/users/search' && m === 'GET') {
    const q = String(new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().replace(/^@+/, '').slice(0,16);
    if (!q) return send(res,200,[]);
    const like = '%' + q.replace(/[\%_]/g, c => '\\' + c) + '%';
    return send(res,200,all(`SELECT username,display,avatar FROM users WHERE status='ok' AND username LIKE ? ESCAPE '\\' ORDER BY CASE WHEN username=? THEN 0 WHEN username LIKE ? THEN 1 ELSE 2 END, username LIMIT 30`, like, q, q+'%'));
  }
  if (p === '/api/chats' && m === 'GET') {
    return send(res, 200, all(`SELECT c.id,c.last,u.username,u.display,u.avatar,(SELECT CASE WHEN image IS NOT NULL AND body='' THEN '(画像)' ELSE body END FROM messages WHERE chat=c.id AND deleted=0 ORDER BY id DESC LIMIT 1) preview
      FROM chats c JOIN users u ON u.id=CASE WHEN c.a=? THEN c.b ELSE c.a END WHERE (c.a=? OR c.b=?) AND u.status='ok' AND u.id NOT IN (SELECT b FROM blocks WHERE a=?) AND u.id NOT IN (SELECT a FROM blocks WHERE b=?) ORDER BY c.last DESC LIMIT 50`, me.id, me.id, me.id, me.id, me.id));
  }
  if (p === '/api/chats/open' && m === 'POST') {
    const t = one('SELECT * FROM users WHERE username=?', clean(b.username, 16)); if (!t || t.id === me.id || !visible(me.id, t)) return err(res, 400, 'チャットを開始できません');
    const active = activeChat.get(me.id); if (active) return err(res, 409, 'いま開いているチャットを先に退出してください');
    if (t.inbox === 'off') return err(res, 403, t.display + 'さんは、いまは話しかけを受け付けていません');
    if (t.inbox === 'mutual' && !mutualPair(me.id, t.id)) return err(res, 403, t.display + 'さんは、つながりのある人からの話しかけだけを受け付けています');
    if (!rl('open' + me.id, 20, HOUR)) return err(res, 429, '話しかけが多すぎます。しばらくしてからお試しください');
    return send(res, 200, { id: openChat(me.id, t.id) });
  }
  if ((r = /^\/api\/chats\/(\d+)$/.exec(p)) && m === 'GET') {
    const c = one('SELECT * FROM chats WHERE id=? AND (a=? OR b=?)', +r[1], me.id, me.id); if (!c) return err(res, 404, 'チャットが見つかりません');
    const o = one('SELECT * FROM users WHERE id=?', c.a === me.id ? c.b : c.a); if (!visible(me.id, o)) return err(res, 403, 'このチャットは利用できません');
    activeChat.set(me.id, c.id); activeChat.set(o.id, c.id);
    return send(res, 200, { with: card(o), mine: !!one('SELECT 1 x FROM follows WHERE a=? AND b=?', me.id, o.id), mutual: mutualPair(me.id, o.id), msgs: all('SELECT m.id,m.body,m.image,m.created,u.username FROM messages m JOIN users u ON u.id=m.user WHERE m.chat=? AND m.deleted=0 ORDER BY m.id DESC LIMIT 80', c.id).reverse() });
  }
  if ((r = /^\/api\/chats\/(\d+)\/leave$/.exec(p)) && m === 'POST') {
    const c = one('SELECT * FROM chats WHERE id=? AND (a=? OR b=?)', +r[1], me.id, me.id);
    if (!c) return err(res,404,'チャットが見つかりません');
    endChatFor(me.id,c.id);
    return send(res,200,ok);
  }
  if ((r = /^\/api\/chats\/(\d+)\/messages$/.exec(p)) && m === 'POST') {
    const c = one('SELECT * FROM chats WHERE id=? AND (a=? OR b=?)', +r[1], me.id, me.id); if (!c) return err(res, 404, 'チャットが見つかりません');
    const oid = c.a === me.id ? c.b : c.a, o = one('SELECT * FROM users WHERE id=?', oid); if (!visible(me.id, o)) return err(res, 403, 'このチャットでは送信できません');
    if (!rl('msg' + me.id, 8, 10000)) return err(res, 429, '送信が早すぎます。少し待ってからお試しください');
    const text = cleanML(b.body, 500); let image = null;
    if (b.image) { if (one('SELECT COUNT(*) c FROM messages WHERE user=? AND image IS NOT NULL AND created>?', me.id, Date.now() - DAY).c >= 30) return err(res, 429, '画像は1日30枚までです'); try { image = saveImage(b.image, 2 * 1048576); } catch (e) { return err(res, 400, e.message); } }
    if (!text && !image) return err(res, 400, '内容がありません。メッセージを入力してください');
    const first = !one('SELECT 1 x FROM messages WHERE chat=? AND deleted=0', c.id);
    const t = Date.now(), id = Number(run('INSERT INTO messages(chat,user,body,image,created) VALUES(?,?,?,?,?)', c.id, me.id, text, image, t).lastInsertRowid);
    run('UPDATE chats SET last=? WHERE id=?', t, c.id);
    const ev = { chat: c.id, id, body: text, image, created: t, username: me.username, display: me.display }; emitTo(me.id, 'msg', ev); emitTo(oid, 'msg', ev);
    if (first) notify(oid, 'talk', { username: me.username, display: me.display, chat: c.id });
    return send(res, 200, ok);
  }
  if ((r = /^\/api\/messages\/(\d+)$/.exec(p)) && m === 'DELETE') {
    const x = one('SELECT * FROM messages WHERE id=? AND user=?', +r[1], me.id); if (!x) return err(res, 404, '削除できませんでした');
    run('UPDATE messages SET deleted=1 WHERE id=?', x.id); rmImg(x.image); const c = one('SELECT * FROM chats WHERE id=?', x.chat); emitTo(c.a, 'del', { id: x.id }); emitTo(c.b, 'del', { id: x.id });
    return send(res, 200, ok);
  }
  return err(res, 404, 'ページが見つかりません');
}

// ---------- 管理者(サーバー側で鍵を確認。URLを隠すだけではありません) ----------
async function admin(req, res, p, q) {
  const k = Buffer.from(String(req.headers['x-admin'] || '')), a = Buffer.from(ADMIN_KEY), bad = 'adm' + ip(req);
  if (ADMIN_KEY.length < 16 || tooMany(bad, 10, 10 * 60000)) return err(res, 403, '権限がありません');
  if (k.length !== a.length || !crypto.timingSafeEqual(k, a)) { rl(bad, 1e9, 10 * 60000); return err(res, 403, '権限がありません'); }
  const ok = {};
  if (p === '/admin-api/overview') {
    const like = '%' + String(q.get('q') || '').slice(0, 30).replace(/[\\%_]/g, '\\$&') + '%', C = s => one(s).c;
    return send(res, 200, {
      stats: { ...stats(), users: C('SELECT COUNT(*) c FROM users'), newUsers: one('SELECT COUNT(*) c FROM users WHERE created>?', Date.now() - DAY).c, chats: C('SELECT COUNT(*) c FROM chats'), searching: queue.size,
        connections: C('SELECT COUNT(*) c FROM follows f JOIN follows g ON g.a=f.b AND g.b=f.a WHERE f.a<f.b'), blocks: C('SELECT COUNT(*) c FROM blocks'), diaries: C('SELECT COUNT(*) c FROM diaries'),
        images: C("SELECT COUNT(*) c FROM messages WHERE image IS NOT NULL AND deleted=0") + C("SELECT COUNT(*) c FROM users WHERE avatar<>''") + C("SELECT COUNT(*) c FROM users WHERE bg<>''") + C('SELECT COUNT(*) c FROM shots'), videos: C("SELECT COUNT(*) c FROM users WHERE video<>''") },
      users: all(`SELECT u.id,u.username,u.display,u.status,u.avatar,u.bg,u.video,u.created,(SELECT COUNT(*) FROM follows f JOIN follows g ON g.a=f.b AND g.b=f.a WHERE f.a=u.id) conn,(SELECT COUNT(*) FROM blocks WHERE b=u.id) bc,(SELECT COUNT(*) FROM messages WHERE user=u.id) mc FROM users u WHERE u.username LIKE ? ESCAPE '\\' OR u.display LIKE ? ESCAPE '\\' ORDER BY u.id DESC LIMIT 200`, like, like),
      messages: all('SELECT m.id,m.body,m.image,m.created,u.username sender,(SELECT username FROM users WHERE id=CASE WHEN c.a=m.user THEN c.b ELSE c.a END) receiver FROM messages m JOIN chats c ON c.id=m.chat JOIN users u ON u.id=m.user WHERE m.deleted=0 ORDER BY m.id DESC LIMIT 80') });
  }
  if (p === '/admin-api/user-detail') {
    const u = one('SELECT * FROM users WHERE id=?', +q.get('id')); if (!u) return err(res, 404, 'ユーザーが見つかりません');
    return send(res, 200, { bio: u.bio, likes: u.likes, hobbies: u.hobbies, interests: u.interests, quote: u.quote, statusLine: u.status_line, inbox: u.inbox, video: u.video, shot: one('SELECT image,caption FROM shots WHERE user=?', u.id) || null,
      links: all('SELECT title,url FROM links WHERE user=? ORDER BY sort', u.id), diaries: all('SELECT id,body,created FROM diaries WHERE user=? ORDER BY id DESC', u.id) });
  }
  let b; try { b = await readBody(req, 1e5, true); } catch (e) { return err(res, 400, 'リクエストの形式が正しくありません'); }
  const id = +b.id;
  if (p === '/admin-api/user' && ['ok', 'suspended', 'frozen'].includes(b.status)) {
    run('UPDATE users SET status=? WHERE id=?', b.status, id); if (b.status !== 'ok') { run('DELETE FROM sessions WHERE user=?', id); dropLive(id, true); }
  } else if (p === '/admin-api/user-delete') deleteUser(id);
  else if (p === '/admin-api/user-image' && ['avatar', 'bg', 'video'].includes(b.kind)) { const u = one('SELECT * FROM users WHERE id=?', id); if (u) { rmImg(u[b.kind]); run('UPDATE users SET ' + b.kind + "='' WHERE id=?", id); } }
  else if (p === '/admin-api/shot-delete') { const s = one('SELECT image FROM shots WHERE user=?', id); if (s) rmImg(s.image); run('DELETE FROM shots WHERE user=?', id); }
  else if (p === '/admin-api/diary-delete') { run('DELETE FROM replies WHERE diary=?', id); run('DELETE FROM diaries WHERE id=?', id); }
  else if (p === '/admin-api/message') {
    const x = one('SELECT * FROM messages WHERE id=?', id);
    if (x) { run('UPDATE messages SET deleted=1 WHERE id=?', id); rmImg(x.image); const c = one('SELECT * FROM chats WHERE id=?', x.chat); if (c) { emitTo(c.a, 'del', { id }); emitTo(c.b, 'del', { id }); } }
  } else return err(res, 404, '操作が見つかりません');
  return send(res, 200, ok);
}

// ---------- 静的ファイル ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4' };
function serveFile(req, res, full, type, cache) { // 動画の再生に必要な Range(途中からの読み込み)にも対応
  const st = fs.statSync(full), h = { 'Content-Type': type, 'Cache-Control': cache, 'Accept-Ranges': 'bytes' }, rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  const pipe = s => { s.on('error', () => res.destroy()); s.pipe(res); };
  if (rg && (rg[1] || rg[2])) {
    let s = rg[1] === '' ? Math.max(0, st.size - +rg[2]) : +rg[1], e = (rg[1] === '' || rg[2] === '') ? st.size - 1 : Math.min(+rg[2], st.size - 1);
    if (s > e || s >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
    res.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Content-Length': e - s + 1 }); return pipe(fs.createReadStream(full, { start: s, end: e }));
  }
  res.writeHead(200, { ...h, 'Content-Length': st.size }); pipe(fs.createReadStream(full));
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  try {
    const u = new URL(req.url, 'http://x'); let p; try { p = decodeURIComponent(u.pathname); } catch (e) { res.writeHead(400); return res.end('Bad request'); }
    if (!['GET', 'POST', 'PUT', 'DELETE', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    if (p.startsWith('/api/')) { if (!rl('api' + ip(req), 300, 60000)) return err(res, 429, 'アクセスが多すぎます。少し待ってからお試しください'); return await api(req, res, p, u.searchParams); }
    if (p.startsWith('/admin-api/')) return await admin(req, res, p, u.searchParams);
    if (p === '/robots.txt') { res.writeHead(200, { 'Content-Type': TYPES['.txt'] }); return res.end('User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /uploads/\n'); }
    if (p.startsWith('/uploads/')) {
      if (!/^\/uploads\/[a-f0-9]{32}\.(png|jpg|gif|webp|mp4)$/.test(p) || !fs.existsSync(path.join(UP, path.basename(p)))) { res.writeHead(404); return res.end('Not found'); }
      return serveFile(req, res, path.join(UP, path.basename(p)), TYPES[path.extname(p)], 'public, max-age=31536000, immutable');
    }
    const f = p === '/' ? '/index.html' : p === '/admin' ? '/admin.html' : p, full = path.join(PUB, path.normalize(f));
    if (!full.startsWith(PUB + path.sep) || path.basename(full).startsWith('.') || !TYPES[path.extname(full)] || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('ページが見つかりません'); }
    if (f === '/admin.html') res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    serveFile(req, res, full, TYPES[path.extname(full)], 'no-cache');
  } catch (e) { console.error(e); if (!res.headersSent) err(res, 500, 'サーバーでエラーが発生しました。しばらくしてからもう一度お試しください'); }
});
process.on('uncaughtException', e => console.error('予期しないエラー:', e));
server.on('error', e => { console.log(e.code === 'EADDRINUSE' ? 'ポート ' + PORT + ' はすでに使われています。Tamariがすでに起動していないか、黒い画面をすべて閉じてからやり直してください。' : e); process.exit(1); });
server.listen(PORT, () => console.log('Tamari 起動: http://localhost:' + PORT + (ADMIN_KEY.length >= 16 ? '  (管理ページ: /admin)' : '  (ADMIN_KEY未設定または短すぎます: 管理ページは使えません)')));
