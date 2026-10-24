import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { areaConfig, factCheckAgainst, orderedAreas } from '../src/national.ts';
import { unitsFor, weeklyUnits } from '../src/publish/plan.ts';

const config = loadConfig('norge');

test('the national profile covers every area, most people first, with the right VAT', () => {
  assert.equal(config.mode, 'national');
  assert.deepEqual(orderedAreas(config), ['NO1', 'NO5', 'NO2', 'NO3', 'NO4']);
  const nord = areaConfig(config, 'NO4');
  assert.deepEqual([nord.area.name, nord.area.vat, nord.brand.tagline], ['Nord-Norge', 0, 'Spotpris Nord-Norge']);
  assert.equal(areaConfig(config, 'NO1').area.vat, 0.25);
  assert.throws(() => areaConfig(config, 'NO9'));
});

test('a number in the national caption that is not in the data is caught', () => {
  const text = 'Østlandet: 59 øre · billigst kl. 21–24\nNord-Norge: 22 øre\n#strøm NO4';
  assert.deepEqual(factCheckAgainst(text, [59, 22, 21, 24]), []);
  assert.deepEqual(factCheckAgainst(text, [59, 21, 24]), ['number "22" is not in the data']);
});

test('the national post publishes the images listed in post.json', () => {
  const images = { feed: ['strom_2026-10-25_0_norge.png', 'strom_2026-10-25_NO1.png', 'strom_2026-10-25_elbil.png'], story: ['strom_2026-10-25_0_norge_story.png', 'strom_2026-10-25_NO1_story.png'] };
  const [feed, story] = unitsFor('2026-10-25', 'tekst', config, images);
  assert.deepEqual([feed.key, feed.images, story.key, story.images], ['2026-10-25-feed', images.feed, '2026-10-25-story', images.story]);
  const [wFeed] = weeklyUnits('uke-2026-W43', '2026-10-25', 'tekst', config, { feed: ['a.png'], story: ['b.png'] });
  assert.deepEqual(wFeed.images, ['a.png']);
});
