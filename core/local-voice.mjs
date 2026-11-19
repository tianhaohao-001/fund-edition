import { execFile, spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('./windows-speech.ps1', import.meta.url));
const replyScript = fileURLToPath(new URL('./neural-reply-voice.py', import.meta.url));
const whisperScript = fileURLToPath(new URL('./whisper-speech.py', import.meta.url));
export const MAX_WAV_BYTES = 960_044;
let detection;
function voiceHome(env) {
  return env.FUNDROOM_VOICE_HOME || join(homedir(), '.cache', 'morrowfolio-voice');
}

export async function replyVoiceLanguages(env=process.env) {
  if(env.FUNDROOM_ENABLE_LOCAL_VOICE==='false')return [];
  const home=voiceHome(env), folder=join(home,'models','kokoro-int8-multi-lang-v1_1');
  try {
    await Promise.all([join(home,'narration','sherpa_onnx','__init__.py'), ...['model.int8.onnx','voices.bin','tokens.txt','lexicon-zh.txt','lexicon-us-en.txt','espeak-ng-data'].map(f=>join(folder,f))].map(path=>access(path)));
    return ['zh-CN','en-US'];
  } catch { return []; }
}

export async function synthesizeManagerReply(words,language,env=process.env) {
  if(!words?.trim()||words.length>2400||!(await replyVoiceLanguages(env)).includes(language)) {
    throw new VoiceUnavailable('Reply narration is unavailable for this message.',422);
  }
  const done=execute(env.FUNDROOM_VOICE_PYTHON||'python',['-X','utf8',replyScript,'--home',voiceHome(env),'--language',language],
    {windowsHide:true,timeout:120000,maxBuffer:32_000_000,encoding:'buffer'});
  done.child.stdin.on('error',()=>{});
  done.child.stdin.end(words,'utf8');
  try {
    const {stdout}=await done;
    if(stdout.length<46||stdout.toString('ascii',0,4)!=='RIFF')throw Error('No audio');
    return stdout;
  } catch { throw new VoiceUnavailable('Reply narration is temporarily unavailable.'); }
}

// Each request owns one short-lived process. Closing the browser stops its synthesis.
export async function streamManagerReply(words,language,env,signal,write,rate) {
  if(!words?.trim()||words.length>2400||!(await replyVoiceLanguages(env)).includes(language))
    throw new VoiceUnavailable('Reply narration is unavailable for this message.',422);
  const child=spawn(env.FUNDROOM_VOICE_PYTHON||'python',['-X','utf8',replyScript,'--home',voiceHome(env),'--language',language,'--stream',...(['0.9','1','1.12'].includes(rate)?['--speed',rate]:[])],
    {windowsHide:true,stdio:['pipe','pipe','ignore']});
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
  done.catch(()=>{});
  const stop=()=>child.kill();
  signal.addEventListener('abort',stop,{once:true});
  const timer=setTimeout(stop,150000);
  try {
    if(signal.aborted)stop();
    child.stdin.on('error',()=>{});
    child.stdin.end(words,'utf8');
    let bytes=0;
    for await(const chunk of child.stdout){
      if(signal.aborted)break;
      bytes+=chunk.length;
      await write(chunk);
    }
    if(!signal.aborted&&((await done)!==0||!bytes))throw new VoiceUnavailable('Local narration was interrupted.');
  } finally {clearTimeout(timer);signal.removeEventListener('abort',stop);stop();await done.catch(()=>{});}
}

export class VoiceUnavailable extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

async function installedLanguages() {
  if (process.platform !== 'win32') return [];
  detection ||= execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-List'], {
    windowsHide: true, timeout: 7000, maxBuffer: 4096, encoding: 'utf8',
  }).then(({ stdout }) => JSON.parse(stdout.replace(/^\uFEFF/u, '')).languages).catch(() => []);
  return detection;
}

