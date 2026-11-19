import { MEMBERSHIP_PLAN } from '../web/membership-plan.mjs';

const dayMs = 24 * 60 * 60 * 1000;

function monthEnd(start, months) {
  const begin = new Date(start);
  const end = new Date(start);
  end.setUTCDate(1);
  end.setUTCMonth(begin.getUTCMonth() + months + 1, 0);
  end.setUTCDate(Math.min(begin.getUTCDate(),end.getUTCDate()));
  return end;
}

function nextPeriod(start, now, cadence='monthly') {
  const first = new Date(start), today = new Date(now);
  const elapsed = Math.max(1, (today.getUTCFullYear() - first.getUTCFullYear()) * 12 + today.getUTCMonth() - first.getUTCMonth());
  const step=cadence==='yearly'?12:1, months=Math.ceil(elapsed/step)*step;
  const end = monthEnd(start,months);
  return (end.getTime() <= now ? monthEnd(start,months+step) : end).toISOString();
}

export function studioMembership(data, now = Date.now(), {simulation=false, live=false, verifiedSubscription=null}={}) {
  const { startedAt = null, interestAt = null } = data.studioMembership ?? {};
  const deadline = startedAt ? Date.parse(startedAt) + MEMBERSHIP_PLAN.trialDays * dayMs : null;
  const daysRemaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / dayMs));
  const trialStatus = startedAt ? (daysRemaining ? 'trial' : 'expired') : 'not_started';
  const demo = data.studioMembership?.simulation ?? {};
  let subscription = {status:'inactive',periodEnd:null,simulated:simulation};
  if (simulation && demo.activatedAt) {
    if (demo.cancelAt && Date.parse(demo.cancelAt) > now) subscription={status:'canceling',periodEnd:demo.cancelAt,simulated:true};
    else if (!demo.cancelAt) subscription={status:'active',periodEnd:nextPeriod(demo.activatedAt,now,demo.cadence),simulated:true};
    if(demo.cadence)subscription.cadence=demo.cadence;
  }
  if (!simulation && verifiedSubscription && ['active','canceling'].includes(verifiedSubscription.status) && Date.parse(verifiedSubscription.periodEnd)>now) {
    subscription={status:verifiedSubscription.status,periodEnd:verifiedSubscription.periodEnd,simulated:false};
    if(verifiedSubscription.cadence)subscription.cadence=verifiedSubscription.cadence;
  }
  return {
    status: subscription.status==='inactive' ? trialStatus : 'member', trialStatus, subscription,
    startedAt, endsAt: deadline === null ? null : new Date(deadline).toISOString(), daysRemaining,
    trialDays: MEMBERSHIP_PLAN.trialDays, monthlyUsd: MEMBERSHIP_PLAN.monthlyUsd, yearlyUsd:MEMBERSHIP_PLAN.yearlyUsd, interestAt, checkoutEnabled: live,
    checkoutMode:simulation?'simulation':live?'live':'unavailable',
    revision:simulation?(demo.revision??0):0,
    checkout:simulation&&demo.offer&&Date.parse(demo.offer.expiresAt)>now?demo.offer:null,
  };
}

export class MembershipError extends Error {
  constructor(message, status) { super(message); this.status=status; }
}

export function changeSimulatedMembership(data, body, now=Date.now()) {
  const view=studioMembership(data,now,{simulation:true});
  if (!Number.isSafeInteger(body?.revision) || body.revision!==view.revision) throw new MembershipError('membership-changed',409);
  const member=data.studioMembership??={};
  const demo=member.simulation??={};
  if (body.action==='prepare' && view.subscription.status==='inactive') {
    const cadence=body.cadence??'monthly';
    if(!['monthly','yearly'].includes(cadence))throw new MembershipError('invalid-membership-plan',400);
    if(view.checkout&&(view.checkout.cadence??'monthly')===cadence)return;
    demo.offer={id:crypto.randomUUID(),cadence,expiresAt:new Date(now+15*60_000).toISOString()};
  } else if (body.action==='confirm' && view.subscription.status==='inactive' && view.checkout?.id && body.checkoutId===view.checkout.id) {
    demo.activatedAt=new Date(now).toISOString();
    if(demo.offer.cadence==='yearly')demo.cadence='yearly';else delete demo.cadence;
    delete demo.cancelAt;
    delete demo.offer;
  } else if (body.action==='cancel' && view.subscription.status==='active') {
    demo.cancelAt=view.subscription.periodEnd;
  } else if (body.action==='resume' && view.subscription.status==='canceling') {
    delete demo.cancelAt;
  } else throw new MembershipError('invalid-membership-step',409);
  demo.revision=(demo.revision??0)+1;
}

export function beginStudioTrial(data) {
  const membership = data.studioMembership ??= {};
  membership.startedAt ??= new Date().toISOString();
}

export function setStudioInterest(data, interested) {
  const membership = data.studioMembership ??= {};
  membership.interestAt = interested ? (membership.interestAt ?? new Date().toISOString()) : null;
}
