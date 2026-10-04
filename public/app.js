// Tamari 画面(ブラウザ側)。画面の文字はすべて createTextNode で入れるので、悪意ある文字(XSS)は実行されません
localStorage.setItem('tamari_lang','ja');
const $ = s => document.querySelector(s);
const el = (t, p = {}, ...c) => {
  const e = document.createElement(t);
  for (const [k, v] of Object.entries(p)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const x of c.flat()) if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(x));
  return e;
};
const app = $('#app');
(function injectTamariPolish(){ if(document.getElementById('tamari-polish')) return; const st=document.createElement('style'); st.id='tamari-polish'; st.textContent=`
:root{--tm-accent:#8d7cf6;--tm-soft:rgba(141,124,246,.10)} body{font-family:Inter,'Noto Sans JP','Yu Gothic UI','Hiragino Kaku Gothic ProN',system-ui,sans-serif;letter-spacing:.01em} .page,.chatw,.me,.posts-section{animation:tmIn .28s ease both}.nm,h1,h2,h3{letter-spacing:-.025em}.phead{backdrop-filter:blur(14px);background:color-mix(in srgb,var(--bg) 88%,transparent);position:sticky;top:0;z-index:5}.profile-top-actions{margin-left:auto;display:flex;align-items:center}.online-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#48c78e;box-shadow:0 0 0 4px rgba(72,199,142,.12);margin-right:6px}.offline-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#a0a0aa;margin-right:6px}.profile-online{font-size:12px;color:var(--muted);display:flex;align-items:center;margin-top:4px}.notice-unread{animation:tmPulse 1.5s ease-in-out infinite}.trending-card{border:1px solid var(--line);border-radius:18px;padding:18px;margin:18px 0;background:linear-gradient(135deg,var(--bg),var(--soft,#f7f7fb));transition:transform .18s ease,box-shadow .18s ease}.trending-card:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(0,0,0,.07)}.trending-rank{font-size:11px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}.reply-count{color:var(--muted);font-size:12px}@keyframes tmIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@keyframes tmPulse{0%,100%{box-shadow:0 0 0 0 rgba(141,124,246,.0)}50%{box-shadow:0 0 18px 3px rgba(141,124,246,.25)}}`; document.head.append(st); })();
let ME = null, es = null, ST = null, CFG = { reportUrl: '', contactUrl: '' }, side, pane, bnav, searching = false, curMatch = null, curChat = null, onMsg = null, onDel = null, opened = false;
const LANG = {
  'ホーム':'Home','チャット':'Chat','お知らせ':'Notices','プロフィール':'Profile','設定':'Settings','ユーザーを探す':'Find users','検索':'Search','今日の投稿':'Today on Tamari','反応の多い順':'Most reacted','今日の投稿がありません。':'No posts today.','まだ投稿がありません。':'No posts yet.','まだ投稿はありません。':'No posts yet.','自己紹介':'About me','今の一言':'Current note','じこしょうかい(実名・連絡先は書かないでください)':'About me (do not include your real name or contact details)','いまの一言':'Current note','お問い合わせ':'Contact','お問い合わせフォームを開く':'Open contact form','言語':'Language','日本語':'Japanese','English':'English','プロフィールを編集':'Edit profile','プロフィールを編集する':'Edit profile','保存して公開':'Save & publish','保存しました':'Saved','話しかける':'Message','話しかける':'Message','つながり':'Connections','ブロック':'Block','ブロック解除':'Unblock','通報':'Report','返信':'Reply','返信する':'Reply','反応・返信を見る':'View reactions & replies','反応する':'React','反応済み':'Reacted','削除':'Delete','投稿する':'Post','新しい投稿':'New post','投稿しました':'Posted','投稿':'Post','設定':'Settings','ライト':'Light','ダーク':'Dark','端末に合わせる':'System','プロフィールを作って「相手を探す」を押すだけ。メールも電話番号も要りません。':'Create a profile and find someone to talk to. No email or phone number required.','現在 ':'Now ','人がオンライン ・ Tamariで交わされたメッセージ ':' online · Messages exchanged on Tamari: ','件':'','まだいません。':'None yet.','つながる(また話したい)':'Connect','つながり中(解除する)':'Connected (remove)','つながり希望を取り消す':'Cancel request','登録しているユーザーを @username で検索できます。':'Search registered users by @username.','該当するユーザーが見つかりませんでした。':'No matching users found.','話したい相手を探す機能は「チャット」から利用できます。':'Find someone to talk to from Chat.','相手の投稿':'Their posts','この人の投稿':'Their posts','あなたの投稿':'Your posts','今日の日記':'Today’s diary','きょうの一枚':'Today’s photo','動画':'Video','リンク':'Links','好きなもの':'Favorites','趣味':'Hobbies','興味':'Interests','好きな言葉':'Favorite words','プロフィールを作って':'Create a profile','読み込んでいます…':'Loading…'
};
const LANG_MORE = {
'通信できませんでした。ネットワークを確認して、もう一度お試しください':'Unable to connect. Please check your network and try again.',
'うまくいきませんでした。もう一度お試しください':'Something went wrong. Please try again.',
'フォームは準備中です。もう少しお待ちください':'The form is not ready yet. Please try again later.',
'利用規約':'Terms of Service','ガイドライン':'Community Guidelines','プライバシー':'Privacy Policy','運営者情報':'About the Operator',
'8文字以上':'8 characters or more','たまり太郎':'Tamari Taro','話したい相手を、':'Someone you want to talk to,','すぐ見つけられる。':'find them right away.','新規登録':'Sign up','ログイン':'Log in','ユーザー名(英数字と _ 、3〜16文字)':'Username (letters, numbers and _, 3–16 characters)','表示名(あとから変えられます)':'Display name (you can change it later)','パスワード':'Password','登録して、はじめる':'Sign up and start','登録すると、':'By signing up, you agree to the ','と':' and ','に同意したことになります。出会い・恋愛・性的な目的での利用は禁止です。パスワードを忘れると復元できないことがあります。':' . Dating, romance and sexual use are prohibited. If you forget your password, it may not be recoverable.','話しかけてみよう':'Start a conversation','戻る':'Back',
'相手から返事がありませんでした。もう一度探してみましょう':'The other person did not respond. Let’s try again.','今回は見送りになりました。もう一度探してみましょう':'This match was passed on. Let’s try again.','相手が見つかりませんでした。しばらくしてからもう一度お試しください':'No match was found. Please try again later.','さんからメッセージが届きました':' sent you a message','既読':'Read','相手が入力中…':'Typing…','相手が退出しました':'The other person left the chat','さんがチャットを開始しました':' started the chat','さんから「つながりたい」が届きました':' sent you a connection request','さんとつながりました':'You are now connected with ','さんが話しかけています':' wants to talk to you','さんがあなたの投稿に反応しました':' reacted to your post','さんがあなたの投稿に返信しました':' replied to your post','さんがあなたの返信に反応しました':' reacted to your reply','さんが日記にひとこと残しました':' left a note on your diary',
'今日はまだ投稿がありません。':'No posts today yet.','投稿画像':'Post image','返信':'Reply','@ユーザー名 または 投稿のキーワードを検索':'Search @username or a post keyword','ユーザーや投稿を検索':'Search users or posts','ユーザー名は @、投稿はキーワードから検索できます。':'Use @ for usernames or keywords for posts.','ユーザー':'Users','該当するユーザー・投稿が見つかりませんでした。':'No matching users or posts found.','ユーザー・投稿を探す':'Find users or posts','登録ユーザーは @ユーザー名、投稿は文章の一部やキーワードから検索できます。':'Search registered users by @username, or search posts by words or phrases.','ユーザーは @、投稿はキーワードから検索できます。':'Use @ for users and keywords for posts.',
'お知らせはありません':'No notices','新しい反応や返信があると、ここに届きます。':'New reactions and replies will appear here.','相手を探しています':'Finding someone to talk to','現在参加しているユーザーから':'From people currently available','話せる相手を探しています。':'Looking for someone you can talk to.','見つかるまで、このままお待ちください(最大3分)。':'Please wait here until someone is found (up to 3 minutes).','やめる':'Cancel','相手が見つかりました':'A match was found','「話してみる」は、相手も同じ気持ちのときにチャットが始まります。':'Chat starts when the other person also chooses “Talk”.','プロフィールをすべて見る(新しいタブ) →':'View full profile (new tab) →','話してみる':'Talk','今回はやめる':'Not this time','さんの返事を待っています':' is waiting for your response','相手も「話してみる」を選ぶと、チャットが始まります。':'Chat starts when both people choose “Talk”.','相手を探す':'Find someone','一時的な会話をここで始められます':'Start a temporary conversation here','まだチャットがありません':'No chats yet','「相手を探す」から、今話せる人を見つけてみましょう。':'Use “Find someone” to meet someone available to chat.','送られた画像':'Sent image','拡大した画像':'Enlarged image','このメッセージを削除しますか?':'Delete this message?','まだメッセージがありません。最初のひとことを送ってみましょう。':'No messages yet. Send the first message.','メッセージ(Ctrl+Enterで送信)':'Message (Ctrl+Enter to send)','メッセージ':'Message','画像を添付しています(送信で投稿)':'Image attached (send to post)','画像は2MB以下にしてください':'Images must be 2MB or smaller','画像を読み込めませんでした。別の画像でお試しください':'Could not load the image. Please try another one.','このチャットから退出しますか？':'Leave this chat?','つながりを希望しました。相手にも同じ気持ちがあると成立します':'Connection request sent. It becomes mutual when they choose the same.','つながり中':'Connected','希望済み':'Requested','つながる':'Connect','さんをブロックしますか?お互いに見えなくなり、相手には通知されません。':'Block this person? You will no longer see each other, and they will not be notified.','退出':'Leave','プロフィールを見る':'View profile','画像を添付':'Attach image','画像':'Image','送信':'Send',
'まもなく消えます':'Disappears soon','あと約':'About ','時間で消えます':' hours remaining','わかる':'I get it','おつかれさま':'Nice work','おもしろい':'Funny','ありがとう':'Thanks','すごい':'Amazing','ひとこと(任意・60文字まで)':'Note (optional, up to 60 characters)','ひとこと添える':'Add a note','この日記を書いた人にだけ届きます。そこから会話が始まるかもしれません。':'Only the diary owner will receive this. It may start a conversation.','届けました':'Sent','送る':'Send','取り消す':'Cancel','今日のこと、好きなもの、残しておきたい一言など':'Share something about today, your interests, or a thought you want to keep','画像は3MB以下にしてください':'Images must be 3MB or smaller','動画は10MB以下にしてください':'Videos must be 10MB or smaller','文章・画像・動画のいずれかを追加してください':'Add text, an image, or a video','動画（MP4・30秒以内）':'Video (MP4, up to 30 seconds)','キャンセル':'Cancel','ファイルを読み込めませんでした':'Could not load the file','さんに返信':'Reply to ','この投稿にひとこと':'Say something about this post','返信に返信':'Reply to reply','返信を入力してください':'Write a reply','返信しました':'Reply sent','返信に♡':'React to reply','まだ返信はありません。':'No replies yet.','この投稿':'This post','閉じる':'Close','件の反応':' reactions','件のいいね':' likes','反応を取り消す':'Remove reaction','♡ 反応する':'♡ React','反応':'Reaction','この投稿を削除しますか？':'Delete this post?','今日の一枚':'Today’s photo','ひとこと(送信済み・変更する)':'Note (sent · change)','この人と話す':'Talk to this person','まだつながりがありません。話した相手を「つながる」で追加できます。':'No connections yet. Add people you have talked with using “Connect”.','つながりの一覧 →':'Connections →','オンライン':'Online','オフライン':'Offline','つながりを解除しますか?':'Remove this connection?','つながりを希望しました':'Connection requested','ブロックしますか?':'Block this person?','あなたのページ':'Your page','ファイルは':'The file must be','MB以下にしてください':'MB or smaller','画像を変更しました':'Image updated','動画をアップロードしています…':'Uploading video…','通信できませんでした。もう一度お試しください':'Unable to connect. Please try again.','動画をアップロードできませんでした':'Could not upload video','動画を変更しました':'Video updated','動画は30秒以内にしてください':'Video must be 30 seconds or shorter',
'グレー':'Gray','青':'Blue','紫':'Purple','緑':'Green','オレンジ':'Orange','赤':'Red','名前(例:ブログ)':'Name (e.g. Blog)','このリンクを削除':'Remove this link','+ リンクを追加':'+ Add link','リンクは6つまでです':'Up to 6 links','を表示':'Show','表示':'Visible','上へ':'Up','下へ':'Down','一言(任意)':'Note (optional)','今日はこんなことがあった…':'Something that happened today…','変更は右(スマホでは下)のプレビューにすぐ反映されます。「保存して公開」を押すと、他の人にも見えるようになります。画像・動画・日記は選んだ時点で反映されます。':'Changes appear immediately in the preview on the right (below on mobile). Save & publish to make them visible to others. Images, videos and diaries update when selected.','アイコンを変更':'Change icon','背景を変更':'Change background','アイコンは1MB、背景は2MBまで。png / jpg / gif / webp が使えます。':'Icon up to 1MB; background up to 2MB. png / jpg / gif / webp supported.','基本':'Basics','表示名':'Display name','例:今日はゆっくり。':'Example: Taking it easy today.','好きなこと(スペースで区切る)':'Interests (separate with spaces)','映画 音楽 PC':'Movies Music PC','リンク(自分のサイトなど)':'Links (your website, etc.)','ホームの今日の投稿':'Today’s posts on Home','自分の投稿を「今日の投稿」に表示する':'Show my posts in “Today’s posts”','オフにすると、プロフィールのTamari Postには残りますが、ホームの今日の投稿一覧には表示されません。':'When off, posts remain on your Tamari Post but will not appear in Home’s Today section.','カラー':'Color','表示する項目と順番':'Visible sections and order','チェックを外すと、他の人には見えなくなります。ドラッグか ↑↓ で並び替えできます。':'Uncheck a section to hide it from others. Drag or use ↑↓ to reorder.','動画(MP4・30秒まで・10MBまで)':'Video (MP4, up to 30 seconds, 10MB)','動画を選ぶ':'Choose video','きょうの一枚(その日だけ表示。日付が変わると消えます)':'Today’s photo (shown for today only)','今日の一枚を更新しました':'Today’s photo updated','写真を選ぶ':'Choose photo','今日の日記(24時間で消えます。いつでも削除できます)':'Today’s diary (expires in 24 hours; you can delete it anytime)','日記を追加':'Add diary','プレビュー(保存前の見た目)':'Preview (before saving)','お互いに「また話したい」と思っている人です。人数は誰にも表示されません。':'People who both want to talk again. The count is not shown to anyone.','まだいません。話した相手のページで「つながる」を押してみましょう。':'None yet. Try “Connect” on someone you have talked with.','あなたが希望している人':'People you requested to connect with','相手には通知されていません。相手も「つながる」を押すと成立します。':'They have not been notified. It becomes mutual when they also choose “Connect”.','いません':'None','話しかけの受け付け':'Who can message you','だれでも話しかけられる':'Anyone','つながりのある人だけ':'Connections only','話しかけを受け付けない':'No one','現在のパスワード':'Current password','新しいパスワード(8文字以上)':'New password (8+ characters)','パスワードを入力して退会':'Enter your password to delete your account','つながりを見る':'View connections','プロフィールからの話しかけを制限できます。「相手を探す」で見つかった人とは、お互いに「話してみる」を選べば話せます。':'Control who can message you from your profile. People found through “Find someone” can chat when both choose “Talk”.','ブロックリスト':'Block list','あなただけに見えます。相手には通知されません。':'Only you can see this. The other person is not notified.','ブロック中のユーザーはいません':'No blocked users','パスワードの変更':'Change password','パスワードを変更しました':'Password changed','変更する':'Change','ログアウト':'Log out','退会':'Delete account','プロフィール・画像・メッセージ・つながりなど、あなたに関するデータをすべて削除します。元に戻せません。':'This permanently deletes your profile, images, messages, connections and other data.','本当に退会しますか?すべてのデータが削除され、元に戻せません。':'Delete your account? All data will be permanently deleted.','退会しました。ご利用ありがとうございました':'Your account was deleted. Thank you for using Tamari.','退会する':'Delete account','保存しました':'Saved','保存して公開':'Save & publish','やめる':'Cancel','プロフィールを編集':'Edit profile','プロフィールを編集する':'Edit profile'
};
Object.assign(LANG, LANG_MORE);

