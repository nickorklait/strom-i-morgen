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

## Next steps

- Publishing: reuse the Instagram publisher, scheduler and dashboard from `haslum-poc`, publishing every day at about 14:00 once tomorrow's prices are out.
- Its own Instagram account, and a GitHub repo with Actions, set up in the same way as the football project.
- A weekly overview (cheapest/most expensive day), and possibly a comparison with Norgespris.
