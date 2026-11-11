import Link from "next/link";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import styles from "./help.module.css";

export const metadata = {
  title: "ヘルプ | Toyota Kyudo Notes",
  description: "リリースノートと各ページの使い方を確認できます。",
};

// Docker build 時に DB 接続有無へ依存せず、常に最新のルート一覧を表示できるよう動的化します。
export const dynamic = "force-dynamic";

type GuideAudience = "member" | "admin" | "support";

type GuideItem = {
  route: string;
  title: string;
  summary: string;
  steps: string[];
  audience: GuideAudience;
};

const EXCLUDED_ROUTE_PREFIXES = ["/api"];
const EXCLUDED_ROUTES = new Set(["/attendance", "/attendance/submit", "/practice-menus", "/practice-menus/new", "/admin/super-admin"]);
const HELP_MANUAL_PDF_PATH = "/downloads/kyudo-help.pdf";
const FALLBACK_ROUTES = [
  "/",
  "/auth",
  "/feedback",
  "/release-notes",
  "/calendar/[date]",
  "/calendar/[date]/attendance-details",
  "/self/profile",
  "/self/weight",
  "/self/weight-history",
  "/kyudo-notes",
  "/kyudo-notes/today",
  "/kyudo-notes/[dateKey]",
  "/admin",
  "/admin/events",
  "/admin/events/bulk",
  "/admin/events/edit",
  "/admin/events/single",
  "/admin/manager",
  "/admin/manager/goals",
  "/admin/feedback",
  "/admin/release-notes",
  "/admin/members/[memberId]",
  "/admin/members/[memberId]/attendance",
  "/admin/members/[memberId]/weight",
  "/admin/members/[memberId]/scores",
  "/admin/members/[memberId]/kyudo-notes",
  "/help",
];

