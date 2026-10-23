import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caption, factCheckNumbers } from '../src/caption.ts';
import { loadConfig } from '../src/config.ts';
import { dayStats, endHour, toHourly, type RawPrice } from '../src/data/prices.ts';

const config = loadConfig();
const raw = (startIso: string, minutes: number, values: number[]): RawPrice[] =>
  values.map((v, i) => {
    const s = new Date(Date.parse(startIso) + i * minutes * 60000);
    return { NOK_per_kWh: v, EUR_per_kWh: v / 10, EXR: 10, time_start: s.toISOString(), time_end: new Date(s.getTime() + minutes * 60000).toISOString() };
  });

test('hourly prices incl. 25 % VAT, labelled in Oslo time', () => {
  const h = toHourly(raw('2026-10-23T22:00:00Z', 60, Array(24).fill(0.8)), 0.25);
  assert.equal(h.length, 24);
  assert.equal(h[0].hour, '00'); // 22:00Z = 00:00 Oslo (summer time)
  assert.equal(Math.round(h[0].ore), 100); // 0.80 NOK * 1.25 = 100 øre
});

test('15-minute prices are averaged per hour', () => {
  const values = Array.from({ length: 96 }, (_, i) => (i % 4) * 0.1); // 0, .1, .2, .3 per hour
  const h = toHourly(raw('2026-11-01T23:00:00Z', 15, values), 0);
  assert.equal(h.length, 24);
  assert.equal(Math.round(h[5].ore), 15);
});

test('the autumn DST day has 25 hours, with "02" twice', () => {
  const h = toHourly(raw('2026-10-24T22:00:00Z', 60, Array(25).fill(1)), 0.25);
  assert.equal(h.length, 25);
  assert.deepEqual(h.slice(1, 5).map((x) => x.hour), ['01', '02', '02', '03']);
});

test('stats: average, cheapest 3-hour window, most expensive hour; midnight is written 24', () => {
  const prices = [0.9, 0.8, 0.3, 0.2, 0.25, 0.7, 1.0, 1.6, 1.2, 0.9, 0.8, 0.8, 0.7, 0.6, 0.6, 0.7, 0.9, 1.4, 1.8, 1.5, 1.0, 0.6, 0.5, 0.4];
  const h = toHourly(raw('2026-10-23T22:00:00Z', 60, prices), 0.25);
  const s = dayStats(h, 3);
  assert.deepEqual([s.cheapest.from, s.cheapest.to, Math.round(s.cheapest.avg)], ['02', '05', 31]);
  assert.equal(s.max.hour, '18');
  assert.equal(endHour(h[23]), '24');
  assert.equal(Math.round(s.avg), Math.round((prices.reduce((a, b) => a + b) / 24) * 125));
});

test('caption numbers all come from the data; a wrong number is caught', () => {
  const prices = [0.9, 0.8, 0.3, 0.2, 0.25, 0.7, 1.0, 1.6, 1.2, 0.9, 0.8, 0.8, 0.7, 0.6, 0.6, 0.7, 0.9, 1.4, 1.8, 1.5, 1.0, 0.6, 0.5, 0.4];
  const h = toHourly(raw('2026-10-23T22:00:00Z', 60, prices), 0.25);
  const s = dayStats(h, 3);
  const text = caption('2026-10-24', s, 150, config);
  assert.deepEqual(factCheckNumbers(text, '2026-10-24', s, 150, 24), []);
  assert.match(text, /lørdag 24\. oktober/);
  assert.equal(factCheckNumbers(text.replace(`${Math.round(s.max.ore)} øre`, '199 øre'), '2026-10-24', s, 150, 24).length, 1);
});
