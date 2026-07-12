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

// 種目×ラウンドの入力値を、ラウンド→種目の順で埋まっているセルだけ抽出する（純粋関数）
// exerciseIds: string[] / rounds: Array<Array<{weight:number, reps:number}>>（rounds[roundIndex][exerciseIndex]）
export function flattenRounds(exerciseIds, rounds) {
  const entries = [];
  rounds.forEach((round) => {
    exerciseIds.forEach((exerciseId, exIndex) => {
      const cell = round[exIndex];
      if (cell && cell.weight > 0 && cell.reps > 0) {
        entries.push({ exerciseId, weight: cell.weight, reps: cell.reps });
      }
    });
  });
  return entries;
}
