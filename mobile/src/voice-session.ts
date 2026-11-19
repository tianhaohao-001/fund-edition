/** Owns asynchronous microphone work; invalidated work may never restart recording. */
export function createVoiceSession(deps: {
  permission: () => Promise<void>;
  configure: () => Promise<void>;
  prepare: () => Promise<void>;
  record: () => void;
  stop: () => Promise<string | null>;
  transcribe: (uri: string) => Promise<string>;
  remove: (uri: string) => void;
  processing: (value: boolean) => void;
  recording: (value: boolean) => void;
  transcript: (text: string) => void;
  error: (error: unknown) => void;
}) {
  let generation = 0;
  let busy = false;
  let recording = false;
  let disposed = false;
  const current = (value: number) => !disposed && generation === value;
  const update = (fn: () => void) => { if (!disposed) fn(); };
  async function clean() {
    try { const uri = await deps.stop(); if (uri) deps.remove(uri); } catch { /* Already stopped or released. */ }
  }
  async function start() {
    if (disposed || busy || recording) return false;
    busy = true;
    const token = ++generation;
    let prepared = false;
    update(() => deps.processing(true));
    try {
      await deps.permission();
      if (!current(token)) return false;
      await deps.configure();
      if (!current(token)) return false;
      await deps.prepare();
      prepared = true;
      if (!current(token)) return false;
      deps.record();
      recording = true;
      update(() => deps.recording(true));
      return true;
    } catch (error) { if (current(token)) deps.error(error); return false; }
    finally {
      if (prepared && !recording) await clean();
      busy = false;
      update(() => deps.processing(false));
    }
  }
  async function finish() {
    if (disposed || busy || !recording) return;
    busy = true;
    recording = false;
    const token = generation;
    let uri: string | null = null;
    update(() => { deps.recording(false); deps.processing(true); });
    try {
      uri = await deps.stop();
      if (!current(token)) return;
      if (!uri) throw new Error('The recording was not completed.');
      const text = await deps.transcribe(uri);
      if (current(token)) deps.transcript(text);
    } catch (error) { if (current(token)) deps.error(error); }
    finally {
      if (uri) deps.remove(uri);
      busy = false;
      update(() => deps.processing(false));
    }
  }
  async function cancel() {
    generation += 1;
    const wasRecording = recording;
    recording = false;
    update(() => deps.recording(false));
    // A pending start/finish owns cleanup and retains the lock until it completes.
    if (busy || !wasRecording) return;
    busy = true;
    update(() => deps.processing(true));
    try { await clean(); }
    finally { busy = false; update(() => deps.processing(false)); }
  }
  return { start, finish, cancel, dispose() { disposed = true; return cancel(); } };
}
