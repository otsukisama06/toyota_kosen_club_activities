import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { NavigationLoadingOverlay } from "@/components/navigation-loading-overlay";
import { SiteCredit } from "@/components/site-credit";
import { SuperAdminClubBar } from "@/components/super-admin-club-bar";
import { GlobalReleaseNotesPopup } from "./global-release-notes-popup";
import "./globals.css";

export const metadata: Metadata = {
  title: "Toyota Table Tennis Notes",
  description: "卓球部の出席・管理アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <Suspense fallback={null}>
          <NavigationLoadingOverlay />
        </Suspense>
        <header className="globalBrand" aria-label="共通ヘッダー">
          <Link href="/" className="globalBrandTitle" aria-label="メインページへ戻る">
            <Image src="/table-tennis-logo.svg" alt="卓球部ロゴ" width={28} height={28} className="globalBrandLogo" priority />
            TOYOTA_KOSEN TABLE TENNIS NOTES
          </Link>
          <Link href="/help" className="globalReleaseLink">
            ヘルプ
          </Link>
        </header>
        <Suspense fallback={null}>
          <SuperAdminClubBar />
        </Suspense>
        <div className="appContent">{children}</div>
        <footer className="globalFooter" aria-label="クレジット表記">
          <SiteCredit />
        </footer>
        <Suspense fallback={null}>
          <GlobalReleaseNotesPopup />
        </Suspense>
      </body>
    </html>
  );
}

