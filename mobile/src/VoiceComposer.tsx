import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import type { Language } from './types';
import { theme } from './theme';
import { createVoiceSession } from './voice-session';

interface Props {
  language: Language;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  onSend: (text: string) => Promise<unknown>;
  transcribe: (uri: string, mimeType: string) => Promise<string>;
}

export default function VoiceComposer({ language, disabled, label, placeholder, onSend, transcribe }: Props) {
  const zh = language === 'zh-CN';
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef({ zh, transcribe });
  current.current = { zh, transcribe };
  const voice = useMemo(() => createVoiceSession({
    permission: async () => {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error(current.current.zh ? '请在系统设置允许麦克风，或改用文字。' : 'Allow microphone access in Settings or type your message.');
    },
    configure: () => setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }),
    prepare: () => recorder.prepareToRecordAsync(),
    record: () => recorder.record(),
    stop: async () => { await recorder.stop(); return recorder.uri; },
    transcribe: uri => current.current.transcribe(uri, 'audio/mp4'),
    remove: uri => { try { new File(uri).delete(); } catch { /* Already removed by the OS. */ } },
    processing: setProcessing,
    recording: setRecording,
    transcript: transcript => { setText(previous => previous ? `${previous} ${transcript}` : transcript); setTyping(true); },
    error: failure => {
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(message === 'The recording was not completed.' && current.current.zh ? '录音没有完成，请重试。' : message);
    },
  }), [recorder]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    void voice.cancel();
  }, [language, voice]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    void voice.dispose();
  }, [voice]);

  async function stopRecording() {
    if (timer.current) clearTimeout(timer.current);
    await voice.finish();
  }

  async function toggleRecording() {
    setError('');
    if (recording) { await stopRecording(); return; }
    if (await voice.start()) {
      timer.current = setTimeout(() => { void stopRecording(); }, 30_000);
    }
  }

  async function send() {
    if (!text.trim()) return;
    setError('');
    setProcessing(true);
    try { await onSend(text.trim()); setText(''); setTyping(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setProcessing(false); }
  }

  return <View style={styles.box}>
    {label ? <Text style={styles.label}>{label}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={recording ? (zh ? '停止录音' : 'Stop recording') : (zh ? '开始录音' : 'Start recording')}
      disabled={disabled || processing} onPress={() => { void toggleRecording(); }} style={[styles.mic, recording && styles.recording]}>
      {recording ? <Text style={styles.micText}>■</Text> : <View accessible={false} style={styles.micIcon}><View style={styles.micCapsule} /><View style={styles.micCradle} /><View style={styles.micStem} /><View style={styles.micFoot} /></View>}
      <Text style={styles.micCaption}>{processing ? (zh ? '正在处理…' : 'Processing…') : recording ? (zh ? '说完点此停止' : 'Tap to stop') : (zh ? '说说你的想法' : 'Tell us your idea')}</Text>
    </Pressable>
    <Text style={styles.hint}>{zh ? '最多30秒。转写后可修改，由你确认发送。' : 'Up to 30 seconds. Review and edit before sending.'}</Text>
    <Pressable accessibilityRole="button" onPress={() => setTyping(value => !value)}><Text style={styles.hint}>{typing ? (zh ? '收起文字输入' : 'Hide keyboard input') : (zh ? '改用文字' : 'Use the keyboard')}</Text></Pressable>
    {typing || text ? <TextInput accessibilityLabel={zh ? '消息或转写文本' : 'Message or transcript'} value={text} onChangeText={setText} multiline
      editable={!disabled && !processing && !recording} style={styles.input} placeholder={placeholder ?? (zh ? '也可以直接输入…' : 'You can also type here…')} placeholderTextColor={theme.muted} />
      : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={disabled || processing || recording || !text.trim()} onPress={() => { void send(); }}
      style={[styles.send, (disabled || processing || recording || !text.trim()) && styles.disabled]}><Text style={styles.sendText}>{zh ? '确认发送 ↑' : 'Send message ↑'}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  box: { backgroundColor: theme.paper, borderRadius: 22, padding: 16, gap: 12 },
  label: { color: theme.ink, fontSize: 17, fontWeight: '600' },
  mic: { backgroundColor: theme.lilac, borderRadius: 78, width: 154, height: 154, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: 6 },
  recording: { backgroundColor: '#F6DBE1' },
  micText: { color: theme.violet, fontSize: 34 },
  micIcon: { width: 40, height: 48, alignItems: 'center' },
  micCapsule: { width: 18, height: 28, borderRadius: 10, backgroundColor: theme.violet },
  micCradle: { position: 'absolute', top: 13, width: 32, height: 25, borderWidth: 3, borderTopWidth: 0, borderColor: theme.violet, borderBottomLeftRadius: 17, borderBottomRightRadius: 17 },
  micStem: { position: 'absolute', top: 36, width: 3, height: 8, backgroundColor: theme.violet },
  micFoot: { position: 'absolute', bottom: 2, width: 20, height: 3, borderRadius: 2, backgroundColor: theme.violet },
  micCaption: { color: theme.ink, fontSize: 15, fontWeight: '600' },
  hint: { color: theme.muted, fontSize: 12, lineHeight: 18 },
  input: { minHeight: 78, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.line, color: theme.ink, fontSize: 16, textAlignVertical: 'top' },
  send: { backgroundColor: theme.violet, borderRadius: 14, padding: 14, alignItems: 'center' },
  sendText: { color: theme.background, fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.45 },
  error: { color: theme.danger, fontSize: 13, lineHeight: 19 },
});
