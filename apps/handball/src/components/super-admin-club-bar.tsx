import Link from "next/link";
import { getSessionMember } from "@/lib/member-session";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { CURRENT_CLUB, PEER_CLUB, isClubSwitchEnabled } from "@/lib/club-switch";

// スーパーアドミンだけに表示する、卓球部・弓道部と各管理画面をワンクリックで行き来するためのバーです。
export async function SuperAdminClubBar() {
  const member = await getSessionMember();
  if (!member || !isSuperAdminNickname(member.nickname)) {
    return null;
  }

  return (
    <nav className="superAdminBar" aria-label="スーパーアドミン用の部活切り替え">
      <span className="superAdminBarTitle">スーパーアドミン</span>
      <div className="superAdminBarGroup superAdminBarCurrent">
        <span className="superAdminBarLabel">{CURRENT_CLUB.label}（表示中）</span>
        <Link href="/" className="superAdminBarButton">メイン</Link>
        <Link href="/admin" className="superAdminBarButton">管理画面</Link>
        <Link href="/super-admin" className="superAdminBarButton">スーパーアドミン</Link>
      </div>
      {isClubSwitchEnabled() ? (
        <form action="/api/club-switch" method="post" className="superAdminBarGroup">
          <span className="superAdminBarLabel">{PEER_CLUB.label}へ</span>
          <button type="submit" name="next" value="home" className="superAdminBarButton superAdminBarPeer">メイン</button>
          <button type="submit" name="next" value="admin" className="superAdminBarButton superAdminBarPeer">管理画面</button>
          <button type="submit" name="next" value="super-admin" className="superAdminBarButton superAdminBarPeer">スーパーアドミン</button>
        </form>
      ) : (
        <span className="superAdminBarNote">{PEER_CLUB.label}への切り替えはゲートウェイ経由の起動時のみ使えます</span>
      )}
    </nav>
  );
}