function applyLanguage(){
  localStorage.setItem('tamari_lang','ja');
  document.documentElement.lang='ja';
}

const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); };
async function api(url, method = 'GET', body) {
  const o = { method, headers: { 'x-requested-with': 'tamari' } };
  if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
  let r; try { r = await fetch(url, o); } catch (e) { throw new Error('通信できませんでした。ネットワークを確認して、もう一度お試しください'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'うまくいきませんでした。もう一度お試しください'); e.status = r.status; throw e; }
  return j;
}
// ボタンを押している間は無効にして、連打を防ぐ。失敗したら理由を表示する
const safe = fn => async (...a) => {
  const b = a[0] && a[0].currentTarget; if (b && 'disabled' in b) b.disabled = true;
  try { await fn(...a); } catch (e) { toast(e.message); if (e.status === 401 && ME) { ME = null; landing(); } }
  finally { if (b && b.isConnected) b.disabled = false; }
};
const hm = t => new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
const num = n => Number(n).toLocaleString('ja-JP');
const closeD = d => { d.close(); d.remove(); };
const avatar = (u, big) => el('div', { class: 'av' + (big ? ' l' : '') }, u.avatar ? el('img', { src: u.avatar, alt: '' }) : (u.display || '?').slice(0, 1));
const logo = () => el('a', { href: '#/', class: 'logo' }, 'Tamari', el('i', {}, '.'));
const liveLine = () => { const en=(localStorage.getItem('tamari_lang')||'ja')==='en'; return el('span', {}, en?'Currently ': '現在 ', el('b', { 'data-s': 'online' }, ST ? num(ST.online) : '-'), en?' people online · Messages exchanged on Tamari: ':'人がオンライン ・ Tamariで交わされたメッセージ ', el('b', { 'data-s': 'total' }, ST ? num(ST.total) : '-'), en?'':'件'); };
const paintStats = () => { if (ST) document.querySelectorAll('[data-s]').forEach(e => { e.textContent = num(ST[e.dataset.s]); }); };
function openForm(kind) { const u = kind === 'report' ? CFG.reportUrl : CFG.contactUrl; if (!u) return toast('フォームは準備中です。もう少しお待ちください'); window.open(u, '_blank', 'noopener'); }
const formLinks = () => el('div', { class: 'foot' }, [['terms', '利用規約'], ['guideline', 'ガイドライン'], ['privacy', 'プライバシー'], ['operator', '運営者情報']].map(([k, l]) => el('a', { href: '/rules.html#' + k }, l)), el('a', { href: '#', onclick: e => { e.preventDefault(); openForm('contact'); } }, 'お問い合わせ'));
const loadingEl = () => el('div', { class: 'load', role: 'status' }, '読み込んでいます…');

// ---------- ログイン前 ----------
async function landing(tab = 'new') {
  if (es) { es.close(); es = null; } opened = false; searching = false; curMatch = null; document.body.classList.remove('inchat');
  [ST, CFG] = await Promise.all([fetch('/api/stats').then(r => r.json()).catch(() => null), fetch('/api/config').then(r => r.json()).catch(() => CFG)]);
  const u = el('input', { maxlength: 16, autocapitalize: 'none', autocomplete: 'username', placeholder: 'tamari_taro' }), p = el('input', { type: 'password', autocomplete: tab === 'new' ? 'new-password' : 'current-password', placeholder: '8文字以上' }), d = el('input', { maxlength: 20, placeholder: 'たまり太郎' });
  const go = safe(async () => { await api(tab === 'new' ? '/api/register' : '/api/login', 'POST', { username: u.value, display: d.value, password: p.value }); boot(); });
  p.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  app.replaceChildren(el('div', { class: 'land' }, logo(), el('h1', {}, '話したい相手を、', el('br'), 'すぐ見つけられる。'),
    el('p', { class: 'sm2' }, 'プロフィールを作って「相手を探す」を押すだけ。メールも電話番号も要りません。'), el('p', { class: 'sm2' }, liveLine()),
    el('div', { class: 'tabs' }, el('button', { class: tab === 'new' ? 'on' : '', onclick: () => landing('new') }, '新規登録'), el('button', { class: tab === 'in' ? 'on' : '', onclick: () => landing('in') }, 'ログイン')),
    el('label', {}, 'ユーザー名(英数字と _ 、3〜16文字)'), u, tab === 'new' ? [el('label', {}, '表示名(あとから変えられます)'), d] : null, el('label', {}, 'パスワード'), p,
    el('button', { class: 'acc big', style: 'font-size:17px;padding:14px', onclick: go }, tab === 'new' ? '登録して、はじめる' : 'ログイン'),
    tab === 'new' ? el('p', { class: 'foot' }, '登録すると、', el('a', { href: '/rules.html#terms' }, '利用規約'), 'と', el('a', { href: '/rules.html#guideline' }, 'ガイドライン'), 'に同意したことになります。出会い・恋愛・性的な目的での利用は禁止です。パスワードを忘れると復元できないことがあります。') : null, formLinks()));
  paintStats();
  applyLanguage();
}

