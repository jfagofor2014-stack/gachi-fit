function getRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// この端末・ブラウザで音声認識が使えるか
export function isVoiceSupported() {
  return Boolean(getRecognitionCtor());
}

let activeStop = null;

// 進行中の認識があれば確実に止める。画面遷移時などから呼ぶ
export function stopVoiceInput() {
  if (activeStop) { activeStop(); activeStop = null; }
}

// 音声認識を1回分開始する。停止関数を返す（未対応なら何もしない関数）
export function startListening({ onInterim, onResult, onError }) {
  // 前のセッションが生きていると遅れた結果が新しいセッションを壊すので先に止める
  stopVoiceInput();

  const Ctor = getRecognitionCtor();
  // コールバックは常に非同期で呼ぶ。同期で呼ぶと呼び出し側が
  // 戻り値の停止関数を代入する前に idle() が走って状態がずれる
  if (!Ctor) { if (onError) setTimeout(() => onError('unsupported'), 0); return () => {}; }

  const rec = new Ctor();
  rec.lang = 'ja-JP';
  rec.continuous = false;
  rec.interimResults = true;

  let settled = false;
  const detach = () => { rec.onresult = null; rec.onerror = null; rec.onend = null; };

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        settled = true;
        detach();
        activeStop = null;
        if (onResult) onResult(r[0].transcript);
        return;
      }
      interim += r[0].transcript;
    }
    if (interim && onInterim) onInterim(interim);
  };
  rec.onerror = (e) => {
    settled = true;
    detach();
    activeStop = null;
    if (onError) onError(e.error || 'unknown');
  };
  // end は必ず最後に来る終端イベント。結果なしで終わる場合があるため、
  // ここで拾わないとボタンが「聞いています…」のまま固まる
  rec.onend = () => {
    if (settled) return;
    settled = true;
    detach();
    activeStop = null;
    if (onError) onError('no-speech');
  };

  const stop = () => {
    detach();
    // stop() は録音済み音声の最終結果を返してから終わるため abort() を使う
    try { rec.abort(); } catch { /* 停止済みなら無視 */ }
  };
  activeStop = stop;

  try { rec.start(); } catch { if (onError) setTimeout(() => onError('unknown'), 0); }
  return stop;
}
