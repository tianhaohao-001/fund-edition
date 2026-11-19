import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import StudioScreen from './src/screens/StudioScreen';
import TeamScreen from './src/screens/TeamScreen';
import FundsScreen from './src/screens/FundsScreen';
import type { CatalogEntry, Fund, Language, Member, MobileAction, Run, ScreenProps, Workspace } from './src/types';
import { PEOPLE, studio, studioCopy } from './src/studio-theme';
// These pure browser-compatible modules are preview fixtures, never native production dependencies.
import { evaluateRun } from '../core/engine.mjs';
import { CATALOG, catalogBacktest, catalogBuy, catalogSell } from '../core/catalog.mjs';
const simulate = evaluateRun as unknown as (input: Record<string, unknown>) => Run;

let sequence = 0;
const nextId = () => `preview-${++sequence}`;
const roster = (): Member[] => PEOPLE.slice(0, 5).map(person => ({ id: person.id, name: person.name, role: person.role, desk: person.desk, duty: person.focusEn }));
const cash = () => ({ cash: 10000, equity: 10000, positions: [] });
const placeholder: Fund = { id: 'preview-placeholder', name: 'My First Fund', mandate: 'Review long-term growth.', maxWeightPercent: 12, scenarioId: 'innovation-signal', team: roster().slice(0, 4), chat: [], runs: [], portfolio: cash(), permissions: { allowBuy: true, allowSell: true, allowedSymbols: [] } };
const initial: Workspace = {
  contractVersion: 'morrowfolio.native-component-preview.v1', provider: { enabled: true, chatEnabled: true, committeeEnabled: true, model: 'Preview service substitute' },
  fund: placeholder, funds: [placeholder], selectedFundId: placeholder.id,
  guide: { phase: 'discovery', draft: null, fundId: null, messages: [{ id: 'welcome', role: 'assistant', name: 'Maya', text: '你好，我是 Maya。你希望这家基金研究什么？', source: 'Component preview' }] },
  catalog: structuredClone(CATALOG) as unknown as CatalogEntry[], catalogChats: {}, catalogAccounts: {}, catalogBacktests: {}, scenarios: [{ id: 'innovation-signal', title: 'AI demand accelerates', symbol: 'NVDA', summary: 'Synthetic market scenario.' }],
};