// ---------- 枠 ----------
const NAV = [['#/', 'ホーム'], ['#/chats', 'チャット'], ['#/notices', 'お知らせ'], ['#/me', 'プロフィール'], ['#/settings', '設定']];
const navOn = h => h === '' || h === '#/' ? '#/' : h.startsWith('#/chat') ? '#/chats' : h === '#/notices' ? '#/notices' : h === '#/me' || h === '#/edit' || h.startsWith('#/u/') || h === '#/connections' ? '#/me' : h;
function layout() {
  side = el('aside', { class: 'side' }); pane = el('section', { class: 'pane' }); bnav = el('nav', { class: 'bnav' });
  app.replaceChildren(el('div', { class: 'app' }, side, pane), bnav);
}
async function renderSide() {
  const h = navOn(location.hash), link = ([href, l]) => el('a', { href, class: href === h ? 'on' : '' }, l);
  bnav.replaceChildren(...NAV.map(link));
  const chats = await api('/api/chats');
  const unread = await api('/api/notices').catch(()=>[]);
  const mainNav = NAV.filter(([href]) => href !== '#/settings');
  const navItems = mainNav.map(([href,label]) => {
    const a=link([href,label]);
    if(href==='#/notices' && unread.length){
      a.style.position='relative';
      a.classList.add('notice-unread'); a.style.boxShadow='0 0 0 1px var(--line), 0 0 16px rgba(141,124,246,.32)';
      a.style.borderRadius='12px';
      a.style.fontWeight='700';
      a.append(el('span',{class:'notice-badge',style:'display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;margin-left:8px;border-radius:999px;background:#ff5f87;color:#fff;font-size:11px;box-shadow:0 0 12px rgba(255,95,135,.55)'},String(unread.length)));
    }
    return a;
  });
  side.replaceChildren(
    el('div', { class: 'top' }, logo()),
    el('div', { class: 'nav' }, navItems),
    el('div', { class: 'side-spacer' }),
    el('div', { class: 'nav side-bottom' }, link(['#/settings', '設定'])),
    el('div', { class: 'live' }, liveLine())
  );
  paintStats();
}
const chatRow = c => el('a', { class: 'row' + (curChat === c.id ? ' cur' : ''), href: '#/chat/' + c.id }, avatar(c), el('div', { class: 'g' }, el('div', { class: 'nm' }, c.display), el('div', { class: 'sm2', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.preview || '話しかけてみよう')));
const phead = (title, sub, right) => el('div', { class: 'phead' }, el('button', { class: 'back', 'aria-label': '戻る', onclick: () => history.length > 1 ? history.back() : (location.hash = '#/') }, '←'), el('div', { class: 'g' }, el('div', { class: 'nm' }, title), sub ? el('div', { class: 'sm2' }, sub) : null), right);
const urow = (x, extra) => el('div', { class: 'row', style: 'cursor:default' }, el('a', { href: '#/u/' + x.username, style: 'display:flex;gap:12px;align-items:center;flex:1;min-width:0;text-decoration:none' }, avatar(x), el('div', { class: 'g' }, el('div', { class: 'nm' }, x.display), el('div', { class: 'sm2' }, '@' + x.username))), extra);
function connect() {
  if (es) es.close(); es = new EventSource('/api/live');
  es.onopen = () => { if (opened && ME) route(); opened = true; }; // つながり直したときは、いまの画面を読み込み直す
  es.addEventListener('stats', e => { ST = JSON.parse(e.data); paintStats(); });
  es.addEventListener('matched', e => {
    // matched は検索開始直後に届くことがあるため、イベントを捨てない。
    // ただし別画面へ移動済みなら、その画面を勝手に上書きしない。
    const d = JSON.parse(e.data);
    if (!searching) return;
    searching = false;
    foundView(d);
  });
  es.addEventListener('matchstart', e => { const d = JSON.parse(e.data); if (curMatch) { curMatch = null; location.hash = '#/chat/' + d.chat; } });
  es.addEventListener('matchend', e => { if (!curMatch) return; curMatch = null; toast(JSON.parse(e.data).reason === 'timeout' ? '相手から返事がありませんでした。もう一度探してみましょう' : '今回は見送りになりました。もう一度探してみましょう'); home(); });
  es.addEventListener('searchend', () => { if (searching) { searching = false; toast('相手が見つかりませんでした。しばらくしてからもう一度お試しください'); home(); } });
  es.addEventListener('msg', e => { const m = JSON.parse(e.data); if (onMsg && m.chat === curChat) onMsg(m); else if (m.username !== ME.username) { toast(m.display + 'さんからメッセージが届きました'); renderSide().catch(() => {}); } });
  es.addEventListener('read', e=>{ const d=JSON.parse(e.data); if(d.chat!==curChat)return; document.querySelectorAll('.msg.mine .read-mark').forEach(x=>x.textContent=(localStorage.getItem('tamari_lang')||'ja')==='en'?'Read':'既読'); });
  es.addEventListener('typing', e=>{ const d=JSON.parse(e.data); if(d.chat!==curChat)return; const t=document.querySelector('.chat-typing'); if(t)t.textContent=d.typing?((localStorage.getItem('tamari_lang')||'ja')==='en'?'Typing…':'相手が入力中…'):''; });
  es.addEventListener('del', e => onDel && onDel(JSON.parse(e.data).id));
  es.addEventListener('chatremoved', e => {
    const d = JSON.parse(e.data);
    if (d.chat === curChat) { curChat = null; onMsg = null; onDel = null; document.body.classList.remove('inchat'); location.hash = '#/chats'; }
    renderSide().catch(() => {});
  });
  es.addEventListener('chatend', e => {
    const d = JSON.parse(e.data);
    if (d.chat !== curChat) return;
    onMsg = null; onDel = null;
    toast(d.message || '相手が退出しました');
    const marker = el('div',{class:'chat-ended'},d.message || '相手が退出しました');
    const list=document.querySelector('.msgs');
    if(list) list.append(marker);
    const comp=document.querySelector('.comp'); if(comp) comp.remove();
  });
  es.addEventListener('notice', e => {
    const n = JSON.parse(e.data);
    renderSide().catch(()=>{});
    if (n.kind === 'talk') {
      if (n.chat === curChat) return;
      toast(n.display + 'さんがチャットを開始しました');
      if (!searching && !curMatch) location.hash = '#/chat/' + n.chat;
      return;
    }
    toast(noticeText(n));
    if ((location.hash === '' || location.hash === '#/') && !searching && !curMatch) home();
  });
}
const noticeText = n => n.kind === 'connect_request' ? n.display + 'さんから「つながりたい」が届きました' : n.kind === 'connected' ? n.display + 'さんとつながりました' : n.kind === 'talk' ? n.display + 'さんが話しかけています' : n.kind === 'postlike' ? '♡ ' + n.display + 'さんがあなたの投稿に反応しました' : n.kind === 'postreply' ? '返信 ' + n.display + 'さんがあなたの投稿に返信しました' : n.kind === 'replylike' ? '♡ ' + n.display + 'さんがあなたの返信に反応しました' : n.display + 'さんが日記にひとこと残しました';
const noticeHref = n => n.kind === 'connect_request' ? '#/u/' + n.username : n.kind === 'connected' ? '#/u/' + n.username : n.kind === 'talk' ? '#/chat/' + n.chat : '#/u/' + n.username;

// ---------- ホーム・相手を探す ----------
const startSearch = async () => {
  // 重要: /api/match/start の応答を待つ前に検索状態をONにする。
  // サーバーがPOST中にmatchedイベントを返すと、await後にsearching=trueでは
  // イベントを受け取った時点でsearching=falseのままになり、見つかった画面が捨てられる。
  searching = true;
  if (location.hash !== '#/chats') location.hash = '#/chats';
  searchView();
  try {
    await api('/api/match/start', 'POST');
  } catch (e) {
    searching = false;
    home();
    throw e;
  }
};
async function userSearch(q) {
  const results = await api('/api/users/search?q=' + encodeURIComponent(q));
  return results;
}
async function renderHomePosts(){
  const posts=await api('/api/home-posts').catch(()=>[]); const box=el('div',{class:'home-posts'});
  if(!posts.length){ box.append(el('p',{class:'sm2',style:'margin-top:14px'},'今日はまだ投稿がありません。')); return box; }
  posts.forEach((p,i)=>{ const card=el('article',{class:'trending-card',onclick:()=>postDetailDialog(p,home),style:'cursor:pointer'},el('div',{class:'trending-rank'},'#'+(i+1)+'  TODAY'),el('div',{style:'display:flex;align-items:center;gap:10px;margin:10px 0'},el('a',{href:'#/u/'+encodeURIComponent(p.username),onclick:e=>e.stopPropagation(),style:'display:flex;align-items:center'},avatar(p)),el('div',{class:'g'},el('a',{href:'#/u/'+encodeURIComponent(p.username),onclick:e=>e.stopPropagation(),class:'nm',style:'text-decoration:none'},p.display),el('div',{class:'sm2'},'@'+p.username+' ・ '+new Date(p.created).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})))),p.body?el('p',{class:'tx',style:'white-space:pre-wrap'},p.body):null,p.image?el('img',{src:p.image,alt:'投稿画像',style:'width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin-top:10px',loading:'lazy'}):null,p.video?el('video',{src:p.video,controls:'',playsinline:'',style:'width:100%;max-height:420px;border-radius:14px;margin-top:10px'}):null,el('div',{style:'margin-top:12px;color:var(--muted);font-size:13px'},'♡ '+num(p.likes||0)+' ・ '+num((p.replies||[]).length)+' 返信')) ; box.append(card); }); return box;
}
async function home() {
  curChat = null; document.body.classList.remove('inchat');
  const box = el('div');
  const input = el('input',{class:'user-search-input',maxlength:80,placeholder:'@ユーザー名 または 投稿のキーワードを検索','aria-label':'ユーザーや投稿を検索'});
  const results = el('div',{class:'user-search-results',style:'margin-top:18px;max-width:720px'});
  const draw = async () => {
    const q = input.value.trim();
    if(!q){ results.replaceChildren(el('p',{class:'sm2'},'ユーザー名は @、投稿はキーワードから検索できます。')); return; }
    try{
      const data=await api('/api/home-search?q='+encodeURIComponent(q));
      const nodes=[];
      if(data.users.length){ nodes.push(el('h3',{},'ユーザー')); data.users.forEach(u=>nodes.push(urow(u))); }
      if(data.posts.length){
        nodes.push(el('h3',{style:'margin-top:24px'},'投稿'));
        data.posts.forEach(p=>nodes.push(el('article',{class:'trending-card',onclick:()=>postDetailDialog(p,home),style:'cursor:pointer'},
          el('div',{class:'trending-rank'},'POST'),
          el('div',{style:'display:flex;align-items:center;gap:10px;margin:10px 0'},el('a',{href:'#/u/'+encodeURIComponent(p.username),onclick:e=>e.stopPropagation(),style:'display:flex'},avatar(p)),el('div',{class:'g'},el('a',{href:'#/u/'+encodeURIComponent(p.username),onclick:e=>e.stopPropagation(),class:'nm',style:'text-decoration:none'},p.display),el('div',{class:'sm2'},'@'+p.username+' ・ '+new Date(p.created).toLocaleString('ja-JP')))),
          p.body?el('p',{class:'tx',style:'white-space:pre-wrap'},p.body):null,
          p.image?el('img',{src:p.image,alt:'投稿画像',style:'width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin-top:10px',loading:'lazy'}):null,
          p.video?el('video',{src:p.video,controls:'',playsinline:'',style:'width:100%;max-height:420px;border-radius:14px;margin-top:10px'}):null,
          el('div',{style:'margin-top:12px;color:var(--muted);font-size:13px'},'♡ '+num(p.likes||0)))));
      }
      results.replaceChildren(...(nodes.length?nodes:[el('p',{class:'sm2'},'該当するユーザー・投稿が見つかりませんでした。')]));
    }catch(e){toast(e.message);}
  };
  const searchBtn = el('button',{class:'acc',style:'white-space:nowrap',onclick:safe(draw)},'検索');
  input.addEventListener('keydown',e=>{if(e.key==='Enter') draw();});
  box.append(el('div',{class:'page c'},
    el('h1',{},'ユーザー・投稿を探す'),
    el('p',{class:'sm2',style:'margin-bottom:18px'},'登録ユーザーは @ユーザー名、投稿は文章の一部やキーワードから検索できます。'),
    el('div',{class:'user-search-bar',style:'display:flex;gap:8px;align-items:center;max-width:720px'},input,searchBtn),results,
    el('section',{class:'trending-home'},el('div',{style:'display:flex;align-items:end;justify-content:space-between;gap:12px;margin-top:34px'},el('div',{},el('span',{class:'eyebrow'},'TODAY AT TAMARI'),el('h2',{style:'margin:5px 0 0'},'今日の投稿')),el('span',{class:'sm2'},'反応の多い順'))),
    await renderHomePosts(),el('div',{class:'foot',style:'margin-top:30px'},'話したい相手を探す機能は「チャット」から利用できます。')));
  results.replaceChildren(el('p',{class:'sm2'},'ユーザーは @、投稿はキーワードから検索できます。'));
  pane.replaceChildren(box); paintStats();
}
async function notices() {
  curChat = null; document.body.classList.remove('inchat');
  const ns = await api('/api/notices');
  const list = el('div',{class:'notice-list'});
  const openNotice = async n => {
    try { await api('/api/notices/'+n.id+'/read','POST'); } catch(e) {}
    const h = noticeHref(n);
    if (h) location.hash = h;
  };
  if (!ns.length) list.append(el('div',{class:'page c'},el('h2',{},'お知らせはありません'),el('p',{class:'sm2'},'新しい反応や返信があると、ここに届きます。')));
  else ns.forEach(n => list.append(el('button',{class:'notice-item',type:'button',style:'display:flex;width:100%;gap:14px;align-items:center;text-align:left;border:1px solid var(--line);background:var(--bg);color:inherit;border-radius:14px;padding:14px 16px;margin-bottom:10px;cursor:pointer',onclick:safe(()=>openNotice(n))},el('div',{class:'notice-mark',style:'width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:var(--s);font-size:18px'},n.kind==='postlike'||n.kind==='replylike'?'♡':n.kind==='postreply'?'返信':'•'),el('div',{class:'g',style:'text-align:left'},el('div',{},noticeText(n)),el('div',{class:'sm2'},new Date(n.created).toLocaleString('ja-JP'))))));
  pane.replaceChildren(phead('お知らせ'), list); paintStats();
}

