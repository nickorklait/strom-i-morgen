# Strøm i morgen – POC

A daily social media post with tomorrow's electricity prices for one price area (default NO1 Østlandet), made from open data. This is a sister project of `haslum-poc`: the same approach, but a separate repo, data and account.

```powershell
npm install
npm run generate                       # tomorrow (available after ~13:00)
npm run generate -- --date 2026-10-24  # a specific day
npm test
```

On a corporate network that inspects TLS, run with `$env:NODE_OPTIONS="--use-system-ca"`.

The output goes to `output/<date>/`:

- `strom_<date>_feed.png` (1080×1350)
- `strom_<date>_story.png` (1080×1920)
- `caption.txt`
- `post.json` (the numbers behind the post)

## Data

- **Source:** [Hva koster strømmen.no](https://www.hvakosterstrommen.no/strompris-api), which describes its API as completely open and free for any use. It asks to be credited. Every image and caption says "Strømpriser levert av Hva koster strømmen.no". The underlying data is from ENTSO-E.
- **Prices:** the API gives NOK/kWh excluding VAT. We show **øre/kWh including VAT** (25 %, set per area in `config/config.json`; NO4 has no VAT). Prices are spot prices without grid fees or the supplier's markup, and this is stated on the image.
- **Cache:** each day is fetched once and cached in `data/prices/`.
- **Time handling:** hourly and 15-minute data are both handled (15-minute values are averaged per hour), as are the 23- and 25-hour daylight-saving days.

## Content

- **Average:** for the day, and the change from today.
- **Cheapest window:** the cheapest 3 consecutive hours (`cheapWindowHours`), as a tip for washing and charging.
- **Most expensive hour.**
- **Bar chart:** neutral bars, highlighting only the cheapest window (green) and the most expensive hour (amber). Both are also named in text, and only the highest and lowest bar get a number. The colours are validated against the dark background.
- **Fact-check:** every number in the caption must come from the data, so the build stops otherwise.
- **Sponsor slot:** a placeholder ("Din bedrift her").

## Publishing to Instagram

- `npm run publish` publishes tomorrow's post (feed + story) from 14:00 the day before until 12:00 on the day itself, and only once. The log is `data/published.json`.
- `-- --dry-run` converts the images but sends nothing. `-- --now` ignores the time window. `-- --check` tests the token.
- `npm run autopilot` runs generate followed by publish. The GitHub workflow `.github/workflows/daily.yml` runs it every day (13:15 / 14:15 / 16:15 Oslo winter time) and commits the log and price cache back to the repo.
- Images reach Instagram through a temporary Cloudflare tunnel inside the job.

### Setup

1. **Instagram account:** professional (Creator), with the profile picture `output/brand/profilbilde.png` (create it with `npm run brand`). The bio and intro text are in `output/brand/tekster.txt`.
2. **Token:** use the same Meta app as `haslum-poc`. Under *Instagram → API setup with Instagram login*, add the new account and click *Generate token*.
3. **GitHub:** create a private repo and push this project. Then add the secrets `INSTAGRAM_ACCESS_TOKEN` (the new token) and `TOKEN_ENCRYPTION_KEY` (from `.env`).
4. Actions → *Strøm i morgen* → *Run workflow*.

## Ideas

- A weekly overview (cheapest and most expensive day).
- A comparison with Norgespris (check the price first).
- More price areas (one account per area, or a carousel).

## One account for all of Norway (national mode, the default)

The account posts all five price areas every day (`STROM_PROFILE=norge`, `config/profiles/norge.json`, `"mode": "national"`):

- **Feed carousel:** a cover with every area's average and cheapest window (cheapest area green, dearest amber), then one chart per area (Østlandet, Vestlandet, Sørlandet, Midt-Norge, Nord-Norge), then EV charging per area.
- **Stories:** the cover, then one per area.
- **Caption:** one line per area, the cheapest area, EV charging, and the short source line. Fact-checked against all areas' data.
- **Sunday:** a weekly summary with each area's average and the change from the week before.
- **Validation:** each area is checked on its own. An area that fails is left out of the post (and logged); the others still go out.
- **Images:** `output/norge/<date>/`; the list of images to publish is in `post.json`.

## One account per price area (profiles)

The per-area profiles still exist if separate accounts are wanted later. `STROM_PROFILE` selects the area: `no1` (Østlandet), `no2` (Sørlandet), `no3` (Midt-Norge), `no4` (Nord-Norge, no VAT) or `no5` (Vestlandet).

- **Configuration:** shared settings are in `config/config.json`, and each profile's own settings (area, name, hashtags, `publish.enabled`) in `config/profiles/<profile>.json`.
- **Folders:** images go to `output/<profile>/`, and the publish log and encrypted token to `data/<profile>/`. The price cache in `data/prices/` is shared.
- **Running locally:** `$env:STROM_PROFILE="no5"; npm run generate`.
- **In the cloud:** the workflow runs one job per profile in its matrix (now only `norge`).

**A new account (e.g. Vestlandet):**

1. Create the Instagram account (Creator), and set its profile picture and bio with `STROM_PROFILE=no5 npm run brand`.
2. In the same Meta app: add it as an Instagram Tester, accept the invite, and generate a token.
3. Add the GitHub secret `INSTAGRAM_ACCESS_TOKEN_NO5` (`norge` uses `INSTAGRAM_ACCESS_TOKEN`).
4. Set `"publish": { "enabled": true }` in `config/profiles/no5.json`, add `no5` to the workflow matrix, and push.

## Dashboard

`npm run dashboard` builds `output/<profile>/index.html`. In the cloud it is built after every run and deployed to Cloudflare Pages (project `strom-i-morgen`), behind Cloudflare Access (email login).

- **Is everything OK:** a green "Alt i orden", or a list of problems: a post that should have gone out (checked live in the browser: a warning after 60 min, an error after the last retry), areas left out by the data check, failed publishing, a pause, or Instagram access running out. It also warns if the page has not been updated for a day (the runs may have stopped).
- **Next post:** all images, the caption, and the buttons *Publiser nå*, *Hopp over* and *Rediger tekst*.
- **Prices and data check:** per area, the average, cheapest and dearest 3 hours, the checks passed, and a link to the raw data.
- **Published** posts with links, **settings** (stories, Sunday summary), the **activity log** (who did what), and **"Hvis noe skjer"**: what to do when something goes wrong.
- **Buttons:** the page posts to `/api/action` (`cloud/functions/`). The function checks the Access login and forwards the action to GitHub (`repository_dispatch`); the workflow applies it to `data/<profile>/controls.json`, runs, and redeploys the page (3–5 minutes).

**Setup (once):**

1. GitHub secrets in this repo: `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`, the same as for the football project. The next run creates the Pages project and deploys.
2. Cloudflare: *Workers & Pages → strom-i-morgen → Settings → Enable access policy*, and allow your email (as for football). Copy the application's *AUD tag*.
3. GitHub secrets: `ACCESS_AUD` (the AUD tag) and `DASHBOARD_GITHUB_TOKEN` (fine-grained token for this repo, *Contents: Read and write*). Optional variable `ACCESS_TEAM_DOMAIN` if it is not `fotball-resultater-pages.cloudflareaccess.com`.

## Data validation

Before a post is made, the day is checked. **Any error stops the post.**

- 23, 24 or 25 hours (or the 15-minute equivalents).
- No gaps, with the day covered from 00 to 24.
- All values are numbers, within −1 to 15 kr/kWh.
- One exchange rate per day.
- NOK = EUR × exchange rate for every hour.
- The exchange rate equals one of **Norges Bank's official EUR/NOK rates** from the preceding days. If Norges Bank cannot be reached, this check only gives a warning.

The results are stored in `post.json` (`validation`).

In addition, every number in the caption must come from the data (the fact-check). The comparison with last year is shown in øre instead of percent when last year's price was under 20 øre, because "+315 %" on a few øre is misleading.

## Source in the caption

The caption ends with one short line: "Spotpris inkl. mva, uten nettleie. Kilde: hvakosterstrommen.no" ("… uten mva …" in Nord-Norge). The image carries the full credit. It is short, but shows where the numbers come from, which builds trust and is what the data provider asks for.
