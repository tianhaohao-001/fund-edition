import './judge-records.js';

// The public receipt is extracted at build time from the reviewed Studio run.
// Only this meeting has the matched screenshot used for the research summary.
const meetingReceipt = '369f0fe8-bcd8-49bc-ad0b-12709f459fa9';
const meetingSource = '25d7d1275eb8619c00124337d5d42066f9d748df746f667d58da685bdbb5a5e9';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadStyles() {
  if (document.querySelector('link[data-recorded-team-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./recorded-team.css', import.meta.url).href;
  link.dataset.recordedTeamStyle = '';
  document.head.append(link);
}

export function renderRecordedTeam({ language, record, onDraft }) {
  const root = element('section', 'recorded-team');
  const meeting = window.judgeRecords?.studio;
  if (!record?.responseId || !record.answer || meeting?.receipt !== meetingReceipt ||
      meeting.source?.sha256 !== meetingSource || meeting.decision !== 'held') return root;
  loadStyles();
  const t = (zh, en) => language === 'en-US' ? en : zh;
  const cash = value => new Intl.NumberFormat(language, {
    currency: 'USD', style: 'currency', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0
  }).format(value);
  root.dataset.recordedTeam = '';
  root.setAttribute('aria-label', t('另一场已录团队会议', 'A separate recorded committee meeting'));
  const title = t('为什么这次没买 NVDA？', 'Why did the team pass on NVDA?');
  root.append(
    element('p', 'rt-context', t('另一场已录会议 · 2026 年 11 月 18 日', 'Separate recorded meeting · Nov 18, 2026')),
    element('h3', 'rt-title', title),
    element('p', 'rt-context-note', t('这支团队研究了一组模拟市场数据。点一个席位，看看意见怎样传到模拟账本。',
      'This team reviewed a synthetic market scenario. Choose a seat to follow the decision through to the paper ledger.'))
  );

  const seats = [
    { id:'research', label:t('研究席', 'Research'), name:'Jules Bennett',
      heading:t('需求在涨，回报够吗？', 'Demand was up. Was the return enough?'),
      copy:t('情景中的需求指标增长了 16%。Jules 估算的五年年化回报只有 10%，低于团队的 15% 门槛。他希望先看到需求增长转化为持续自由现金流的证据。',
        'Demand rose 16% in the scenario. Jules estimated a 10% annualized return over five years, below the team’s 15% hurdle. He wanted evidence that demand could translate into lasting free cash flow.') },
    { id:'manager', label:t('经理', 'Manager'), name:'Maya Chen',
      heading:t('听完异议，先持有现金。', 'After the review, hold cash.'),
      copy:t('研究席把反对建仓的意见交给 Maya。经理在这次模拟审议中选择持有；团队的决定随后交给独立执行引擎。',
        'Research handed its objection to Maya. The manager chose to hold in this paper review and passed the decision to the independent execution engine.') },
    { id:'ledger', label:t('模拟账本', 'Paper ledger'), name:t('独立执行引擎','Independent execution engine'),
      heading:t('账户里的现金没有动。', 'The cash stayed in the account.'),
      copy:t('引擎记录了持有。你正在查看当时的回执，打开这份记录不会改变自己的模拟账户。',
        'The engine recorded a hold. Reading this receipt leaves your own paper account untouched.') }
  ];

  const room = element('div', 'rt-room');
  const image = element('img', 'rt-photo');
  image.src = '/assets/meeting-room.jpg';
  image.width = 1536;
  image.height = 1024;
  image.loading = 'lazy';
  image.alt = '';
  const speaker = element('span', 'rt-speaker');
  speaker.setAttribute('aria-hidden', 'true');
  room.append(image, speaker);
  const selectors = element('div','rt-seats');
  selectors.setAttribute('role','group');
  selectors.setAttribute('aria-label', t('查看会议信息','Explore the meeting'));
  const summary = element('div','rt-notes');
  summary.setAttribute('aria-live','polite');
  summary.setAttribute('aria-atomic','true');
  const buttons = new Map();

  function choose(seat) {
    room.dataset.active = seat.id;
    speaker.textContent = seat.name;
    for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === seat.id));
    summary.replaceChildren(element('h4','rt-decision',seat.heading),element('p','rt-copy',seat.copy));
    if (seat.id === 'ledger') {
      const ledger = element('dl', 'rt-ledger');
      for (const [label, value] of [[t('审议前现金','Before review'), meeting.before],
          [t('审议后现金','After review'), meeting.after]]) {
        const row = element('div');
        row.append(element('dt','',label),element('dd','',cash(value)));
        ledger.append(row);
      }
      summary.append(ledger);
    }
  }
  for (const seat of seats) {
    const button = element('button', 'rt-seat', seat.label);
    button.type = 'button';
    button.dataset.caseSeat = seat.id;
    button.addEventListener('click', () => choose(seat));
    buttons.set(seat.id,button);
    selectors.append(button);
  }
  choose(seats[0]);
  const receipt = element('details', 'rt-receipt');
  receipt.append(element('summary','',t('核对会议回执','Inspect the meeting receipt')),
    element('p','',t(`${meeting.replies} 份真实模型回复，${meeting.events} 条会议事件。`,
      `${meeting.replies} genuine model replies and ${meeting.events} meeting events.`)),
    element('code','',meeting.receipt));
  const draft = element('button', 'rt-draft', t('写下我自己的想法','Write my own idea'));
  draft.dataset.caseDraft = '';
  draft.type = 'button';
  draft.addEventListener('click', () => onDraft?.());
  root.append(room,selectors,summary,receipt,draft);
  return root;
}
