import { cp, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'static', 'vendor');
await mkdir(out, {recursive: true});
await cp(path.join(root, 'node_modules/katex/dist'), path.join(out, 'katex'), {recursive: true});
await copyFile(path.join(root, 'node_modules/katex/LICENSE'), path.join(out, 'KATEX-LICENSE'));
await mkdir(path.join(out, 'vazirmatn'), {recursive: true});
for (const file of ['vazirmatn-arabic-400-normal.woff2', 'vazirmatn-arabic-600-normal.woff2', 'vazirmatn-latin-400-normal.woff2']) {
  await copyFile(path.join(root, 'node_modules/@fontsource/vazirmatn/files', file), path.join(out, 'vazirmatn', file));
}
await copyFile(path.join(root, 'node_modules/@fontsource/vazirmatn/LICENSE'), path.join(out, 'VAZIRMATN-LICENSE'));
await mkdir(path.join(out, 'mathlive'), {recursive: true});
await copyFile(path.join(root, 'node_modules/mathlive/mathlive.min.mjs'), path.join(out, 'mathlive/mathlive.min.mjs'));
await cp(path.join(root, 'node_modules/mathlive/fonts'), path.join(out, 'mathlive/fonts'), {recursive: true});
await copyFile(path.join(root, 'node_modules/mathlive/LICENSE.txt'), path.join(out, 'MATHLIVE-LICENSE'));
console.log('Local KaTeX, MathLive and Vazirmatn assets prepared.');
