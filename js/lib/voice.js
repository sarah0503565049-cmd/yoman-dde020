
export function dictationSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function joinDictation(base, spoken) {
  const raw = String(base || '');
  const s = String(spoken || '').trim().replace(/\s+/g, ' ');
  if (!s) return raw;
  if (!raw.trim()) return s;
  if (/\n[ \t]*$/.test(raw)) return raw.replace(/[ \t]+$/, '') + s;
  return raw.replace(/\s+$/, '') + ' ' + s;
}

const ERRORS = {
  unsupported: 'אפשר להכתיב במיקרופון של המקלדת',
  'not-allowed': 'צריך לאשר לאפליקציה להשתמש במיקרופון',
  'service-not-allowed': 'צריך לאשר לאפליקציה להשתמש במיקרופון',
  'audio-capture': 'לא נמצא מיקרופון',
  network: 'אין חיבור לאינטרנט, אי אפשר להכתיב עכשיו',
};

export function dictationErrorText(code) {
  return ERRORS[code] || 'ההכתבה נעצרה, אפשר לנסות שוב';
}

export function createDictation({ getBase, onText, onState, onError, lang = 'he-IL', idleMs = 10000, SR }) {
  const Rec = SR || (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);
  let rec = null;
  let wanted = false;
  let base = '';
  let lastHeard = 0;

  const setState = (s) => { if (onState) onState(s); };

  function run() {
    let text = '';
    rec = new Rec();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      let t = '';
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript + ' ';
      text = t;
      lastHeard = Date.now();
      onText(joinDictation(base, text));
    };
    rec.onerror = (ev) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return; // אחריהן מגיע onend
      wanted = false;
      if (onError) onError(ev.error);
    };
    rec.onend = () => {
      base = joinDictation(base, text);
      onText(base);
      rec = null;
      if (wanted && Date.now() - lastHeard < idleMs) {
        try { run(); return; } catch { /* נופלים לעצירה */ }
      }
      wanted = false;
      setState('idle');
    };
    rec.start();
  }

  return {
    start() {
      if (!Rec) { if (onError) onError('unsupported'); return false; }
      if (wanted) return true;
      wanted = true;
      base = getBase();
      lastHeard = Date.now();
      setState('listening');
      try {
        run();
      } catch {
        wanted = false;
        rec = null;
        setState('idle');
        if (onError) onError('start-failed');
        return false;
      }
      return true;
    },
    stop() {
      wanted = false;
      if (rec) { try { rec.stop(); } catch { /* כבר נעצר */ } } else setState('idle');
    },
    destroy() {
      wanted = false;
      if (rec) {
        rec.onresult = null; rec.onend = null; rec.onerror = null;
        try { rec.abort(); } catch { /* כבר נעצר */ }
        rec = null;
      }
    },
    get listening() { return wanted; },
  };
}
