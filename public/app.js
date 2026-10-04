// Tamari 画面(ブラウザ側)。画面の文字はすべて createTextNode で入れるので、悪意ある文字(XSS)は実行されません
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

let ME = null,
    es = null,
    ST = null,
    CFG = { reportUrl: '', contactUrl: '' },
    side,
    pane,
    bnav,
    searching = false,
    curMatch = null,
    curChat = null,
    onMsg = null,
    onDel = null,
    opened = false;

const toast = m => {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 3200);
};

async function api(url, method = 'GET', body) {
  const o = {
    method,
    headers: {
      'x-requested-with': 'tamari'
    }
  };

  if (body) {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(body);
  }

  let r;

  try {
    r = await fetch(url, o);
  } catch (e) {
    throw new Error('通信できませんでした。ネットワークを確認して、もう一度お試しください');
  }

  const j = await r.json().catch(() => ({}));

  if (!r.ok) {
    const e = new Error(
      j.error || 'うまくいきませんでした。もう一度お試しください'
    );
    e.status = r.status;
    throw e;
  }

  return j;
}

const safe = fn => async (...a) => {
  const b = a[0] && a[0].currentTarget;

  if (b && 'disabled' in b) {
    b.disabled = true;
  }

  try {
    await fn(...a);
  } catch (e) {
    toast(e.message);

    if (e.status === 401 && ME) {
      ME = null;
      landing();
    }
  } finally {
    if (b && b.isConnected) {
      b.disabled = false;
    }
  }
};

const hm = t =>
  new Date(t).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  });

const num = n => Number(n).toLocaleString('ja-JP');

const closeD = d => {
  if (!d) return;
  d.close();
  d.remove();
};

const avatar = (u, big) =>
  el(
    'div',
    {
      class: 'av' + (big ? ' l' : '')
    },
    u.avatar
      ? el('img', {
          src: u.avatar,
          alt: ''
        })
      : (u.display || '?').slice(0, 1)
  );

const logo = () =>
  el(
    'a',
    {
      href: '#/',
      class: 'logo'
    },
    'Tamari',
    el('i', {}, '.')
  );

const liveLine = () => {
  return el(
    'span',
    {},
    '現在 ',
    el(
      'b',
      {
        'data-s': 'online'
      },
      ST ? num(ST.online) : '-'
    ),
    '人がオンライン ・ Tamariで交わされたメッセージ ',
    el(
      'b',
      {
        'data-s': 'total'
      },
      ST ? num(ST.total) : '-'
    ),
    '件'
  );
};

const paintStats = () => {
  if (!ST) return;

  document.querySelectorAll('[data-s]').forEach(e => {
    e.textContent = num(ST[e.dataset.s]);
  });
};

function openForm(kind) {
  const u = kind === 'report'
    ? CFG.reportUrl
    : CFG.contactUrl;

  if (!u) {
    return toast('フォームは準備中です。もう少しお待ちください');
  }

  window.open(u, '_blank', 'noopener');
}

const formLinks = () =>
  el(
    'div',
    {
      class: 'foot'
    },
    el(
      'a',
      {
        href: '/rules.html#terms'
      },
      '利用規約'
    ),
    el(
      'a',
      {
        href: '/rules.html#guideline'
      },
      'ガイドライン'
    ),
    el(
      'a',
      {
        href: '/rules.html#privacy'
      },
      'プライバシー'
    ),
    el(
      'a',
      {
        href: '/rules.html#operator'
      },
      '運営者情報'
    ),
    el(
      'a',
      {
        href: '#',
        onclick: e => {
          e.preventDefault();
          openForm('contact');
        }
      },
      'お問い合わせ'
    )
  );

const loadingEl = () =>
  el(
    'div',
    {
      class: 'load',
      role: 'status'
    },
    '読み込んでいます…'
  );

// --------------------------------------------------
// ログイン前
// --------------------------------------------------

async function landing(tab = 'new') {
  if (es) {
    es.close();
    es = null;
  }

  opened = false;
  searching = false;
  curMatch = null;

  document.body.classList.remove('inchat');

  const [stats, config] = await Promise.all([
    fetch('/api/stats')
      .then(r => r.json())
      .catch(() => null),

    fetch('/api/config')
      .then(r => r.json())
      .catch(() => CFG)
  ]);

  ST = stats;
  CFG = config || CFG;

  const u = el('input', {
    maxlength: 16,
    autocapitalize: 'none',
    autocomplete: 'username',
    placeholder: 'tamari_taro'
  });

  const p = el('input', {
    type: 'password',
    autocomplete:
      tab === 'new'
        ? 'new-password'
        : 'current-password',
    placeholder: '8文字以上'
  });

  const d = el('input', {
    maxlength: 20,
    placeholder: 'たまり太郎'
  });

  const go = safe(async () => {
    await api(
      tab === 'new'
        ? '/api/register'
        : '/api/login',
      'POST',
      {
        username: u.value,
        display: d.value,
        password: p.value
      }
    );

    boot();
  });

  p.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      go();
    }
  });

  app.replaceChildren(
    el(
      'div',
      {
        class: 'land'
      },

      logo(),

      el(
        'h1',
        {},
        '話したい相手を、',
        el('br'),
        'すぐ見つけられる。'
      ),

      el(
        'p',
        {
          class: 'sm2'
        },
        'プロフィールを作って「相手を探す」を押すだけ。メールも電話番号も要りません。'
      ),

      el(
        'p',
        {
          class: 'sm2'
        },
        liveLine()
      ),

      el(
        'div',
        {
          class: 'tabs'
        },

        el(
          'button',
          {
            class: tab === 'new' ? 'on' : '',
            onclick: () => landing('new')
          },
          '新規登録'
        ),

        el(
          'button',
          {
            class: tab === 'in' ? 'on' : '',
            onclick: () => landing('in')
          },
          'ログイン'
        )
      ),

      el(
        'label',
        {},
        'ユーザー名(英数字と _ 、3〜16文字)'
      ),

      u,

      tab === 'new'
        ? el(
            'label',
            {},
            '表示名(あとから変えられます)'
          )
        : null,

      tab === 'new' ? d : null,

      el(
        'label',
        {},
        'パスワード'
      ),

      p,

      el(
        'button',
        {
          class: 'acc big',
          style: 'font-size:17px;padding:14px',
          onclick: go
        },
        tab === 'new'
          ? '登録して、はじめる'
          : 'ログイン'
      ),

      tab === 'new'
        ? el(
            'p',
            {
              class: 'foot'
            },
            '登録すると、',
            el(
              'a',
              {
                href: '/rules.html#terms'
              },
              '利用規約'
            ),
            'と',
            el(
              'a',
              {
                href: '/rules.html#guideline'
              },
              'ガイドライン'
            ),
            'に同意したことになります。出会い・恋愛・性的な目的での利用は禁止です。パスワードを忘れると復元できないことがあります。'
          )
        : null,

      formLinks()
    )
  );

  paintStats();
}

// --------------------------------------------------
// 共通レイアウト
// --------------------------------------------------

const NAV = [
  ['#/', 'ホーム'],
  ['#/chats', 'チャット'],
  ['#/notices', 'お知らせ'],
  ['#/me', 'プロフィール'],
  ['#/settings', '設定']
];

