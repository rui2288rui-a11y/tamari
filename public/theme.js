// 保存したライト/ダークの設定を、画面が表示される前に反映します
try { var t = localStorage.getItem('tamari_theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
