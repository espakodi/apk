'use strict';

const CONFIG = {
  owner: 'espakodi',
  repo: 'apk',
  cacheTtlMs: 15 * 60 * 1000,
};

const API_URL = './releases.json';
const CACHE_KEY = `releases:${CONFIG.owner}/${CONFIG.repo}`;

const PALETTES = [
  { id: 'teal', name: 'Teal', color: '#136b5e' },
  { id: 'indigo', name: 'Índigo', color: '#37548f' },
  { id: 'burgundy', name: 'Burdeos', color: '#8a3144' },
  { id: 'forest', name: 'Bosque', color: '#356b3f' },
  { id: 'terracotta', name: 'Terracota', color: '#a85534' },
];

const ICON = {
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
};

let CODES = {};

const $ = (sel, root = document) => root.querySelector(sel);

// Acceso a localStorage tolerante a fallos (modo privado, cookies bloqueadas,
// cuota llena o JSON corrupto) para que nada de esto rompa el arranque.
function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch { /* sin persistencia */ }
}
function lsGetJSON(key, fallback) {
  try { const v = lsGet(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

function boot() {
  initTheme();
  initPalette();
  initA11y();
  initCopy();
  load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// --- Tema (claro / oscuro / sistema por defecto) ---

function initTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  applyTheme();
  media.addEventListener('change', () => {
    if (!lsGet('theme')) applyTheme();
  });
  $('#theme-btn').addEventListener('click', () => {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    lsSet('theme', next);
    applyTheme();
  });
}

function resolvedTheme() {
  const pref = lsGet('theme');
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', resolvedTheme());
}

// --- Paleta de color ---

function initPalette() {
  const saved = lsGet('palette');
  if (PALETTES.some((p) => p.id === saved)) applyPalette(saved);

  const pop = $('#palette-pop');
  pop.innerHTML = PALETTES.map((p) => `
    <button class="swatch" type="button" role="menuitemradio" data-palette="${p.id}">
      <span class="dot" style="background:${p.color}"></span>${p.name}
      <span class="check">${ICON.check}</span>
    </button>`).join('');
  markPalette();

  pop.querySelectorAll('[data-palette]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyPalette(btn.dataset.palette);
      lsSet('palette', btn.dataset.palette);
      markPalette();
      togglePopover($('#palette-btn'), pop, false);
    });
  });

  bindPopover($('#palette-btn'), pop);
}

function applyPalette(id) {
  document.documentElement.setAttribute('data-palette', id);
}

function markPalette() {
  const current = document.documentElement.getAttribute('data-palette');
  $('#palette-pop').querySelectorAll('[data-palette]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.palette === current));
  });
}

// --- Accesibilidad ---

function initA11y() {
  const saved = new Set(lsGetJSON('a11y', []));

  const root = document.documentElement;
  document.querySelectorAll('[data-a11y]').forEach((btn) => {
    const cls = btn.dataset.a11y;
    const on = saved.has(cls);
    root.classList.toggle(cls, on);
    btn.setAttribute('aria-pressed', String(on));

    btn.addEventListener('click', () => {
      const active = root.classList.toggle(cls);
      btn.setAttribute('aria-pressed', String(active));
      const current = new Set(lsGetJSON('a11y', []));
      active ? current.add(cls) : current.delete(cls);
      lsSet('a11y', JSON.stringify([...current]));
    });
  });

  bindPopover($('#a11y-btn'), $('#a11y-panel'));
}

// --- Popovers ---

function bindPopover(btn, pop) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover(btn, pop, pop.hasAttribute('hidden'));
  });
  // Un clic dentro del popover no debe cerrarlo (p. ej. para activar varios toggles seguidos).
  pop.addEventListener('click', (e) => e.stopPropagation());
}

function togglePopover(btn, pop, show) {
  if (show) closeAllPopovers();
  pop.toggleAttribute('hidden', !show);
  btn.setAttribute('aria-expanded', String(show));
}

