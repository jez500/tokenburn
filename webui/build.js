import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const FONTS = [
  'space-grotesk-latin-400-normal', 'space-grotesk-latin-500-normal',
  'space-grotesk-latin-600-normal', 'space-grotesk-latin-700-normal',
  'jetbrains-mono-latin-400-normal', 'jetbrains-mono-latin-500-normal',
  'jetbrains-mono-latin-600-normal',
];
const FONT_PKG = {
  'space-grotesk': 'node_modules/@fontsource/space-grotesk/files',
  'jetbrains-mono': 'node_modules/@fontsource/jetbrains-mono/files',
};

rmSync('public', { recursive: true, force: true });
mkdirSync('public/fonts', { recursive: true });

cpSync('src/index.html', 'public/index.html');
cpSync('src/styles.css', 'public/styles.css');

for (const f of FONTS) {
  const pkgDir = f.startsWith('space-grotesk') ? FONT_PKG['space-grotesk'] : FONT_PKG['jetbrains-mono'];
  cpSync(`${pkgDir}/${f}.woff2`, `public/fonts/${f}.woff2`);
}

await esbuild.build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  outfile: 'public/app.js',
  jsx: 'automatic',
  format: 'iife',
  minify: true,
  loader: { '.jsx': 'jsx' },
  logLevel: 'info',
});

console.log('build complete → public/');
