export const MEMBERSHIP_PLAN = Object.freeze({
  trialDays: 7,
  monthlyUsd: 9.99,
  yearlyUsd: 99.99,
  proposedPlatformRate: 0.0015,
  illustrativeComparisonRate: 0.005,
  wellingtonExpenseRate: 0.0024,
  vymExpenseRate: 0.0004,
  vcitExpenseRate: 0.0003,
});

export function annualFeeExample(averageAssets, equityWeight = 0.65) {
  if (!Number.isFinite(averageAssets) || averageAssets < 0 || !Number.isFinite(equityWeight) || equityWeight < 0 || equityWeight > 1) {
    throw new RangeError('Use a nonnegative balance and an equity weight from zero to one.');
  }
  const plan = MEMBERSHIP_PLAN;
  const underlying = averageAssets * (equityWeight * plan.vymExpenseRate + (1 - equityWeight) * plan.vcitExpenseRate);
  const platform = averageAssets * plan.proposedPlatformRate;
  return {platform, underlying, combined: platform + underlying, wellington: averageAssets * plan.wellingtonExpenseRate,
    comparison: averageAssets * plan.illustrativeComparisonRate};
}
