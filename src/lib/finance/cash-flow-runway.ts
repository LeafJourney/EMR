export interface RunwayTrendInput {
  openingCashCents: number;
  closingCashCents: number;
  netChangeCents: number;
  burnRateCentsPerDay: number;
  runwayDays: number | null;
}

export interface RunwayTrendPoint {
  x: number;
  y: number;
}

export interface RunwayTrend {
  points: RunwayTrendPoint[];
  projectedCashCents: number;
  caption: string;
  tone: "good" | "neutral" | "bad";
}

const WIDTH = 100;
const HEIGHT = 28;
const PADDING = 3;

export function buildRunwayTrend(input: RunwayTrendInput): RunwayTrend {
  const hasFiniteRunway = input.runwayDays !== null && input.burnRateCentsPerDay > 0;
  const projectedCashCents = hasFiniteRunway
    ? Math.max(0, input.closingCashCents - input.burnRateCentsPerDay * Math.min(30, Math.max(1, input.runwayDays!)))
    : input.closingCashCents + Math.max(0, input.netChangeCents);

  const caption = hasFiniteRunway
    ? input.runwayDays! < 90
      ? `${input.runwayDays}d runway at current burn`
      : `${Math.min(30, input.runwayDays!)}d burn projection`
    : input.netChangeCents > 0
      ? "Positive cash trend"
      : "Stable runway";

  const tone = hasFiniteRunway ? (input.runwayDays! < 90 ? "bad" : "neutral") : "good";

  return {
    points: normalizeTrend([input.openingCashCents, input.closingCashCents, projectedCashCents]),
    projectedCashCents,
    caption,
    tone,
  };
}

function normalizeTrend(values: number[]): RunwayTrendPoint[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = values.length > 1 ? WIDTH / (values.length - 1) : 0;

  return values.map((value, index) => ({
    x: Math.round(index * step),
    y: span === 0 ? HEIGHT / 2 : Math.round(PADDING + ((max - value) / span) * (HEIGHT - PADDING * 2)),
  }));
}
