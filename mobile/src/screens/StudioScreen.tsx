import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { ScreenProps } from '../types';
import VoiceComposer from '../VoiceComposer';
import { candidateMember, roleName, studio, studioCopy, studioMoney } from '../studio-theme';
import { ChatHistory, Portrait, ReviewReceipt, SectionTitle, StudioButton, StudioRoom } from '../components/studio-ui';

export default function StudioScreen({ workspace, language, busy, act, transcribe, speak }: ScreenProps) {
  const c = (zh: string, en: string) => studioCopy(language, zh, en);
  const fund = workspace.fund;
  const guide = workspace.guide;
  const [newStudio, setNewStudio] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [roomVisible, setRoomVisible] = useState(false);
  const [proVisible, setProVisible] = useState(false);
  const [mandate, setMandate] = useState(fund?.mandate ?? '');
  const [cap, setCap] = useState(String(fund?.maxWeightPercent ?? 12));
  const [proMode, setProMode] = useState<'committee' | 'harnessrouter' | 'replay'>('committee');
  const [localError, setLocalError] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [revising, setRevising] = useState(false);
  const placeholder = fund?.name === 'My First Fund' && workspace.funds.length === 1 && !fund.runs.length && !fund.chat.length;
  const onboarding = newStudio || guide.phase === 'ready' || (guide.phase !== 'created' && placeholder);
  const ready = onboarding && guide.phase === 'ready' && Boolean(guide.draft);
  const selected = fund?.team.find(member => member.id === selectedId && member.desk !== 'bench')
    ?? fund?.team.find(member => member.role === 'manager' && member.desk !== 'bench')
    ?? fund?.team.find(member => member.desk !== 'bench');
  const connected = Boolean(workspace.provider.chatEnabled);
  const dimensions = useWindowDimensions();
  const tablet = dimensions.width / dimensions.fontScale >= 720;

  useEffect(() => {
    setSelectedId(undefined);
    setMandate(fund?.mandate ?? '');
    setCap(String(fund?.maxWeightPercent ?? 12));
    setProVisible(false);
  }, [fund?.id]);
  useEffect(() => { setRevising(false); }, [guide.draft?.id]);

  async function confirmTeam() {
    if (!guide.draft) return;
    try { await act({ action: 'confirmFundDraft', draftId: guide.draft.id }); setNewStudio(false); }
    catch { /* App displays the server error. The same blueprint remains reviewable. */ }
  }

  async function startNew() {
    try { await act({ action: 'resetDesignConversation', language }); setNewStudio(true); }
    catch { /* The current studio remains in place when reset fails. */ }
  }

  async function review() {
    setReviewing(true);
    try { await act({ action: 'runScenario', fundId: fund.id, scenarioId: fund.scenarioId, provider: workspace.provider.committeeEnabled ? 'committee' : 'harnessrouter' }); }
    catch { /* App keeps the order failure visible without inventing an outcome. */ }
    finally { setReviewing(false); }
  }

  async function savePro(run = false) {
    const limit = Number(cap);
    if (!mandate.trim() || !Number.isFinite(limit) || limit < 0 || limit > 100) {
      setLocalError(true);
      return;
    }
    setLocalError(false);
    try { await act({ action: run ? 'runScenario' : 'updateFund', fundId: fund.id, mandate, maxWeightPercent: limit, ...(run ? { provider: proMode } : {}) }); }
    catch { /* App reports the API failure; edited fields stay intact. */ }
  }

  const guideMessages = guide.messages.map(message => message.id === 'welcome' ? {
    ...message,
    text: c('你好，我是 Maya。你想让这家模拟基金投资什么，或者一起研究什么想法？', 'I’m Maya. What would you like this paper fund to invest in, or what idea should we explore?'),
  } : message);

  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {onboarding ? <View style={[styles.onboardingLayout, tablet && styles.tabletLayout]}><View style={[styles.narrative, tablet && styles.tabletHalf]}>
        <View style={styles.managerIntro}><Portrait id="maya-chen" size={64} /><View><Text style={styles.managerName}>Maya Chen <Text style={styles.online}>●</Text></Text><Text style={styles.managerRole}>{c('你的基金经理', 'Your portfolio manager')}</Text></View></View>
        <SectionTitle eyebrow={c('从你的想法开始', 'LET’S START WITH YOUR IDEA')} title={ready ? c('你的团队，准备好了。', 'Your team is taking shape.') : c('说一个想法，\n我们一起把它做出来。', 'Tell us your idea.\nWe’ll build it together.')} />
        <View style={styles.conversation}><ChatHistory messages={guideMessages} language={language} speak={speak} /></View>
        </View><View style={[styles.narrative, tablet && styles.tabletHalf]}>
        {ready && guide.draft ? <View style={styles.blueprint}>
          <Text style={styles.eyebrow}>{c('团队蓝图', 'TEAM BLUEPRINT')}</Text><Text accessibilityRole="header" style={styles.blueprintTitle}>{guide.draft.name}</Text>
          <Text style={styles.copy}>{c('经理、研究、组合、风控和执行各司其职。确认后，他们将加入你的独立模拟基金。', 'Management, research, allocation, risk and execution work together. Confirm to open your separate paper fund.')}</Text>
          <View style={styles.blueprintRoster}>{guide.draft.roster.map(seat => {
            const member = candidateMember(seat.id, seat.duty);
            return <View key={member.id} style={styles.blueprintMember}><Portrait id={member.id} size={39} /><View style={styles.flex}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberRole}>{roleName(member.role, language)}</Text></View></View>;
          })}</View>
          <View style={styles.authorization}><Text style={styles.authorizationTitle}>{c('确认前，先看授权', 'Review the authorization')}</Text><Text style={styles.copy}>{guide.draft.authorizationSummary}</Text><Text style={styles.copy}>{c('单一持仓上限', 'Single-position cap')} {guide.draft.maxWeightPercent}%</Text></View>
          <StudioButton title={c('确认蓝图，雇用团队 ↗', 'Confirm blueprint & hire team ↗')} disabled={busy} onPress={() => { void confirmTeam(); }} />
          <Text style={styles.hint}>{c('只有确认后才创建基金。此处使用模拟资金。', 'The fund is created only after confirmation. Funds are simulated.')}</Text>
          <StudioButton title={revising ? c('收起修改', 'Close revision') : c('再聊一句，修改蓝图', 'Talk through a change')} secondary onPress={() => setRevising(value => !value)} />
          {revising ? <VoiceComposer language={language} disabled={busy || !connected} transcribe={transcribe}
            placeholder={c('告诉 Maya 想调整哪里…', 'Tell Maya what you would like to change…')}
            onSend={message => act({ action: 'designConversation', message, provider: 'harnessrouter', language })} /> : null}
        </View> : <VoiceComposer language={language} disabled={busy || !connected} transcribe={transcribe}
          placeholder={c('你的话会显示在这里，可以修改后发送。', 'Your words appear here. Edit before sending.')}
          onSend={message => act({ action: 'designConversation', message, provider: 'harnessrouter', language })} />}
        {!connected ? <Text accessibilityRole="alert" style={styles.connectionNote}>{c('AI 经理尚未连接。请在电脑上检查 HarnessRouter 配置后刷新。', 'The AI manager is not connected. Check HarnessRouter setup on the computer, then refresh.')}</Text> : null}
      </View></View> : <>
        <View style={styles.fundHeader}><View style={styles.flex}><Text style={styles.eyebrow}>{c('我的工作室', 'MY STUDIO')}</Text><Text accessibilityRole="header" style={styles.fundName}>{fund.name}</Text></View><View><Text style={styles.balanceLabel}>{c('模拟组合', 'Paper portfolio')}</Text><Text style={styles.balance}>{studioMoney(fund.portfolio.equity, language)}</Text></View></View>
        <View style={styles.toolbar}><Pressable accessibilityRole="button" onPress={() => { void startNew(); }} disabled={busy}><Text style={styles.link}>{c('新建工作室 +', 'New studio +')}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setProVisible(value => !value)} accessibilityState={{ expanded: proVisible }}><Text style={styles.link}>{c('专业模式', 'Pro mode')} {proVisible ? '−' : '+'}</Text></Pressable></View>
        <View style={[styles.onboardingLayout, tablet && styles.tabletLayout]}><View style={[styles.narrative, tablet && styles.tabletHalf]}>
        {selected ? <View style={styles.conversation}>
          <View style={styles.selectedHeader}><Portrait id={selected.id} size={50} /><View style={styles.flex}><Text style={styles.managerName}>{selected.name}</Text><Text style={styles.managerRole}>{roleName(selected.role, language)} · {c('在岗', 'At the desk')}</Text></View></View>
          <ChatHistory messages={fund.chat} language={language} speak={speak} empty={c('工作室准备好了。说说你的想法，或者召集团队做第一次模拟审议。', 'Your studio is ready. Talk through an idea or bring the team together for a paper review.')} />
          <VoiceComposer language={language} disabled={busy || !connected} transcribe={transcribe}
            placeholder={c(`问问 ${selected.name.split(' ')[0]}…`, `Ask ${selected.name.split(' ')[0]}…`)}
            onSend={message => act({ action: 'sendChat', fundId: fund.id, memberId: selected.id, message, provider: 'harnessrouter', language })} />
        </View> : null}
        <StudioButton title={reviewing ? c('团队正在审议…', 'Your team is reviewing…') : c('召集团队，模拟审议 ✦', 'Review with my team ✦')} disabled={busy || !connected} onPress={() => { void review(); }} />
        <Text style={styles.hint}>{c('合成市场情景 · 独立风控 · 模拟成交', 'Synthetic market scenario · Independent policy · Paper fills')}</Text>
        {fund.runs[0] ? <ReviewReceipt run={fund.runs[0]} language={language} /> : null}
        </View><View style={[styles.narrative, tablet && styles.tabletHalf]}>
        {tablet ? <SectionTitle title={c('我的团队房间', 'My team studio')} /> : <Pressable style={styles.roomToggle} accessibilityRole="button" accessibilityState={{ expanded: roomVisible }} onPress={() => setRoomVisible(value => !value)}><Text style={styles.roomToggleText}>{c('我的团队房间', 'My team studio')} <Text style={styles.link}>{roomVisible ? '−' : '+'}</Text></Text><Text style={styles.hint}>{c('点选一位成员，切换对话对象', 'Choose a teammate to switch conversations')}</Text></Pressable>}
        {roomVisible || tablet ? <StudioRoom team={fund.team} language={language} selectedId={selected?.id} onSelect={setSelectedId} /> : null}
        </View></View>
        {proVisible ? <View style={styles.pro}>
          <SectionTitle eyebrow={c('专业设置', 'PROFESSIONAL CONTROLS')} title={c('让规则明确可见。', 'Make the rules explicit.')} />
          <Text style={styles.label}>{c('投资授权', 'Investment mandate')}</Text><TextInput accessibilityLabel={c('投资授权', 'Investment mandate')} multiline value={mandate} onChangeText={setMandate} style={[styles.input, styles.multiline]} />
          <Text style={styles.label}>{c('单一持仓上限（%）', 'Single-position cap (%)')}</Text><TextInput accessibilityLabel={c('单一持仓上限', 'Single-position cap')} value={cap} onChangeText={setCap} keyboardType="decimal-pad" style={styles.input} />
          <StudioButton title={c('保存授权', 'Save mandate')} disabled={busy} secondary onPress={() => { void savePro(); }} />
          <Text style={styles.label}>{c('显式选择专业审议模式', 'Explicit professional review mode')}</Text>
          {(['committee', 'harnessrouter', 'replay'] as const).map(mode => <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ checked: proMode === mode }} onPress={() => setProMode(mode)} style={[styles.mode, proMode === mode && styles.modeActive]}><Text style={styles.modeText}>{proMode === mode ? '● ' : '○ '}{mode === 'committee' ? c('AI 投委会', 'AI committee') : mode === 'harnessrouter' ? c('HarnessRouter 经理', 'HarnessRouter manager') : c('离线示例回放', 'Offline example replay')}</Text></Pressable>)}
          <StudioButton title={c('按此模式运行一次', 'Run this mode once')} disabled={busy} secondary onPress={() => { void savePro(true); }} />
          {localError ? <Text accessibilityRole="alert" style={styles.error}>{c('请填写授权，并把持仓上限设为 0–100%。', 'Enter a mandate and a position cap between 0% and 100%.')}</Text> : null}
        </View> : null}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: studio.background }, page: { padding: 20, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 1120, alignSelf: 'center' }, onboardingLayout: { gap: 18 }, narrative: { gap: 16, minWidth: 0 }, tabletLayout: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 }, tabletHalf: { flex: 1 }, flex: { flex: 1 }, managerIntro: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8, marginBottom: 5 }, managerName: { color: studio.ink, fontSize: 17, fontWeight: '600' }, online: { color: studio.mint, fontSize: 9 }, managerRole: { color: studio.muted, fontSize: 11, marginTop: 5 }, conversation: { padding: 17, gap: 16, borderWidth: 1, borderColor: studio.border, borderRadius: 18, backgroundColor: studio.panel },
  blueprint: { padding: 18, gap: 15, backgroundColor: studio.panel, borderWidth: 1, borderColor: '#C6B4FF38', borderRadius: 18 }, eyebrow: { color: studio.subtle, fontSize: 10, fontWeight: '600', letterSpacing: 1.5 }, blueprintTitle: { color: studio.ink, fontWeight: '600', fontSize: 24, lineHeight: 31 }, copy: { color: '#BCAFCC', fontSize: 12, lineHeight: 21 }, blueprintRoster: { gap: 0 }, blueprintMember: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, borderTopWidth: 1, borderColor: '#FFFFFF0A' }, memberName: { color: studio.ink, fontSize: 13, fontWeight: '600' }, memberRole: { color: studio.subtle, fontSize: 10, marginTop: 4 }, authorization: { padding: 13, borderRadius: 10, backgroundColor: '#C6B4FF08', gap: 7 }, authorizationTitle: { color: '#D2BDF0', fontSize: 12, fontWeight: '600' }, hint: { color: studio.subtle, fontSize: 10, lineHeight: 17 }, connectionNote: { color: '#D6BAEA', fontSize: 12, lineHeight: 21, borderLeftWidth: 2, borderColor: studio.purple, paddingLeft: 11 },
  fundHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 }, fundName: { color: studio.ink, fontSize: 25, fontWeight: '600', marginTop: 5, lineHeight: 33 }, balanceLabel: { color: studio.subtle, fontSize: 10, textAlign: 'right' }, balance: { color: studio.ink, fontSize: 19, fontWeight: '600', marginTop: 5 }, toolbar: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 2 }, link: { minHeight: 44, textAlignVertical: 'center', color: '#AE95D0', fontSize: 11, paddingVertical: 5 }, selectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderColor: '#FFFFFF0C' }, roomToggle: { borderTopWidth: 1, borderColor: studio.border, paddingTop: 15, gap: 5 }, roomToggleText: { color: studio.ink, fontSize: 17, fontWeight: '500' }, pro: { padding: 17, gap: 11, borderWidth: 1, borderColor: studio.border, borderRadius: 17, backgroundColor: studio.panel }, label: { color: '#B5A4C8', fontSize: 12, marginTop: 4 }, input: { color: studio.ink, fontSize: 16, padding: 13, backgroundColor: '#111021', borderWidth: 1, borderColor: studio.border, borderRadius: 10 }, multiline: { minHeight: 110, textAlignVertical: 'top' }, mode: { padding: 12, borderRadius: 9, borderWidth: 1, borderColor: studio.border }, modeActive: { borderColor: '#C6B4FF70', backgroundColor: '#C6B4FF0C' }, modeText: { color: '#C6B2DB', fontSize: 12 }, error: { color: studio.danger, fontSize: 12, lineHeight: 20 },
});
