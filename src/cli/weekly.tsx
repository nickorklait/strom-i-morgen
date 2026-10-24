// npm run weekly [-- --end 2026-10-25]
// Sunday summary: national (all areas) or one price area, depending on STROM_PROFILE.
import { loadConfig } from '../config.ts';

await import(loadConfig().mode === 'national' ? './weeklyNational.tsx' : './weeklyArea.tsx');
