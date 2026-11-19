import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as Speech from 'expo-speech';
import { LANGUAGE_KEY, MobileApiError, MobileClient } from './src/client';
import type { Language, MobileAction, ScreenProps, Workspace } from './src/types';
import { theme } from './src/theme';
import StudioScreen from './src/screens/StudioScreen';
import TeamScreen from './src/screens/TeamScreen';
import FundsScreen from './src/screens/FundsScreen';

export default function App() {
  const [language, setLanguage] = useState<Language>('zh-CN');
  const [client, setClient] = useState<MobileClient | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState<'studio' | 'team' | 'funds'>('studio');
  const [baseUrl, setBaseUrl] = useState(process.env.EXPO_PUBLIC_API_BASE_URL || '');
  const [pairCode, setPairCode] = useState('');
  const zh = language === 'zh-CN';

  useEffect(() => {
    let active = true;
    void (async () => {
      const storedLanguage = await SecureStore.getItemAsync(LANGUAGE_KEY);
      const nextLanguage: Language = storedLanguage === 'en-US' ? 'en-US' : 'zh-CN';
      const saved = await MobileClient.restore(nextLanguage);
      if (!active) return;
      setLanguage(nextLanguage);
      if (saved) {
        setBaseUrl(saved.connection.baseUrl);
        try {
          const state = await saved.state();
          if (active) { setClient(saved); setWorkspace(state); }
        } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : String(failure)); }
      }
      if (active) setLoading(false);
    })().catch(failure => { if (active) { setError(String(failure)); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function acceptLink(url: string | null | undefined) {
      if (!url?.startsWith('morrowfolio://pair')) return;
      try {
        const link = new URL(url);
        const base = link.searchParams.get('base');
        const code = link.searchParams.get('code');
        if (base) setBaseUrl(base);
        if (code) setPairCode(code);
      } catch { /* Invalid links leave the manual pairing form available. */ }
    }
    void Linking.getInitialURL().then(acceptLink);
    const subscription = Linking.addEventListener('url', ({ url }) => acceptLink(url));
    return () => subscription.remove();
  }, []);

  async function changeLanguage() {
    const next: Language = zh ? 'en-US' : 'zh-CN';
    setLanguage(next);
    if (client) client.language = next;
    try { await SecureStore.setItemAsync(LANGUAGE_KEY, next); }
    catch { setError(next === 'zh-CN' ? '语言已切换，系统暂未保存这个偏好。' : 'Language switched. The system could not save this preference.'); }
    Speech.stop();
  }

  async function report(failure: unknown) {
    setError(failure instanceof Error ? failure.message : String(failure));
    if (failure instanceof MobileApiError && failure.status === 401) {
      setClient(null);
      setPairCode('');
      try { await client?.disconnect(); } catch { /* The local session is already isolated even if secure storage is unavailable. */ }
    }
  }

  async function disconnect() {
    const previous = client;
    setClient(null);
    setPairCode('');
    try { await previous?.disconnect(); }
    catch { setError(zh ? '已断开当前连接。系统暂未删除保存的会话，请重新配对。' : 'Disconnected. Secure storage could not remove the saved session. Pair again to continue.'); }
    Speech.stop();
  }

  async function pair() {
    setBusy(true);
    setError('');
    try {
      const next = await MobileClient.pair(baseUrl, pairCode, language);
      const state = await next.state();
      setClient(next);
      setWorkspace(state);
      setPairCode('');
    } catch (failure) { await report(failure); }
    finally { setBusy(false); }
  }

  async function act(action: MobileAction) {
    if (!client) throw new Error(zh ? '请先配对电脑。' : 'Pair your computer first.');
    setBusy(true);
    setError('');
    try {
      const next = await client.action(action);
      setWorkspace(next);
      return next;
    } catch (failure) { await report(failure); throw failure; }
    finally { setBusy(false); }
  }

  async function refresh() {
    if (!client) return;
    setBusy(true);
    try { setWorkspace(await client.state()); setError(''); }
    catch (failure) { await report(failure); }
    finally { setBusy(false); }
  }

  async function transcribe(uri: string, mimeType: string) {
    if (!client) throw new Error(zh ? '请先配对电脑。' : 'Pair your computer first.');
    try { return await client.transcribe(uri, mimeType); }
    catch (failure) { await report(failure); throw failure; }
  }

  const pairing = <KeyboardAvoidingView style={styles.pairKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.pairPanel} keyboardShouldPersistTaps="handled">
    <Text style={styles.wordmark}>Morrowfolio</Text>
    <Text style={styles.title}>{zh ? '把你的基金团队带在身边。' : 'Your fund team, wherever you are.'}</Text>
    <Text style={styles.copy}>{zh ? '在电脑启动手机连接，输入五分钟内有效的一次性配对码。AI 密钥留在电脑。' : 'Start mobile pairing on your computer and enter its one-time code within five minutes. AI keys stay on the computer.'}</Text>
    <Text style={styles.label}>{zh ? '后端地址' : 'Backend URL'}</Text>
    <TextInput accessibilityLabel="Backend URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…" placeholderTextColor={theme.muted} style={styles.input} />
    <Text style={styles.label}>{zh ? '一次性配对码' : 'One-time pairing code'}</Text>
    <TextInput accessibilityLabel="Pairing code" value={pairCode} onChangeText={setPairCode} autoCapitalize="none" autoCorrect={false} secureTextEntry style={styles.input} />
    <Pressable accessibilityRole="button" disabled={busy || !pairCode.trim()} onPress={() => { void pair(); }} style={[styles.primary, (busy || !pairCode.trim()) && styles.disabled]}>
      <Text style={styles.primaryText}>{busy ? (zh ? '正在连接…' : 'Connecting…') : (zh ? '配对并打开工作室' : 'Pair and open studio')}</Text>
    </Pressable>
    <Text style={styles.hint}>{zh ? 'iPhone 和 iPad 需要可访问的私人 HTTPS 后端地址。电脑上的 localhost 地址不能用作手机连接。' : 'Use a private HTTPS backend reachable from this iPhone or iPad. Your computer’s localhost address is not reachable from your phone.'}</Text>
    <Pressable accessibilityRole="button" onPress={() => { void changeLanguage(); }}><Text style={styles.language}>{zh ? 'Switch to English' : '切换到中文'}</Text></Pressable>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </ScrollView></KeyboardAvoidingView>;

  let content: React.ReactNode = loading ? <ActivityIndicator color={theme.violet} size="large" /> : pairing;
  if (workspace) {
    const props: ScreenProps = { workspace, language, busy: busy || !client, act, refresh, transcribe,
      speak: text => { Speech.stop(); Speech.speak(text, { language, rate: 0.95 }); } };
    content = <View style={styles.application}>
      <View style={styles.header}><Text style={styles.brand}>Morrowfolio</Text><Pressable onPress={() => { void changeLanguage(); }} accessibilityRole="button"><Text style={styles.language}>{zh ? '中文 / EN' : 'EN / 中文'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { void disconnect(); }}><Text style={styles.disconnect}>{zh ? '断开' : 'Disconnect'}</Text></Pressable></View>
      {error ? <Pressable onPress={() => setError('')} style={styles.errorBanner}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></Pressable> : null}
      <View style={styles.screen}>{screen === 'studio' ? <StudioScreen {...props} /> : screen === 'team' ? <TeamScreen {...props} /> : <FundsScreen {...props} />}</View>
      <View style={styles.tabs}>{([['studio', zh ? '工作室' : 'Studio'], ['team', zh ? '团队' : 'Team'], ['funds', zh ? '基金广场' : 'Funds']] as const).map(([id, name]) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: screen === id }} onPress={() => setScreen(id)} style={[styles.tab, screen === id && styles.activeTab]}><Text style={[styles.tabText, screen === id && styles.activeTabText]}>{name}</Text></Pressable>)}</View>
      <Modal visible={!client} transparent animationType="fade"><SafeAreaView style={styles.modal}>{pairing}</SafeAreaView></Modal>
    </View>;
  }
  return <SafeAreaProvider><SafeAreaView style={styles.safe}><StatusBar style="light" />{content}</SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  application: { flex: 1 }, screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: theme.line },
  brand: { flex: 1, color: theme.ink, fontWeight: '700', fontSize: 20 },
  wordmark: { color: theme.violet, fontWeight: '700', fontSize: 20, marginBottom: 22 },
  pairKeyboard: { flex: 1 },
  pairPanel: { padding: 28, gap: 12, flexGrow: 1, justifyContent: 'center', backgroundColor: theme.background },
  title: { color: theme.ink, fontSize: 30, fontWeight: '600', lineHeight: 40 },
  copy: { color: theme.muted, fontSize: 15, lineHeight: 23, marginBottom: 12 },
  label: { color: theme.ink, fontSize: 13, fontWeight: '600' },
  input: { padding: 14, borderWidth: 1, borderColor: theme.line, borderRadius: 14, backgroundColor: theme.paper, color: theme.ink, fontSize: 16 },
  primary: { padding: 16, backgroundColor: theme.violet, borderRadius: 15, alignItems: 'center', marginTop: 5 },
  primaryText: { color: theme.background, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  hint: { color: theme.muted, fontSize: 12, lineHeight: 19 },
  language: { color: theme.violet, fontWeight: '600', paddingVertical: 8 },
  disconnect: { color: theme.muted, fontSize: 12 },
  error: { color: theme.danger, fontSize: 13, lineHeight: 20 },
  errorBanner: { paddingHorizontal: 18, paddingVertical: 9, backgroundColor: '#FAE7EB' },
  tabs: { flexDirection: 'row', padding: 10, gap: 8, backgroundColor: theme.paper, borderTopWidth: 1, borderTopColor: theme.line },
  tab: { flex: 1, alignItems: 'center', padding: 13, borderRadius: 15 },
  activeTab: { backgroundColor: theme.lilac },
  tabText: { color: theme.muted, fontWeight: '600' },
  activeTabText: { color: theme.violet },
  modal: { flex: 1, backgroundColor: theme.background },
});
