import type { Config } from '../config.ts';

export interface Unit {
  /** "2026-10-24-feed" / "2026-10-24-story": the key in data/published.json. */
  key: string;
  date: string;
  kind: 'feed' | 'story';
  /** One image (story) or several (feed carousel). */
  images: string[];
  caption: string | null;
  /** Oslo local "YYYY-MM-DDTHH:MM". */
  publishAt: string;
  expiresAt: string;
}

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The post for a date: from the configured time the day before until midday on the day itself. */
export function unitsFor(date: string, caption: string, config: Config): Unit[] {
  const publishAt = `${addDays(date, -1)}T${config.publish.time}`;
  const expiresAt = `${date}T${config.publish.lastUsefulTime}`;
  const units: Unit[] = [{ key: `${date}-feed`, date, kind: 'feed', images: [`strom_${date}_feed.png`, `strom_${date}_kostnad.png`], caption, publishAt, expiresAt }];
  if (config.publish.stories) units.push({ key: `${date}-story`, date, kind: 'story', images: [`strom_${date}_story.png`], caption: null, publishAt, expiresAt });
  return units;
}

/** Not yet published, and within the window (unless forced). */
export const isDue = (u: Unit, published: Record<string, unknown>, now: string, force = false) => !published[u.key] && (force || (u.publishAt <= now && now < u.expiresAt));