const GUIDE_OVERRIDES: Array<{
  test: (route: string) => boolean;
  title: string;
  summary: string;
  steps: string[];
  audience: GuideAudience;
}> = [
  {
    test: (route) => route === "/",
    title: "ホーム",
    summary: "カレンダー、通達、目標、フィードバック導線をまとめて確認するトップページです。",
    steps: [
      "月送りで予定のある日を探し、日付カードを押して詳細画面へ進みます。",
      "下部のメニューからプロフィール更新へ移動します。",
    ],
    audience: "member",
  },
  {
    test: (route) => route === "/auth",
    title: "認証",
    summary: "個人パスワードとメールの確認コード（二段階認証）で登録・ログインを行う入口ページです。",
    steps: [
      "初回は登録フォームでメールアドレス・ニックネーム・パスワードを入力し、メールに届く6桁の確認コードを入力して登録します。",
      "2回目以降はニックネーム（またはメールアドレス）とパスワードを入力し、メールに届く6桁の確認コードを入力してログインします。",
      "パスワードを忘れた場合や、部活共通パスワード時代からのアカウントで初めてパスワードを設定する場合は「パスワードの設定・再設定」から登録済みメールアドレス宛てに確認コードを受け取って設定します。",
    ],
    audience: "support",
  },
  {
    test: (route) => route === "/feedback",
    title: "フィードバック送信",
    summary: "アプリ改善の要望や不具合報告を送信するページです。",
    steps: [
      "内容を入力して送信します。",
      "送信された内容は管理者画面に表示され、サーバ管理者に通知されます。",
    ],
    audience: "member",
  },
  {
    test: (route) => route === "/release-notes",
    title: "リリースノート",
    summary: "アプリの更新履歴と改善内容を確認するページです。",
    steps: [
      "新しい順で変更内容を確認します。",
      "運用ルール変更や追加機能がないか定期的に確認します。",
    ],
    audience: "support",
  },
  {
    test: (route) => route.startsWith("/calendar/"),
    title: "日別カレンダー",
    summary: "指定日のイベント詳細と自分の出席提出を確認するページです。",
    steps: [
      "予定のタイトル、時刻、メモを確認します。",
      "出席状態とコメントを入力して保存します。",
    ],
    audience: "member",
  },
  {
    test: (route) => route === "/self/profile",
    title: "プロフィール・目標",
    summary: "プロフィール情報と目標を更新するページです。",
    steps: [
      "表示名や学年など必要項目を更新します。",
      "年間目標、月間目標を入力して保存します。",
    ],
    audience: "member",
  },

  {
    test: (route) => route === "/admin",
    title: "管理ダッシュボード",
    summary: "管理者とマネージャー向けの管理起点ページです。",
    steps: [
      "出席イベント作成、部員管理、各種管理ページへの導線を利用します。",
      "役割に応じて利用可能な管理機能を確認します。",
    ],
    audience: "admin",
  },
  {
    test: (route) => route === "/admin/feedback",
    title: "フィードバック一覧",
    summary: "部員から届いたフィードバックを確認する管理ページです。",
    steps: [
      "投稿日時順で内容を確認します。",
      "必要な改善タスクをチーム内で起票します。",
    ],
    audience: "admin",
  },
  {
    test: (route) => route === "/admin/release-notes",
    title: "リリースノート管理",
    summary: "admin ユーザーがリリースノートを作成するページです。",
    steps: [
      "version、title、content を入力して作成します。",
      "公開後はユーザー向けページで表示確認します。",
    ],
    audience: "admin",
  },
  {
    test: (route) => route === "/admin/events",
    title: "予定管理",
    summary: "練習・試合などのイベントを作成・編集・削除するページです。",
    steps: [
      "単体予定作成、複数予定作成、予定削除の機能が利用できます。",
      "日程、イベントタイプ、対戦相手情報などを入力して保存します。",
    ],
    audience: "admin",
  },
  {
    test: (route) => route === "/admin/manager",
    title: "マネージャーウィンドウ",
    summary: "部員の出席率と目標を管理するページです。",
    steps: [
      "部員一覧で出席率を確認できます。列の表示・非表示の切り替えが可能です。",
      "全員の目標を表形式で確認・管理します。",
    ],
    audience: "admin",
  },
  {
    test: (route) => route === "/kyudo-notes",
    title: "弓道ノート",
    summary: "日々の練習や試合で学んだことを記録するページです。",
    steps: [
      "本日のノートまたは過去の日付を選択します。",
      "気付きや改善点を自由な形式で記入して保存します。",
    ],
    audience: "member",
  },
  {
    test: (route) => route.startsWith("/admin/members/") && route.endsWith("/attendance"),
    title: "部員別出席履歴",
    summary: "部員個別の出席履歴を確認するページです。",
    steps: [
      "期間やイベントごとの傾向を確認します。",
      "必要なら本人へ入力運用を案内します。",
    ],
    audience: "admin",
  },
  {
    test: (route) => route.startsWith("/admin/members/"),
    title: "部員詳細ダッシュボード",
    summary: "部員単位の詳細データへアクセスするハブページです。",
    steps: [
      "基本情報と各種サマリーを確認します。",
      "出席など個別画面へ移動します。",
    ],
    audience: "admin",
  },
];

async function collectAppPageRoutes(dirPath: string, segments: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    // 本番環境で src/app が参照できない場合は空配列を返し、呼び出し側でフォールバックします。
    return [];
  }
  const routes: string[] = [];

  const hasPage = entries.some((entry) => entry.isFile() && entry.name === "page.tsx");
  if (hasPage) {
    routes.push(segments.length === 0 ? "/" : `/${segments.join("/")}`);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name.startsWith("_")) {
      continue;
    }
    const childPath = path.join(dirPath, entry.name);
    const childRoutes = await collectAppPageRoutes(childPath, [...segments, entry.name]);
    routes.push(...childRoutes);
  }

  return routes;
}

function includeRoute(route: string): boolean {
  if (EXCLUDED_ROUTES.has(route)) {
    return false;
  }

  return !EXCLUDED_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix));
}

function fallbackGuide(route: string): GuideItem {
  const isAdminRoute = route.startsWith("/admin");
  return {
    route,
    title: route === "/" ? "ホーム" : `ページ ${route}`,
    summary: "画面内の案内に沿って入力・閲覧を行うページです。",
    steps: [
      "ページ内の見出しと説明文を確認します。",
      "必要な入力欄やボタンを使って操作します。",
    ],
    audience: isAdminRoute ? "admin" : "member",
  };
}