const navOn = h => {
  if (h === '' || h === '#/') return '#/';

  if (h.startsWith('#/chat')) {
    return '#/chats';
  }

  if (h === '#/notices') {
    return '#/notices';
  }

  if (
    h === '#/me' ||
    h === '#/edit' ||
    h.startsWith('#/u/') ||
    h === '#/connections'
  ) {
    return '#/me';
  }

  return h;
};

function layout() {
  side = el('aside', {
    class: 'side'
  });

  pane = el('section', {
    class: 'pane'
  });

  bnav = el('nav', {
    class: 'bnav'
  });

  app.replaceChildren(
    el(
      'div',
      {
        class: 'app'
      },
      side,
      pane
    ),
    bnav
  );
}

async function renderSide() {
  const h = navOn(location.hash);

  const link = ([href, l]) =>
    el(
      'a',
      {
        href,
        class: href === h ? 'on' : ''
      },
      l
    );

  bnav.replaceChildren(
    ...NAV.map(link)
  );

  const chats = await api('/api/chats').catch(() => []);
  const unread = await api('/api/notices').catch(() => []);

  const mainNav = NAV.filter(
    ([href]) => href !== '#/settings'
  );

  const navItems = mainNav.map(
    ([href, label]) => {
      const a = link([href, label]);

      if (
        href === '#/notices' &&
        unread.length
      ) {
        a.style.position = 'relative';
        a.classList.add('notice-unread');
        a.style.boxShadow =
          '0 0 0 1px var(--line), 0 0 16px rgba(141,124,246,.32)';
        a.style.borderRadius = '12px';
        a.style.fontWeight = '700';

        a.append(
          el(
            'span',
            {
              class: 'notice-badge',
              style:
                'display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;margin-left:8px;border-radius:999px;background:#ff5f87;color:#fff;font-size:11px;box-shadow:0 0 12px rgba(255,95,135,.55)'
            },
            String(unread.length)
          )
        );
      }

      return a;
    }
  );

  side.replaceChildren(
    el(
      'div',
      {
        class: 'top'
      },
      logo()
    ),

    el(
      'div',
      {
        class: 'nav'
      },
      navItems
    ),

    el(
      'div',
      {
        class: 'side-spacer'
      }
    ),

    el(
      'div',
      {
        class: 'nav side-bottom'
      },
      link(['#/settings', '設定'])
    ),

    el(
      'div',
      {
        class: 'live'
      },
      liveLine()
    )
  );

  paintStats();
}

const chatRow = c =>
  el(
    'a',
    {
      class:
        'row' +
        (curChat === c.id ? ' cur' : ''),
      href: '#/chat/' + c.id
    },

    avatar(c),

    el(
      'div',
      {
        class: 'g'
      },

      el(
        'div',
        {
          class: 'nm'
        },
        c.display
      ),

      el(
        'div',
        {
          class: 'sm2',
          style:
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
        },
        c.preview || '話しかけてみよう'
      )
    )
  );

const phead = (title, sub, right) =>
  el(
    'div',
    {
      class: 'phead'
    },

    el(
      'button',
      {
        class: 'back',
        'aria-label': '戻る',
        onclick: () =>
          history.length > 1
            ? history.back()
            : (location.hash = '#/')
      },
      '←'
    ),

    el(
      'div',
      {
        class: 'g'
      },

      el(
        'div',
        {
          class: 'nm'
        },
        title
      ),

      sub
        ? el(
            'div',
            {
              class: 'sm2'
            },
            sub
          )
        : null
    ),

    right
  );

const urow = (x, extra) =>
  el(
    'div',
    {
      class: 'row',
      style: 'cursor:default'
    },

    el(
      'a',
      {
        href: '#/u/' + encodeURIComponent(x.username),
        style:
          'display:flex;gap:12px;align-items:center;flex:1;min-width:0;text-decoration:none'
      },

      avatar(x),

      el(
        'div',
        {
          class: 'g'
        },

        el(
          'div',
          {
            class: 'nm'
          },
          x.display
        ),

        el(
          'div',
          {
            class: 'sm2'
          },
          '@' + x.username
        )
      )
    ),

    extra
  );

// --------------------------------------------------
// リアルタイム
// --------------------------------------------------

function connect() {
  if (es) {
    es.close();
  }

  es = new EventSource('/api/live');

  es.onopen = () => {
    if (opened && ME) {
      route();
    }

    opened = true;
  };

  es.addEventListener(
    'stats',
    e => {
      try {
        ST = JSON.parse(e.data);
        paintStats();
      } catch {}
    }
  );

  es.addEventListener(
    'matched',
    e => {
      try {
        const d = JSON.parse(e.data);

        if (!searching) return;

        searching = false;
        foundView(d);
      } catch {}
    }
  );

  es.addEventListener(
    'matchstart',
    e => {
      try {
        const d = JSON.parse(e.data);

        if (curMatch) {
          curMatch = null;
          location.hash = '#/chat/' + d.chat;
        }
      } catch {}
    }
  );

  es.addEventListener(
    'matchend',
    e => {
      try {
        if (!curMatch) return;

        curMatch = null;

        const d = JSON.parse(e.data);

        toast(
          d.reason === 'timeout'
            ? '相手から返事がありませんでした。もう一度探してみましょう'
            : '今回は見送りになりました。もう一度探してみましょう'
        );

        home();
      } catch {}
    }
  );

  es.addEventListener(
    'searchend',
    () => {
      if (searching) {
        searching = false;
        toast(
          '相手が見つかりませんでした。しばらくしてからもう一度お試しください'
        );
        home();
      }
    }
  );

  es.addEventListener(
    'msg',
    e => {
      try {
        const m = JSON.parse(e.data);

        if (onMsg && m.chat === curChat) {
          onMsg(m);
        } else if (
          ME &&
          m.username !== ME.username
        ) {
          toast(
            m.display +
              'さんからメッセージが届きました'
          );

          renderSide().catch(() => {});
        }
      } catch {}
    }
  );

  es.addEventListener(
    'read',
    e => {
      try {
        const d = JSON.parse(e.data);

        if (d.chat !== curChat) return;

        document
          .querySelectorAll(
            '.msg.mine .read-mark'
          )
          .forEach(x => {
            x.textContent = '既読';
          });
      } catch {}
    }
  );

  es.addEventListener(
    'typing',
    e => {
      try {
        const d = JSON.parse(e.data);

        if (d.chat !== curChat) return;

        const t =
          document.querySelector(
            '.chat-typing'
          );

        if (t) {
          t.textContent = d.typing
            ? '相手が入力中…'
            : '';
        }
      } catch {}
    }
  );

  es.addEventListener(
    'del',
    e => {
      try {
        if (onDel) {
          onDel(
            JSON.parse(e.data).id
          );
        }
      } catch {}
    }
  );

  es.addEventListener(
    'chatremoved',
    e => {
      try {
        const d = JSON.parse(e.data);

        if (d.chat === curChat) {
          curChat = null;
          onMsg = null;
          onDel = null;

          document.body.classList.remove(
            'inchat'
          );

          location.hash = '#/chats';
        }

        renderSide().catch(() => {});
      } catch {}
    }
  );

  es.addEventListener(
    'chatend',
    e => {
      try {
        const d = JSON.parse(e.data);

        if (d.chat !== curChat) return;

        onMsg = null;
        onDel = null;

        toast(
          d.message ||
            '相手が退出しました'
        );

        const marker = el(
          'div',
          {
            class: 'chat-ended'
          },
          d.message ||
            '相手が退出しました'
        );

        const list =
          document.querySelector('.msgs');

        if (list) {
          list.append(marker);
        }

        const comp =
          document.querySelector('.comp');

        if (comp) {
          comp.remove();
        }
      } catch {}
    }
  );

  es.addEventListener(
    'notice',
    e => {
      try {
        const n = JSON.parse(e.data);

        renderSide().catch(() => {});

        if (n.kind === 'talk') {
          if (n.chat === curChat) return;

          toast(
            n.display +
              'さんがチャットを開始しました'
          );

          if (
            !searching &&
            !curMatch
          ) {
            location.hash =
              '#/chat/' + n.chat;
          }

          return;
        }

        toast(noticeText(n));

        if (
          (location.hash === '' ||
            location.hash === '#/') &&
          !searching &&
          !curMatch
        ) {
          home();
        }
      } catch {}
    }
  );
}