function searchView() {
  pane.replaceChildren(el('div', { class: 'page c' }, el('h1', {}, '相手を探しています'), el('div', { class: 'dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')), el('p', { class: 'sm2' }, '現在参加しているユーザーから', el('br'), '話せる相手を探しています。'),
    el('p', { class: 'sm2', style: 'margin:22px 0' }, '見つかるまで、このままお待ちください(最大3分)。'),
    el('button', { class: 'sub', onclick: safe(async () => { searching = false; await api('/api/match/cancel', 'POST'); home(); }) }, 'やめる')));
}
function foundView(m) {
  const u = m.user; curMatch = m.match;
  pane.replaceChildren(el('div', { class: 'page c' }, el('h1', {}, '相手が見つかりました'), el('p', { class: 'sm2' }, '「話してみる」は、相手も同じ気持ちのときにチャットが始まります。'),
    el('div', { class: 'found' }, el('div', { class: 'row', style: 'padding:0 0 10px;cursor:default' }, avatar(u), el('div', { class: 'g' }, el('div', { class: 'nm' }, u.display), el('div', { class: 'sm2' }, '@' + u.username))),
      u.statusLine ? el('p', { class: 'now' }, u.statusLine) : null, u.bio ? el('p', { style: 'white-space:pre-wrap;margin:0 0 8px' }, u.bio) : null, tags(u.likes), tags(u.interests), el('a', { href: '#/u/' + u.username, target: '_blank', rel: 'noopener', class: 'sm2' }, 'プロフィールをすべて見る(新しいタブ) →')),
    el('button', { class: 'acc big', onclick: safe(async () => { const r = await api('/api/match/answer', 'POST', { match: m.match, accept: true }); if (r.waiting) waitView(u); }) }, '話してみる'),
    el('button', { class: 'sub big', style: 'margin-top:10px;font-size:16px;padding:14px', onclick: safe(async () => { await api('/api/match/answer', 'POST', { match: m.match, accept: false }); curMatch = null; await startSearch(); }) }, '今回はやめる')));
}
function waitView(u) {
  pane.replaceChildren(el('div', { class: 'page c' }, el('h1', {}, u.display + 'さんの返事を待っています'), el('div', { class: 'dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')), el('p', { class: 'sm2', style: 'margin:18px 0' }, '相手も「話してみる」を選ぶと、チャットが始まります。'),
    el('button', { class: 'sub', onclick: safe(async () => { await api('/api/match/answer', 'POST', { match: curMatch, accept: false }); curMatch = null; await startSearch(); }) }, '今回はやめる')));
}
const tags = s => s ? el('div', {}, s.split(/[,、\s]+/).filter(Boolean).slice(0, 10).map(t => el('span', { class: 'tag' }, t))) : null;

