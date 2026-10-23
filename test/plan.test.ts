import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { isDue, unitsFor } from '../src/publish/plan.ts';

const config = loadConfig();

test('the post for a date goes out from 14:00 the day before until midday on the day, once', () => {
  const [feed, story] = unitsFor('2026-10-24', 'tekst', config);
  assert.deepEqual([feed.key, feed.publishAt, feed.expiresAt, feed.image], ['2026-10-24-feed', '2026-10-23T14:00', '2026-10-24T12:00', 'strom_2026-10-24_feed.png']);
  assert.equal(story.caption, null);
  assert.equal(isDue(feed, {}, '2026-10-23T13:15'), false); // prices may be out, but not time yet
  assert.equal(isDue(feed, {}, '2026-10-23T14:15'), true);
  assert.equal(isDue(feed, {}, '2026-10-24T12:30'), false); // old news
  assert.equal(isDue(feed, { '2026-10-24-feed': {} }, '2026-10-23T15:15'), false); // never twice
  assert.equal(isDue(feed, {}, '2026-10-22T09:00', true), true); // --now
});