const noticeText = n =>
  n.kind === 'connect_request'
    ? n.display +
      'さんから「つながりたい」が届きました'
    : n.kind === 'connected'
    ? n.display +
      'さんとつながりました'
    : n.kind === 'talk'
    ? n.display +
      'さんが話しかけています'
    : n.kind === 'postlike'
    ? '♡ ' +
      n.display +
      'さんがあなたの投稿に反応しました'
    : n.kind === 'postreply'
    ? '返信 ' +
      n.display +
      'さんがあなたの投稿に返信しました'
    : n.kind === 'replylike'
    ? '♡ ' +
      n.display +
      'さんがあなたの返信に反応しました'
    : n.display +
      'さんが日記にひとこと残しました';

const noticeHref = n =>
  n.kind === 'connect_request'
    ? '#/u/' + n.username
    : n.kind === 'connected'
    ? '#/u/' + n.username
    : n.kind === 'talk'
    ? '#/chat/' + n.chat
    : '#/u/' + n.username;

// --------------------------------------------------
// ホーム・検索
// --------------------------------------------------

const startSearch = async () => {
  searching = true;

  if (location.hash !== '#/chats') {
    location.hash = '#/chats';
  }

  searchView();

  try {
    await api(
      '/api/match/start',
      'POST'
    );
  } catch (e) {
    searching = false;
    home();
    throw e;
  }
};

async function userSearch(q) {
  return await api(
    '/api/users/search?q=' +
      encodeURIComponent(q)
  );
}

async function renderHomePosts() {
  const posts = await api(
    '/api/home-posts'
  ).catch(() => []);

  const box = el(
    'div',
    {
      class: 'home-posts'
    }
  );

  if (!posts.length) {
    box.append(
      el(
        'p',
        {
          class: 'sm2',
          style: 'margin-top:14px'
        },
        '今日はまだ投稿がありません。'
      )
    );

    return box;
  }

  posts.forEach((p, i) => {
    const card = el(
      'article',
      {
        class: 'trending-card',
        onclick: () =>
          postDetailDialog(p, home),
        style: 'cursor:pointer'
      },

      el(
        'div',
        {
          class: 'trending-rank'
        },
        '#' + (i + 1) + '  TODAY'
      ),

      el(
        'div',
        {
          style:
            'display:flex;align-items:center;gap:10px;margin:10px 0'
        },

        el(
          'a',
          {
            href:
              '#/u/' +
              encodeURIComponent(p.username),
            onclick: e =>
              e.stopPropagation(),
            style:
              'display:flex;align-items:center'
          },
          avatar(p)
        ),

        el(
          'div',
          {
            class: 'g'
          },

          el(
            'a',
            {
              href:
                '#/u/' +
                encodeURIComponent(
                  p.username
                ),
              onclick: e =>
                e.stopPropagation(),
              class: 'nm',
              style:
                'text-decoration:none'
            },
            p.display
          ),

          el(
            'div',
            {
              class: 'sm2'
            },
            '@' +
              p.username +
              ' ・ ' +
              new Date(
                p.created
              ).toLocaleTimeString(
                'ja-JP',
                {
                  hour: '2-digit',
                  minute: '2-digit'
                }
              )
          )
        )
      ),

      p.body
        ? el(
            'p',
            {
              class: 'tx',
              style:
                'white-space:pre-wrap'
            },
            p.body
          )
        : null,

      p.image
        ? el('img', {
            src: p.image,
            alt: '投稿画像',
            style:
              'width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin-top:10px',
            loading: 'lazy'
          })
        : null,

      p.video
        ? el('video', {
            src: p.video,
            controls: '',
            playsinline: '',
            style:
              'width:100%;max-height:420px;border-radius:14px;margin-top:10px'
          })
        : null,

      el(
        'div',
        {
          style:
            'margin-top:12px;color:var(--muted);font-size:13px'
        },
        '♡ ' +
          num(p.likes || 0) +
          ' ・ ' +
          num(
            (p.replies || []).length
          ) +
          ' 返信'
      )
    );

    box.append(card);
  });

  return box;
}