// ---------- チャット ----------
async function chatList() {
  curChat = null;
  const c = await api('/api/chats');
  const find = el('button',{class:'acc',onclick:safe(startSearch)},'相手を探す');
  pane.replaceChildren(
    phead('チャット','一時的な会話をここで始められます',find),
    c.length ? c.map(chatRow) : el('div',{class:'page c'},el('div',{class:'empty-chat'},el('div',{class:'empty-chat-icon'},'◌'),el('h2',{},'まだチャットがありません'),el('p',{class:'sm2'},'「相手を探す」から、今話せる人を見つけてみましょう。'),el('button',{class:'acc big',onclick:safe(startSearch)},'相手を探す')))
  );
}
async function chat(id) {
  curChat = +id; let typingTimer=null; let typingShown=null;
  await api('/api/chats/'+id+'/read','POST').catch(()=>{}); document.body.classList.add('inchat'); const d = await api('/api/chats/' + id); let image = null;
  const list = el('div', { class: 'msgs' }), pv = el('div', { class: 'pv' });
  const add = m => {
    const mine = m.username === ME.username, meta = el('div', { class: 'meta' }, hm(m.created)), box = el('div', { class: 'msg' + (mine ? ' mine' : ''), 'data-id': m.id }, meta, m.body ? el('div', { class: 'bub' }, m.body) : null);
    if (m.image) box.append(el('img', { src: m.image, alt: '送られた画像', loading: 'lazy', onclick: () => { const z = el('div', { class: 'zoom', onclick: () => z.remove() }, el('img', { src: m.image, alt: '拡大した画像' })); document.body.append(z); } }));
    if (mine) meta.append(el('button', { class: 'txt', onclick: safe(async () => { if (confirm('このメッセージを削除しますか?')) { await api('/api/messages/' + m.id, 'DELETE'); box.remove(); } }) }, '削除'));
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 140; list.append(box); if (stick || mine) list.scrollTop = list.scrollHeight;
  };
  const typing=el('div',{class:'sm2 chat-typing',style:'min-height:18px;margin:4px 12px'},'');
  const showTyping=v=>{typing.textContent=v?'相手が入力中…':'';};
  const markRead=()=>api('/api/chats/'+id+'/read','POST').catch(()=>{});
  if(document.visibilityState==='visible') markRead();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&curChat===+id)markRead();},{once:false});
  if (!d.msgs.length) list.append(el('p', { class: 'sm2', style: 'text-align:center;margin:30px 0' }, 'まだメッセージがありません。最初のひとことを送ってみましょう。'));
  d.msgs.forEach(add);
  const ta = el('textarea', { maxlength: 500, placeholder: 'メッセージ(Ctrl+Enterで送信)', 'aria-label': 'メッセージ' }), file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', hidden: '' });
  const sendIt = safe(async () => {
    if (!ta.value.trim() && !image) return; const body = ta.value, img = image; ta.value = ''; image = null; pv.textContent = '';
    try { await api('/api/chats/' + id + '/messages', 'POST', { body, image: img }); list.querySelector('p.sm2')?.remove(); } catch (e) { ta.value = body; image = img; if (img) pv.textContent = '画像を添付しています(送信で投稿)'; throw e; }
  });
  file.onchange = () => { const f = file.files[0]; if (!f) return; if (f.size > 2 * 1048576) { file.value = ''; return toast('画像は2MB以下にしてください'); } const fr = new FileReader(); fr.onload = () => { image = fr.result; pv.textContent = '画像を添付しています(送信で投稿)'; file.value = ''; }; fr.onerror = () => toast('画像を読み込めませんでした。別の画像でお試しください'); fr.readAsDataURL(f); };
  ta.addEventListener('input',()=>{ api('/api/chats/'+id+'/typing','POST',{typing:true}).catch(()=>{}); clearTimeout(typingTimer); typingTimer=setTimeout(()=>api('/api/chats/'+id+'/typing','POST',{typing:false}).catch(()=>{}),900); });
ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendIt(); } });
  const w = d.with;
  const exitChat = safe(async () => {
    if (!confirm('このチャットから退出しますか？')) return;
    try { await api('/api/chats/' + id + '/leave', 'POST'); } finally {
      onMsg = null; onDel = null; curChat = null; location.hash = '#/chats';
    }
  });
  const menu = el('div', { class: 'row2 chat-toolbar' },
    el('button', { class: 'txt', onclick: safe(async () => { if (d.mine) await api('/api/connect/' + w.username, 'DELETE'); else { const r = await api('/api/connect', 'POST', { username: w.username }); toast(r.mutual ? w.display + 'さんとつながりました' : 'つながりを希望しました。相手にも同じ気持ちがあると成立します'); } route(); }) }, d.mutual ? 'つながり中' : d.mine ? '希望済み' : 'つながる'),
    el('button', { class: 'txt', onclick: () => openForm('report') }, '通報'),
    el('button', { class: 'txt', onclick: safe(async () => { if (confirm(w.display + 'さんをブロックしますか?お互いに見えなくなり、相手には通知されません。')) { await api('/api/block', 'POST', { username: w.username }); location.hash = '#/chats'; } }) }, 'ブロック'),
  el('button', { class: 'leave-chat', onclick: exitChat }, '退出'));
  pane.replaceChildren(el('div', { class: 'chatw' }, el('div', { class: 'phead' }, el('button', { class: 'back', 'aria-label': '戻る', onclick: () => { location.hash = '#/chats'; } }, '←'), avatar(w),
    el('a', { class: 'g', href: '#/u/' + w.username, style: 'text-decoration:none' }, el('div', { class: 'nm' }, w.display), el('div', { class: 'sm2' }, 'プロフィールを見る')), menu),
    typing, list, pv, el('div', { class: 'comp' }, el('button', { class: 'sub', onclick: () => file.click(), 'aria-label': '画像を添付' }, '画像'), file, ta, el('button', { onclick: sendIt }, '送信'))));
  list.scrollTop = list.scrollHeight; onMsg = add; onDel = id => { const x = list.querySelector('[data-id="' + id + '"]'); if (x) x.remove(); };
}

// ---------- プロフィール(自分で組み立てる個人ページ) ----------
const LABEL = { bio: '自己紹介', likes: '好きなもの', hobbies: '趣味', interests: '興味', quote: '好きな言葉', shot: 'きょうの一枚', video: '動画', diary: '今日の日記', links: 'リンク', follow: 'つながり', status: '今の一言' };
const slash = s => String(s || '').split(/[,、\s\/]+/).filter(Boolean).slice(0, 12).join(' / ');
const left = t => { const h = Math.ceil((t + 864e5 - Date.now()) / 36e5); return h <= 1 ? 'まもなく消えます' : 'あと約' + h + '時間で消えます'; };
const okLink = l => { try { const x = new URL(l.url); return /^https?:$/.test(x.protocol) ? x : null; } catch (e) { return null; } };
const STAMPS = ['わかる', 'おつかれさま', 'おもしろい', 'ありがとう', 'すごい'];
function replyDialog(diary, done) { // 日記への「ひとこと」。数は表示されず、日記の持ち主だけが読めます
  let stamp = diary.mine ? diary.mine.stamp : '', dlg;
  const t = el('input', { maxlength: 60, placeholder: 'ひとこと(任意・60文字まで)', value: diary.mine ? diary.mine.body : '' }), row = el('div', { class: 'row2' });
  const drawS = () => row.replaceChildren(...STAMPS.map(s => el('button', { class: 'sub sm' + (stamp === s ? ' on' : ''), onclick: () => { stamp = stamp === s ? '' : s; drawS(); } }, s)));
  drawS();
  dlg = el('dialog', {}, el('h3', { style: 'margin:0 0 6px' }, 'ひとこと添える'), el('p', { class: 'sm2', style: 'margin:0 0 10px' }, 'この日記を書いた人にだけ届きます。そこから会話が始まるかもしれません。'), row, el('div', { style: 'height:10px' }), t,
    el('div', { class: 'row2' }, el('button', { class: 'acc', onclick: safe(async () => { await api('/api/diary/' + diary.id + '/reply', 'POST', { stamp, body: t.value }); closeD(dlg); toast('届けました'); done(); }) }, '送る'),
      diary.mine ? el('button', { class: 'sub', onclick: safe(async () => { await api('/api/diary/' + diary.id + '/reply', 'DELETE'); closeD(dlg); done(); }) }, '取り消す') : null, el('button', { class: 'sub', onclick: () => closeD(dlg) }, 'やめる')));
  document.body.append(dlg); dlg.showModal();
}

async function postDialog(owner, onDone) {
  const dlg = el('dialog', { class:'dlg' });
  const body = el('textarea',{maxlength:1000,rows:6,placeholder:'今日のこと、好きなもの、残しておきたい一言など'});
  const image = el('input',{type:'file',accept:'image/png,image/jpeg,image/gif,image/webp'});
  const video = el('input',{type:'file',accept:'video/mp4'});
  const preview = el('div',{class:'pv'});
  const send = safe(async()=>{
    let img=null, vid=null;
    if(image.files[0]){
      if(image.files[0].size>3*1048576) throw new Error('画像は3MB以下にしてください');
      img=await fileData(image.files[0]);
    }
    if(video.files[0]){
      if(video.files[0].size>10*1048576) throw new Error('動画は10MB以下にしてください');
      vid=await fileData(video.files[0]);
    }
    if(!body.value.trim()&&!img&&!vid) throw new Error('文章・画像・動画のいずれかを追加してください');
    await api('/api/posts','POST',{body:body.value,image:img,video:vid});
    closeD(dlg); await onDone(); toast('投稿しました');
  });
  dlg.append(
    el('h2',{},'新しい投稿'),
    body,
    el('label',{},'画像',image),
    el('label',{},'動画（MP4・30秒以内）',video),
    preview,
    el('div',{class:'row2'},el('button',{class:'sub',onclick:()=>closeD(dlg)},'キャンセル'),el('button',{class:'acc',onclick:send},'投稿する'))
  );
  document.body.append(dlg); dlg.showModal();
}
function fileData(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(new Error('ファイルを読み込めませんでした')); r.readAsDataURL(file);
  });
}
async function loadPosts(username){
  try{return await api('/api/posts?username='+encodeURIComponent(username));}
  catch(e){toast(e.message);return [];}
}
function launchHeartBurst(card){
  const burst = el('div',{class:'heart-burst','aria-hidden':'true'});
  const symbols=['♡','♡','♡','♥','♡'];
  symbols.forEach((symbol,i)=>{
    const h=el('span',{class:'heart-float'},symbol);
    h.style.setProperty('--dx', ((i-2)*22 + (Math.random()*14-7)) + 'px');
    h.style.setProperty('--delay', (i*45) + 'ms');
    h.style.setProperty('--rot', ((Math.random()*26)-13) + 'deg');
    burst.append(h);
  });
  card.append(burst);
  setTimeout(()=>burst.remove(),1250);
}


