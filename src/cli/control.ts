// npm run control -- --action '{"type":"pause"}' [--by name]
// Applies one dashboard action to data/<profile>/controls.json. In the cloud the action comes from the
// DASHBOARD_ACTION environment variable (set by the workflow from the dashboard request).
// For "publish-now" it writes publish_key=<key> to $GITHUB_OUTPUT so the workflow publishes that post.

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { applyAction, readControls, writeControls } from '../controls.ts';
import { parseAction } from '../controlsSchema.ts';

const { values: args } = parseArgs({ options: { action: { type: 'string' }, by: { type: 'string' } } });
const raw = args.action ?? process.env.DASHBOARD_ACTION;
if (!raw) throw new Error('Give --action \'{"type":"pause"}\' or set DASHBOARD_ACTION.');

const input = JSON.parse(raw) as { action?: unknown; by?: unknown };
// The workflow passes { action, by }; the CLI also accepts a bare action.
const action = parseAction(input.action ?? input);
const by = typeof input.by === 'string' ? input.by : (args.by ?? 'cli');

writeControls(applyAction(readControls(), action, by));
console.log(`Applied ${action.type} (by ${by}).`);

if (action.type === 'publish-now' && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `publish_key=${action.key}\n`);