async function home() {
  curChat = null;
  document.body.classList.remove(
    'inchat'
  );

  const box = el('div');

  const input = el('input', {
    class: 'user-search-input',
    maxlength: 80,
    placeholder:
      '@ユーザー名 または 投稿のキーワードを検索',
    'aria-label':
      'ユーザーや投稿を検索'
  });

  const results = el(
    'div',
    {
      class: 'user-search-results',
      style:
        'margin-top:18px;max-width:720px'
    }
  );

  const draw = async () => {
    const q = input.value.trim();

    if (!q) {
      results.replaceChildren(
        el(
          'p',
          {
            class: 'sm2'
          },
          'ユーザー名は @、投稿はキーワードから検索できます。'
        )
      );

      return;
    }

    try {
      const data = await api(
        '/api/home-search?q=' +
          encodeURIComponent(q)
      );

      const nodes = [];

      if (data.users.length) {
        nodes.push(
          el(
            'h3',
            {},
            'ユーザー'
          )
        );

        data.users.forEach(u =>
          nodes.push(
            urow(u)
          )
        );
      }

      if (data.posts.length) {
        nodes.push(
          el(
            'h3',
            {
              style:
                'margin-top:24px'
            },
            '投稿'
          )
        );

        data.posts.forEach(p =>
          nodes.push(
            el(
              'article',
              {
                class:
                  'trending-card',
                onclick: () =>
                  postDetailDialog(
                    p,
                    home
                  ),
                style:
                  'cursor:pointer'
              },

              el(
                'div',
                {
                  class:
                    'trending-rank'
                },
                'POST'
              ),

              el(
                'div',
                {
                  style:
                    'display:flex;align-items:center;gap:10px;margin:10px 0'
                },

                el(
                  'a',
                  {
                    href:
                      '#/u/' +
                      encodeURIComponent(
                        p.username
                      ),
                    onclick: e =>
                      e.stopPropagation(),
                    style:
                      'display:flex'
                  },
                  avatar(p)
                ),

                el(
                  'div',
                  {
                    class: 'g'
                  },

                  el(
                    'a',
                    {
                      href:
                        '#/u/' +
                        encodeURIComponent(
                          p.username
                        ),
                      onclick: e =>
                        e.stopPropagation(),
                      class: 'nm',
                      style:
                        'text-decoration:none'
                    },
                    p.display
                  ),

                  el(
                    'div',
                    {
                      class: 'sm2'
                    },
                    '@' +
                      p.username +
                      ' ・ ' +
                      new Date(
                        p.created
                      ).toLocaleString(
                        'ja-JP'
                      )
                  )
                )
              ),

              p.body
                ? el(
                    'p',
                    {
                      class: 'tx',
                      style:
                        'white-space:pre-wrap'
                    },
                    p.body
                  )
                : null,

              p.image
                ? el('img', {
                    src: p.image,
                    alt: '投稿画像',
                    style:
                      'width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin-top:10px',
                    loading: 'lazy'
                  })
                : null,

              p.video
                ? el('video', {
                    src: p.video,
                    controls: '',
                    playsinline: '',
                    style:
                      'width:100%;max-height:420px;border-radius:14px;margin-top:10px'
                  })
                : null,

              el(
                'div',
                {
                  style:
                    'margin-top:12px;color:var(--muted);font-size:13px'
                },
                '♡ ' +
                  num(
                    p.likes || 0
                  )
              )
            )
          )
        );
      }

      results.replaceChildren(
        ...(nodes.length
          ? nodes
          : [
              el(
                'p',
                {
                  class: 'sm2'
                },
                '該当するユーザー・投稿が見つかりませんでした。'
              )
            ])
      );
    } catch (e) {
      toast(e.message);
    }
  };

  const searchBtn = el(
    'button',
    {
      class: 'acc',
      style:
        'white-space:nowrap',
      onclick: safe(draw)
    },
    '検索'
  );

  input.addEventListener(
    'keydown',
    e => {
      if (e.key === 'Enter') {
        draw();
      }
    }
  );

  box.append(
    el(
      'div',
      {
        class: 'page c'
      },

      el(
        'h1',
        {},
        'ユーザー・投稿を探す'
      ),

      el(
        'p',
        {
          class: 'sm2',
          style:
            'margin-bottom:18px'
        },
        '登録ユーザーは @ユーザー名、投稿は文章の一部やキーワードから検索できます。'
      ),

      el(
        'div',
        {
          class:
            'user-search-bar',
          style:
            'display:flex;gap:8px;align-items:center;max-width:720px'
        },
        input,
        searchBtn
      ),

      results,

      el(
        'section',
        {
          class:
            'trending-home'
        },

        el(
          'div',
          {
            style:
              'display:flex;align-items:end;justify-content:space-between;gap:12px;margin-top:34px'
          },

          el(
            'div',
            {},

            el(
              'span',
              {
                class: 'eyebrow'
              },
              'TODAY AT TAMARI'
            ),

            el(
              'h2',
              {
                style:
                  'margin:5px 0 0'
              },
              '今日の投稿'
            )
          ),

          el(
            'span',
            {
              class: 'sm2'
            },
            '反応の多い順'
          )
        )
      ),

      await renderHomePosts(),

      el(
        'div',
        {
          class: 'foot',
          style:
            'margin-top:30px'
        },
        '話したい相手を探す機能は「チャット」から利用できます。'
      )
    )
  );

  results.replaceChildren(
    el(
      'p',
      {
        class: 'sm2'
      },
      'ユーザーは @、投稿はキーワードから検索できます。'
    )
  );

  pane.replaceChildren(box);
  paintStats();
}

// --------------------------------------------------
// お知らせ
// --------------------------------------------------

async function notices() {
  curChat = null;

  document.body.classList.remove(
    'inchat'
  );

  const ns = await api('/api/notices');

  const list = el(
    'div',
    {
      class: 'notice-list'
    }
  );

  const openNotice = async n => {
    try {
      await api(
        '/api/notices/' +
          n.id +
          '/read',
        'POST'
      );
    } catch (e) {}

    const h = noticeHref(n);

    if (h) {
      location.hash = h;
    }
  };

  if (!ns.length) {
    list.append(
      el(
        'div',
        {
          class: 'page c'
        },

        el(
          'h2',
          {},
          'お知らせはありません'
        ),

        el(
          'p',
          {
            class: 'sm2'
          },
          '新しい反応や返信があると、ここに届きます。'
        )
      )
    );
  } else {
    ns.forEach(n =>
      list.append(
        el(
          'button',
          {
            class: 'notice-item',
            type: 'button',
            style:
              'display:flex;width:100%;gap:14px;align-items:center;text-align:left;border:1px solid var(--line);background:var(--bg);color:inherit;border-radius:14px;padding:14px 16px;margin-bottom:10px;cursor:pointer',
            onclick: safe(() =>
              openNotice(n)
            )
          },

          el(
            'div',
            {
              class:
                'notice-mark',
              style:
                'width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:var(--s);font-size:18px'
            },
            n.kind ===
                'postlike' ||
            n.kind ===
                'replylike'
              ? '♡'
              : n.kind ===
                'postreply'
              ? '返信'
              : '•'
          ),

          el(
            'div',
            {
              class: 'g',
              style:
                'text-align:left'
            },

            el(
              'div',
              {},
              noticeText(n)
            ),

            el(
              'div',
              {
                class: 'sm2'
              },
              new Date(
                n.created
              ).toLocaleString(
                'ja-JP'
              )
            )
          )
        )
      )
    );
  }

  pane.replaceChildren(
    phead(
      'お知らせ'
    ),
    list
  );

  paintStats();
}

// --------------------------------------------------
// マッチング
// --------------------------------------------------

function searchView() {
  pane.replaceChildren(
    el(
      'div',
      {
        class: 'page c'
      },

      el(
        'h1',
        {},
        '相手を探しています'
      ),

      el(
        'div',
        {
          class: 'dots',
          'aria-hidden': 'true'
        },
        el('i'),
        el('i'),
        el('i')
      ),

      el(
        'p',
        {
          class: 'sm2'
        },
        '現在参加しているユーザーから',
        el('br'),
        '話せる相手を探しています。'
      ),

      el(
        'p',
        {
          class: 'sm2',
          style:
            'margin:22px 0'
        },
        '見つかるまで、このままお待ちください(最大3分)。'
      ),

      el(
        'button',
        {
          class: 'sub',
          onclick: safe(
            async () => {
              searching = false;

              await api(
                '/api/match/cancel',
                'POST'
              );

              home();
            }
          )
        },
        'やめる'
      )
    )
  );
}

