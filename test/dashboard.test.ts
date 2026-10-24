import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { applyAction, applySettings, EMPTY_CONTROLS } from '../src/controls.ts';
import { parseAction } from '../src/controlsSchema.ts';
import { dashboardPage, expectedPosts, latePosts, problems, type DashboardInput } from '../src/dashboard.ts';

const config = loadConfig('norge');
const controls = structuredClone(EMPTY_CONTROLS);

test('dashboard actions are validated before they reach GitHub', () => {
  assert.deepEqual(parseAction({ type: 'publish-now', key: '2026-10-25-feed' }), { type: 'publish-now', key: '2026-10-25-feed' });
  assert.deepEqual(parseAction({ type: 'skip', key: 'uke-2026-W43-story' }), { type: 'skip', key: 'uke-2026-W43-story' });
  assert.throws(() => parseAction({ type: 'skip', key: '../../etc' }), /Ugyldig innleggsnøkkel/);
  assert.throws(() => parseAction({ type: 'caption', key: '2026-10-25-feed', text: 'x'.repeat(2201) }), /for lang/);
  assert.throws(() => parseAction({ type: 'settings', settings: { stories: 'yes' } }), /av eller på/);
  assert.throws(() => parseAction({ type: 'rm -rf' }), /Ukjent/);
});

test('actions change the controls and are logged; settings override the config', () => {
  let c = applyAction(controls, { type: 'pause' }, 'a@b.no', '2026-10-24T10:00:00Z');
  c = applyAction(c, { type: 'caption', key: '2026-10-25-feed', text: 'Ny tekst' }, 'a@b.no');
  c = applyAction(c, { type: 'settings', settings: { stories: false } }, 'a@b.no');
  assert.equal(c.paused, true);
  assert.equal(c.captions['2026-10-25-feed'], 'Ny tekst');
  assert.equal(c.log.length, 3);
  assert.equal(c.log[2].action, 'Satte automatisk publisering på pause');
  const cfg = applySettings(config, c.settings);
  assert.deepEqual([cfg.publish.stories, cfg.weekly.enabled], [false, true]);
});

test('a post that has not gone out is a warning after an hour and an error after the last retry', () => {
  const exp = expectedPosts(config, '2026-10-24T15:30');
  assert.deepEqual(exp.map((e) => [e.key, e.publishAt]), [['2026-10-24-feed', '2026-10-23T14:00'], ['2026-10-25-feed', '2026-10-24T14:00']]);
  const published = { '2026-10-24-feed': {} };
  assert.deepEqual(latePosts(exp, published, controls, '2026-10-24T14:50'), []); // GitHub may be late
  assert.deepEqual(latePosts(exp, published, controls, '2026-10-24T15:30').map((l) => [l.key, l.level]), [['2026-10-25-feed', 'warn']]);
  assert.deepEqual(latePosts(exp, published, controls, '2026-10-24T17:30').map((l) => l.level), ['bad']);
  assert.deepEqual(latePosts(exp, published, { ...controls, skip: ['2026-10-25-feed'] }, '2026-10-24T17:30'), []);
  assert.deepEqual(latePosts(exp, published, { ...controls, paused: true }, '2026-10-24T17:30'), []);
  assert.equal(expectedPosts(config, '2026-10-25T16:00').at(-1)!.key, 'uke-2026-W43-feed'); // Sunday
});

const input = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  config,
  controls,
  status: {},
  published: {},
  units: [],
  tokenRefreshedAt: '2026-10-22T12:00:00Z',
  now: '2026-10-24T12:00',
  builtAt: '2026-10-24T10:00:00Z',
  repo: 'o/r',
  ...over,
});

test('problems: left-out areas, failed posts and an expiring token', () => {
  assert.deepEqual(problems(input()), []);
  const status = {
    generate: { '2026-10-25': { at: '', areas: [{ code: 'NO3', name: 'Midt-Norge', ok: false, passed: 6, errors: ['mangler time 03'], warnings: [] }] } },
    publish: { at: '', paused: false, published: [], failed: [{ key: '2026-10-25-feed', error: 'timeout' }], skipped: [] },
  };
  const p = problems(input({ status, tokenRefreshedAt: '2026-08-30T10:00:00Z' }));
  assert.deepEqual(p.map((x) => x.level), ['bad', 'bad', 'warn']);
  assert.match(p.map((x) => x.text).join(' | '), /Midt-Norge er utelatt.*mangler time 03/);
  assert.match(p.map((x) => x.text).join(' | '), /utløper om 5 dager/);
});

test('the page escapes captions and says when all is well', () => {
  const html = dashboardPage(input({ units: [{ key: '2026-10-25-feed', date: '2026-10-25', dir: '2026-10-25', kind: 'feed', images: ['a.png'], caption: '<script>x</script>', publishAt: '2026-10-24T14:00', expiresAt: '2026-10-25T12:00' }] }));
  assert.match(html, /Alt i orden/);
  assert.ok(!html.includes('<script>x</script>'));
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
});
