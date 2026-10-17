#!/usr/bin/env node
import { readFileSync, realpathSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fail = message => { throw new Error(message); };
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) fail(`${label}: 글자를 확인해 주세요.`);
  return value.trim();
};
function localFile(relative) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(relative) || relative.split('/').some(part => part === '.' || part === '..')) {
    fail(`잘못된 파일 경로: ${relative}`);
  }
  const file = realpathSync(resolve(root, relative));
  if (!file.startsWith(root + sep) || !statSync(file).isFile()) fail(`저장소 안의 파일이 필요합니다: ${relative}`);
  return relative;
}

const data = JSON.parse(readFileSync(resolve(root, 'albums.json'), 'utf8'));
if (data.schemaVersion !== 1 || !Array.isArray(data.albums) || !data.albums.length) fail('공개 앨범 목록을 확인해 주세요.');
const title = text(data.title, '앨범 제목');
const ids = new Set();
const albums = data.albums.map((album, index) => {
  if (typeof album.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(album.id) || ids.has(album.id)) fail(`중복되거나 잘못된 앨범 ID: ${album.id}`);
  ids.add(album.id);
  const path = `albums/${album.id}/`;
  if (album.path !== path) fail(`앨범 경로는 ${path}여야 합니다.`);
  localFile(path + 'index.html');
  if (typeof album.cover !== 'string' || !album.cover.startsWith(path) || !/\.(?:webp|png|jpe?g|avif)$/i.test(album.cover)) fail(`표지 경로를 확인해 주세요: ${album.id}`);
  localFile(album.cover);
  if (![album.width, album.height].every(size => Number.isInteger(size) && size > 0 && size <= 20000)) fail(`표지 이미지 크기를 확인해 주세요: ${album.id}`);
  const label = text(album.title, '이벤트 제목');
  const alt = text(album.alt, '표지 대체 텍스트');
  return `      <li>
        <a class="album-card" href="${escape(path)}">
          <span class="cover"><img src="${escape(album.cover)}" alt="${escape(alt)}" width="${album.width}" height="${album.height}" decoding="async"${index === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}></span>
          <span class="card-label"><span>${escape(label)}</span><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </a>
      </li>`;
});

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#f5efe6">
  <meta name="description" content="${escape(title)}">
  <title>${escape(title)} · Rahae</title>
  <link rel="stylesheet" href="assets/home.css?v=hub1">
</head>
<body>
  <main class="home">
    <header class="home-head"><h1>${escape(title)}</h1></header>
    <ul class="albums" aria-label="앨범 목록">
${albums.join('\n')}
    </ul>
  </main>
</body>
</html>
`;

// Validate the complete list before replacing the published home.
const target = resolve(root, 'index.html');
const temporary = resolve(root, '.index.html.build');
writeFileSync(temporary, html);
renameSync(temporary, target);
console.log(`Built album home: ${albums.length} published album${albums.length === 1 ? '' : 's'}.`);