export default function Preview() {
  const [workspace, setWorkspace] = useState<Workspace>(() => structuredClone(initial));
  const current = useRef(workspace);
  const [language, setLanguage] = useState<Language>('zh-CN');
  const [screen, setScreen] = useState<'studio' | 'team' | 'funds'>('studio');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = (zh: string, en: string) => studioCopy(language, zh, en);

  async function act(action: MobileAction) {
    setBusy(true); setError('');
    const next = structuredClone(current.current);
    try {
      if (action.action === 'resetDesignConversation') next.guide = structuredClone(initial.guide);
      else if (action.action === 'designConversation') {
        const first = next.guide.messages.filter(message => message.role === 'user').length === 0;
        next.guide.messages.push({ id: nextId(), role: 'user', text: String(action.message) });
        next.guide.messages.push({ id: nextId(), role: 'assistant', name: 'Maya', source: 'Component preview', text: first ? c('这个方向我记下了。你希望长期持有，还是先研究几个月？', 'I have the idea. Should the team think in long-term ownership or a few months?') : c('团队蓝图准备好了。确认前还可以继续讨论修改。', 'Your team blueprint is ready. You can discuss a change before hiring.') });
        if (!first) { next.guide.phase = 'ready'; next.guide.draft = { id: nextId(), name: c('晨光科技', 'Tomorrow Growth'), summary: 'Preview blueprint.', authorizationSummary: c('独立模拟基金，允许模拟买入和卖出，不授权真实订单。', 'A separate paper fund. Simulated buys and sells are allowed. No real orders are authorized.'), maxWeightPercent: 12, roster: roster().map(({ id, duty }) => ({ id, duty })) }; }
      } else if (action.action === 'confirmFundDraft') {
        if (!next.guide.draft || action.draftId !== next.guide.draft.id) throw new Error(c('蓝图已经改变。', 'The blueprint has changed.'));
        const fund: Fund = { ...structuredClone(placeholder), id: nextId(), name: next.guide.draft.name, team: roster(), portfolio: cash() };
        next.funds.push(fund); next.fund = fund; next.selectedFundId = fund.id; next.guide.phase = 'created'; next.guide.fundId = fund.id;
      } else if (action.action === 'sendChat') {
        const member = next.fund.team.find(person => person.id === action.memberId);
        if (!member) throw new Error(c('请选择在岗成员。', 'Choose a teammate.'));
        next.fund.chat.push({ id: nextId(), role: 'user', text: String(action.message) }, { id: nextId(), role: 'assistant', name: member.name, text: c('我会先检查证据与仓位限制。模拟审议会给出独立执行结果。', 'I would check evidence and position limits first. The paper review records an independent execution outcome.'), source: 'Component preview' });
      } else if (action.action === 'runScenario') {
        const result = simulate({ scenarioId: 'innovation-signal', mandate: next.fund.mandate, maxWeightPercent: next.fund.maxWeightPercent, portfolio: next.fund.portfolio, team: next.fund.team, permissions: next.fund.permissions });
        next.fund.runs.unshift({ ...result, id: nextId(), provider: 'Component preview' }); next.fund.portfolio = result.portfolio;
      } else if (action.action === 'updateFund') {
        if (typeof action.mandate === 'string') next.fund.mandate = action.mandate;
        if (typeof action.maxWeightPercent === 'number') next.fund.maxWeightPercent = action.maxWeightPercent;
      } else if (action.action === 'hireMember') {
        const person = PEOPLE.find(candidate => candidate.id === action.memberId);
        if (person && !next.fund.team.some(member => member.id === person.id)) next.fund.team.push({ id: person.id, name: person.name, role: person.role, desk: person.desk, duty: person.focusEn });
      } else if (action.action === 'updateMember') {
        const member = next.fund.team.find(person => person.id === action.memberId);
        if (member) { if (typeof action.duty === 'string') member.duty = action.duty; if (typeof action.desk === 'string') member.desk = action.desk; }
      } else if (action.action === 'removeMember') next.fund.team = next.fund.team.filter(member => member.id !== action.memberId || member.role === 'manager');
      else if (action.action === 'catalogChat') {
        const catalogId = String(action.catalogId);
        (next.catalogChats[catalogId] ||= []).push({ id: nextId(), role: 'user', text: String(action.message) }, { id: nextId(), role: 'assistant', name: 'Research manager', text: c('这是组件预览的服务替身回复。请从公开来源和假设理解这项研究。', 'This component preview uses a service substitute. Read the public sources and assumptions to understand the study.'), source: 'Component preview' });
      } else if (['catalogBacktest', 'catalogBuy', 'catalogSell'].includes(action.action)) {
        const catalogId = String(action.catalogId);
        if (action.action === 'catalogBacktest') next.catalogBacktests[catalogId] = catalogBacktest(catalogId);
        else next.catalogAccounts[catalogId] = action.action === 'catalogBuy' ? catalogBuy(next.catalogAccounts[catalogId], { catalogId, amount: Number(action.amount), requestId: nextId() }) : catalogSell(next.catalogAccounts[catalogId], { catalogId, requestId: nextId() });
      }
      next.funds = next.funds.map(fund => fund.id === next.fund.id ? next.fund : fund);
      current.current = next; setWorkspace(next); return next;
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); throw failure; }
    finally { setBusy(false); }
  }

  const props: ScreenProps = { workspace, language, busy, act, refresh: async () => {}, transcribe: async () => { throw new Error(c('组件预览不测试真实录音，请使用文字。', 'This preview does not test microphone capture. Use text.')); }, speak: text => { Speech.stop(); Speech.speak(text, { language }); } };
  return <SafeAreaProvider><SafeAreaView style={styles.safe}>
    <View style={styles.header}><Text style={styles.brand}>Morrowfolio</Text><View style={styles.languages}>{(['zh-CN', 'en-US'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: language === value }} onPress={() => { Speech.stop(); setLanguage(value); }} style={styles.language}><Text style={{ color: language === value ? studio.purple : studio.subtle }}>{value === 'zh-CN' ? '中文' : 'English'}</Text></Pressable>)}</View></View>
    <Text style={styles.previewNote}>{c('原生组件预览 · 服务替身 · 非设备验收', 'Native component preview · Service substitutes · Not a device test')}</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.body}>{screen === 'studio' ? <StudioScreen {...props} /> : screen === 'team' ? <TeamScreen {...props} /> : <FundsScreen {...props} />}</View>
    <View style={styles.tabs}>{([['studio', c('工作室', 'Studio')], ['team', c('团队', 'Team')], ['funds', c('基金广场', 'Funds')]] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: screen === key }} onPress={() => setScreen(key)} style={styles.tab}><Text style={{ color: screen === key ? studio.purple : studio.subtle, fontSize: 13, fontWeight: '600' }}>{label}</Text></Pressable>)}</View>
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: studio.background }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderColor: studio.border }, brand: { fontSize: 19, fontWeight: '700', color: studio.ink, letterSpacing: -0.5 }, languages: { flexDirection: 'row', gap: 8 }, language: { minHeight: 44, justifyContent: 'center' }, previewNote: { color: '#C3A169', backgroundColor: '#F2CC8010', textAlign: 'center', fontSize: 9, padding: 6 }, body: { flex: 1 }, tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: studio.border, padding: 8, backgroundColor: studio.panel }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46 }, error: { color: studio.danger, padding: 10, fontSize: 12 } });
