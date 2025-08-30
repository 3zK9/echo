export const keys = {
  profileEchoes: (username: string, cursor: string | null, limit: number) => ["profile-echoes", username.toLowerCase(), cursor || null, limit] as const,
  profileLikes: (username: string, offset: number | null, limit: number) => ["profile-likes", username.toLowerCase(), offset ?? 0, limit] as const,
};

