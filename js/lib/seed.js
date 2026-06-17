export const DEFAULT_SET_PATTERNS = ['通常', 'ピラミッド', 'ドロップ', 'レストポーズ'];

// setPatterns ストアが空ならデフォルトを投入する（依存注入でテスト可能）
export async function ensureDefaultSetPatterns(getAllFn, putFn, uidFn) {
  const existing = await getAllFn();
  if (existing && existing.length > 0) return;
  for (const name of DEFAULT_SET_PATTERNS) {
    await putFn({ id: uidFn(), name });
  }
}
