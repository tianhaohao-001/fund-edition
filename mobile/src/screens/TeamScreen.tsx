import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import VoiceComposer from '../VoiceComposer';
import type { Member, ScreenProps } from '../types';
import { PEOPLE, roleName, studio, studioCopy } from '../studio-theme';
import { ChatHistory, Portrait, SectionTitle, StudioButton, StudioRoom } from '../components/studio-ui';

const desks = [
  { id: 'management', zh: '管理', en: 'Management' }, { id: 'research', zh: '研究', en: 'Research' },
  { id: 'risk', zh: '风控', en: 'Risk' }, { id: 'execution', zh: '执行', en: 'Execution' }, { id: 'bench', zh: '候补', en: 'Bench' },
];

export default function TeamScreen({ workspace, language, busy, act, transcribe, speak }: ScreenProps) {
  const c = (zh: string, en: string) => studioCopy(language, zh, en);
  const fund = workspace.fund;
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [recruiting, setRecruiting] = useState(false);
  const [details, setDetails] = useState(false);
  const [duty, setDuty] = useState('');
  const selected = fund.team.find(member => member.id === selectedId) ?? fund.team.find(member => member.role === 'manager') ?? fund.team[0];
  const available = PEOPLE.filter(candidate => !fund.team.some(member => member.id === candidate.id));
  const unconfirmed = workspace.guide.phase !== 'created' && fund.name === 'My First Fund' && workspace.funds.length === 1 && !fund.runs.length && !fund.chat.length;
  const atDesk = selected?.desk !== 'bench';

  useEffect(() => { setSelectedId(undefined); setRecruiting(false); setDetails(false); }, [fund.id]);
  useEffect(() => { setDuty(selected?.duty ?? ''); }, [selected?.id]);

  async function hire(id: string) {
    try { await act({ action: 'hireMember', fundId: fund.id, memberId: id }); setSelectedId(id); setRecruiting(false); }
    catch { /* The candidate stays available and App displays the failure. */ }
  }

  async function assign(desk: string) {
    if (!selected) return;
    try { await act({ action: 'updateMember', fundId: fund.id, memberId: selected.id, desk }); }
    catch { /* The previous desk stays selected after a failed assignment. */ }
  }

  async function saveDuty() {
    if (!selected || !duty.trim()) return;
    try { await act({ action: 'updateMember', fundId: fund.id, memberId: selected.id, duty: duty.trim() }); }
    catch { /* The edited responsibility remains in the native input. */ }
  }

  async function remove(member: Member) {
    if (member.role === 'manager') return;
    try { await act({ action: 'removeMember', fundId: fund.id, memberId: member.id }); setSelectedId(undefined); }
    catch { /* App keeps the removal failure visible. */ }
  }

  if (unconfirmed) return <View style={styles.waiting}><Portrait id="maya-chen" size={84} /><Text style={styles.waitingTitle}>{c('你的团队在等一个方向。', 'Your team is waiting for an idea.')}</Text><Text style={styles.copy}>{c('先在工作室和 Maya 聊聊，确认蓝图后，团队才会入驻。', 'Talk with Maya in Studio first. Your team moves in after you confirm its blueprint.')}</Text></View>;

  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <SectionTitle eyebrow={fund.name} title={c('让想法有不同的声音。', 'Give the idea different voices.')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roster}>
        {fund.team.map(member => <Pressable key={member.id} accessibilityRole="button" accessibilityState={{ selected: member.id === selected?.id }} accessibilityLabel={`${member.name}, ${roleName(member.role, language)}`} onPress={() => setSelectedId(member.id)} style={[styles.rosterPerson, selected?.id === member.id && styles.rosterSelected]}><Portrait id={member.id} size={45} /><Text style={styles.rosterName}>{member.name.split(' ')[0]}</Text><Text style={styles.rosterRole}>{member.desk === 'bench' ? c('候补', 'Bench') : roleName(member.role, language)}</Text></Pressable>)}
      </ScrollView>
      {selected ? <View style={styles.conversation}>
        <View style={styles.personHeader}><Portrait id={selected.id} size={54} /><View style={styles.flex}><Text style={styles.personName}>{selected.name}</Text><Text style={styles.personRole}>{roleName(selected.role, language)} · {atDesk ? c('在岗', 'At the desk') : c('候补', 'On the bench')}</Text></View></View>
        {atDesk ? <>
          <ChatHistory messages={fund.chat} language={language} speak={speak} empty={c('你想一起讨论什么？点击麦克风，我们来看看。', 'What would you like to work through? Tap the microphone and let’s look at it.')} />
          <VoiceComposer key={selected.id} language={language} disabled={busy || !workspace.provider.chatEnabled} transcribe={transcribe}
            placeholder={c(`问问 ${selected.name.split(' ')[0]}…`, `Ask ${selected.name.split(' ')[0]}…`)}
            onSend={message => act({ action: 'sendChat', fundId: fund.id, memberId: selected.id, message, provider: 'harnessrouter', language })} />
        </> : <Text style={styles.copy}>{c('这位成员尚未在岗。先任命一个工作台，再开始讨论。', 'This teammate is on the bench. Assign a desk before starting a conversation.')}</Text>}
        <Text style={styles.hint}>{c('讨论形成建议，基金授权仍由你确认。', 'Discussion creates suggestions. You approve fund authorization.')}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(value => !value)} style={styles.detailsToggle}><Text style={styles.link}>{c('职责与工作台', 'Responsibilities and desk')} {details ? '−' : '+'}</Text></Pressable>
        {details ? <View style={styles.details}>
          <Text style={styles.label}>{c(`${selected.name.split(' ')[0]} 应该关注什么？`, `What should ${selected.name.split(' ')[0]} focus on?`)}</Text>
          <TextInput accessibilityLabel={c('成员职责', 'Teammate responsibilities')} value={duty} onChangeText={setDuty} multiline style={styles.duty} maxLength={500} editable={!busy} />
          <StudioButton title={c('保存职责', 'Save responsibilities')} secondary disabled={busy || !duty.trim()} onPress={() => { void saveDuty(); }} />
          <Text style={styles.label}>{c('任命工作台', 'Assign a desk')}</Text><View style={styles.desks}>{desks.map(desk => <Pressable key={desk.id} accessibilityRole="radio" accessibilityState={{ checked: selected.desk === desk.id, disabled: busy }} disabled={busy} onPress={() => { void assign(desk.id); }} style={[styles.desk, selected.desk === desk.id && styles.deskSelected]}><Text style={[styles.deskText, selected.desk === desk.id && styles.deskTextSelected]}>{c(desk.zh, desk.en)}</Text></Pressable>)}</View>
          {selected.role !== 'manager' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void remove(selected); }} style={styles.remove}><Text style={styles.removeText}>{c('移出团队', 'Remove teammate')}</Text></Pressable> : null}
        </View> : null}
      </View> : null}
      <StudioButton title={recruiting ? c('收起招募', 'Close recruiting') : c('给团队增加一种视角 +', 'Recruit another perspective +')} secondary onPress={() => setRecruiting(value => !value)} />
      {recruiting ? <View style={styles.recruit}>
        {available.map(candidate => <View key={candidate.id} style={styles.candidate}><Portrait id={candidate.id} size={48} /><View style={styles.flex}><Text style={styles.candidateRole}>{roleName(candidate.role, language)}</Text><Text style={styles.candidateName}>{candidate.name}</Text><Text style={styles.candidateFocus}>{c(candidate.focusZh, candidate.focusEn)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={c(`雇用 ${candidate.name}`, `Hire ${candidate.name}`)} disabled={busy} onPress={() => { void hire(candidate.id); }} style={styles.hire}><Text style={styles.hireText}>{c('雇用', 'Hire')} +</Text></Pressable></View>)}
        {!available.length ? <Text style={styles.copy}>{c('所有可用成员都已加入团队。', 'Every available teammate has joined your fund.')}</Text> : null}
      </View> : null}
      <StudioRoom team={fund.team} language={language} selectedId={selected?.id} onSelect={setSelectedId} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: studio.background }, page: { padding: 20, paddingBottom: 32, gap: 17 }, flex: { flex: 1 }, waiting: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 19, backgroundColor: studio.background }, waitingTitle: { color: studio.ink, fontSize: 27, fontWeight: '600', lineHeight: 35, textAlign: 'center' }, copy: { color: studio.muted, fontSize: 13, lineHeight: 22 },
  roster: { gap: 8, paddingBottom: 3 }, rosterPerson: { width: 80, padding: 8, borderWidth: 1, borderColor: '#FFFFFF0B', borderRadius: 12, backgroundColor: '#FFFFFF03', alignItems: 'center', gap: 5 }, rosterSelected: { borderColor: '#C6B4FF70', backgroundColor: '#C6B4FF0B' }, rosterName: { color: '#DDCFEB', fontSize: 11, fontWeight: '600', marginTop: 3 }, rosterRole: { color: '#8D789F', fontSize: 8, textAlign: 'center' },
  conversation: { padding: 17, borderRadius: 18, backgroundColor: studio.panel, borderWidth: 1, borderColor: studio.border, gap: 16 }, personHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 13, borderBottomWidth: 1, borderColor: '#FFFFFF0B' }, personName: { color: studio.ink, fontSize: 20, fontWeight: '600' }, personRole: { color: studio.muted, fontSize: 11, marginTop: 5 }, hint: { color: studio.subtle, fontSize: 10, lineHeight: 17 }, detailsToggle: { minHeight: 44, justifyContent: 'center', borderTopWidth: 1, borderColor: studio.border, paddingTop: 14 }, link: { color: '#B09BCD', fontSize: 12 }, details: { gap: 12 }, label: { color: '#B6A4CA', fontSize: 12 }, duty: { minHeight: 115, backgroundColor: '#111021', borderWidth: 1, borderColor: studio.border, borderRadius: 10, padding: 12, color: studio.ink, fontSize: 16, lineHeight: 23, textAlignVertical: 'top' }, desks: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' }, desk: { minHeight: 44, justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: studio.border, borderRadius: 9 }, deskSelected: { borderColor: '#C6B4FF75', backgroundColor: '#C6B4FF13' }, deskText: { color: '#8E7CA2', fontSize: 11 }, deskTextSelected: { color: '#D5C1EE' }, remove: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 11 }, removeText: { color: '#C196A5', fontSize: 11 },
  recruit: { borderWidth: 1, borderColor: studio.border, borderRadius: 14, padding: 13, gap: 7, backgroundColor: studio.panel }, candidate: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderColor: '#FFFFFF0A' }, candidateRole: { color: '#9F85BB', fontSize: 9 }, candidateName: { color: studio.ink, fontSize: 15, fontWeight: '600', marginVertical: 4 }, candidateFocus: { color: '#90809E', fontSize: 10, lineHeight: 16 }, hire: { minHeight: 44, justifyContent: 'center', padding: 10, borderWidth: 1, borderColor: '#C6B4FF50', borderRadius: 8 }, hireText: { color: studio.purple, fontSize: 11, fontWeight: '600' },
});
