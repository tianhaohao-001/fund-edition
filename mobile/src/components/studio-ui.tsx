import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Language, Member, Message, Run } from '../types';
import { PEOPLE, roleName, studio, studioCopy, studioMoney } from '../studio-theme';

const portraits = require('./studio-portraits.png');

export function Portrait({ id, size = 48 }: { id: string; size?: number }) {
  const found = PEOPLE.findIndex(person => person.id === id);
  const index = Math.max(0, found);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 1, borderColor: '#C6B4FF55', backgroundColor: studio.elevated }}>
    <Image source={portraits} style={{ position: 'absolute', width: size * 4, height: size * 2, left: -(index % 4) * size, top: -Math.floor(index / 4) * size }} />
  </View>;
}

export function StudioButton({ title, onPress, disabled, secondary = false, label }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; label?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
  </Pressable>;
}

export function SectionTitle({ eyebrow, title, trailing }: { eyebrow?: string; title: string; trailing?: React.ReactNode }) {
  return <View style={styles.sectionTitle}><View style={{ flex: 1 }}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text accessibilityRole="header" style={styles.title}>{title}</Text></View>{trailing}</View>;
}

const seats = [[50, 14], [23, 41], [76, 43], [31, 72], [72, 74], [49, 49], [13, 76], [87, 76]];

export function StudioRoom({ team, language, selectedId, onSelect }: { team: Member[]; language: Language; selectedId?: string; onSelect?: (id: string) => void }) {
  const [width, setWidth] = useState(300);
  const active = team.filter(member => member.desk !== 'bench');
  return <View style={styles.room} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.roomHeader}><Text style={styles.roomCaption}>● {studioCopy(language, '我的工作室', 'MY STUDIO')}</Text><Text style={styles.roomCount}>{studioCopy(language, `${active.length} 位成员在岗`, `${active.length} at their desks`)}</Text></View>
    <View style={styles.roomSpace}>
      <View style={styles.window}><View style={styles.windowPane} /><View style={styles.windowPane} /><View style={styles.windowPane} /></View>
      <Text style={styles.neon}>folio / studio</Text>
      <View style={styles.floor}><View style={styles.floorLine} /><View style={styles.floorLine} /><View style={styles.floorLine} /><View style={styles.floorLine} /></View>
      {active.slice(0, seats.length).map((member, index) => <Pressable key={member.id} accessibilityRole="button"
        accessibilityLabel={`${member.name}, ${roleName(member.role, language)}`} accessibilityState={{ selected: selectedId === member.id, disabled: !onSelect }}
        disabled={!onSelect} onPress={() => onSelect?.(member.id)} style={[styles.seat, { left: (width - 2) * seats[index][0] / 100 - 40, top: seats[index][1] * 2.55 }]}>
        <View style={styles.desk}><View style={styles.monitor} /><View style={styles.notebook} /></View>
        <View style={selectedId === member.id ? styles.selectedPortrait : undefined}><Portrait id={member.id} size={member.role === 'manager' ? 49 : 40} /></View>
        <View style={styles.seatName}><Text numberOfLines={1} style={styles.seatNameText}>{member.name.split(' ')[0]}</Text><Text numberOfLines={1} style={styles.seatRole}>{roleName(member.role, language)}</Text></View>
      </Pressable>)}
    </View>
    <Text style={styles.roomHint}>{studioCopy(language, '点击成员，听听不同的观点。', 'Tap a teammate for a different perspective.')}</Text>
  </View>;
}

