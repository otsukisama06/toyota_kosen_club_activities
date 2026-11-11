import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBulkEmails, type BulkEmailMessage } from "@/lib/email-notification";
import { isSuperAdminNickname } from "@/lib/admin-access";
import {
  describeBroadcastFilter,
  filterBroadcastMembers,
  getSuperAdminMember,
  isBroadcastTarget,
  renderBroadcastMessage,
  type BroadcastFilter,
} from "@/lib/super-admin";
import { buildAppUrl } from "@/lib/request-utils";

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

// スーパーアドミンが部員へメールを一斉送信します。
export async function POST(request: NextRequest) {
  const redirectUrl = buildAppUrl(request, "/super-admin/mail");
  const admin = await getSuperAdminMember();
  if (!admin) {
    const authUrl = buildAppUrl(request, "/auth");
    authUrl.searchParams.set("error", "admin ユーザーでログインしてください");
    return NextResponse.redirect(authUrl, 303);
  }

  const formData = await request.formData();
  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").replace(/\r\n/g, "\n").trim();
  const targetRaw = String(formData.get("target") || "");
  const sendCopyToSelf = formData.get("sendCopyToSelf") === "1";

  const fail = (message: string) => {
    redirectUrl.searchParams.set("error", message);
    return NextResponse.redirect(redirectUrl, 303);
  };

  if (formData.get("confirmSend") !== "1") {
    return fail("送信内容の確認にチェックを入れてください");
  }
  if (!subject || subject.length > SUBJECT_MAX) {
    return fail(`件名は1〜${SUBJECT_MAX}文字で入力してください`);
  }
  if (!body || body.length > BODY_MAX) {
    return fail(`本文は1〜${BODY_MAX}文字で入力してください`);
  }
  if (!isBroadcastTarget(targetRaw)) {
    return fail("送信対象を選択してください");
  }

  const filter: BroadcastFilter = {
    target: targetRaw,
    roles: formData.getAll("roles").map(String),
    grades: formData.getAll("grades").map(String),
    memberIds: formData.getAll("memberIds").map(String),
  };

  const members = await prisma.member.findMany({
    select: { id: true, nickname: true, name: true, grade: true, role: true, email: true, passwordHash: true },
  });
  const candidates = members
    .filter((member) => !isSuperAdminNickname(member.nickname))
    .map((member) => ({
      id: member.id,
      nickname: member.nickname || member.name,
      grade: member.grade,
      role: member.role,
      email: member.email?.trim() || "",
      hasEmail: Boolean(member.email?.trim()),
      hasPassword: Boolean(member.passwordHash),
    }));
  const recipients = filterBroadcastMembers(candidates, filter);

  if (recipients.length === 0) {
    return fail("送信対象の部員がいません（メールアドレス未登録の部員には送信できません）");
  }

  const messages: BulkEmailMessage[] = recipients.map((member) => ({
    to: member.email,
    subject: subject.replaceAll("{nickname}", member.nickname),
    message: renderBroadcastMessage(body, member.nickname),
  }));
  if (sendCopyToSelf && admin.email) {
    messages.push({
      to: admin.email,
      subject: `[控え] ${subject.replaceAll("{nickname}", "（部員名）")}`,
      message: renderBroadcastMessage(body, "（部員名）"),
    });
  }

  const result = await sendBulkEmails(messages);
  let sentCount = result.sent;
  let failedCount = result.failed;

  if (result.skipped) {
    if (process.env.NODE_ENV === "production") {
      return fail("メール送信が設定されていないため送信できません（メールAPIキーを設定してください）");
    }
    // 開発環境ではメール送信の代わりにコンソールへ出力します。
    for (const message of messages) {
      console.info(`[broadcast] to=${message.to} subject=${message.subject}\n${message.message}`);
    }
    sentCount = messages.length;
    failedCount = 0;
  } else if (result.errors.length > 0) {
    console.error("[broadcast] some batches failed", result.errors);
  }

  const nicknames = new Map(candidates.map((member) => [member.id, member.nickname]));
  await prisma.emailBroadcast.create({
    data: {
      subject,
      body,
      targetSummary: `${describeBroadcastFilter(filter, nicknames)}${sendCopyToSelf && admin.email ? "（自分に控えを送信）" : ""}`,
      recipientCount: messages.length,
      sentCount,
      failedCount,
      createdById: admin.id,
    },
  });

  redirectUrl.searchParams.set("ok", `broadcast-sent-${sentCount}-${failedCount}`);
  return NextResponse.redirect(redirectUrl, 303);
}
