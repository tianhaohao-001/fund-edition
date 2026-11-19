import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoiceSession } from '../mobile/src/voice-session.ts';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(overrides = {}) {
  const events = [];
  const dependencies = {
    permission: async () => { events.push('permission'); },
    configure: async () => { events.push('configure'); },
    prepare: async () => { events.push('prepare'); },
    record: () => events.push('record'),
    stop: async () => { events.push('stop'); return 'file://isolated-voice.m4a'; },
    transcribe: async () => { events.push('transcribe'); return 'Unsent transcript'; },
    remove: uri => events.push(['remove', uri]),
    processing: value => events.push(['processing', value]),
    recording: value => events.push(['recording', value]),
    transcript: text => events.push(['transcript', text]),
    error: error => events.push(['error', error.message]),
    ...overrides,
  };
  return { events, voice: createVoiceSession(dependencies) };
}

test('a language change while native microphone permission is pending cannot start an old recorder', async () => {
  const permission = deferred();
  const { voice, events } = fixture({ permission: () => permission.promise });
  const start = voice.start();
  assert.equal(await voice.start(), false, 'a second tap cannot start another permission flow');
  await voice.cancel();
  permission.resolve();
  assert.equal(await start, false);
  assert.equal(events.includes('prepare'), false);
  assert.equal(events.includes('record'), false);
  assert.equal(events.some(event => event[0] === 'transcript'), false);
  assert.deepEqual(events.at(-1), ['processing', false]);
});

test('cancelling native audio configuration cannot proceed into recorder preparation', async () => {
  const configure = deferred();
  const entered = deferred();
  const { voice, events } = fixture({ configure: async () => { entered.resolve(); await configure.promise; } });
  const start = voice.start();
  await entered.promise;
  await voice.cancel();
  configure.resolve();
  assert.equal(await start, false);
  assert.equal(events.includes('prepare'), false);
  assert.equal(events.includes('record'), false);
});

test('cancelling native recorder preparation keeps its lock and removes the resulting local audio', async () => {
  const prepare = deferred();
  const entered = deferred();
  const { voice, events } = fixture({ prepare: async () => { entered.resolve(); await prepare.promise; } });
  const start = voice.start();
  await entered.promise;
  await voice.cancel();
  assert.equal(await voice.start(), false, 'cancelled preparation retains ownership until cleanup');
  prepare.resolve();
  assert.equal(await start, false);
  assert.equal(events.includes('record'), false);
  assert.equal(events.filter(event => event === 'stop').length, 1);
  assert.deepEqual(events.filter(event => event[0] === 'remove'), [['remove', 'file://isolated-voice.m4a']]);
});

test('unmounting during native transcription discards late text and cleans the M4A without UI callbacks', async () => {
  const transcript = deferred();
  const entered = deferred();
  const { voice, events } = fixture({ transcribe: async () => { entered.resolve(); return transcript.promise; } });
  assert.equal(await voice.start(), true);
  const finish = voice.finish();
  await entered.promise;
  await voice.dispose();
  const cutoff = events.length;
  transcript.resolve('This late result must never be shown or sent.');
  await finish;
  assert.deepEqual(events.slice(cutoff), [['remove', 'file://isolated-voice.m4a']]);
  assert.equal(await voice.start(), false);
  assert.equal(events.some(event => event[0] === 'transcript'), false);
});

test('stopping native recording exposes an editable transcript only and removes audio on success or failure', async () => {
  const successful = fixture();
  assert.equal(await successful.voice.start(), true);
  await successful.voice.finish();
  assert.deepEqual(successful.events.filter(event => event[0] === 'transcript'), [['transcript', 'Unsent transcript']]);
  assert.equal(successful.events.filter(event => event[0] === 'remove').length, 1);
  const failure = fixture({ transcribe: async () => { throw new Error('Isolated recognizer failure'); } });
  assert.equal(await failure.voice.start(), true);
  await failure.voice.finish();
  assert.equal(failure.events.filter(event => event[0] === 'remove').length, 1);
  assert.deepEqual(failure.events.filter(event => event[0] === 'error'), [['error', 'Isolated recognizer failure']]);
  assert.equal(failure.events.some(event => event[0] === 'transcript'), false);
});
