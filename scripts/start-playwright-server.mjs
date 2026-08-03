import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sourcePath = path.join(root, 'server.js');
const testServerPath = path.join(root, '.playwright-server.mjs');
const marker = `        fontSrc: ["'self'", 'data:'],\n`;

const source = await fs.readFile(sourcePath, 'utf8');
if (!source.includes(marker)) {
  throw new Error('Не найдено место для отключения HTTPS-upgrade в тестовом CSP.');
}

const testSource = source.replace(
  marker,
  `${marker}        // Локальный Playwright-сервер работает по HTTP; production CSP не изменяется.\n        upgradeInsecureRequests: null,\n`,
);

await fs.writeFile(testServerPath, testSource, 'utf8');

const cleanup = () => fs.rm(testServerPath, { force: true }).catch(() => {});
process.once('exit', cleanup);
process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);

await import(`${pathToFileURL(testServerPath).href}?run=${Date.now()}`);
