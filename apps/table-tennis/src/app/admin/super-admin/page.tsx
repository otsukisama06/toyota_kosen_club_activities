import { redirect } from "next/navigation";

// admin 専用画面はスーパーアドミンコンソール（/super-admin）へ移動しました。
export default function LegacySuperAdminPage() {
  redirect("/super-admin");
}