function routeToGuide(route: string): GuideItem {
  const override = GUIDE_OVERRIDES.find((entry) => entry.test(route));
  if (!override) {
    return fallbackGuide(route);
  }

  return {
    route,
    title: override.title,
    summary: override.summary,
    steps: override.steps,
    audience: override.audience,
  };
}

function sortGuideItems(items: GuideItem[]): GuideItem[] {
  return [...items].sort((a, b) => a.route.localeCompare(b.route));
}

function sectionLabel(audience: GuideAudience): string {
  if (audience === "member") {
    return "部員向けページ";
  }
  if (audience === "admin") {
    return "管理者・マネージャー向けページ";
  }
  return "認証・共有・共通ページ";
}

function isDirectNavigableRoute(route: string): boolean {
  return !route.includes("[");
}

async function hasHelpManualPdf(): Promise<boolean> {
  const filePath = path.join(process.cwd(), "public", ...HELP_MANUAL_PDF_PATH.split("/").filter(Boolean));
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export default async function HelpPage() {
  const appDir = path.join(process.cwd(), "src", "app");
  const hasManualPdf = await hasHelpManualPdf();
  const allRoutes = await collectAppPageRoutes(appDir);
  const sourceRoutes = allRoutes.length > 0 ? allRoutes : FALLBACK_ROUTES;
  const guides = sortGuideItems(sourceRoutes.filter(includeRoute).map(routeToGuide));

  const grouped: Record<GuideAudience, GuideItem[]> = {
    member: guides.filter((item) => item.audience === "member"),
    admin: guides.filter((item) => item.audience === "admin"),
    support: guides.filter((item) => item.audience === "support"),
  };

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>ヘルプ</h1>
        <p>リリースノートと、各ページの使い方をここで確認できます。</p>
        <div className={styles.actions}>
          <Link href="/release-notes" className={styles.primaryButton}>
            リリースノートを見る
          </Link>
          <a href="#guide" className={styles.secondaryButton}>
            使い方一覧へ移動
          </a>
        </div>
      </header>

      <section className={styles.noteCard}>
        <h2>使い方一覧について</h2>
        <p>
          この一覧は src/app 配下の page.tsx を読み取って自動生成します。
          本番環境などで読み取りできない場合は、既知のルート一覧を表示します。
        </p>
      </section>

      <section className={styles.noteCard}>
        <h2>使い方PDF</h2>
        <p>配布用の操作マニュアルをPDFでダウンロードできます。</p>
        {hasManualPdf ? (
          <a href={HELP_MANUAL_PDF_PATH} download className={styles.manualDownloadLink}>
            使い方PDFをダウンロード
          </a>
        ) : (
          <p className={styles.dynamicNote}>PDFはまだ配置されていません。配置後にこのボタンが表示されます。</p>
        )}
      </section>

      <section id="guide" className={styles.guideSection}>
        {["member", "admin", "support"].map((audience) => {
          const key = audience as GuideAudience;
          const items = grouped[key];
          if (items.length === 0) {
            return null;
          }

          return (
            <article key={key} className={styles.groupCard}>
              <h2>{sectionLabel(key)}</h2>
              <ul className={styles.guideList}>
                {items.map((item) => (
                  <li key={item.route} className={styles.guideItem}>
                    <div className={styles.itemHeader}>
                      <h3>{item.title}</h3>
                      <span className={styles.routeLabel}>{item.route}</span>
                    </div>
                    <p className={styles.summary}>{item.summary}</p>
                    <ul className={styles.steps}>
                      {item.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                    {isDirectNavigableRoute(item.route) ? (
                      <Link href={item.route} className={styles.pageLink}>
                        このページを開く
                      </Link>
                    ) : (
                      <p className={styles.dynamicNote}>動的ルートのため、画面内リンクから開いてください。</p>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>
    </main>
  );
}
