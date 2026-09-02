#!/usr/bin/env node
/**
 * 接口契约比对：比较两份快照，逐条列出差异。
 *
 * 用法：
 *   node scripts/contract-compare.js <baseline> <candidate>
 *   node scripts/contract-compare.js before after
 *
 * 退出码：0 = 完全一致；1 = 存在差异。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '.contract');
const [baseline, candidate] = process.argv.slice(2);

if (!baseline || !candidate) {
  console.error('用法：node scripts/contract-compare.js <baseline> <candidate>');
  process.exit(2);
}

function load(label) {
  const file = path.join(OUT_DIR, `${label}.json`);
  if (!fs.existsSync(file)) {
    console.error(`找不到快照：${file}`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 递归收集差异，返回形如 `a.b[0].c: 旧值 → 新值` 的条目。 */
function diffValues(oldValue, newValue, prefix, out) {
  const bothObjects =
    oldValue && newValue && typeof oldValue === 'object' && typeof newValue === 'object' &&
    !Array.isArray(oldValue) && !Array.isArray(newValue);

  if (bothObjects) {
    const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    for (const key of keys) {
      diffValues(oldValue[key], newValue[key], prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }

  const bothArrays = Array.isArray(oldValue) && Array.isArray(newValue);
  if (bothArrays) {
    if (oldValue.length !== newValue.length) {
      out.push(`${prefix}.length: ${oldValue.length} → ${newValue.length}`);
    }
    const max = Math.max(oldValue.length, newValue.length);
    for (let i = 0; i < max; i += 1) {
      if (i >= oldValue.length || i >= newValue.length) continue;
      diffValues(oldValue[i], newValue[i], `${prefix}[${i}]`, out);
    }
    return;
  }

  if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
    const render = (v) => (v === undefined ? '<缺失>' : JSON.stringify(v));
    out.push(`${prefix}: ${render(oldValue)} → ${render(newValue)}`);
  }
}

const before = load(baseline);
const after = load(candidate);

const beforeByName = new Map(before.results.map((r) => [r.name, r]));
const afterByName = new Map(after.results.map((r) => [r.name, r]));

const missing = [...beforeByName.keys()].filter((n) => !afterByName.has(n));
const added = [...afterByName.keys()].filter((n) => !beforeByName.has(n));

let diffCount = 0;
const lines = [];

for (const name of beforeByName.keys()) {
  if (!afterByName.has(name)) continue;
  const a = beforeByName.get(name);
  const b = afterByName.get(name);
  const issues = [];

  if (a.status !== b.status) issues.push(`状态码: ${a.status} → ${b.status}`);
  if (a.contentType !== b.contentType) issues.push(`Content-Type: ${a.contentType} → ${b.contentType}`);
  if (a.contentDisposition !== b.contentDisposition) {
    issues.push(`Content-Disposition: ${a.contentDisposition} → ${b.contentDisposition}`);
  }
  if (a.bytes !== b.bytes) issues.push(`字节数: ${a.bytes} → ${b.bytes}`);
  if (a.sha256 !== b.sha256) issues.push(`内容指纹: ${a.sha256} → ${b.sha256}`);

  diffValues(a.body, b.body, 'body', issues);

  if (issues.length) {
    diffCount += 1;
    lines.push(`\n✗ ${name}  (${a.request})`);
    for (const issue of issues.slice(0, 25)) lines.push(`    ${issue}`);
    if (issues.length > 25) lines.push(`    …另有 ${issues.length - 25} 处差异`);
  }
}

console.log(`比对 ${beforeByName.size} 个探针：${baseline} → ${candidate}`);
console.log(`一致 ${beforeByName.size - diffCount} 个，差异 ${diffCount} 个`);

if (missing.length) console.log(`仅存在于 ${baseline}：${missing.join(', ')}`);
if (added.length) console.log(`仅存在于 ${candidate}：${added.join(', ')}`);

if (lines.length) {
  console.log(lines.join('\n'));
  process.exit(1);
}
console.log('\n✓ 接口契约完全一致');
