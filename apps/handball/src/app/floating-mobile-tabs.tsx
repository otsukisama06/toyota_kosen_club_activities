"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./home-dashboard.module.css";

type FloatingMobileTabsProps = {
  monthQuery: string;
};

const BOTTOM_THRESHOLD_PX = 24;

function isNearBottom(): boolean {
  const documentHeight = document.documentElement.scrollHeight;
  const viewportBottom = window.scrollY + window.innerHeight;
  return viewportBottom >= documentHeight - BOTTOM_THRESHOLD_PX;
}

export function FloatingMobileTabs({ monthQuery }: FloatingMobileTabsProps) {
  const [raised, setRaised] = useState(false);

  useEffect(() => {
    const update = () => setRaised(isNearBottom());

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <nav
      className={`${styles.mobileTabs} ${raised ? styles.mobileTabsRaised : ""}`.trim()}
      aria-label="メイン操作タブ"
    >
      <Link href="/kyudo-notes" className={styles.mobileTab}>弓道ノート</Link>
      <Link href={`/self/profile${monthQuery}`} className={styles.mobileTab}>プロフィール</Link>
    </nav>
  );
}
