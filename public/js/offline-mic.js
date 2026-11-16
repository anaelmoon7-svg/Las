// تسجيل المايكروفون وتحويله إلى 16kHz أحادي لتغذية Whisper على الجهاز.
export function resampleTo16k(data, from) {
  if (from === 16000) return data;
  const ratio = from / 16000, n = Math.floor(data.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(data.length, Math.floor((i + 1) * ratio));
    let s = 0; for (let j = a; j < b; j++) s += data[j];
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}

export function createRecorder() {
  let ctx = null, stream = null, src = null, proc = null, chunks = [], total = 0, rate = 16000, t0 = 0;
  const cleanup = () => {
    try { proc && (proc.onaudioprocess = null, proc.disconnect()); } catch (e) {}
    try { src && src.disconnect(); } catch (e) {}
    try { stream && stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { ctx && ctx.close(); } catch (e) {}
    proc = src = stream = ctx = null;
  };
  return {
    async start(onLevel) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      if (ctx.state === 'suspended') await ctx.resume();
      rate = ctx.sampleRate; t0 = Date.now();
      src = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(d)); total += d.length;
        if (onLevel) { let s = 0; for (let i = 0; i < d.length; i += 16) s += d[i] * d[i]; onLevel(Math.sqrt(s / (d.length / 16))); }
      };
      src.connect(proc); proc.connect(ctx.destination); // الإخراج صامت: لا نكتب في outputBuffer
    },
    async stop() {
      const sr = rate; cleanup();
      const all = new Float32Array(total); let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      chunks = []; total = 0;
      const audio = resampleTo16k(all, sr);
      let peak = 0; for (let i = 0; i < audio.length; i += 4) { const v = Math.abs(audio[i]); if (v > peak) peak = v; }
      return { audio, seconds: audio.length / 16000, peak, sampleRate: sr };
    },
    cancel() { cleanup(); chunks = []; total = 0; },
  };
}
