const DEFAULT_CLUB_PASSWORD = "hand";

function getClubPassword(): string {
  const envPassword = process.env.CLUB_PASSWORD?.trim();
  if (envPassword) {
    return envPassword;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("CLUB_PASSWORD is required in production");
  }

  return DEFAULT_CLUB_PASSWORD;
}

export function isValidClubPassword(password: string | null | undefined): boolean {
  return (password || "") === getClubPassword();
}