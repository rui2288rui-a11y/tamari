// Tamari 管理ページ。操作はすべてサーバー側で管理者キーを確認します
const el = (t, p = {}, ...c) => {
  const e = document.createElement(t);
  for (const [k, v] of Object.entries(p)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); }
  for (const x of c.flat()) if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(x));
  return e;
};
const root = document.getElementById('root');
let AK = sessionStorage.getItem('tamari_admin') || '', tab = 'users', search = '';
const fmt = t => new Date(t).toLocaleString('ja-JP');
async function call(url, body) {
  let r; try { r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'x-admin': AK, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); } catch (e) { throw new Error('サーバーに接続できませんでした'); }
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'エラーが発生しました'); e.status = r.status; throw e; } return j;
}
function login(msg) {
  const k = el('input', { type: 'password', placeholder: '管理者キー(admin_key.txt の中身)', autocomplete: 'off' }), go = () => { AK = k.value.trim(); sessionStorage.setItem('tamari_admin', AK); load(); };
  k.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  root.replaceChildren(el('h2', {}, 'Tamari 管理'), msg ? el('p', { style: 'color:var(--a)' }, msg) : null, k, el('button', { onclick: go }, '入る'));
}
const act = async (url, body, ask) => { if (ask && !confirm(ask)) return; try { await call(url, body); load(); } catch (e) { alert(e.message); } };
const stBtn = (id, st, label) => el('button', { class: 'sub sm', onclick: () => act('/admin-api/user', { id, status: st }, label + 'しますか?') }, label);
const media = src => src ? el('img', { src, style: 'height:60px;border-radius:6px;object-fit:cover' }) : null;
async function toggleDetail(u, box) {
  if (box.firstChild) return box.replaceChildren();
  try {
    const d = await call('/admin-api/user-detail?id=' + u.id), line = (l, v) => v ? el('div', { class: 'sm2' }, l + ':' + v) : null;
    box.replaceChildren(line('いまの一言', d.statusLine), line('自己紹介', d.bio), line('好きなもの', d.likes), line('趣味', d.hobbies), line('興味', d.interests), line('好きな言葉', d.quote), line('話しかけ設定', d.inbox),
      ...d.links.map(l => el('div', { class: 'sm2' }, 'リンク:' + l.title + ' ' + l.url)),
      ...d.posts.map(x=>el('div',{class:'row',style:'cursor:default;padding:4px 0'},el('div',{class:'g'},el('div',{class:'sm2'},'投稿 '+fmt(x.created)),el('div',{},x.body||'(画像・動画)'),x.image?media(x.image):null,x.video?el('video',{src:x.video,controls:'',style:'max-width:240px;display:block'}):null),el('button',{class:'sub sm',onclick:()=>act('/admin-api/post-delete',{id:x.id},'この投稿を削除しますか?')},'投稿削除'))), d.shot ? el('div', {}, el('div', { class: 'sm2' }, 'きょうの一枚:' + (d.shot.caption || '')), media(d.shot.image), el('button', { class: 'sub sm', onclick: () => act('/admin-api/shot-delete', { id: u.id }, 'この写真を削除しますか?') }, '写真削除')) : null,
      d.video ? el('div', {}, el('video', { src: d.video, controls: '', preload: 'metadata', style: 'max-width:240px;display:block' }), el('button', { class: 'sub sm', onclick: () => act('/admin-api/user-image', { id: u.id, kind: 'video' }, '動画を削除しますか?') }, '動画削除')) : null,
      ...d.diaries.map(x => el('div', { class: 'row', style: 'cursor:default;padding:4px 0' }, el('div', { class: 'g' }, el('div', { class: 'sm2' }, '日記 ' + fmt(x.created)), el('div', {}, x.body)), el('button', { class: 'sub sm', onclick: () => act('/admin-api/diary-delete', { id: x.id }, '日記を削除しますか?') }, '削除'))));
  } catch (e) { alert(e.message); }
}
async function load() {
  let d; try { d = await call('/admin-api/overview?q=' + encodeURIComponent(search)); } catch (e) { if (e.status === 403) { sessionStorage.removeItem('tamari_admin'); return login('管理者キーが違います(短時間に何度も間違えると、しばらく入れなくなります)'); } return alert(e.message); }
  const s = d.stats, T = (k, l) => el('button', { class: 'sub sm', style: tab === k ? 'border-color:var(--t)' : '', onclick: () => { tab = k; load(); } }, l);
  let body;
  if (tab === 'users') {
    const q = el('input', { placeholder: 'ユーザー名・表示名で検索(Enterで検索)', value: search }); q.addEventListener('change', () => { search = q.value; load(); });
    body = [q, ...d.users.map(u => { const box = el('div', { class: 'g', style: 'flex-basis:100%;padding:6px 0' });
      return el('div', { class: 'row', style: 'cursor:default;flex-wrap:wrap' },
        el('div', { class: 'g' }, el('div', { class: 'nm' }, u.display + ' @' + u.username), el('div', { class: 'sm2' }, '状態:' + u.status + ' / つながり ' + u.conn + ' / ブロックされた数 ' + u.bc + ' / 発言 ' + u.mc + ' / 登録 ' + fmt(u.created))),
        media(u.avatar), media(u.bg), el('button', { class: 'sub sm', onclick: () => toggleDetail(u, box) }, '中身を見る'),
        u.avatar ? el('button', { class: 'sub sm', onclick: () => act('/admin-api/user-image', { id: u.id, kind: 'avatar' }, 'アイコンを削除しますか?') }, 'アイコン削除') : null, u.bg ? el('button', { class: 'sub sm', onclick: () => act('/admin-api/user-image', { id: u.id, kind: 'bg' }, '背景を削除しますか?') }, '背景削除') : null,
        u.status === 'ok' ? [stBtn(u.id, 'suspended', '停止'), stBtn(u.id, 'frozen', '凍結')] : el('button', { class: 'acc sm', onclick: () => act('/admin-api/user', { id: u.id, status: 'ok' }) }, '解除'),
        el('button', { class: 'sub sm', onclick: () => act('/admin-api/user-delete', { id: u.id }, '@' + u.username + ' を完全に削除します。元に戻せません。よろしいですか?') }, '削除'), box); })];
  } else body = d.messages.map(m => el('div', { class: 'row', style: 'cursor:default' }, el('div', { class: 'g' }, el('div', { class: 'sm2' }, fmt(m.created) + ' @' + m.sender + ' → @' + m.receiver), el('div', {}, m.body || '(画像のみ)'), media(m.image)), el('button', { class: 'sub sm', onclick: () => act('/admin-api/message', { id: m.id }, 'このメッセージを削除しますか?') }, '削除')));
  root.replaceChildren(el('h2', {}, 'Tamari 管理'),
    el('p', { class: 'sm2' }, 'オンライン ' + s.online + '人 / 相手探し中 ' + s.searching + '人 / ユーザー ' + s.users + '(今日の新規 ' + s.newUsers + ') / チャット ' + s.chats + ' / 累計メッセージ ' + s.total + ' / 今日 ' + s.today),
    el('p', { class: 'sm2' }, '日記 ' + s.diaries + '件 / 画像 ' + s.images + '枚 / 動画 ' + s.videos + '本 / つながり ' + s.connections + '組 / ブロック ' + s.blocks),
    el('p', { class: 'sm2' }, '通報とお問い合わせは、Googleフォームの回答で確認してください。チャットの内容は、通報への対応や安全のために必要な範囲でだけ見てください。'),
    el('div', { class: 'row2', style: 'margin-bottom:12px' }, T('users', 'ユーザー'), T('msgs', '最近のチャット'), el('button', { class: 'sub sm', onclick: load }, '更新')), ...[].concat(body));
}
AK ? load() : login();