function foundView(m) {
  const u = m.user;

  curMatch = m.match;

  pane.replaceChildren(
    el(
      'div',
      {
        class: 'page c'
      },

      el(
        'h1',
        {},
        '相手が見つかりました'
      ),

      el(
        'p',
        {
          class: 'sm2'
        },
        '「話してみる」は、相手も同じ気持ちのときにチャットが始まります。'
      ),

      el(
        'div',
        {
          class: 'found'
        },

        el(
          'div',
          {
            class: 'row',
            style:
              'padding:0 0 10px;cursor:default'
          },

          avatar(u),

          el(
            'div',
            {
              class: 'g'
            },

            el(
              'div',
              {
                class: 'nm'
              },
              u.display
            ),

            el(
              'div',
              {
                class: 'sm2'
              },
              '@' + u.username
            )
          )
        ),

        u.statusLine
          ? el(
              'p',
              {
                class: 'now'
              },
              u.statusLine
            )
          : null,

        u.bio
          ? el(
              'p',
              {
                style:
                  'white-space:pre-wrap;margin:0 0 8px'
              },
              u.bio
            )
          : null,

        tags(u.likes),
        tags(u.interests),

        el(
          'a',
          {
            href:
              '#/u/' +
              u.username,
            target: '_blank',
            rel: 'noopener',
            class: 'sm2'
          },
          'プロフィールをすべて見る(新しいタブ) →'
        )
      ),

      el(
        'button',
        {
          class: 'acc big',
          onclick: safe(
            async () => {
              const r =
                await api(
                  '/api/match/answer',
                  'POST',
                  {
                    match: m.match,
                    accept: true
                  }
                );

              if (r.waiting) {
                waitView(u);
              }
            }
          )
        },
        '話してみる'
      ),

      el(
        'button',
        {
          class: 'sub big',
          style:
            'margin-top:10px;font-size:16px;padding:14px',
          onclick: safe(
            async () => {
              await api(
                '/api/match/answer',
                'POST',
                {
                  match: m.match,
                  accept: false
                }
              );

              curMatch = null;
              await startSearch();
            }
          )
        },
        '今回はやめる'
      )
    )
  );
}

function waitView(u) {
  pane.replaceChildren(
    el(
      'div',
      {
        class: 'page c'
      },

      el(
        'h1',
        {},
        u.display +
          'さんの返事を待っています'
      ),

      el(
        'div',
        {
          class: 'dots',
          'aria-hidden': 'true'
        },
        el('i'),
        el('i'),
        el('i')
      ),

      el(
        'p',
        {
          class: 'sm2',
          style:
            'margin:18px 0'
        },
        '相手も「話してみる」を選ぶと、チャットが始まります。'
      ),

      el(
        'button',
        {
          class: 'sub',
          onclick: safe(
            async () => {
              await api(
                '/api/match/answer',
                'POST',
                {
                  match: curMatch,
                  accept: false
                }
              );

              curMatch = null;
              await startSearch();
            }
          )
        },
        '今回はやめる'
      )
    )
  );
}

const tags = s =>
  s
    ? el(
        'div',
        {},
        s
          .split(/[,、\s]+/)
          .filter(Boolean)
          .slice(0, 10)
          .map(t =>
            el(
              'span',
              {
                class: 'tag'
              },
              t
            )
          )
      )
    : null;

// --------------------------------------------------
// チャット
// --------------------------------------------------

async function chatList() {
  curChat = null;

  const c = await api(
    '/api/chats'
  ).catch(() => []);

  const find = el(
    'button',
    {
      class: 'acc',
      onclick: safe(startSearch)
    },
    '相手を探す'
  );

  pane.replaceChildren(
    phead(
      'チャット',
      '一時的な会話をここで始められます',
      find
    ),

    c.length
      ? c.map(chatRow)
      : el(
          'div',
          {
            class: 'page c'
          },

          el(
            'div',
            {
              class:
                'empty-chat'
            },

            el(
              'div',
              {
                class:
                  'empty-chat-icon'
              },
              '◌'
            ),

            el(
              'h2',
              {},
              'まだチャットがありません'
            ),

            el(
              'p',
              {
                class: 'sm2'
              },
              '「相手を探す」から、今話せる人を見つけてみましょう。'
            ),

            el(
              'button',
              {
                class:
                  'acc big',
                onclick:
                  safe(
                    startSearch
                  )
              },
              '相手を探す'
            )
          )
        )
  );
}