function ensureReplyEffects(){
  if(document.getElementById('tamari-reply-effects')) return;
  const s=document.createElement('style'); s.id='tamari-reply-effects';
  s.textContent=`
    .reply-heart-burst{position:absolute;left:26px;bottom:22px;pointer-events:none;z-index:8}
    .reply-heart-float{position:absolute;left:0;bottom:0;font-size:22px;color:#ff5f87;animation:tamariReplyHeart 1.05s ease-out var(--delay) forwards;opacity:0}
    @keyframes tamariReplyHeart{0%{transform:translate(0,0) scale(.65) rotate(0deg);opacity:0}15%{opacity:1}100%{transform:translate(var(--dx),-58px) scale(1.18) rotate(14deg);opacity:0}}
    .reply-heart-btn{border:0;background:transparent;color:var(--muted);font-size:18px;cursor:pointer;padding:3px 6px}
    .reply-heart-btn.active{color:#ff5f87;text-shadow:0 0 10px rgba(255,95,135,.35)}
    .reply-like-count{font-size:12px;color:var(--muted);min-width:12px}
  `;
  document.head.append(s);
}
function postDetailDialog(p, reload){
  ensureReplyEffects();
  const dlg = el('dialog',{class:'post-detail-dialog'});
  const close = () => closeD(dlg);
  const total = Math.max(0, Number(p.likes)||0);
  const replyList = el('div',{class:'post-detail-replies'});
  const burstReplyHeart = target => {
    const layer=el('div',{class:'reply-heart-burst'});
    for(let i=0;i<7;i++){
      const h=el('span',{class:'reply-heart-float'},'♡');
      h.style.setProperty('--dx',((Math.random()*70)-35)+'px');
      h.style.setProperty('--delay',(i*45)+'ms');
      layer.append(h);
    }
    target.style.position='relative'; target.append(layer);
    setTimeout(()=>layer.remove(),1200);
  };
  const replyEditor = (parent, username) => {
    const form=el('dialog',{class:'dlg'});
    const ta=el('textarea',{maxlength:300,rows:5,placeholder:parent?'@'+username+' さんに返信':'この投稿にひとこと'});
    if(parent) ta.value='@'+username+' ';
    form.append(el('h2',{},parent?'返信に返信':'返信する'),ta,
      el('div',{class:'row2'},
        el('button',{class:'sub',onclick:()=>closeD(form)},'キャンセル'),
        el('button',{class:'acc',onclick:safe(async()=>{
          const text=ta.value.trim(); if(!text) return toast('返信を入力してください');
          const r=await api('/api/posts/'+p.id+'/reply','POST',{body:text,parent:parent?parent.id:null});
          closeD(form); toast('返信しました'); await refresh();
        })},'送信')));
    document.body.append(form); form.showModal();
  };
  const refresh = async () => {
    const fresh=await api('/api/posts?username='+encodeURIComponent(p.username));
    const fp=fresh.find(x=>x.id===p.id);
    if(fp){ Object.assign(p,fp); renderReplies(); }
  };
  const renderReplies = () => {
    replyList.replaceChildren();
    const rs=(p.replies||[]).map(r=>({...r,children:[]})), map=new Map(rs.map(r=>[r.id,r]));
    rs.forEach(r=>{ if(r.parent && map.has(r.parent)) map.get(r.parent).children.push(r); });
    const roots=rs.filter(r=>!r.parent);
    const draw=(r,depth=0)=>{
      const wrap=el('div',{class:'post-reply-thread',style:'margin-left:'+Math.min(depth,3)*18+'px'});
      const head=el('div',{class:'post-reply-head'},
        avatar({display:r.display,avatar:r.avatar}),
        el('div',{class:'g'},el('a',{href:'#/u/'+encodeURIComponent(r.username),class:'nm'},r.display),el('span',{class:'sm2'},'@'+r.username+' ・ '+new Date(r.created).toLocaleString('ja-JP')))
      );
      const body=el('p',{class:'tx'},r.body);
      const actions=el('div',{class:'post-reply-actions'});
      const heart=el('button',{class:'reply-heart-btn '+(r.liked?'active':''),title:'返信に♡',onclick:safe(async()=>{
        const was=r.liked; const x=await api('/api/posts/replies/'+r.id+'/reaction','POST');
        r.liked=x.liked; r.likes=x.likes; heart.textContent=r.liked?'♥':'♡'; count.textContent=String(r.likes);
        if(r.liked&&!was) burstReplyHeart(wrap);
      })},r.liked?'♥':'♡');
      const count=el('span',{class:'reply-like-count'},String(r.likes||0));
      const reply=el('button',{class:'txt',onclick:()=>replyEditor(r,r.username)},'返信');
      actions.append(heart,count,reply);
      wrap.append(head,body,actions);
      r.children.forEach(c=>wrap.append(draw(c,depth+1)));
      return wrap;
    };
    if(!roots.length) replyList.append(el('p',{class:'sm2'},'まだ返信はありません。'));
    else roots.forEach(r=>replyList.append(draw(r)));
  };
  const replyTop=()=>replyEditor(null,null);
  dlg.append(el('div',{class:'dlg-inner'},
    el('div',{class:'dlg-head'},el('strong',{},'この投稿'),el('button',{class:'x',onclick:close,'aria-label':'閉じる'},'×')),
    el('div',{class:'post-detail-summary'},
      el('div',{class:'post-head'},avatar({display:p.display,avatar:p.avatar}),el('div',{class:'g'},el('strong',{},p.display),el('span',{class:'sm2'},'@'+p.username+' ・ '+new Date(p.created).toLocaleString('ja-JP')))),
      p.body?el('p',{class:'tx'},p.body):null,
      p.image?el('img',{class:'post-media',src:p.image,alt:'投稿画像',loading:'lazy'}):null,
      p.video?el('video',{class:'post-media',src:p.video,controls:'',playsinline:'',preload:'metadata'}):null,
      el('div',{class:'post-detail-hearts'},...Array.from({length:Math.min(total,60)},()=>el('span',{class:'post-heart-small'},'♡')),total>60?el('span',{class:'post-heart-more'},'+'+(total-60)):null),
      el('div',{class:'sm2'},'♡ '+total+'件の反応')
    ),
    el('div',{class:'post-detail-reply-title'},'返信'),
    replyList,
    el('div',{class:'row2'},el('button',{class:'sub',onclick:close},'閉じる'),el('button',{class:'acc',onclick:replyTop},'返信する'))
  ));
  document.body.append(dlg); dlg.addEventListener('close',()=>dlg.remove(),{once:true}); renderReplies(); dlg.showModal();
}
function postCard(p, self, reload){
  const card=el('article',{class:'tamari-post'});
  const head=el('div',{class:'post-head'},
    avatar({display:p.display,avatar:p.avatar}),
    el('div',{class:'g'},el('strong',{},p.display),el('span',{class:'sm2'},'@'+p.username+' ・ '+new Date(p.created).toLocaleString('ja-JP')))
  );
  const content=el('div',{class:'post-body post-open-area'},p.body?el('p',{class:'tx'},p.body):null);
  if(p.image) content.append(el('img',{class:'post-media',src:p.image,alt:'投稿画像',loading:'lazy'}));
  if(p.video) content.append(el('video',{class:'post-media',src:p.video,controls:'',playsinline:'',preload:'metadata'}));
  content.addEventListener('click',e=>{ if(e.target.closest('video,a,button')) return; postDetailDialog(p,reload); });
  const heartStack = el('div',{class:'post-heart-stack','aria-label':String(p.likes||0)+'件のいいね'});
  const renderHearts = n => { heartStack.replaceChildren(); const total=Math.max(0,Number(n)||0); const shown=Math.min(total,24); for(let i=0;i<shown;i++) heartStack.append(el('span',{class:'post-heart-small'},'♡')); if(total>shown) heartStack.append(el('span',{class:'post-heart-more'},'+'+(total-shown))); };
  renderHearts(p.likes||0);
  const reacts=el('button',{class:'post-reaction '+(p.liked?'active':''),title:p.liked?'反応を取り消す':'♡ 反応する','aria-label':p.liked?'反応を取り消す':'♡ 反応する',onclick:safe(async()=>{
    const wasLiked=p.liked; const r=await api('/api/posts/'+p.id+'/reaction','POST'); p.liked=r.liked;p.likes=r.likes; reacts.classList.toggle('active',p.liked); reacts.querySelector('.heart-icon').textContent=p.liked?'♥':'♡'; count.textContent=String(r.likes)+' 反応'; renderHearts(r.likes); if(p.liked&&!wasLiked) launchHeartBurst(card);
  })},el('span',{class:'heart-icon'},p.liked?'♥':'♡'),el('span',{class:'heart-label'},p.liked?'反応済み':'反応する'));
  const count=el('span',{class:'post-like-count'},String(p.likes||0)+' 反応');
  const replyBtn=el('button',{class:'post-reply-btn',onclick:()=>postDetailDialog(p,reload)},'反応・返信を見る');
  const actions=el('div',{class:'post-actions'},reacts,count,replyBtn,self?el('button',{class:'txt',onclick:safe(async()=>{if(confirm('この投稿を削除しますか？')){await api('/api/posts/'+p.id,'DELETE');await reload();}})},'削除'):null);
  card.append(head,content,actions,heartStack);
  return card;
}

