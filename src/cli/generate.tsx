// npm run generate [-- --date 2026-10-25]
// National profile (all areas in one post) or one price area, depending on STROM_PROFILE.
import { loadConfig } from '../config.ts';

await import(loadConfig().mode === 'national' ? './generateNational.tsx' : './generateArea.tsx');
