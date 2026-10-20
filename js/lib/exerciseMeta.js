// homeOk が未設定の登録済み種目に、同名プリセットの homeOk / bodyweight を写す。
// 一致しない自作種目は「自宅可・自重なし」にして隠さない。
// 既に homeOk がある種目には書き込まないので、2回目以降は何もしない（依存注入でテスト可能）
export async function ensureExerciseMeta(getAllFn, putFn, presets) {
  const exercises = await getAllFn();
  const byName = new Map(presets.map((p) => [p.name, p]));
  let updated = 0;
  for (const ex of exercises) {
    if (typeof ex.homeOk === 'boolean') continue;
    const preset = byName.get(ex.name);
    await putFn({
      ...ex,
      homeOk: preset ? preset.homeOk !== false : true,
      bodyweight: preset ? preset.bodyweight === true : false,
    });
    updated++;
  }
  return updated;
}
