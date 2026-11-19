// Hiring preserves the specialist’s professional role and editable job title.
const desks = Object.freeze({research:'research',quant:'research',risk:'risk',trader:'execution'});
// The current desk sets the next assignment. Membership, titles and order authority stay independent.
export function deskAssignment(member) {
  if (!member) return null;
  if (member.role === 'manager') return 'manager';
  if (member.desk === 'bench' || !Object.hasOwn(desks, member.role)) return null;
  switch (member.desk) {
    case 'risk': return 'risk';
    case 'execution': return 'trader';
    case 'research': return member.role === 'quant' ? 'quant' : 'research';
    default: return member.role; // Management support and legacy records without a desk.
  }
}

export const MAX_TEAM_SIZE = 24;
export const hiringIntent = message => /招募|招聘|招人|招(?:[一两二三四五六七八九十\d个名位来])|聘请|雇[用佣]|组建.{0,10}团队|组队|(?:想要|需要|要|安排|找).{0,20}(?:个[人員员]|名|位|员工|分析师|研究员|风控|交易员)|\b(hire|hiring|recruit|staff|assemble|build my team|people on (?:my|our|the) team|add (?:an?|two|three|four|\d+) (?:new )?(?:people|teammates?|analysts?|traders?))\b/iu.test(message);

function field(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit || /[<>\p{Cc}]/u.test(value.trim())) {
    throw new RangeError('Invalid staffing field');
  }
  return value.trim();
}

export function readStaffingPlan(rows, existingMembers) {
  if (!Array.isArray(rows) || existingMembers.length + rows.length > MAX_TEAM_SIZE) throw new RangeError('Invalid team size');
  const names = new Set(existingMembers.map(member => member.name?.trim().toLocaleLowerCase()).filter(Boolean));
  return rows.map(row => {
    if (!row || !Object.hasOwn(desks, row.role)) throw new RangeError('Invalid team role');
    const name = field(row.name, 60), title = field(row.title, 70), duty = field(row.duty, 500);
    if (names.has(name.toLocaleLowerCase()) || /^(?:maya(?: chen)?|玛雅)$/iu.test(name)) throw new RangeError('Choose distinct teammate names');
    names.add(name.toLocaleLowerCase());
    return {id:'seat-'+crypto.randomUUID(), name, role:row.role, title, duty, desk:desks[row.role]};
  });
}

export const staffingSchema =
  'Each new employee has {name,title,role,duty}. Keep user-specified names, job titles and individual assignments exactly when supplied. Otherwise give distinct fictional personal names and short job titles in the user language. role is research, quant, risk or trader (internal routing). Never add another manager. Never authorize orders. Honor requested headcount and mixed specialties. If asked to hire N staff, N excludes Maya. If a user asks only for ideas or negates a hire, do not propose any hires.';
