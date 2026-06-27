// 実験的UI（視聴管理V2 の Codex/Grok 実機比較など）をオーナー本人にのみ
// 露出するためのゲート。本番では既定オフ・このメール以外には一切出さない。
export const OWNER_EMAIL = "tnob38@gmail.com";

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL.toLowerCase();
}
