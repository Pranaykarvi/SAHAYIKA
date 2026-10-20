import type { ReadinessBand } from "../../validation/matches";
import type { SizeClass } from "../../validation/opportunities";

// Rule-based readiness, no ML, and two deliberate shape decisions:
//
// 1. The output is a BAND, never a precise score, and never a ranking across
//    groups. A score invites false precision and silent ordering; a band is
//    something a social worker can read, discuss, and disagree with.
// 2. The band is advisory. A group with thin ledgers because its district is
//    poor must not be permanently excluded by this function — the band is
//    overridable by a social worker (stage 6, invariant 2), and banding
//    instead of ordering is what keeps that override meaningful.

export interface ReadinessSignals {
  // Share of the last six months in which the group recorded thrift (0..1).
  thriftRegularity: number;
  // Repaid / lent on internal loans (0..1), or null when the group has not
  // lent internally yet — absence of lending history is normal for young
  // groups and is treated as neutral, not as a failure.
  loanRepaymentRate: number | null;
  completedDeliveries: number;
  tenureMonths: number;
}

export interface ReadinessAssessment {
  band: ReadinessBand;
  // Top three contributing factors, as plain sentences a social worker can
  // read aloud. Unmet factors come first — they are what needs discussing.
  factors: string[];
}

// Thresholds per order size class. Larger orders demand more demonstrated
// discipline and history; the numbers are starting points for social-work
// review, not laws.
export const READINESS_THRESHOLDS: Record<
  SizeClass,
  {
    thriftRegularity: number;
    loanRepaymentRate: number;
    completedDeliveries: number;
    tenureMonths: number;
  }
> = {
  small: {
    thriftRegularity: 0.5,
    loanRepaymentRate: 0.6,
    completedDeliveries: 0,
    tenureMonths: 6,
  },
  medium: {
    thriftRegularity: 0.65,
    loanRepaymentRate: 0.75,
    completedDeliveries: 1,
    tenureMonths: 12,
  },
  large: {
    thriftRegularity: 0.8,
    loanRepaymentRate: 0.85,
    completedDeliveries: 3,
    tenureMonths: 24,
  },
};

interface FactorCheck {
  met: boolean;
  sentence: string;
}

export function assessReadiness(
  signals: ReadinessSignals,
  sizeClass: SizeClass | null,
): ReadinessAssessment {
  // An unclassified opportunity is assessed against the middle bar rather
  // than silently skipping readiness.
  const effectiveSize: SizeClass = sizeClass ?? "medium";
  const bar = READINESS_THRESHOLDS[effectiveSize];

  const thriftMonths = Math.round(signals.thriftRegularity * 6);
  const checks: FactorCheck[] = [
    {
      met: signals.thriftRegularity >= bar.thriftRegularity,
      sentence:
        signals.thriftRegularity >= bar.thriftRegularity
          ? `The group saved in ${thriftMonths} of the last 6 months, steady enough for a ${effectiveSize} order.`
          : `The group saved in only ${thriftMonths} of the last 6 months, below the regularity a ${effectiveSize} order asks for.`,
    },
    {
      met:
        signals.loanRepaymentRate === null ||
        signals.loanRepaymentRate >= bar.loanRepaymentRate,
      sentence:
        signals.loanRepaymentRate === null
          ? "The group has not lent internally yet, so repayment discipline is untested rather than weak."
          : signals.loanRepaymentRate >= bar.loanRepaymentRate
            ? `Internal loans are ${Math.round(signals.loanRepaymentRate * 100)}% repaid, showing solid repayment discipline.`
            : `Internal loans are only ${Math.round(signals.loanRepaymentRate * 100)}% repaid, below the bar for a ${effectiveSize} order.`,
    },
    {
      met: signals.completedDeliveries >= bar.completedDeliveries,
      sentence:
        signals.completedDeliveries >= bar.completedDeliveries
          ? `${signals.completedDeliveries} completed ${signals.completedDeliveries === 1 ? "delivery" : "deliveries"} on record supports taking a ${effectiveSize} order.`
          : `${signals.completedDeliveries} completed ${signals.completedDeliveries === 1 ? "delivery" : "deliveries"} on record is thin history for a ${effectiveSize} order.`,
    },
    {
      met: signals.tenureMonths >= bar.tenureMonths,
      sentence:
        signals.tenureMonths >= bar.tenureMonths
          ? `The group has been operating for ${Math.floor(signals.tenureMonths)} months, long enough for a ${effectiveSize} order.`
          : `The group has been operating for only ${Math.floor(signals.tenureMonths)} months, young for a ${effectiveSize} order.`,
    },
  ];

  const unmet = checks.filter((check) => !check.met);
  const band: ReadinessBand =
    unmet.length === 0 ? "ready" : unmet.length >= 2 ? "not_ready" : "stretch";

  const factors = [...unmet, ...checks.filter((check) => check.met)]
    .slice(0, 3)
    .map((check) => check.sentence);

  return { band, factors };
}
