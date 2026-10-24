import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastYearText } from '../src/caption.ts';
import { loadConfig, priceBasis, vatShort } from '../src/config.ts';
import { checkExchangeRate, validateDay } from '../src/data/validate.ts';
import type { RawPrice } from '../src/data/prices.ts';

const day = (n = 24, start = '2026-10-23T22:00:00Z', exr = 10.488): RawPrice[] =>
  Array.from({ length: n }, (_, i) => {
    const s = new Date(Date.parse(start) + i * 3.6e6);
    const eur = 0.05 + i * 0.001;
    return { NOK_per_kWh: Number((eur * exr).toFixed(5)), EUR_per_kWh: eur, EXR: exr, time_start: s.toISOString(), time_end: new Date(s.getTime() + 3.6e6).toISOString() };
  });

test('a complete, consistent day passes all structural checks', () => {
  const v = validateDay(day(), '2026-10-24');
  assert.deepEqual(v.errors, []);
  assert.equal(v.passed.length, 8);
});

test('validation catches missing hours, gaps, wrong arithmetic, implausible prices and the wrong day', () => {
  assert.ok(validateDay(day(20), '2026-10-24').errors.some((e) => /antall/.test(e)));
  const gap = day();
  gap.splice(5, 1);
  assert.ok(validateDay(gap, '2026-10-24').errors.some((e) => /hull/.test(e)));
  const wrongMath = day();
  wrongMath[3] = { ...wrongMath[3], NOK_per_kWh: wrongMath[3].NOK_per_kWh + 0.1 };
  assert.ok(validateDay(wrongMath, '2026-10-24').errors.some((e) => /EUR × valutakurs/.test(e)));
  const crazy = day();
  crazy[0] = { ...crazy[0], NOK_per_kWh: 99, EUR_per_kWh: 99 / 10.488 };
  assert.ok(validateDay(crazy, '2026-10-24').errors.some((e) => /utenfor/.test(e)));
  assert.ok(validateDay(day(), '2026-10-25').errors.some((e) => /Dekker ikke/.test(e)));
});

test('the 25-hour DST day is complete', () => {
  assert.deepEqual(validateDay(day(25, '2026-10-24T22:00:00Z'), '2026-10-25').errors, []);
});

test('exchange rate is checked against Norges Bank (mocked); unreachable is only a warning', async () => {
  const body = { data: { dataSets: [{ series: { '0:0:0:0': { observations: { 0: ['10.5245'], 1: ['10.512'], 2: ['10.488'] } } } }], structure: { dimensions: { observation: [{ values: [{ id: '2026-10-20' }, { id: '2026-10-21' }, { id: '2026-10-22' }] }] } } } };
  const ok = (async () => new Response(JSON.stringify(body))) as typeof fetch;
  assert.match((await checkExchangeRate(day(), '2026-10-24', 'test', ok)).passed[0], /Norges Bank 2026-10-22/);
  assert.equal((await checkExchangeRate(day(24, '2026-10-23T22:00:00Z', 10.9), '2026-10-24', 'test', ok)).errors.length, 1);
  const down = (async () => { throw new Error('offline'); }) as typeof fetch;
  const v = await checkExchangeRate(day(), '2026-10-24', 'test', down);
  assert.deepEqual([v.errors.length, v.warnings.length], [0, 1]);
});

test('profiles: Nord-Norge has no VAT, the wording follows; other areas keep their own hashtags', () => {
  const no4 = loadConfig('no4');
  assert.equal(no4.area.code, 'NO4');
  assert.equal(vatShort(no4), 'uten mva');
  assert.match(priceBasis(no4), /ingen mva i Nord-Norge/);
  assert.equal(loadConfig('no1').area.vat, 0.25);
  assert.ok(loadConfig('no5').brand.hashtags.includes('#bergen'));
  assert.equal(loadConfig('no5').publish.enabled, false);
  assert.equal(loadConfig('no5').publish.time, '14:00'); // shared settings are merged in
});

test('last year: percent normally, øre when last year was very cheap', () => {
  assert.equal(lastYearText({ pct: 5, avg: 56 }, 59), '+5 % mot samme dag i fjor');
  assert.equal(lastYearText({ pct: 315, avg: 5.3 }, 22), '+17 øre mot samme dag i fjor');
});
