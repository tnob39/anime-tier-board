export const CHATGPT_HOME = "https://chatgpt.com/";
/** Conservative application policy, not a guaranteed provider/browser limit. */
export const PERSONAL_AI_URL_LIMIT = 12000;
export function buildChatGptLink(prompt: string): string | null {
  if (!prompt) return null;
  try {
    const url = `${CHATGPT_HOME}?q=${encodeURIComponent(prompt)}`;
    return url.length <= PERSONAL_AI_URL_LIMIT ? url : null;
  } catch { return null; }
}
/** noopener returns null even on success; opening and delivery remain unconfirmed. */
export function openPersonalAiWindow(url: string): "attempted" | "exception" {
  try { window.open(url, "_blank", "noopener,noreferrer"); return "attempted"; }
  catch { return "exception"; }
}