function closeAllPopovers() {
  document.querySelectorAll('.popover').forEach((pop) => {
    if (pop.hasAttribute('hidden')) return;
    pop.setAttribute('hidden', '');
    const btn = document.getElementById(pop.getAttribute('id') === 'palette-pop' ? 'palette-btn' : 'a11y-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', closeAllPopovers);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllPopovers(); });

// --- Copiar (delegado) ---

function initCopy() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    copy(btn.dataset.copy, btn.dataset.copyLabel || 'Copiado');
  });
}

// --- Carga de datos ---

async function load() {
  try {
    const res = await fetch('./codes.json', { cache: 'no-cache' });
    if (res.ok) CODES = await res.json();
  } catch {
    // codes.json es opcional; sin él solo se muestran las descargas directas.
  }

  let releases;
  let stale = false;
  try {
    releases = await fetchReleases();
  } catch (err) {
    const cached = readCache();
    if (!cached) { renderError(err); return; }
    releases = cached.data;
    stale = true;
  }

  const visible = (Array.isArray(releases) ? releases : [])
    .filter((r) => r && !r.draft && !r.prerelease)
    .sort((a, b) => releaseTime(b) - releaseTime(a));
  if (visible.length === 0) {
    renderError(new Error('No hay versiones publicadas todavía.'));
    return;
  }

  renderLatest(visible[0]);
  renderHistory(visible);
  if (stale) showToast('Mostrando datos guardados (GitHub no responde)');
}

