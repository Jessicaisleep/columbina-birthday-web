'use strict';
/**
 * 把库里的投稿导出成 JSON / CSV，方便线下看或交给人整理。
 *   node tools/dump-submissions.js                 # JSON 到 stdout
 *   node tools/dump-submissions.js --csv out.csv   # CSV 到文件
 */
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

function parseArgs(argv) {
  const out = { csv: null, limit: 1000, offset: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') out.csv = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--offset') out.offset = Number(argv[++i]);
  }
  return out;
}

function esc(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* MySQL 的 JSON 列经 mysql2 回来已经是对象 */
function asArray(v) {
  if (v === null || v === undefined) return [];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }
  return Array.isArray(v) ? v : [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await db.init();
  const rows = await db.listSubmissions(args.limit, args.offset);
  const items = [];
  for (const r of rows) {
    const files = await db.filesOf(r.id);
    items.push({
      ...r,
      team_members: asArray(r.team_members),
      other_chars: asArray(r.other_chars),
      files: files.map((f) => ({ id: f.id, name: f.original_name, size: Number(f.size), path: f.stored_path })),
    });
  }
  if (!args.csv) {
    process.stdout.write(JSON.stringify({ count: items.length, items }, null, 2));
    process.stdout.write('\n');
    return;
  }
  const cols = ['id', 'created_at', 'title', 'category', 'duration', 'creation_type', 'contact_type',
    'contact_value', 'nicknames', 'team_members', 'intro', 'has_other_chars', 'other_chars',
    'progress', 'preview_type', 'preview_link', 'files', 'ip'];
  const lines = [cols.join(',')];
  for (const it of items) {
    lines.push(cols.map((c) => {
      let v = it[c];
      if (Array.isArray(v)) {
        v = v.map((x) => (typeof x === 'object' ? `${x.role || ''}:${x.nickname || ''}` : x)).join(' / ');
      }
      return esc(v);
    }).join(','));
  }
  const dest = path.resolve(process.cwd(), args.csv);
  fs.writeFileSync(dest, '\ufeff' + lines.join('\r\n') + '\r\n', 'utf8');
  console.log(`已导出 ${items.length} 条投稿 → ${dest}`);
}

main().then(() => {
  /* 连接池不关的话进程不会自己退出 */
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
