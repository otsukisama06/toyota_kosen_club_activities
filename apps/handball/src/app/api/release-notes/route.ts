import { redirect } from "next/navigation";
import { releaseNoteSchema } from "@/lib/form-schemas";
import { getSessionMember } from "@/lib/member-session";
import { isSuperAdminNickname } from "@/lib/admin-access";
import { toSafeAppPath } from "@/lib/request-utils";
import { createReleaseNoteInAllDbs, fetchUnifiedReleaseNotes, hasReleaseNoteVersion } from "@/lib/dual-db-content";

// GET: 全ユーザーがリリースノート一覧を取得できます
export async function GET() {
  try {
    const releaseNotes = await fetchUnifiedReleaseNotes();

    return Response.json(
      { releaseNotes },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch release notes:", error);
    return Response.json(
      { error: "リリースノートの取得に失�ました" },
      { status: 500 }
    );
  }
}

// POST: ユーザー名が「admin」の人のみがリリースノートを作成できます
export async function POST(request: Request) {
  try {
    const member = await getSessionMember();

    if (!member) {
      redirect("/auth?error=認証が必要です");
    }

    if (!isSuperAdminNickname(member.nickname)) {
      redirect("/admin/release-notes?error=ユーザー名がadminの人のみリリースノートを作成できます");
    }

    const formData = await request.formData();
    const version = formData.get("version") as string;
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const redirectTo = toSafeAppPath(formData.get("redirectTo") as string | null, "/admin/release-notes");

    const parsed = releaseNoteSchema.safeParse({ version, title, content });

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message).join(", ");
      redirect(`${redirectTo}?error=${encodeURIComponent(errors)}`);
    }

    const existingVersion = await hasReleaseNoteVersion(parsed.data.version);

    if (existingVersion) {
      redirect(`${redirectTo}?error=${encodeURIComponent("このバージョンは既に存在します")}`);
    }

    await createReleaseNoteInAllDbs({
      version: parsed.data.version,
      title: parsed.data.title,
      content: parsed.data.content,
      authorId: member.id,
      authorNickname: member.nickname,
    });

    redirect(`${redirectTo}?ok=${encodeURIComponent("リリースノートを作成しました")}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Failed to create release note:", error);
    redirect("/admin/release-notes?error=リリースノートの作成に失敗しました");
  }
}
