import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { spreadText } from '../src/render/norway.tsx';
import { isDue, weeklyUnits } from '../src/publish/plan.ts';
import { buildWeek, factCheckWeekly, isoWeek, isSunday, weekKey, weeklyCaption } from '../src/weekly.ts';

const config = loadConfig();

test('ISO week and week key', () => {
  assert.deepEqual(isoWeek('2026-10-18'), { year: 2026, week: 42 });
  assert.deepEqual(isoWeek('2027-01-03'), { year: 2026, week: 53 });
  assert.equal(weekKey('2026-10-25'), 'uke-2026-W43');
  assert.equal(isSunday('2026-10-25'), true);
});

test('week: Monday–Sunday, cheapest/dearest day, change vs the week before; caption numbers checked', async () => {
  const prices: Record<string, number> = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10); // 5–18 Oct
    prices[d] = i < 7 ? 100 : 100 + i; // previous week 100, this week 107..120
  }
  const w = (await buildWeek('2026-10-18', async (d) => prices[d] ?? null))!;
  assert.deepEqual(w.days.map((d) => d.short), ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']);
  assert.equal(w.cheapest.date, '2026-10-12');
  assert.equal(w.dearest.date, '2026-10-18');
  assert.equal(Math.round(w.avg), 110);
  const text = weeklyCaption(w, config);
  assert.match(text, /\+10 % fra uka før/);
  assert.deepEqual(factCheckWeekly(text, w), []);
  assert.equal(factCheckWeekly(text.replace('110 øre', '999 øre'), w).length, 1);
  assert.equal(await buildWeek('2026-10-18', async () => null), null); // a missing day: no post
});

test('weekly post goes out on the Sunday between 15:00 and 23:00', () => {
  const [feed] = weeklyUnits('uke-2026-W43', '2026-10-25', 'tekst', config);
  assert.equal(isDue(feed, {}, '2026-10-25T14:15'), false);
  assert.equal(isDue(feed, {}, '2026-10-25T16:15'), true);
  assert.equal(isDue(feed, {}, '2026-10-25T23:30'), false);
});

test('Norway spread line', () => {
  const a = (code: string, name: string, avg: number) => ({ code, name, avg, vat: 0.25 });
  assert.equal(spreadText([a('NO4', 'Nord-Norge', 22), a('NO3', 'Midt-Norge', 79)]), 'Midt-Norge betaler 57 øre mer enn Nord-Norge');
  assert.equal(spreadText([a('NO1', 'Østlandet', 50), a('NO2', 'Sørlandet', 52)]), 'Nesten lik pris i hele landet');
});
