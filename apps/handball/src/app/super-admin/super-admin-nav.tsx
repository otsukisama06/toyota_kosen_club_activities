"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./super-admin.module.css";

const NAV_ITEMS = [
  { href: "/super-admin", label: "ダッシュボード" },
  { href: "/super-admin/mail", label: "メール一斉送信" },
  { href: "/super-admin/announcements", label: "通達メッセージ" },
  { href: "/super-admin/members", label: "部員アカウント" },
  { href: "/super-admin/system", label: "サーバ状態" },
  { href: "/super-admin/data", label: "データ管理" },
];

const EXTERNAL_ITEMS = [
  { href: "/admin/release-notes", label: "リリースノート" },
  { href: "/admin/feedback", label: "フィードバック" },
];

export function SuperAdminNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="スーパーアドミンメニュー">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/super-admin" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
      <div className={styles.navDivider} />
      {EXTERNAL_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={styles.navLink}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