export async function localVoiceStatus(env = process.env, publicDemo = false) {
  if (publicDemo || env.FUNDROOM_ENABLE_LOCAL_VOICE === 'false') return { local: false, languages: [], source: 'Browser speech service', maxSeconds: 30 };
  const paths = whisperPaths(env);
  const whisperReady = await Promise.all([join(paths.runtime, 'faster_whisper', '__init__.py'), join(paths.model, 'model.bin')].map((filename) => access(filename).then(() => true).catch(() => false)));
  if (whisperReady.every(Boolean)) return { local: true, languages: ['zh-CN', 'en-US'], source: 'Whisper small · local CPU int8', engine: 'whisper-small', maxSeconds: 30 };
  const languages = await installedLanguages();
  return { local: languages.length > 0, languages, source: languages.length ? 'Windows on-device dictation' : 'Browser speech service', engine: 'windows-speech', maxSeconds: 30 };
}

function whisperPaths(env) {
  const home = env.FUNDROOM_VOICE_HOME || join(homedir(), '.cache', 'morrowfolio-voice');
  return { runtime: join(home, 'python'), model: join(home, 'models', 'small'), python: env.FUNDROOM_VOICE_PYTHON || 'python' };
}

export function validateWave(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 46 || buffer.length > MAX_WAV_BYTES ||
      buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE' ||
      buffer.toString('ascii', 12, 16) !== 'fmt ' || buffer.readUInt32LE(16) !== 16 || buffer.readUInt16LE(20) !== 1 ||
      buffer.readUInt16LE(22) !== 1 || buffer.readUInt32LE(24) !== 16000 || buffer.readUInt32LE(28) !== 32000 || buffer.readUInt16LE(32) !== 2 || buffer.readUInt16LE(34) !== 16 ||
      buffer.toString('ascii', 36, 40) !== 'data' || buffer.readUInt32LE(40) !== buffer.length - 44 ||
      buffer.readUInt32LE(4) !== buffer.length - 8 || (buffer.length - 44) % 2 !== 0) {
    throw new VoiceUnavailable('Use a mono 16 kHz PCM recording no longer than 30 seconds.', 400);
  }
  return (buffer.length - 44) / 32000;
}

export async function transcribeLocalWave(buffer, language, status, { executeImpl = execute, env = process.env } = {}) {
  const seconds = validateWave(buffer);
  return transcribeFile(buffer, 'wav', language, status, { executeImpl, env, seconds });
}

export async function transcribeMobileAudio(buffer, mimeType, language, status, { executeImpl = execute, env = process.env } = {}) {
  const extension = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' }[mimeType];
  if (!extension || !Buffer.isBuffer(buffer) || buffer.length < 32 || buffer.length > 4_000_000) {
    throw new VoiceUnavailable('Use an AAC or M4A recording below 4 MB and 30 seconds.', 400);
  }
  if (status.engine !== 'whisper-small') throw new VoiceUnavailable('Mobile audio transcription requires the local Whisper model.');
  return transcribeFile(buffer, extension, language, status, { executeImpl, env });
}

async function transcribeFile(buffer, extension, language, status, { executeImpl, env, seconds }) {
  if (!status.local || !status.languages.includes(language)) throw new VoiceUnavailable('A local recognizer is unavailable for this language. Use browser speech or text input.');
  const directory = await mkdtemp(join(tmpdir(), 'morrowfolio-speech-'));
  try {
    const filename = join(directory, `voice.${extension}`);
    await writeFile(filename, buffer, { flag: 'wx' });
    const whisper = status.engine === 'whisper-small';
    const paths = whisperPaths(env);
    const command = whisper ? paths.python : 'powershell.exe';
    const args = whisper
      ? [whisperScript, '--runtime', paths.runtime, '--model', paths.model, '--input', filename, '--language', language]
      : ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-InputPath', filename, '-Language', language];
    const { stdout } = await executeImpl(command, args, { windowsHide: true, timeout: 45000, maxBuffer: 8192, encoding: 'utf8' });
    const result = JSON.parse(stdout.replace(/^\uFEFF/u, ''));
    if (!result.text?.trim()) throw new VoiceUnavailable('没有听清这句话。请靠近麦克风，再说一遍。', 422);
    return { text: result.text.trim().slice(0, 800), confidence: Number(result.confidence), language, seconds: seconds ?? result.seconds, source: status.source || 'Windows on-device dictation', ...(result.processingSeconds ? { processingSeconds: result.processingSeconds } : {}) };
  } catch (error) {
    if (error instanceof VoiceUnavailable) throw error;
    throw new VoiceUnavailable('本机语音识别暂时不可用。可以重试或输入文字。');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
