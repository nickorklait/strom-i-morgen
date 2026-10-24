// Checks that a day of prices is complete and consistent before anything is published.
// Errors stop the post; warnings are logged (e.g. when Norges Bank cannot be reached).

import type { RawPrice } from './prices.ts';

export interface Validation {
  errors: string[];
  warnings: string[];
  /** The checks that passed, for the log / dashboard. */
  passed: string[];
}

const osloDateTime = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(' ', 'T');

const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Structure and arithmetic: full day, no gaps, plausible values, NOK = EUR × exchange rate. */
export function validateDay(raw: RawPrice[], date: string): Validation {
  const v: Validation = { errors: [], warnings: [], passed: [] };
  const check = (ok: boolean, pass: string, fail: string) => (ok ? v.passed.push(pass) : v.errors.push(fail));

  check([23, 24, 25, 92, 96, 100].includes(raw.length), `${raw.length} prisintervaller`, `Uventet antall prisintervaller: ${raw.length}`);
  if (raw.length === 0) return v;

  const sorted = [...raw].sort((a, b) => Date.parse(a.time_start) - Date.parse(b.time_start));
  const gaps = sorted.slice(1).filter((p, i) => Date.parse(p.time_start) !== Date.parse(sorted[i].time_end)).length;
  check(gaps === 0, 'Ingen hull mellom intervallene', `${gaps} hull eller overlapp i tidsserien`);

  const minutes = new Set(sorted.map((p) => (Date.parse(p.time_end) - Date.parse(p.time_start)) / 60000));
  check(minutes.size === 1 && (minutes.has(60) || minutes.has(15)), `Faste intervaller (${[...minutes][0]} min)`, `Ujevne intervaller: ${[...minutes].join(', ')} min`);

  const first = osloDateTime(sorted[0].time_start);
  const last = osloDateTime(sorted.at(-1)!.time_end);
  check(first === `${date}T00:00` && last === `${nextDay(date)}T00:00`, 'Dekker hele døgnet (00–24)', `Dekker ikke døgnet ${date}: ${first} → ${last}`);

  const finite = raw.every((p) => [p.NOK_per_kWh, p.EUR_per_kWh, p.EXR].every(Number.isFinite));
  check(finite, 'Alle verdier er tall', 'Mangler eller ugyldige tall i dataene');
  // Day-ahead prices have been between about −0.5 and 10 NOK/kWh; outside that, something is wrong.
  const implausible = raw.filter((p) => p.NOK_per_kWh < -1 || p.NOK_per_kWh > 15).length;
  check(implausible === 0, 'Prisene er innenfor normalt område', `${implausible} priser utenfor −1 til 15 kr/kWh`);

  const rates = new Set(raw.map((p) => p.EXR));
  check(rates.size === 1, `Én valutakurs for døgnet (${[...rates][0]})`, `Flere valutakurser samme døgn: ${[...rates].join(', ')}`);
  const mismatched = raw.filter((p) => Math.abs(p.NOK_per_kWh - p.EUR_per_kWh * p.EXR) > 0.0006).length;
  check(mismatched === 0, 'NOK = EUR × valutakurs for alle timer', `${mismatched} priser stemmer ikke med EUR × valutakurs`);
  return v;
}

/**
 * The exchange rate the source used must be one of Norges Bank's official EUR/NOK rates from the days
 * before (the price is set the day before, with the latest published rate). Unreachable Norges Bank = warning.
 */
export async function checkExchangeRate(raw: RawPrice[], date: string, userAgent: string, fetchFn: typeof fetch = fetch): Promise<Validation> {
  const v: Validation = { errors: [], warnings: [], passed: [] };
  const exr = raw[0]?.EXR;
  const from = new Date(Date.parse(`${date}T12:00:00Z`) - 10 * 864e5).toISOString().slice(0, 10);
  try {
    const url = `https://data.norges-bank.no/api/data/EXR/B.EUR.NOK.SP?format=sdmx-json&startPeriod=${from}&endPeriod=${date}&locale=no`;
    const res = await fetchFn(url, { headers: { 'User-Agent': userAgent } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { data: { dataSets: { series: Record<string, { observations: Record<string, [string]> }> }[]; structure: { dimensions: { observation: { values: { id: string }[] }[] } } } };
    const obs = Object.values(j.data.dataSets[0].series)[0].observations;
    const days = j.data.structure.dimensions.observation[0].values.map((x) => x.id);
    const official = Object.entries(obs).map(([i, [val]]) => ({ day: days[Number(i)], rate: Number(val) }));
    const match = official.find((o) => o.day < date && Math.abs(o.rate - exr) < 0.0006);
    if (match) v.passed.push(`Valutakurs ${exr} = Norges Bank ${match.day}`);
    else v.errors.push(`Valutakursen ${exr} finnes ikke blant Norges Banks kurser (${official.map((o) => `${o.day}: ${o.rate}`).join(', ')})`);
  } catch (e) {
    v.warnings.push(`Kunne ikke sjekke valutakurs mot Norges Bank (${(e as Error).message})`);
  }
  return v;
}

export const merge = (...vs: Validation[]): Validation => ({ errors: vs.flatMap((x) => x.errors), warnings: vs.flatMap((x) => x.warnings), passed: vs.flatMap((x) => x.passed) });
