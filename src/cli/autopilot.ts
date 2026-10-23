// npm run autopilot: what the scheduled job runs. Build tomorrow's post (once prices are out), then publish if due.
import { spawnSync } from 'node:child_process';

const run = (script: string) => spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true }).status === 0;
const generated = run('generate');
const weekly = run('weekly'); // only does something on Sundays
const published = run('publish');
if (!generated || !weekly || !published) process.exitCode = 1;
