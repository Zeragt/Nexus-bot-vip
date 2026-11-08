/** تشغيل الخادم والواجهة معاً أثناء التطوير: الخادم على 3001 وVite على 5173. */
import { spawn } from 'node:child_process';

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const procs = [run('node', ['--watch', 'server/index.js']), run('npx', ['vite', '--config', 'client/vite.config.js'])];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
