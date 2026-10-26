// 連続する同一groupIdのセットを1つのグループにまとめる（純粋関数）
// sets は既にソート済みの配列を想定し、順序は保持する
export function groupConsecutiveSets(sets) {
  const result = [];
  for (const s of sets) {
    const last = result[result.length - 1];
    if (s.groupId && last && last.groupId === s.groupId) {
      last.sets.push(s);
    } else {
      result.push({ groupId: s.groupId || null, groupType: s.groupType || null, sets: [s] });
    }
  }
  return result;
}