async function fetchReleases() {
  const cached = readCache();
  if (cached && Date.now() - cached.at < CONFIG.cacheTtlMs) return cached.data;

  const res = await fetch(API_URL, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
  const data = await res.json();
  lsSet(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  return data;
}

function readCache() {
  return lsGetJSON(CACHE_KEY, null);
}

// --- Render ---

function renderLatest(release) {
  const badge = $('#latest-badge');
  badge.innerHTML = `<span class="tag">${escapeHtml(release.tag_name)}</span>
    <span class="date">Publicada el ${formatDate(release.published_at)}</span>`;
  badge.hidden = false;

  const grid = $('#downloads-grid');
  const apks = (release.assets || []).filter(isApk);
  if (apks.length === 0) {
    grid.innerHTML = '<p class="loading">Esta versión no tiene archivos APK.</p>';
    return;
  }
  grid.innerHTML = '';
  for (const asset of apks) grid.appendChild(buildCard(asset));
}

function buildCard(asset) {
  const arch = describeArch(asset.name);
  const meta = getMeta(asset.name);
  const card = document.createElement('div');
  card.className = 'card' + (arch.recommended ? ' recommended' : '');
  card.innerHTML = `
    <div class="card-head">
      <h3 class="card-arch">${escapeHtml(arch.label)}</h3>
      <span class="card-pill ${arch.recommended ? 'is-rec' : ''}">${escapeHtml(arch.pill)}</span>
    </div>
    ${arch.note ? `<p class="card-note">${escapeHtml(arch.note)}</p>` : ''}
    <p class="card-size">${formatSize(asset.size)}</p>
    <a class="btn-download" href="${asset.browser_download_url}" rel="noopener">${ICON.download} Descargar</a>
    ${codeBlock(meta)}
    ${hashesBlock(asset, meta)}`;
  return card;
}

function codeBlock(meta) {
  if (!meta.code) return '';
  return `<div class="code-row">
    <span class="code-label">Código Downloader</span>
    <span class="code-value">${escapeHtml(meta.code)}</span>
    <button class="btn-copy" type="button" data-copy="${escapeHtml(meta.code)}" data-copy-label="Código copiado">${ICON.copy} Copiar</button>
  </div>`;
}

function hashesBlock(asset, meta) {
  const rows = [];
  const sha = sha256Of(asset);
  if (sha) rows.push(hashRow('SHA256', sha));
  if (meta.md5) rows.push(hashRow('MD5', meta.md5));
  return rows.length ? `<div class="hashes">${rows.join('')}</div>` : '';
}

function hashRow(label, value) {
  return `<div class="hash">
    <span class="hash-label">${label}</span>
    <span class="hash-value">${escapeHtml(value)}</span>
    <button class="btn-copy" type="button" data-copy="${escapeHtml(value)}" data-copy-label="${label} copiado">${ICON.copy} Copiar</button>
  </div>`;
}

function renderHistory(releases) {
  const list = $('#history-list');
  list.innerHTML = '';

  releases.forEach((release, idx) => {
    const isLatest = idx === 0;
    const details = document.createElement('details');
    details.className = 'release';
    if (isLatest) details.open = true;

    const apks = (release.assets || []).filter(isApk);
    details.innerHTML = `
      <summary>
        <span class="rel-tag">${escapeHtml(release.tag_name)}</span>
        ${isLatest ? '<span class="rel-latest">Última</span>' : ''}
        <span class="rel-date">${formatDate(release.published_at)}</span>
      </summary>
      <div class="rel-body">
        <div class="rel-notes">${renderMarkdown(release.body || '')}</div>
        <div class="rel-assets">${apks.map(assetRow).join('')}</div>
      </div>`;
    list.appendChild(details);
  });
}

function assetRow(asset) {
  const meta = getMeta(asset.name);
  const chip = meta.code ? `<span class="code-chip" title="Código Downloader">#${escapeHtml(meta.code)}</span>` : '';
  return `<div class="rel-asset">
    <div class="rel-asset-head">
      <span class="asset-name">${escapeHtml(asset.name)}</span>
      <span class="asset-size">${formatSize(asset.size)}</span>
      <span class="spacer"></span>
      ${chip}
      <a class="btn-download" href="${asset.browser_download_url}" rel="noopener">${ICON.download} Descargar</a>
    </div>
    ${hashesBlock(asset, meta)}
  </div>`;
}

function renderError(err) {
  $('#downloads-grid').innerHTML = `<div class="error-box">No se pudieron cargar las versiones (${escapeHtml(err.message)}).
    Mira las descargas directamente en
    <a href="https://github.com/${CONFIG.owner}/${CONFIG.repo}/releases" target="_blank" rel="noopener">GitHub Releases</a>.</div>`;
  $('#history-list').innerHTML = '';
}

// --- Helpers ---

function isApk(asset) {
  return asset.name.toLowerCase().endsWith('.apk');
}

function getMeta(name) {
  const v = CODES[name];
  if (!v) return { code: '', md5: '' };
  if (typeof v === 'string') return { code: v, md5: '' };
  return { code: v.code || '', md5: v.md5 || '' };
}

function describeArch(name) {
  const n = name.toLowerCase();
  if (/arm64|v8a|aarch64/.test(n)) {
    return {
      label: 'ARM64 · 64 bits',
      pill: 'Recomendada · móviles',
      note: 'Móviles y tablets modernos, NVIDIA Shield y TV box de 64 bits.',
      recommended: true,
    };
  }
  if (/armeabi|v7a|arm32/.test(n)) {
    return {
      label: 'ARM · 32 bits',
      pill: 'Máxima compatibilidad',
      note: 'Fire TV Stick, Chromecast con Google TV y equipos económicos. Si la de 64 bits no instala, usa esta.',
      recommended: false,
    };
  }
  if (/x86_64|x64/.test(n)) return { label: 'x86_64', pill: 'Emuladores / x86', note: 'PC con emulador Android de 64 bits.', recommended: false };
  if (/x86/.test(n)) return { label: 'x86', pill: 'Emuladores / x86', note: 'PC con emulador Android de 32 bits.', recommended: false };
  return { label: name.replace(/\.apk$/i, ''), pill: 'APK', note: '', recommended: false };
}

function sha256Of(asset) {
  const digest = asset.digest || '';
  return digest.startsWith('sha256:') ? digest.slice(7) : '';
}

function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function releaseTime(release) {
  const t = new Date(release.published_at || release.created_at || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

async function copy(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMsg);
  } catch {
    showToast('No se pudo copiar');
  }
}

let toastTimer;
function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 200);
  }, 2200);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Render mínimo de las notas de release: encabezados, viñetas, párrafos,
// negrita y enlaces. El texto se escapa antes para evitar inyección.
function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inList = false;

  const inline = (text) => escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 6);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  return out.join('') || '<p class="loading">Sin notas de versión.</p>';
}
