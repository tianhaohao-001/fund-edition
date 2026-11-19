import type { Language, Member } from './types';

export const studio = {
  background: '#101023', panel: '#1C1A30', elevated: '#242039', border: '#383047',
  ink: '#F4EDFF', muted: '#A397B8', subtle: '#796D8C', purple: '#C6B4FF',
  purpleInk: '#281A3B', mint: '#8CE7C7', danger: '#F0AFA8',
};

export function studioCopy(language: Language, zh: string, en: string) { return language === 'zh-CN' ? zh : en; }
export const studioMoney = (value: number | undefined, language: Language) => Number.isFinite(value)
  ? new Intl.NumberFormat(language, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value as number) : '—';

export const PEOPLE = [
  { id: 'maya-chen', name: 'Maya Chen', role: 'manager', desk: 'management', focusZh: '统筹证据，形成组合提案', focusEn: 'Weigh evidence and own the portfolio proposal' },
  { id: 'theo-park', name: 'Theo Park', role: 'research', desk: 'research', focusZh: '研究企业质量与估值', focusEn: 'Study business quality and valuation' },
  { id: 'inez-rao', name: 'Inez Rao', role: 'risk', desk: 'risk', focusZh: '审视敞口与下行风险', focusEn: 'Challenge exposure and downside' },
  { id: 'eli-morgan', name: 'Eli Morgan', role: 'trader', desk: 'execution', focusZh: '检查报价与执行条件', focusEn: 'Check quotes and execution conditions' },
  { id: 'leah-kim', name: 'Leah Kim', role: 'quant', desk: 'research', focusZh: '比较配置规模与现金储备', focusEn: 'Compare allocation sizes and cash reserves' },
  { id: 'jules-bennett', name: 'Jules Bennett', role: 'research', desk: 'research', focusZh: '研究盈利、催化因素与估值', focusEn: 'Study earnings, catalysts and valuation' },
  { id: 'avery-khan', name: 'Avery Khan', role: 'risk', desk: 'risk', focusZh: '检验压力情景与风控边界', focusEn: 'Stress scenarios and policy guardrails' },
  { id: 'riley-diaz', name: 'Riley Diaz', role: 'trader', desk: 'execution', focusZh: '跟踪订单质量与调仓条件', focusEn: 'Track order quality and rebalancing' },
] as const;

export function roleName(role: string, language: Language) {
  const names: Record<string, [string, string]> = {
    manager: ['基金经理', 'Portfolio manager'], research: ['研究员', 'Research'], risk: ['风险分析师', 'Portfolio risk'],
    trader: ['交易执行', 'Execution'], quant: ['组合构建', 'Portfolio construction'],
  };
  const pair = names[role] ?? ['专业成员', 'Specialist'];
  return studioCopy(language, ...pair);
}

export function candidateMember(id: string, duty: string): Member {
  const found = PEOPLE.find(person => person.id === id) ?? PEOPLE[0];
  return { id, name: found.name, role: found.role, desk: found.desk, duty };
}