async function renderPosts(username,self){
  const posts=await loadPosts(username);
  const box=el('section',{class:'posts-section'},el('div',{class:'posts-title'},el('div',{},el('span',{class:'eyebrow'},'TAMARI POSTS'),el('h2',{},self?'あなたの投稿':'この人の投稿')),self?el('button',{class:'acc sm',onclick:()=>postDialog(username,route)},'投稿する'):null));
  const list=el('div',{class:'posts-list'});
  if(!posts.length) list.append(el('p',{class:'sm2'},self?'まだ投稿がありません。':'まだ投稿はありません。'));
  else posts.forEach(p=>list.append(postCard(p,self,route)));
  box.append(list); return box;
}
function renderProfile(u, acts, ctx = {}) { // 保存済みのデータも、編集中のプレビューも、同じ関数で描画します
  const sec = (id, ...k) => el('section', { class: 'blk' }, el('h3', { class: 'lb' }, LABEL[id]), k);
  const txt = (id, v, cls) => v ? sec(id, el('p', { class: cls || 'tx' }, id === 'likes' || id === 'hobbies' || id === 'interests' ? slash(v) : v)) : null;
  const parts = {
    status: () => u.statusLine ? el('p', { class: 'now' }, u.statusLine) : null, bio: () => txt('bio', u.bio), likes: () => txt('likes', u.likes, 'tx sl'), hobbies: () => txt('hobbies', u.hobbies, 'tx sl'), interests: () => txt('interests', u.interests, 'tx sl'), quote: () => txt('quote', u.quote, 'tx sl'),
    shot: () => u.shot ? sec('shot', el('figure', { class: 'shot' }, el('img', { src: u.shot.image, alt: '今日の一枚' }), u.shot.caption ? el('figcaption', {}, u.shot.caption) : null)) : null,
    video: () => u.video ? sec('video', el('video', { class: 'vid', src: u.video, controls: '', preload: 'metadata', playsinline: '' })) : null,
    diary: () => u.diaries.length ? sec('diary', u.diaries.map(d => el('div', { class: 'dia' }, el('p', { class: 'tx' }, d.body), el('div', { class: 'sm2' }, hm(d.created) + ' ・ ' + left(d.created)),
      ctx.reply && !u.self ? el('button', { class: 'sub sm', style: 'margin-top:8px', onclick: () => replyDialog(d, ctx.reply) }, d.mine ? 'ひとこと(送信済み・変更する)' : 'ひとこと添える') : null,
      u.self && d.replies && d.replies.length ? el('div', { class: 'rps' }, d.replies.map(r => el('div', { class: 'rp' }, el('a', { href: '#/u/' + r.username, class: 'nm' }, r.display), ' ', r.stamp ? el('span', { class: 'tag' }, r.stamp) : null, r.body ? el('span', {}, r.body) : null,
        ctx.talk ? el('button', { class: 'txt', style: 'margin-left:8px', onclick: () => ctx.talk(r.username) }, 'この人と話す') : null))) : null))) : null,
    links: () => { const ls = u.links.map(l => [l, okLink(l)]).filter(x => x[1]); return ls.length ? sec('links', ls.map(([l, x]) => el('a', { class: 'lk', href: x.href, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, el('span', {}, l.title || x.hostname), el('span', { class: 'sm2' }, x.hostname)))) : null; },
    follow: () => !u.connections || (!u.connections.length && !u.self) ? null : sec('follow', u.connections.length ? u.connections.map(c => el('a', { class: 'lk', href: '#/u/' + c.username }, el('span', {}, c.display), el('span', { class: 'sm2' }, '@' + c.username))) : el('p', { class: 'sm2' }, 'まだつながりがありません。話した相手を「つながる」で追加できます。'), u.self ? el('a', { href: '#/connections', class: 'sm2' }, 'つながりの一覧 →') : null)
  };
  const bg = el('div', { class: 'mebg' }); if (u.bg) bg.style.backgroundImage = 'url("' + u.bg + '")';
  return el('div', { class: 'me', 'data-ac': u.accent || 'gray' }, bg, el('div', { class: 'mescrim' }),
    el('div', { class: 'mebody' }, el('div', { class: 'mh' }, el('div', { class: 'mav' }, u.avatar ? el('img', { src: u.avatar, alt: '' }) : (u.display || '?').slice(0, 1)), el('div', {}, el('h1', {}, u.display), el('div', { class: 'sm2' }, '@' + u.username), el('div',{class:'profile-online'}, u.online ? [el('span',{class:'online-dot'}),'オンライン'] : [el('span',{class:'offline-dot'}),'オフライン']))),
      u.layout.filter(x => x.show).map(x => parts[x.id] && parts[x.id]()), acts));
}
async function profile(name) {
  curChat = null;
  const u = await api('/api/user/' + encodeURIComponent(name));
  const reload = () => route();
  const talk = safe(async uname => {
    const c = await api('/api/chats/open', 'POST', { username: uname });
    location.hash = '#/chat/' + c.id;
  });
  let acts = null;
  let topRight = u.self ? el('button', { class: 'acc sm', onclick: () => { location.hash = '#/edit'; } }, 'プロフィールを編集') : null;
  if (!u.self) {
    topRight = el('div',{class:'profile-top-actions'},
      el('button',{class:'acc sm',onclick:()=>talk(u.username)},'話しかける')
    );
    acts = el('div', { class: 'mact' },
      u.mutual
        ? el('button', { class: 'sub', onclick: safe(async () => { if (confirm('つながりを解除しますか?')) { await api('/api/connect/' + u.username, 'DELETE'); reload(); } }) }, 'つながり中(解除する)')
        : u.iConnect
          ? el('button', { class: 'sub', onclick: safe(async () => { await api('/api/connect/' + u.username, 'DELETE'); reload(); }) }, 'つながり希望を取り消す')
          : el('button', { class: 'sub', onclick: safe(async () => { const r = await api('/api/connect', 'POST', { username: u.username }); toast(r.mutual ? u.display + 'さんとつながりました' : 'つながりを希望しました'); reload(); }) }, 'つながる(また話したい)'),
      el('div', { class: 'quiet' },
        u.iBlock
          ? el('button', { class: 'txt', onclick: safe(async () => { await api('/api/block/' + u.username, 'DELETE'); reload(); }) }, 'ブロック解除')
          : el('button', { class: 'txt', onclick: safe(async () => { if (confirm('ブロックしますか?')) { await api('/api/block', 'POST', { username: u.username }); location.hash = '#/'; } }) }, 'ブロック'),
        el('button', { class: 'txt', onclick: () => openForm('report') }, '通報')
      )
    );
  }
  const base=renderProfile(u, acts, { reply: reload, talk: n => talk(n) });
  const posts=await renderPosts(u.username,u.self);
  pane.replaceChildren(
    phead(u.self ? 'あなたのページ' : u.display, null,
      u.self ? el('button', { class: 'acc sm', onclick: () => { location.hash = '#/edit'; } }, 'プロフィールを編集') : null),
    base, posts
  );
}
// ---------- プロフィール編集(右側にプレビュー) ----------
async function editor() {
  curChat = null; const u = await api('/api/user/' + ME.username), view = { ...u };
  const D = { display: u.display, statusLine: u.statusLine, bio: u.bio, likes: u.likes, hobbies: u.hobbies, interests: u.interests, quote: u.quote, accent: u.accent, layout: u.layout.map(x => ({ ...x })), links: u.links.map(l => ({ title: l.title, url: l.url })), homeVisible: u.homeVisible !== false };
  const prev = el('div'), draw = () => prev.replaceChildren(renderProfile({ ...view, ...D, self: true }));
  const fld = (label, key, max, ph, ta) => { const i = ta ? el('textarea', { maxlength: max, rows: 3, placeholder: ph || '' }) : el('input', { maxlength: max, placeholder: ph || '' }); i.value = D[key] || ''; i.addEventListener('input', () => { D[key] = i.value; draw(); }); return [el('label', {}, label), i]; };
  const pick = (mb, cb, accept = 'image/png,image/jpeg,image/gif,image/webp') => { const f = el('input', { type: 'file', accept, hidden: '' }); f.onchange = () => { const x = f.files[0]; f.remove(); if (!x) return; if (x.size > mb * 1048576) return toast('ファイルは' + mb + 'MB以下にしてください'); cb(x); }; document.body.append(f); f.click(); };
  const readData = (x, cb) => { const fr = new FileReader(); fr.onload = safe(() => cb(fr.result)); fr.onerror = () => toast('画像を読み込めませんでした。別の画像でお試しください'); fr.readAsDataURL(x); };
  const reload = async () => { Object.assign(view, await api('/api/user/' + ME.username)); draw(); };
  const setImg = (kind, mb) => () => pick(mb, x => readData(x, async d => { await api('/api/me/image', 'PUT', { kind, image: d }); await reload(); toast('画像を変更しました'); }));
  const delImg = kind => safe(async () => { await api('/api/me/image', 'PUT', { kind, image: '' }); await reload(); });
  const setVideo = () => pick(10, async x => {
    const url = URL.createObjectURL(x), v = document.createElement('video'); v.preload = 'metadata';
    const up = safe(async () => { toast('動画をアップロードしています…'); const r = await fetch('/api/me/video', { method: 'PUT', headers: { 'x-requested-with': 'tamari', 'Content-Type': 'video/mp4' }, body: x }).catch(() => null); if (!r) throw new Error('通信できませんでした。もう一度お試しください'); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || '動画をアップロードできませんでした'); await reload(); toast('動画を変更しました'); });
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); if (v.duration > 30) toast('動画は30秒以内にしてください'); else up(); }; v.onerror = () => { URL.revokeObjectURL(url); up(); }; v.src = url;
  }, 'video/mp4,video/quicktime');
  const sw = el('div', { class: 'row2' }, [['gray', 'グレー'], ['blue', '青'], ['purple', '紫'], ['green', '緑'], ['orange', 'オレンジ'], ['red', '赤']].map(([c, n]) => el('button', { class: 'sw' + (D.accent === c ? ' on' : ''), 'data-c': c, 'aria-label': n, onclick: () => { D.accent = c; sw.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x.dataset.c === c)); draw(); } })));
  const linkBox = el('div'), drawLinks = () => { linkBox.replaceChildren(...D.links.map((l, i) => { const t = el('input', { maxlength: 30, placeholder: '名前(例:ブログ)', value: l.title }), a = el('input', { maxlength: 200, placeholder: 'https://…', value: l.url }); t.oninput = () => { l.title = t.value; draw(); }; a.oninput = () => { l.url = a.value; draw(); }; return el('div', { class: 'irow' }, t, a, el('button', { class: 'sub sm', 'aria-label': 'このリンクを削除', onclick: () => { D.links.splice(i, 1); drawLinks(); draw(); } }, '×')); }), D.links.length < 6 ? el('button', { class: 'sub sm', onclick: () => { D.links.push({ title: '', url: '' }); drawLinks(); } }, '+ リンクを追加') : el('p', { class: 'sm2' }, 'リンクは6つまでです')); };
  const layBox = el('div'); let dragI = null;
  const move = (i, j) => { if (j < 0 || j >= D.layout.length) return; const [x] = D.layout.splice(i, 1); D.layout.splice(j, 0, x); drawLay(); draw(); };
  const drawLay = () => layBox.replaceChildren(...D.layout.map((x, i) => { const cb = el('input', { type: 'checkbox', 'aria-label': LABEL[x.id] + 'を表示' }); cb.checked = x.show; cb.onchange = () => { x.show = cb.checked; draw(); };
    const r = el('div', { class: 'lrow', draggable: 'true' }, el('span', { class: 'hd', 'aria-hidden': 'true' }, '≡'), el('span', { class: 'g' }, LABEL[x.id]), el('label', { style: 'margin:0;display:flex;gap:4px;align-items:center' }, cb, '表示'), el('button', { class: 'sub sm', 'aria-label': '上へ', onclick: () => move(i, i - 1) }, '↑'), el('button', { class: 'sub sm', 'aria-label': '下へ', onclick: () => move(i, i + 1) }, '↓'));
    r.ondragstart = () => { dragI = i; }; r.ondragover = e => { e.preventDefault(); r.classList.add('over'); }; r.ondragleave = () => r.classList.remove('over'); r.ondrop = e => { e.preventDefault(); if (dragI != null) move(dragI, i); dragI = null; }; return r; }));
  const cap = el('input', { maxlength: 60, placeholder: '一言(任意)' }), diaIn = el('textarea', { maxlength: 300, rows: 3, placeholder: '今日はこんなことがあった…' }), diaList = el('div');
  const drawDia = () => diaList.replaceChildren(...view.diaries.map(d => el('div', { class: 'irow' }, el('div', { class: 'g sm2', style: 'flex:1' }, d.body.slice(0, 40) + ' (' + left(d.created) + ')'), el('button', { class: 'sub sm', onclick: safe(async () => { await api('/api/diary/' + d.id, 'DELETE'); await reload(); drawDia(); }) }, '削除'))));
  const form = el('div', { class: 'form' }, el('h2', { style: 'margin:0 0 4px' }, 'プロフィールを編集'), el('p', { class: 'sm2' }, '変更は右(スマホでは下)のプレビューにすぐ反映されます。「保存して公開」を押すと、他の人にも見えるようになります。画像・動画・日記は選んだ時点で反映されます。'),
    el('h3', {}, '画像'), el('div', { class: 'row2' }, el('button', { class: 'sub sm', onclick: setImg('avatar', 1) }, 'アイコンを変更'), el('button', { class: 'sub sm', onclick: delImg('avatar') }, '削除'), el('button', { class: 'sub sm', onclick: setImg('bg', 2) }, '背景を変更'), el('button', { class: 'sub sm', onclick: delImg('bg') }, '削除')),
    el('p', { class: 'sm2' }, 'アイコンは1MB、背景は2MBまで。png / jpg / gif / webp が使えます。'),
    el('h3', {}, '基本'), fld('表示名', 'display', 20), fld('いまの一言', 'statusLine', 60, '例:今日はゆっくり。'), fld('じこしょうかい(実名・連絡先は書かないでください)', 'bio', 200, '', true),
    el('h3', {}, '好きなこと(スペースで区切る)'), fld('好きなもの', 'likes', 100, '映画 音楽 PC'), fld('趣味', 'hobbies', 100), fld('興味', 'interests', 100), fld('好きな言葉', 'quote', 80),
    el('h3', {}, 'リンク(自分のサイトなど)'), linkBox, el('h3', {}, 'ホームの今日の投稿'), el('label', { style:'display:flex;gap:8px;align-items:center;margin:8px 0' }, (()=>{ const c=el('input',{type:'checkbox'}); c.checked=D.homeVisible; c.onchange=()=>{D.homeVisible=c.checked;draw();}; return c; })(), '自分の投稿を「今日の投稿」に表示する'), el('p',{class:'sm2'},'オフにすると、プロフィールのTamari Postには残りますが、ホームの今日の投稿一覧には表示されません。'), el('h3', {}, 'カラー'), sw,
    el('h3', {}, '表示する項目と順番'), el('p', { class: 'sm2' }, 'チェックを外すと、他の人には見えなくなります。ドラッグか ↑↓ で並び替えできます。'), layBox,
    el('h3', {}, '動画(MP4・30秒まで・10MBまで)'), el('div', { class: 'row2' }, el('button', { class: 'sub sm', onclick: setVideo }, '動画を選ぶ'), el('button', { class: 'sub sm', onclick: safe(async () => { await api('/api/me/video', 'DELETE'); await reload(); }) }, '削除')),
    el('h3', {}, 'きょうの一枚(その日だけ表示。日付が変わると消えます)'), cap, el('div', { class: 'row2' }, el('button', { class: 'sub sm', onclick: () => pick(2, x => readData(x, async d => { await api('/api/shot', 'POST', { image: d, caption: cap.value }); await reload(); toast('今日の一枚を更新しました'); })) }, '写真を選ぶ'), el('button', { class: 'sub sm', onclick: safe(async () => { await api('/api/shot', 'DELETE'); await reload(); }) }, '削除')),
    el('h3', {}, '今日の日記(24時間で消えます。いつでも削除できます)'), diaIn, el('button', { class: 'sub sm', onclick: safe(async () => { await api('/api/diary', 'POST', { body: diaIn.value }); diaIn.value = ''; await reload(); drawDia(); }) }, '日記を追加'), diaList,
    el('div', { class: 'row2', style: 'margin-top:30px' }, el('button', { class: 'acc', onclick: safe(async () => { await api('/api/profile', 'PUT', D); ME = await api('/api/me'); toast('保存しました'); renderSide().catch(() => {}); location.hash = '#/me'; }) }, '保存して公開'), el('button', { class: 'sub', onclick: () => { location.hash = '#/me'; } }, 'やめる')));
  drawLinks(); drawLay(); drawDia(); draw();
  pane.replaceChildren(phead('プロフィールを編集'), el('div', { class: 'edit' }, form, el('div', { class: 'prevw' }, el('div', { class: 'sm2', style: 'padding:10px 20px 0' }, 'プレビュー(保存前の見た目)'), prev)));
}
async function connections() {
  curChat = null; const d = await api('/api/connections');
  pane.replaceChildren(phead('つながり'), el('div', { class: 'page' }, el('h3', { style: 'margin-top:0' }, 'つながり中'), el('p', { class: 'sm2' }, 'お互いに「また話したい」と思っている人です。人数は誰にも表示されません。'),
    d.mutual.length ? d.mutual.map(x => urow(x)) : el('p', { class: 'sm2' }, 'まだいません。話した相手のページで「つながる」を押してみましょう。'),
    el('h3', { style: 'margin-top:30px' }, 'あなたが希望している人'), el('p', { class: 'sm2' }, '相手には通知されていません。相手も「つながる」を押すと成立します。'),
    d.mine.length ? d.mine.map(x => urow(x, el('button', { class: 'sub sm', onclick: safe(async () => { await api('/api/connect/' + x.username, 'DELETE'); connections(); }) }, '取り消す'))) : el('p', { class: 'sm2' }, 'いません')));
}

