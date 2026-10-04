Tamari 完成版

1. このフォルダでターミナルを開く
2. 管理者キーを設定する

PowerShell:
$env:ADMIN_KEY="16文字以上の自分だけが知っている長い文字列"
node --disable-warning=ExperimentalWarning server.js

CMD:
set "ADMIN_KEY=16文字以上の自分だけが知っている長い文字列"
node --disable-warning=ExperimentalWarning server.js

または start.bat をダブルクリックしてください。

サイト:
http://localhost:3000

管理:
http://localhost:3000/admin
管理ページでは、起動時に設定したADMIN_KEYを入力します。

重要:
- tamari.db と uploads は実行時に自動作成されます。
- ADMIN_KEYはGitHubなどに公開しないでください。
- お問い合わせと通報は config.json のGoogleフォームを使用します。
- 通報用フォームを別に作った場合は REPORT_FORM_URL だけ変更してください。
- AdSenseはサイト公開後の実際の運用・コンテンツ・プライバシー設定等を含めてGoogleの最新ポリシーに適合させる必要があり、審査通過を保証するものではありません。