async function chat(id) {
  curChat = +id;

  let typingTimer = null;

  await api(
    '/api/chats/' +
      id +
      '/read',
    'POST'
  ).catch(() => {});

  document.body.classList.add(
    'inchat'
  );

  const d = await api(
    '/api/chats/' +
      id
  );

  let image = null;

  const list = el(
    'div',
    {
      class: 'msgs'
    }
  );

  const pv = el(
    'div',
    {
      class: 'pv'
    }
  );

  const add = m => {
    const mine =
      m.username ===
      ME.username;

    const meta = el(
      'div',
      {
        class: 'meta'
      },
      hm(m.created)
    );

    const box = el(
      'div',
      {
        class:
          'msg' +
          (mine
            ? ' mine'
            : ''),
        'data-id': m.id
      },
      meta,

      m.body
        ? el(
            'div',
            {
              class: 'bub'
            },
            m.body
          )
        : null
    );

    if (m.image) {
      box.append(
        el('img', {
          src: m.image,
          alt: '送られた画像',
          loading: 'lazy',
          onclick: () => {
            const z = el(
              'div',
              {
                class: 'zoom',
                onclick: () =>
                  z.remove()
              },
              el('img', {
                src: m.image,
                alt: '拡大した画像'
              })
            );

            document.body.append(z);
          }
        })
      );
    }

    if (mine) {
      meta.append(
        el(
          'button',
          {
            class: 'txt',
            onclick: safe(
              async () => {
                if (
                  confirm(
                    'このメッセージを削除しますか?'
                  )
                ) {
                  await api(
                    '/api/messages/' +
                      m.id,
                    'DELETE'
                  );

                  box.remove();
                }
              }
            )
          },
          '削除'
        )
      );
    }

    const stick =
      list.scrollHeight -
        list.scrollTop -
        list.clientHeight <
      140;

    list.append(box);

    if (stick || mine) {
      list.scrollTop =
        list.scrollHeight;
    }
  };

  const typing = el(
    'div',
    {
      class:
        'sm2 chat-typing',
      style:
        'min-height:18px;margin:4px 12px'
    },
    ''
  );

  const markRead = () =>
    api(
      '/api/chats/' +
        id +
        '/read',
      'POST'
    ).catch(() => {});

  if (
    document.visibilityState ===
    'visible'
  ) {
    markRead();
  }

  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        document.visibilityState ===
          'visible' &&
        curChat === +id
      ) {
        markRead();
      }
    }
  );

  if (!d.msgs.length) {
    list.append(
      el(
        'p',
        {
          class: 'sm2',
          style:
            'text-align:center;margin:30px 0'
        },
        'まだメッセージがありません。最初のひとことを送ってみましょう。'
      )
    );
  }

  d.msgs.forEach(add);

  const ta = el(
    'textarea',
    {
      maxlength: 500,
      placeholder:
        'メッセージ(Ctrl+Enterで送信)',
      'aria-label': 'メッセージ'
    }
  );

  const file = el(
    'input',
    {
      type: 'file',
      accept:
        'image/png,image/jpeg,image/gif,image/webp',
      hidden: ''
    }
  );

  const sendIt = safe(
    async () => {
      if (
        !ta.value.trim() &&
        !image
      ) {
        return;
      }

      const body = ta.value;
      const img = image;

      ta.value = '';
      image = null;
      pv.textContent = '';

      try {
        await api(
          '/api/chats/' +
            id +
            '/messages',
          'POST',
          {
            body,
            image: img
          }
        );

        list
          .querySelector(
            'p.sm2'
          )
          ?.remove();
      } catch (e) {
        ta.value = body;
        image = img;

        if (img) {
          pv.textContent =
            '画像を添付しています(送信で投稿)';
        }

        throw e;
      }
    }
  );

  file.onchange = () => {
    const f =
      file.files[0];

    if (!f) return;

    if (
      f.size >
      2 * 1048576
    ) {
      file.value = '';

      return toast(
        '画像は2MB以下にしてください'
      );
    }

    const fr =
      new FileReader();

    fr.onload = () => {
      image = fr.result;

      pv.textContent =
        '画像を添付しています(送信で投稿)';

      file.value = '';
    };

    fr.onerror = () =>
      toast(
        '画像を読み込めませんでした。別の画像でお試しください'
      );

    fr.readAsDataURL(f);
  };

  ta.addEventListener(
    'input',
    () => {
      api(
        '/api/chats/' +
          id +
          '/typing',
        'POST',
        {
          typing: true
        }
      ).catch(() => {});

      clearTimeout(
        typingTimer
      );

      typingTimer = setTimeout(
        () =>
          api(
            '/api/chats/' +
              id +
              '/typing',
            'POST',
            {
              typing: false
            }
          ).catch(() => {}),
        900
      );
    }
  );

  ta.addEventListener(
    'keydown',
    e => {
      if (
        e.key === 'Enter' &&
        (e.ctrlKey ||
          e.metaKey)
      ) {
        e.preventDefault();
        sendIt();
      }
    }
  );

  const w = d.with;

  const exitChat = safe(
    async () => {
      if (
        !confirm(
          'このチャットから退出しますか？'
        )
      ) {
        return;
      }

      try {
        await api(
          '/api/chats/' +
            id +
            '/leave',
          'POST'
        );
      } finally {
        onMsg = null;
        onDel = null;
        curChat = null;
        location.hash =
          '#/chats';
      }
    }
  );

  const menu = el(
    'div',
    {
      class:
        'row2 chat-toolbar'
    },

    el(
      'button',
      {
        class: 'txt',
        onclick: safe(
          async () => {
            if (d.mine) {
              await api(
                '/api/connect/' +
                  w.username,
                'DELETE'
              );
            } else {
              const r =
                await api(
                  '/api/connect',
                  'POST',
                  {
                    username:
                      w.username
                  }
                );

              toast(
                r.mutual
                  ? w.display +
                    'さんとつながりました'
                  : 'つながりを希望しました。相手にも同じ気持ちがあると成立します'
              );
            }

            route();
          }
        )
      },
      d.mutual
        ? 'つながり中'
        : d.mine
        ? '希望済み'
        : 'つながる'
    ),

    el(
      'button',
      {
        class: 'txt',
        onclick: () =>
          openForm('report')
      },
      '通報'
    ),

    el(
      'button',
      {
        class: 'txt',
        onclick: safe(
          async () => {
            if (
              confirm(
                w.display +
                  'さんをブロックしますか?お互いに見えなくなり、相手には通知されません。'
              )
            ) {
              await api(
                '/api/block',
                'POST',
                {
                  username:
                    w.username
                }
              );

              location.hash =
                '#/chats';
            }
          }
        )
      },
      'ブロック'
    ),

    el(
      'button',
      {
        class:
          'leave-chat',
        onclick: exitChat
      },
      '退出'
    )
  );

  pane.replaceChildren(
    el(
      'div',
      {
        class: 'chatw'
      },

      el(
        'div',
        {
          class: 'phead'
        },

        el(
          'button',
          {
            class: 'back',
            'aria-label':
              '戻る',
            onclick: () => {
              location.hash =
                '#/chats';
            }
          },
          '←'
        ),

        avatar(w),

        el(
          'a',
          {
            class: 'g',
            href:
              '#/u/' +
              w.username,
            style:
              'text-decoration:none'
          },

          el(
            'div',
            {
              class: 'nm'
            },
            w.display
          ),

          el(
            'div',
            {
              class: 'sm2'
            },
            'プロフィールを見る'
          )
        ),

        menu
      ),

      typing,
      list,
      pv,

      el(
        'div',
        {
          class: 'comp'
        },

        el(
          'button',
          {
            class: 'sub',
            onclick: () =>
              file.click(),
            'aria-label':
              '画像を添付'
          },
          '画像'
        ),

        file,
        ta,

        el(
          'button',
          {
            onclick: sendIt
          },
          '送信'
        )
      )
    )
  );

  list.scrollTop =
    list.scrollHeight;

  onMsg = add;

  onDel = id => {
    const x =
      list.querySelector(
        '[data-id="' +
          id +
          '"]'
      );

    if (x) {
      x.remove();
    }
  };
}

// --------------------------------------------------
// プロフィール
// --------------------------------------------------

const LABEL = {
  bio: '自己紹介',
  likes: '好きなもの',
  hobbies: '趣味',
  interests: '興味',
  quote: '好きな言葉',
  shot: 'きょうの一枚',
  video: '動画',
  diary: '今日の日記',
  links: 'リンク',
  follow: 'つながり',
  status: '今の一言'
};