// ---------- 設定 ----------
async function settings() {
  curChat = null; const bl = await api('/api/blocks');
  const setTheme = t => { if (t) { document.documentElement.dataset.theme = t; localStorage.setItem('tamari_theme', t); } else { delete document.documentElement.dataset.theme; localStorage.removeItem('tamari_theme'); } };
  const inbox = el('select', { 'aria-label': '話しかけの受け付け' }, [['all', 'だれでも話しかけられる'], ['mutual', 'つながりのある人だけ'], ['off', '話しかけを受け付けない']].map(([v, l]) => el('option', { value: v }, l)));
  inbox.value = ME.inbox || 'all'; inbox.onchange = safe(async () => { await api('/api/settings', 'PUT', { inbox: inbox.value }); ME.inbox = inbox.value; toast('保存しました'); });
  const cur = el('input', { type: 'password', autocomplete: 'current-password', placeholder: '現在のパスワード' }), nw = el('input', { type: 'password', autocomplete: 'new-password', placeholder: '新しいパスワード(8文字以上)' }), dp = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'パスワードを入力して退会' });
  pane.replaceChildren(phead('設定'), el('div', { class: 'page' }, el('h3', { style: 'margin-top:0' }, 'プロフィール'), el('button', { class: 'sub', onclick: () => { location.hash = '#/edit'; } }, 'プロフィールを編集する'), ' ', el('button', { class: 'sub', onclick: () => { location.hash = '#/connections'; } }, 'つながりを見る'),
    el('h3', { style: 'margin-top:30px' }, '表示'), el('div', { class: 'row2' }, el('button', { class: 'sub', onclick: () => setTheme('light') }, 'ライト'), el('button', { class: 'sub', onclick: () => setTheme('dark') }, 'ダーク'), el('button', { class: 'sub', onclick: () => setTheme('') }, '端末に合わせる')),
    el('h3', { style: 'margin-top:30px' }, '話しかけの受け付け'), el('p', { class: 'sm2' }, 'プロフィールからの話しかけを制限できます。「相手を探す」で見つかった人とは、お互いに「話してみる」を選べば話せます。'), inbox,
    el('h3', { style: 'margin-top:30px' }, 'ブロックリスト'), el('p', { class: 'sm2' }, 'あなただけに見えます。相手には通知されません。'), bl.length ? bl.map(x => el('div', { class: 'row', style: 'padding-left:0;cursor:default' }, avatar(x), el('div', { class: 'g' }, el('div', { class: 'nm' }, x.display), el('div', { class: 'sm2' }, '@' + x.username)), el('button', { class: 'sub sm', onclick: safe(async () => { await api('/api/block/' + x.username, 'DELETE'); settings(); }) }, 'ブロック解除'))) : el('p', { class: 'sm2' }, 'ブロック中のユーザーはいません'),
    el('h3', { style: 'margin-top:30px' }, 'パスワードの変更'), cur, nw, el('button', { class: 'sub', onclick: safe(async () => { await api('/api/me/password', 'POST', { current: cur.value, next: nw.value }); cur.value = nw.value = ''; toast('パスワードを変更しました'); }) }, '変更する'),
    el('h3', { style: 'margin-top:30px' }, 'お問い合わせ'), el('button', { class: 'sub', onclick: () => openForm('contact') }, 'お問い合わせフォームを開く'),
    el('div', { class: 'row2', style: 'margin-top:30px' }, el('button', { class: 'sub', onclick: safe(async () => { await api('/api/logout', 'POST'); ME = null; location.hash = ''; landing(); }) }, 'ログアウト')),
    el('h3', { style: 'margin-top:36px' }, '退会'), el('p', { class: 'sm2' }, 'プロフィール・画像・メッセージ・つながりなど、あなたに関するデータをすべて削除します。元に戻せません。'), dp,
    el('button', { class: 'sub', onclick: safe(async () => { if (!confirm('本当に退会しますか?すべてのデータが削除され、元に戻せません。')) return; await api('/api/me/delete', 'POST', { password: dp.value }); ME = null; location.hash = ''; toast('退会しました。ご利用ありがとうございました'); landing(); }) }, '退会する'), formLinks()));
}

async function route() {
  if (!ME) return; const h = location.hash; onMsg = onDel = null;
  if (curMatch && h !== '' && h !== '#/') { const m = curMatch; curMatch = null; api('/api/match/answer', 'POST', { match: m, accept: false }).catch(() => {}); }
  if (searching && !['','#/','#/chats'].includes(h)) { searching = false; api('/api/match/cancel', 'POST').catch(() => {}); }
  document.body.classList.remove('inchat');
  const slow = setTimeout(() => pane.replaceChildren(loadingEl()), 300); // 読み込みが遅いときだけ表示
  try {
    renderSide().catch(() => {});
    if (h.startsWith('#/chat/')) await chat(h.split('/')[2]);
    else if (h === '#/chats' && searching) searchView();
    else if (h === '#/chats') await chatList();
    else if (h === '#/notices') await notices();
    else if (h.startsWith('#/u/')) await profile(decodeURIComponent(h.split('/')[2]));
    else if (h === '#/me') await profile(ME.username);
    else if (h === '#/connections') await connections();
    else if (h === '#/edit') await editor();
    else if (h === '#/settings') await settings();
    else if (curMatch || searching) { /* 相手探しの画面はそのまま */ if (searching) searchView(); }
    else await home();
    if (!h.startsWith('#/chat/')) pane.scrollTop = 0;
  } catch (e) { toast(e.message); if (e.status === 401) { ME = null; landing(); } else if (h !== '' && h !== '#/') location.hash = '#/'; }
  finally { clearTimeout(slow); applyLanguage(); }
}
async function boot() {
  try { ME = await api('/api/me'); } catch (e) { return landing(); }
  CFG = await fetch('/api/config').then(r => r.json()).catch(() => CFG); layout(); connect(); route();
}
window.addEventListener('hashchange', route);
boot();