export function ChatHistory({ messages, language, speak, empty }: { messages: Message[]; language: Language; speak: (text: string) => void; empty?: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? messages : messages.slice(-4);
  return <View style={styles.history}>
    {messages.length > 4 ? <Pressable accessibilityRole="button" onPress={() => setExpanded(value => !value)}><Text style={styles.historyToggle}>{studioCopy(language, expanded ? '收起历史' : '展开历史', expanded ? 'Less history' : 'More history')}</Text></Pressable> : null}
    {visible.length ? visible.map((message, index) => <View key={message.id || String(index)} style={[styles.message, message.role === 'user' && styles.userMessage]}>
      <Text style={styles.author}>{message.role === 'user' ? studioCopy(language, '你', 'You') : message.name || 'Maya'}</Text>
      <Text selectable style={styles.messageText}>{message.text}</Text>
      {message.role === 'assistant' ? <Pressable accessibilityRole="button" onPress={() => speak(message.text)} style={styles.readButton}><Text style={styles.readText}>{studioCopy(language, '读给我听 ♫', 'Read aloud ♫')}</Text></Pressable> : null}
      {message.source ? <Text style={styles.source}>{message.source}</Text> : null}
    </View>) : empty ? <Text style={styles.messageText}>{empty}</Text> : null}
  </View>;
}

export function ReviewReceipt({ run, language }: { run: Run; language: Language }) {
  const [expanded, setExpanded] = useState(false);
  const labels: Record<string, [string, string]> = { BUY: ['买入', 'Buy'], SELL: ['卖出', 'Sell'], HOLD: ['持有', 'Hold'] };
  const decision = labels[run.decision.action];
  const action = decision ? studioCopy(language, ...decision) : run.decision.action;
  return <View style={styles.receipt}>
    <Text style={styles.receiptEyebrow}>{studioCopy(language, '团队审议完成 · 模拟执行', 'TEAM REVIEW · PAPER EXECUTION')}</Text>
    <Text accessibilityRole="header" style={styles.receiptTitle}>{action} {run.decision.symbol} <Text style={styles.target}>{run.decision.targetWeightPercent}%</Text></Text>
    <Text style={styles.messageText}>{run.decision.summary}</Text>
    <View style={styles.receiptRow}><Text style={styles.muted}>{studioCopy(language, '模拟执行', 'Paper execution')}</Text><Text style={styles.receiptValue}>{run.execution.status === 'filled' ? studioCopy(language, `${run.execution.quantity} 股 · ${studioMoney(run.execution.price ?? undefined, language)}`, `${run.execution.quantity} shares · ${studioMoney(run.execution.price ?? undefined, language)}`) : run.execution.status === 'held' ? studioCopy(language, '未下单', 'No order') : studioCopy(language, '已拦截', 'Blocked')}</Text></View>
    <Text style={styles.source}>{run.execution.reason}</Text>
    <View style={styles.receiptRow}><Text style={styles.muted}>{studioCopy(language, '成交后现金', 'Cash after')}</Text><Text style={styles.receiptValue}>{studioMoney(run.portfolio.cash, language)}</Text></View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.receiptMore}><Text style={styles.historyToggle}>{studioCopy(language, expanded ? '收起理由与风控 −' : '查看理由与独立风控 +', expanded ? 'Hide reasoning and policy −' : 'Reasoning and independent policy +')}</Text></Pressable>
    {expanded ? <View style={styles.reviewDetail}>
      {run.reviews.map(review => <View key={review.id} style={styles.reviewItem}><Text style={styles.author}>{review.name} · {roleName(review.role, language)}</Text><Text selectable style={styles.detailText}>{review.summary}</Text><Text style={styles.source}>{review.source}</Text></View>)}
      <Text style={styles.detailHeading}>{studioCopy(language, '证据与来源', 'Evidence and sources')}</Text>
      {run.evidence.map(item => <View key={item.id} style={styles.reviewItem}><Text style={styles.detailText}>{item.label} · {item.value}</Text><Text style={styles.source}>{item.source}</Text></View>)}
      <Text style={styles.detailHeading}>{studioCopy(language, '独立风控', 'Independent policy')}</Text>
      {run.policy.checks.map(check => <View key={check.id} style={styles.reviewItem}><Text style={styles.detailText}>{check.status === 'pass' ? '✓' : '○'} {check.label}</Text><Text style={styles.source}>{check.detail}</Text></View>)}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 46, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: studio.purple },
  buttonText: { color: studio.purpleInk, fontSize: 14, fontWeight: '700' }, secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: studio.border }, secondaryText: { color: studio.muted }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.8 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 }, eyebrow: { fontSize: 10, fontWeight: '600', letterSpacing: 1.5, color: studio.subtle, marginBottom: 6 }, title: { color: studio.ink, fontSize: 27, fontWeight: '600', letterSpacing: -0.7, lineHeight: 34 },
  room: { backgroundColor: '#28243D', borderWidth: 1, borderColor: studio.border, borderRadius: 18, overflow: 'hidden' }, roomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 13, borderBottomWidth: 1, borderColor: '#FFFFFF08' }, roomCaption: { color: '#B5A2CE', fontSize: 9, letterSpacing: 1 }, roomCount: { color: '#9784AC', fontSize: 9 },
  roomSpace: { height: 300, position: 'relative', overflow: 'hidden' }, window: { flexDirection: 'row', gap: 3, position: 'absolute', left: 22, top: 22, width: 105, height: 70, backgroundColor: '#52416D', borderWidth: 5, borderColor: '#3D3457', transform: [{ skewY: '-7deg' }] }, windowPane: { flex: 1, backgroundColor: '#71609455' }, neon: { position: 'absolute', right: 24, top: 40, fontSize: 12, color: '#B69AE7', letterSpacing: -0.3 },
  floor: { position: 'absolute', left: -35, right: -35, top: 100, height: 260, backgroundColor: '#383148', borderWidth: 1, borderColor: '#8F75AE33', transform: [{ perspective: 650 }, { rotateX: '47deg' }, { rotateZ: '-9deg' }], flexDirection: 'row', justifyContent: 'space-evenly' }, floorLine: { width: 1, backgroundColor: '#B79ED51A' }, seat: { position: 'absolute', width: 80, alignItems: 'center', padding: 0 }, desk: { position: 'absolute', top: 32, width: 78, height: 28, borderRadius: 4, borderWidth: 1, borderColor: '#B9A7C265', backgroundColor: '#776481', transform: [{ skewY: '-8deg' }] }, monitor: { position: 'absolute', top: -12, left: 8, width: 21, height: 16, borderRadius: 2, borderWidth: 3, borderColor: '#3E3354', backgroundColor: '#8D74AF' }, notebook: { position: 'absolute', top: 7, right: 9, width: 14, height: 8, borderRadius: 2, backgroundColor: '#C6B58B80' }, selectedPortrait: { borderRadius: 35, borderWidth: 2, borderColor: studio.purple }, seatName: { backgroundColor: '#252034', borderColor: '#9B7DBD33', borderWidth: 1, borderRadius: 5, marginTop: 14, paddingHorizontal: 7, paddingVertical: 3, alignItems: 'center' }, seatNameText: { color: '#E0D1F2', fontSize: 9, fontWeight: '600' }, seatRole: { color: '#A28AB8', fontSize: 7, marginTop: 2 }, roomHint: { color: '#AB93BF', fontSize: 10, padding: 12, borderTopWidth: 1, borderColor: '#FFFFFF08' },
  history: { gap: 12 }, historyToggle: { color: '#B69FD6', fontSize: 11, minHeight: 44, textAlignVertical: 'center', paddingVertical: 13 }, message: { gap: 6, paddingVertical: 4 }, userMessage: { backgroundColor: '#C6B4FF0B', padding: 12, borderLeftWidth: 2, borderLeftColor: '#8368A7', borderRadius: 9 }, author: { color: '#AF99C7', fontSize: 11, fontWeight: '600' }, messageText: { color: '#D0C2DF', fontSize: 14, lineHeight: 23 }, readButton: { alignSelf: 'flex-start', paddingVertical: 6, minHeight: 44, justifyContent: 'center' }, readText: { color: '#A38ABF', fontSize: 11 }, source: { color: '#847391', fontSize: 10, lineHeight: 16 },
  receipt: { borderWidth: 1, borderColor: '#8CE7C733', borderRadius: 16, padding: 18, gap: 12, backgroundColor: '#18312B44' }, receiptEyebrow: { color: studio.mint, letterSpacing: 1, fontSize: 10 }, receiptTitle: { color: studio.ink, fontSize: 26, fontWeight: '600' }, target: { fontSize: 16, color: '#AAC8BC' }, receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTopWidth: 1, borderColor: '#FFFFFF0C', paddingTop: 11 }, muted: { color: studio.muted, fontSize: 12 }, receiptValue: { color: '#CBECDD', fontSize: 13, fontWeight: '600' }, receiptMore: { paddingVertical: 5 }, reviewDetail: { gap: 10 }, reviewItem: { borderTopWidth: 1, borderColor: '#FFFFFF0A', paddingTop: 10, gap: 5 }, detailText: { color: '#B7A8C7', fontSize: 12, lineHeight: 20 }, detailHeading: { color: '#D3C0E7', fontSize: 13, fontWeight: '600', marginTop: 10 },
});