const slash = s =>
  String(s || '')
    .split(/[,、\s\/]+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(' / ');

const left = t => {
  const h = Math.ceil(
    (t + 864e5 - Date.now()) /
      36e5
  );

  return h <= 1
    ? 'まもなく消えます'
    : 'あと約' +
        h +
        '時間で消えます';
};

const okLink = l => {
  try {
    const x = new URL(
      l.url
    );

    return /^https?:$/.test(
      x.protocol
    )
      ? x
      : null;
  } catch (e) {
    return null;
  }
};

const STAMPS = [
  'わかる',
  'おつかれさま',
  'おもしろい',
  'ありがとう',
  'すごい'
];

function replyDialog(
  diary,
  done
) {
  let stamp = diary.mine
    ? diary.mine.stamp
    : '';

  let dlg;

  const t = el(
    'input',
    {
      maxlength: 60,
      placeholder:
        'ひとこと(任意・60文字まで)',
      value: diary.mine
        ? diary.mine.body
        : ''
    }
  );

  const row = el(
    'div',
    {
      class: 'row2'
    }
  );

  const drawS = () =>
    row.replaceChildren(
      ...STAMPS.map(s =>
        el(
          'button',
          {
            class:
              'sub sm' +
              (stamp === s
                ? ' on'
                : ''),
            onclick: () => {
              stamp =
                stamp === s
                  ? ''
                  : s;

              drawS();
            }
          },
          s
        )
      )
    );

  drawS();

  dlg = el(
    'dialog',
    {},

    el(
      'h3',
      {
        style:
          'margin:0 0 6px'
      },
      'ひとこと添える'
    ),

    el(
      'p',
      {
        class: 'sm2',
        style:
          'margin:0 0 10px'
      },
      'この日記を書いた人にだけ届きます。そこから会話が始まるかもしれません。'
    ),

    row,

    el(
      'div',
      {
        style:
          'height:10px'
      }
    ),

    t,

    el(
      'div',
      {
        class: 'row2'
      },

      el(
        'button',
        {
          class: 'acc',
          onclick: safe(
            async () => {
              await api(
                '/api/diary/' +
                  diary.id +
                  '/reply',
                'POST',
                {
                  stamp,
                  body: t.value
                }
              );

              closeD(dlg);
              toast(
                '届けました'
              );
              done();
            }
          )
        },
        '送る'
      ),

      diary.mine
        ? el(
            'button',
            {
              class: 'sub',
              onclick: safe(
                async () => {
                  await api(
                    '/api/diary/' +
                      diary.id +
                      '/reply',
                    'DELETE'
                  );

                  closeD(dlg);
                  done();
                }
              )
            },
            '取り消す'
          )
        : null,

      el(
        'button',
        {
          class: 'sub',
          onclick: () =>
            closeD(dlg)
        },
        'やめる'
      )
    )
  );

  document.body.append(dlg);
  dlg.showModal();
}

async function postDialog(
  owner,
  onDone
) {
  const dlg = el(
    'dialog',
    {
      class: 'dlg'
    }
  );

  const body = el(
    'textarea',
    {
      maxlength: 1000,
      rows: 6,
      placeholder:
        '今日のこと、好きなもの、残しておきたい一言など'
    }
  );

  const image = el(
    'input',
    {
      type: 'file',
      accept:
        'image/png,image/jpeg,image/gif,image/webp'
    }
  );

  const video = el(
    'input',
    {
      type: 'file',
      accept:
        'video/mp4'
    }
  );

  const preview = el(
    'div',
    {
      class: 'pv'
    }
  );

  const send = safe(
    async () => {
      let img = null;
      let vid = null;

      if (image.files[0]) {
        if (
          image.files[0]
            .size >
          3 * 1048576
        ) {
          throw new Error(
            '画像は3MB以下にしてください'
          );
        }

        img = await fileData(
          image.files[0]
        );
      }

      if (video.files[0]) {
        if (
          video.files[0]
            .size >
          10 * 1048576
        ) {
          throw new Error(
            '動画は10MB以下にしてください'
          );
        }

        vid = await fileData(
          video.files[0]
        );
      }

      if (
        !body.value.trim() &&
        !img &&
        !vid
      ) {
        throw new Error(
          '文章・画像・動画のいずれかを追加してください'
        );
      }

      await api(
        '/api/posts',
        'POST',
        {
          body: body.value,
          image: img,
          video: vid
        }
      );

      closeD(dlg);

      await onDone();

      toast(
        '投稿しました'
      );
    }
  );

  dlg.append(
    el(
      'h2',
      {},
      '新しい投稿'
    ),

    body,

    el(
      'label',
      {},
      '画像',
      image
    ),

    el(
      'label',
      {},
      '動画（MP4・30秒以内）',
      video
    ),

    preview,

    el(
      'div',
      {
        class: 'row2'
      },

      el(
        'button',
        {
          class: 'sub',
          onclick: () =>
            closeD(dlg)
        },
        'キャンセル'
      ),

      el(
        'button',
        {
          class: 'acc',
          onclick: send
        },
        '投稿する'
      )
    )
  );

  document.body.append(dlg);
  dlg.showModal();
}

function fileData(file) {
  return new Promise(
    (resolve, reject) => {
      const r =
        new FileReader();

      r.onload = () =>
        resolve(r.result);

      r.onerror = () =>
        reject(
          new Error(
            'ファイルを読み込めませんでした'
          )
        );

      r.readAsDataURL(file);
    }
  );
}

async function loadPosts(
  username
) {
  try {
    return await api(
      '/api/posts?username=' +
        encodeURIComponent(
          username
        )
    );
  } catch (e) {
    toast(e.message);
    return [];
  }
}

function launchHeartBurst(
  card
) {
  const burst = el(
    'div',
    {
      class: 'heart-burst',
      'aria-hidden':
        'true'
    }
  );

  const symbols = [
    '♡',
    '♡',
    '♡',
    '♥',
    '♡'
  ];

  symbols.forEach(
    (symbol, i) => {
      const h = el(
        'span',
        {
          class:
            'heart-float'
        },
        symbol
      );

      h.style.setProperty(
        '--dx',
        (i - 2) * 22 +
          (Math.random() *
            14 -
            7) +
          'px'
      );

      h.style.setProperty(
        '--delay',
        i * 45 + 'ms'
      );

      h.style.setProperty(
        '--rot',
        Math.random() *
          26 -
          13 +
          'deg'
      );

      burst.append(h);
    }
  );

  card.append(burst);

  setTimeout(
    () => burst.remove(),
    1250
  );
}

async function renderPosts(
  username,
  self
) {
  const posts =
    await loadPosts(
      username
    );

  const box = el(
    'section',
    {
      class:
        'posts-section'
    },

    el(
      'div',
      {
        class:
          'posts-title'
      },

      el(
        'div',
        {},

        el(
          'span',
          {
            class:
              'eyebrow'
          },
          'TAMARI POSTS'
        ),

        el(
          'h2',
          {},
          self
            ? 'あなたの投稿'
            : 'この人の投稿'
        )
      ),

      self
        ? el(
            'button',
            {
              class:
                'acc sm',
              onclick: () =>
                postDialog(
                  username,
                  route
                )
            },
            '投稿する'
          )
        : null
    )
  );

  const list = el(
    'div',
    {
      class:
        'posts-list'
    }
  );

  if (!posts.length) {
    list.append(
      el(
        'p',
        {
          class: 'sm2'
        },
        self
          ? 'まだ投稿がありません。'
          : 'まだ投稿はありません。'
      )
    );
  } else {
    posts.forEach(
      p =>
        list.append(
          postCard(
            p,
            self,
            route
          )
        )
    );
  }

  box.append(list);

  return box;
}

// --------------------------------------------------
// プロフィール編集
// --------------------------------------------------

async function editProfile() {
  const me = await api(
    '/api/me'
  );

  const display = el(
    'input',
    {
      maxlength: 20,
      value:
        me.display || ''
    }
  );

  const bio = el(
    'textarea',
    {
      maxlength: 1000
    }
  );

  bio.value =
    me.bio || '';

  const status = el(
    'input',
    {
      maxlength: 80,
      value:
        me.status || ''
    }
  );

  const likes = el(
    'input',
    {
      value:
        me.likes || ''
    }
  );

  const interests =
    el(
      'input',
      {
        value:
          me.interests || ''
      }
    );

  const save = safe(
    async () => {
      await api(
        '/api/profile',
        'POST',
        {
          display:
            display.value,
          bio:
            bio.value,
          status:
            status.value,
          likes:
            likes.value,
          interests:
            interests.value
        }
      );

      toast(
        '保存しました'
      );

      location.hash =
        '#/me';

      route();
    }
  );

  pane.replaceChildren(
    phead(
      'プロフィールを編集'
    ),

    el(
      'div',
      {
        class:
          'page c edit-profile'
      },

      el(
        'label',
        {},
        '表示名',
        display
      ),

      el(
        'label',
        {},
        '自己紹介',
        bio
      ),

      el(
        'label',
        {},
        '今の一言',
        status
      ),

      el(
        'label',
        {},
        '好きなもの',
        likes
      ),

      el(
        'label',
        {},
        '興味',
        interests
      ),

      el(
        'button',
        {
          class:
            'acc big',
          onclick: save
        },
        '保存して公開'
      ),

      el(
        'button',
        {
          class:
            'sub big',
          style:
            'margin-top:10px',
          onclick: () => {
            location.hash =
              '#/me';
          }
        },
        'やめる'
      )
    )
  );
}

// --------------------------------------------------
// 自分のプロフィール
// --------------------------------------------------

async function mePage() {
  curChat = null;

  document.body.classList.remove(
    'inchat'
  );

  const me =
    await api('/api/me');

  ME = me;

  const profile = el(
    'div',
    {
      class:
        'profile-page'
    }
  );

  profile.append(
    el(
      'div',
      {
        class:
          'profile-top-actions'
      },

      el(
        'button',
        {
          class:
            'acc',
          onclick: () => {
            location.hash =
              '#/edit';
          }
        },
        'プロフィールを編集'
      )
    ),

    el(
      'div',
      {
        class:
          'profile-header'
      },

      avatar(me, true),

      el(
        'div',
        {
          class:
            'profile-main'
        },

        el(
          'h1',
          {},
          me.display ||
            me.username
        ),

        el(
          'div',
          {
            class:
              'sm2'
          },
          '@' +
            me.username
        ),

        me.status
          ? el(
              'div',
              {
                class:
                  'profile-online'
              },
              me.online
                ? el(
                    'span',
                    {
                      class:
                        'online-dot'
                    }
                  )
                : el(
                    'span',
                    {
                      class:
                        'offline-dot'
                    }
                  ),
              me.online
                ? 'オンライン'
                : 'オフライン'
            )
          : null,

        me.bio
          ? el(
              'p',
              {
                class:
                  'profile-bio',
                style:
                  'white-space:pre-wrap'
              },
              me.bio
            )
          : null,

        me.status
          ? el(
              'p',
              {
                class:
                  'now'
              },
              me.status
            )
          : null
      )
    ),

    me.likes
      ? el(
          'div',
          {
            class:
              'profile-section'
          },

          el(
            'h3',
            {},
            '好きなもの'
          ),

          el(
            'p',
            {},
            slash(
              me.likes
            )
          )
        )
      : null,

    me.interests
      ? el(
          'div',
          {
            class:
              'profile-section'
          },

          el(
            'h3',
            {},
            '興味'
          ),

          el(
            'p',
            {},
            slash(
              me.interests
            )
          )
        )
      : null,

    await renderPosts(
      me.username,
      true
    )
  );

  pane.replaceChildren(
    phead(
      'プロフィール'
    ),
    profile
  );
}

// --------------------------------------------------
// 他ユーザーのプロフィール
// --------------------------------------------------

async function userProfile(
  username
) {
  const u =
    await api(
      '/api/users/' +
        encodeURIComponent(
          username
        )
    );

  const actions =
    el(
      'div',
      {
        class:
          'profile-top-actions'
      }
    );

  if (
    ME &&
    u.username !==
      ME.username
  ) {
    actions.append(
      el(
        'button',
        {
          class:
            'acc',
          onclick: safe(
            async () => {
              const r =
                await api(
                  '/api/connect',
                  'POST',
                  {
                    username:
                      u.username
                  }
                );

              toast(
                r.mutual
                  ? u.display +
                    'さんとつながりました'
                  : 'つながりを希望しました'
              );

              route();
            }
          )
        },
        'つながる'
      ),

      el(
        'button',
        {
          class:
            'sub',
          style:
            'margin-left:8px',
          onclick: safe(
            async () => {
              location.hash =
                '#/chats';
            }
          )
        },
        '話しかける'
      )
    );
  }

  const profile =
    el(
      'div',
      {
        class:
          'profile-page'
      },

      actions,

      el(
        'div',
        {
          class:
            'profile-header'
        },

        avatar(
          u,
          true
        ),

        el(
          'div',
          {
            class:
              'profile-main'
          },

          el(
            'h1',
            {},
            u.display ||
              u.username
          ),

          el(
            'div',
            {
              class:
                'sm2'
            },
            '@' +
              u.username
          ),

          el(
            'div',
            {
              class:
                'profile-online'
            },

            u.online
              ? el(
                  'span',
                  {
                    class:
                      'online-dot'
                  }
                )
              : el(
                  'span',
                  {
                    class:
                      'offline-dot'
                  }
                ),

            u.online
              ? 'オンライン'
              : 'オフライン'
          ),

          u.bio
            ? el(
                'p',
                {
                  class:
                    'profile-bio',
                  style:
                    'white-space:pre-wrap'
                },
                u.bio
              )
            : null,

          u.status
            ? el(
                'p',
                {
                  class:
                    'now'
                },
                u.status
              )
            : null
        )
      ),

      u.likes
        ? el(
            'div',
            {
              class:
                'profile-section'
            },

            el(
              'h3',
              {},
              '好きなもの'
            ),

            el(
              'p',
              {},
              slash(
                u.likes
              )
            )
          )
        : null,

      u.interests
        ? el(
            'div',
            {
              class:
                'profile-section'
            },

            el(
              'h3',
              {},
              '興味'
            ),

            el(
              'p',
              {},
              slash(
                u.interests
              )
            )
          )
        : null,

      await renderPosts(
        u.username,
        false
      )
    );

  pane.replaceChildren(
    phead(
      u.display ||
        u.username
    ),
    profile
  );
}

// --------------------------------------------------
// 設定
// --------------------------------------------------

async function settings() {
  const me =
    await api('/api/me');

  const logout =
    el(
      'button',
      {
        class:
          'sub big',
        onclick: safe(
          async () => {
            await api(
              '/api/logout',
              'POST'
            );

            ME = null;

            if (es) {
              es.close();
              es = null;
            }

            landing('in');
          }
        )
      },
      'ログアウト'
    );

  pane.replaceChildren(
    phead(
      '設定'
    ),

    el(
      'div',
      {
        class:
          'page c settings-page'
      },

      el(
        'h2',
        {},
        'アカウント'
      ),

      el(
        'p',
        {
          class:
            'sm2'
        },
        '@' +
          me.username
      ),

      logout
    )
  );
}

// --------------------------------------------------
// ルーティング
// --------------------------------------------------

async function route() {
  if (!ME) {
    return landing(
      'in'
    );
  }

  if (!side || !pane) {
    layout();
  }

  await renderSide();

  const h =
    location.hash ||
    '#/';

  try {
    if (
      h === '#/' ||
      h === ''
    ) {
      await home();
      return;
    }

    if (
      h === '#/chats'
    ) {
      await chatList();
      return;
    }

    if (
      h === '#/notices'
    ) {
      await notices();
      return;
    }

    if (
      h === '#/me'
    ) {
      await mePage();
      return;
    }

    if (
      h === '#/edit'
    ) {
      await editProfile();
      return;
    }

    if (
      h === '#/settings'
    ) {
      await settings();
      return;
    }

    if (
      h.startsWith(
        '#/chat/'
      )
    ) {
      await chat(
        decodeURIComponent(
          h.slice(
            '#/chat/'.length
          )
        )
      );
      return;
    }

    if (
      h.startsWith(
        '#/u/'
      )
    ) {
      await userProfile(
        decodeURIComponent(
          h.slice(
            '#/u/'.length
          )
        )
      );
      return;
    }

    if (
      h ===
      '#/connections'
    ) {
      await connections();
      return;
    }

    location.hash = '#/';
  } catch (e) {
    console.error(
      'route error:',
      e
    );

    toast(
      e.message ||
        '読み込みに失敗しました'
    );
  }
}

// --------------------------------------------------
// 初期化
// --------------------------------------------------

async function boot() {
  try {
    ME = await api(
      '/api/me'
    );
  } catch (e) {
    ME = null;
    return landing(
      'in'
    );
  }

  layout();
  connect();
  await route();
}

window.addEventListener(
  'hashchange',
  () => {
    route();
  }
);

document.addEventListener(
  'DOMContentLoaded',
  () => {
    boot();
  }
);
