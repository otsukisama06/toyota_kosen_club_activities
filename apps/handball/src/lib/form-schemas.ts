import { AttendanceEventType, AttendanceStatus, InputType } from "@prisma/client";
import { z } from "zod";

const dateTimeLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const dateOrDateTimeRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

// 部員アカウントのニックネーム登録フォームです。
export const memberAccountRegisterSchema = z.object({
  email: z.string().trim().email("メールアドレスの形式が不正です"),
  nickname: z
    .string()
    .trim()
    .min(2, "ニックネームは2文字以上で入力してください")
    .max(20, "ニックネームは20文字以内で入力してください"),
  grade: z.string().trim().min(1, "学年を入力してください").max(20, "学年は20文字以内で入力してください"),
});

// ニックネームでログインするフォームです。
export const nicknameLoginSchema = z.object({
  nickname: z.string().trim().min(2, "ニックネームを入力してください"),
  adminPassword: z.string().optional(),
});

// 管理画面の部員編集フォームです。
export const memberUpdateSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2, "ニックネームは2文字以上で入力してください")
    .max(20, "ニックネームは20文字以内で入力してください"),
  grade: z.string().trim().min(1, "学年を入力してください").max(20, "学年は20文字以内で入力してください"),
});

// 本人プロフィール更新フォームです。
export const selfProfileUpdateSchema = z.object({
  email: z.string().trim().email("メールアドレスの形式が不正です"),
  nickname: z
    .string()
    .trim()
    .min(2, "ニックネームは2文字以上で入力してください")
    .max(20, "ニックネームは20文字以内で入力してください"),
  grade: z.string().trim().min(1, "学年を入力してください").max(20, "学年は20文字以内で入力してください"),
  yearlyGoal: z.string().trim().max(300, "一年の目標は300文字以内で入力してください").optional(),
  monthlyGoal: z.string().trim().max(300, "その月の目標は300文字以内で入力してください").optional(),
});

// 出席イベント作成フォームです。
export const attendanceEventSchema = z.object({
  eventType: z.nativeEnum(AttendanceEventType),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選択してください"),
  eventTime: z.string().regex(/^\d{2}:\d{2}$/, "時刻を選択してください"),
  eventEndTime: z.string().regex(/^\d{2}:\d{2}$/, "終了時刻を選択してください").optional(),
  matchOpponent: z.string().trim().optional(),
  matchDetail: z.string().trim().optional(),
  note: z.string().trim().optional(),
}).superRefine((value, ctx) => {
  if (value.eventType === AttendanceEventType.MATCH && !value.matchOpponent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["matchOpponent"],
      message: "試合を選択した場合は対戦相手を入力してください",
    });
  }

  if (value.eventEndTime && value.eventEndTime < value.eventTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["eventEndTime"],
      message: "終了時刻は開始時刻以降を指定してください",
    });
  }
});

// 共有リンクから送信される出席入力です。
export const attendanceSubmitSchema = z.object({
  token: z.string().trim().min(1),
  status: z.nativeEnum(AttendanceStatus),
  comment: z.string().trim().optional(),
});

// メイン画面から送る自分の出席入力です。
export const selfAttendanceSubmitSchema = z.object({
  eventId: z.string().trim().min(1, "イベントを選択してください"),
  status: z.nativeEnum(AttendanceStatus),
  comment: z.string().trim().optional(),
}).superRefine((value, ctx) => {
  if ((value.status === AttendanceStatus.LATE || value.status === AttendanceStatus.ABSENT) && !value.comment) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["comment"],
      message: "遅刻・欠席の場合はコメントを入力してください",
    });
  }
});

// メイン画面から送るフィードバック入力です。
export const feedbackSubmitSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "フィードバックを入力してください")
    .max(1000, "フィードバックは1000文字以内で入力してください"),
  redirectTo: z.string().trim().optional(),
});

// 試合登録フォームです。
export const matchSchema = z.object({
  opponent: z.string().trim().min(1, "対戦相手は必須です"),
  matchDate: z.string().trim().regex(dateOrDateTimeRegex, "日時を選択してください"),
  ourScore: z.coerce.number().int().min(0),
  theirScore: z.coerce.number().int().min(0),
  note: z.string().trim().optional(),
});

// 管理画面の共有リンク作成フォームです。
export const inputTokenSchema = z.object({
  type: z.nativeEnum(InputType),
  memberId: z.string().trim().min(1),
  eventId: z.string().trim().optional(),
  expiresAt: z.string().trim().regex(dateTimeLocalRegex, "有効期限を選択してください"),
});

// 練習メニュー入力フォームです。
export const practiceMenuSchema = z.object({
  title: z.string().trim().min(1, "練習名は必須です"),
  practiceDate: z.string().trim().regex(dateOrDateTimeRegex, "日時を選択してください"),
  menuText: z.string().trim().min(1, "練習メニューを入力してください"),
  detail: z.string().trim().optional(),
  createdByMemberId: z.string().trim().optional(),
});

// 部活タスク入力フォームです。
export const clubTaskSchema = z.object({
  title: z.string().trim().min(1, "タスク名は必須です").max(100, "タスク名は100文字以内で入力してください"),
  deadlineOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "締め切り日を選択してください"),
  notificationDaysBefore: z.coerce.number().int().min(1, "1日以上で指定してください").max(30, "最大30日まで指定できます").optional().default(14),
});

// 部活タスク更新フォームです。
export const clubTaskUpdateSchema = z.object({
  taskId: z.string().trim().min(1, "タスクを選択してください"),
  deadlineOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "締め切り日を選択してください"),
});

// 個人ごとの試合得点入力フォームです。
export const playerMatchScoreSchema = z.object({
  matchId: z.string().trim().min(1, "試合を選択してください"),
  goals: z.coerce.number().int().min(0, "得点は0以上で入力してください"),
  note: z.string().trim().optional(),
});

// リリースノート作成フォームです。
export const releaseNoteSchema = z.object({
  version: z
    .string()
    .trim()
    .min(1, "バージョンは必須です")
    .max(20, "バージョンは20文字以内で入力してください"),
  title: z
    .string()
    .trim()
    .min(1, "タイトルは必須です")
    .max(100, "タイトルは100文字以内で入力してください"),
  content: z
    .string()
    .trim()
    .min(1, "内容は必須です")
    .max(2000, "内容は2000文字以内で入力してください"),
});

// 管理画面の通達メッセージ作成フォームです。
export const adminAnnouncementSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "通達メッセージを入力してください")
    .max(500, "通達メッセージは500文字以内で入力してください"),
  startsAt: z.string().trim().regex(dateTimeLocalRegex, "表示開始日時を選択してください"),
  endsAt: z.string().trim().regex(dateTimeLocalRegex, "表示終了日時を選択してください"),
  redirectTo: z.string().trim().optional(),
}).superRefine((value, ctx) => {
  if (value.endsAt < value.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "終了日時は開始日時以降を指定してください",
    });
  }
});
