// Instagram API with Instagram Login (graph.instagram.com).
// Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing

export class InstagramError extends Error {
  constructor(message: string, readonly status: number, readonly code?: number) {
    super(message);
  }
}

type FetchFn = typeof fetch;

export interface InstagramClientOptions {
  userId: string;
  token: string;
  apiVersion: string;
  fetch?: FetchFn;
  /** Status polling; Meta suggests checking about once a minute, for at most 5 minutes. */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export class InstagramClient {
  private readonly base: string;
  private readonly fetch: FetchFn;

  constructor(private readonly opts: InstagramClientOptions) {
    this.base = `https://graph.instagram.com/${opts.apiVersion}`;
    this.fetch = opts.fetch ?? fetch;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, params: Record<string, string | undefined> = {}): Promise<T> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, access_token: this.opts.token })) if (v !== undefined) body.set(k, v);
    const url = method === 'GET' ? `${this.base}/${path}?${body}` : `${this.base}/${path}`;
    const res = await this.fetch(url, method === 'GET' ? {} : { method, body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
    if (!res.ok || json.error) throw new InstagramError(json.error?.message ?? `HTTP ${res.status}`, res.status, json.error?.code);
    return json;
  }

  /** Image container. Feed image (with caption/alt text), carousel item, or story. */
  async createImage(o: { imageUrl: string; caption?: string; altText?: string; carouselItem?: boolean; story?: boolean }): Promise<string> {
    const { id } = await this.call<{ id: string }>('POST', `${this.opts.userId}/media`, {
      image_url: o.imageUrl,
      caption: o.caption,
      alt_text: o.altText,
      is_carousel_item: o.carouselItem ? 'true' : undefined,
      media_type: o.story ? 'STORIES' : undefined,
    });
    return id;
  }

  async createCarousel(children: string[], caption?: string): Promise<string> {
    const { id } = await this.call<{ id: string }>('POST', `${this.opts.userId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
    return id;
  }

  async status(containerId: string): Promise<string> {
    const { status_code } = await this.call<{ status_code: string }>('GET', containerId, { fields: 'status_code' });
    return status_code;
  }

  async waitUntilReady(containerId: string): Promise<void> {
    const interval = this.opts.pollIntervalMs ?? 5000;
    const deadline = Date.now() + (this.opts.pollTimeoutMs ?? 5 * 60_000);
    for (;;) {
      const s = await this.status(containerId);
      if (s === 'FINISHED') return;
      if (s === 'ERROR' || s === 'EXPIRED') throw new InstagramError(`Container ${containerId} ${s}`, 0);
      if (Date.now() > deadline) throw new InstagramError(`Container ${containerId} not ready (${s})`, 0);
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  async publish(containerId: string): Promise<string> {
    const { id } = await this.call<{ id: string }>('POST', `${this.opts.userId}/media_publish`, { creation_id: containerId });
    return id;
  }

  async permalink(mediaId: string): Promise<string | null> {
    const { permalink } = await this.call<{ permalink?: string }>('GET', mediaId, { fields: 'permalink' });
    return permalink ?? null;
  }

  /** Posts used in the current 24 h window. */
  async quotaUsage(): Promise<number> {
    const { data } = await this.call<{ data: { quota_usage: number }[] }>('GET', `${this.opts.userId}/content_publishing_limit`, { fields: 'quota_usage' });
    return data[0]?.quota_usage ?? 0;
  }

  /**
   * The account behind the token. `userId` is the professional account ID (<IG_ID>) used in publishing paths;
   * the `id` field of /me is only an app-scoped ID. The response is either flat or wrapped in `data`.
   */
  /** Follower and post counts of the account. */
  async accountStats(): Promise<{ followers: number; mediaCount: number }> {
    const r = await this.call<{ followers_count?: number; media_count?: number }>('GET', this.opts.userId, { fields: 'followers_count,media_count' });
    return { followers: r.followers_count ?? 0, mediaCount: r.media_count ?? 0 };
  }

  /** Recent feed media (id + permalink), newest first. */
  async recentMedia(limit = 50): Promise<{ id: string; permalink: string }[]> {
    const r = await this.call<{ data: { id: string; permalink: string }[] }>('GET', `${this.opts.userId}/media`, { fields: 'id,permalink', limit: String(limit) });
    return r.data;
  }

  /**
   * Lifetime insights for one post or story (needs instagram_business_manage_insights).
   * Unavailable metrics come back missing, not 0. Story metrics only exist for 24 hours.
   */
  async mediaInsights(mediaId: string, kind: 'feed' | 'story'): Promise<Record<string, number>> {
    const metric = kind === 'feed' ? 'reach,likes,comments,saved,shares' : 'reach,replies,shares';
    const r = await this.call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>('GET', `${mediaId}/insights`, { metric });
    return Object.fromEntries(r.data.map((d) => [d.name, d.total_value?.value ?? d.values?.[0]?.value ?? 0]));
  }

  async whoAmI(): Promise<{ userId: string; username: string; accountType: string | null }> {
    type Me = { user_id?: string | number; username?: string; account_type?: string };
    const r = await this.call<Me & { data?: Me[] }>('GET', 'me', { fields: 'user_id,username,account_type' });
    const me = r.data?.[0] ?? r;
    if (!me.user_id) throw new InstagramError('The token did not return an Instagram account (user_id). Was it generated with Instagram login?', 0);
    return { userId: String(me.user_id), username: me.username ?? '?', accountType: me.account_type ?? null };
  }

  /** Feed post: one image, or a carousel of 2–20 images. Returns the published media id. */
  async publishFeed(imageUrls: string[], caption: string, altText?: string): Promise<string> {
    if (imageUrls.length === 1) {
      const id = await this.createImage({ imageUrl: imageUrls[0], caption, altText });
      await this.waitUntilReady(id);
      return this.publish(id);
    }
    const children: string[] = [];
    for (const url of imageUrls) children.push(await this.createImage({ imageUrl: url, carouselItem: true }));
    for (const c of children) await this.waitUntilReady(c);
    const carousel = await this.createCarousel(children, caption);
    await this.waitUntilReady(carousel);
    return this.publish(carousel);
  }

  /** Each image becomes its own story. Returns the published media ids. */
  async publishStories(imageUrls: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const url of imageUrls) {
      const id = await this.createImage({ imageUrl: url, story: true });
      await this.waitUntilReady(id);
      ids.push(await this.publish(id));
    }
    return ids;
  }
}

/** Long-lived tokens last 60 days; refreshing (allowed after 24 h) gives a new 60-day token. */
export async function refreshToken(token: string, fetchFn: FetchFn = fetch): Promise<{ token: string; expiresInSeconds: number }> {
  const res = await fetchFn(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!res.ok || !json.access_token) throw new InstagramError(json.error?.message ?? `Token refresh failed (HTTP ${res.status})`, res.status);
  return { token: json.access_token, expiresInSeconds: json.expires_in ?? 0 };
}
