function getRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// この端末・ブラウザで音声認識が使えるか
export function isVoiceSupported() {
  return Boolean(getRecognitionCtor());
}

// 音声認識を1回分開始する。停止関数を返す（未対応なら何もしない関数）
export function startListening({ onInterim, onResult, onError }) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) { if (onError) onError('unsupported'); return () => {}; }

  const rec = new Ctor();
  rec.lang = 'ja-JP';
  rec.continuous = false;
  rec.interimResults = true;

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { if (onResult) onResult(r[0].transcript); return; }
      interim += r[0].transcript;
    }
    if (interim && onInterim) onInterim(interim);
  };
  rec.onerror = (e) => { if (onError) onError(e.error || 'unknown'); };

  try { rec.start(); } catch { if (onError) onError('unknown'); }
  return () => { try { rec.stop(); } catch { /* 停止済みなら無視 */ } };
}
