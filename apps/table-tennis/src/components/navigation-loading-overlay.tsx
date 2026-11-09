"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoadingCredit } from "@/components/loading-credit";
import styles from "./navigation-loading-overlay.module.css";

function isInternalHttpUrl(url: URL): boolean {
  return url.origin === window.location.origin && (url.protocol === "http:" || url.protocol === "https:");
}

export function NavigationLoadingOverlay() {
  const [startRouteKey, setStartRouteKey] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRouteKey = `${pathname}?${searchParams.toString()}`;

  // 遷移開始時の画面のままであれば読み込み中を表示します（遷移が完了するとキーが変わり自動で消えます）。
  const showOverlayState = startRouteKey !== null && startRouteKey === currentRouteKey;

  // 3秒タイムアウト：ページ遷移が失敗した場合でもオーバーレイを解除
  useEffect(() => {
    if (!showOverlayState) {
      return;
    }
    const timer = setTimeout(() => {
      setStartRouteKey(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [showOverlayState]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      if (anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (!isInternalHttpUrl(nextUrl)) {
        return;
      }

      const nextKey = `${nextUrl.pathname}?${nextUrl.searchParams.toString()}`;
      if (nextKey === currentRouteKey) {
        return;
      }

      setStartRouteKey(currentRouteKey);
    };

    const onSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const form = event.target as HTMLFormElement | null;
      if (!form) {
        return;
      }

      if (form.dataset.disableGlobalNavLoading === "true") {
        return;
      }

      const action = form.getAttribute("action");
      if (!action) {
        setStartRouteKey(currentRouteKey);
        return;
      }

      let actionUrl: URL;
      try {
        actionUrl = new URL(action, window.location.href);
      } catch {
        return;
      }

      if (isInternalHttpUrl(actionUrl)) {
        setStartRouteKey(currentRouteKey);
      }
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [currentRouteKey]);

  const disableByDataAttr = typeof document !== "undefined" && document.body.dataset.disableGlobalNavLoading === "true";
  const showOverlay = showOverlayState && !disableByDataAttr;

  if (!showOverlay) {
    return null;
  }

  return (
    <>
      <div className={styles.overlay} aria-live="polite" aria-busy="true">
        <section className={styles.panel} role="status" aria-label="ページを読み込み中です">
          <Image src="/table-tennis-logo.svg" alt="卓球部ロゴ" width={64} height={64} className={styles.logo} priority />
          <h2 className={styles.title}>TOYOTA_KOSEN TABLE TENNIS NOTES</h2>
          <div className={styles.spinner} aria-hidden="true" />
          <p className={styles.label}>読み込み中...</p>
        </section>
      </div>
      <LoadingCredit />
    </>
  );
}
