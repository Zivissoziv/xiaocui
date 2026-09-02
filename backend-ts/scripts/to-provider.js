#!/usr/bin/env node
/**
 * 把「导出一组模块函数的文件」机械转换为 NestJS 的 @Injectable 类。
 *
 * 只改结构，不改逻辑——函数体逐字符保留。转换规则：
 *   - import 语句移除（由 --header 提供新的一份）
 *   - export function foo()   →   foo()          （公有方法）
 *   - function foo()          →   private foo()  （私有方法）
 *   - const FOO = v;          →   private readonly FOO = v;
 *   - let foo: T = v;         →   private foo: T = v;
 *   - 上述名字及 --members 列出的标识符，调用处自动加 this. 前缀
 *
 * 用法：
 *   node scripts/to-provider.js <源文件> <目标文件> \
 *     --class RepositoryService --members db,readJson,writeJson \
 *     --header /tmp/header.txt
 *
 * --header 文件的内容会原样放在类声明之前，通常包含 import、
 * @Injectable() 装饰器、类声明行与构造函数。
 */
'use strict';

const fs = require('fs');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--class') args.class = argv[++i];
    else if (arg === '--members') args.members = argv[++i];
    else if (arg === '--header') args.header = argv[++i];
    else args._.push(arg);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const [srcPath, destPath] = args._;

if (!srcPath || !destPath || !args.class || !args.header) {
  console.error('用法：node scripts/to-provider.js <源> <目标> --class <类名> --header <头文件> [--members a,b]');
  process.exit(2);
}

const original = fs.readFileSync(srcPath, 'utf8');
const extraMembers = (args.members || '').split(',').map((s) => s.trim()).filter(Boolean);

// ---- 1. 先判定哪些函数是导出的（决定方法可见性）----
const exported = new Set();
const exportRe = /^export\s+(?:async\s+)?function\s+(\w+)/gm;
let em;
while ((em = exportRe.exec(original))) exported.add(em[1]);

let body = original;

// ---- 2. 移除 import 语句（含跨行的 import { ... } from '...';）----
body = body.replace(/^import\s+(?:[\s\S]*?)\s+from\s+'[^']+';[ \t]*\r?\n/gm, '');
body = body.replace(/^import\s+'[^']+';[ \t]*\r?\n/gm, '');

// ---- 3. 顶层 const / let 转成类字段（字段名临时加 __FIELD__ 前缀，避免 step5 误加 this.）----
const fieldNames = [];
body = body.replace(/^const\s+(\w+)\s*=/gm, (_m, name) => {
  fieldNames.push(name);
  return `private readonly __FIELD__${name} =`;
});
body = body.replace(/^let\s+(\w+)\s*=/gm, (_m, name) => {
  fieldNames.push(name);
  return `private __FIELD__${name} =`;
});

// ---- 4. 函数定义改成方法，并把名字临时标记，避免被加 this. ----
const fnNames = [];
body = body.replace(/^(?:export\s+)?(async\s+)?function\s+(\w+)\s*\(/gm, (_m, asyncKw, name) => {
  fnNames.push(name);
  const visibility = exported.has(name) ? '' : 'private ';
  return `${visibility}${asyncKw ? 'async ' : ''}__FN__${name}(`;
});

// ---- 5. 调用处加 this. 前缀 ----
// 覆盖四种引用形态：调用 foo(...)、回调/值引用 foo 后跟 ,)]、展开 ...foo(...)、字段值引用
for (const name of new Set([...fnNames, ...fieldNames, ...extraMembers])) {
  body = body.replace(new RegExp(`(?<![.\\w$])${name}(?=\\s*\\()`, 'g'), `this.${name}`);
}
for (const name of fnNames) {
  body = body.replace(new RegExp(`(?<![.\\w$])${name}(?=\\s*[,)\\]])`, 'g'), `this.${name}`);
}
for (const name of new Set([...fnNames, ...fieldNames, ...extraMembers])) {
  body = body.replace(new RegExp(`(?<=\\.\\.\\.)${name}(?=\\s*\\()`, 'g'), `this.${name}`);
}
for (const name of new Set([...fieldNames, ...extraMembers])) {
  body = body.replace(new RegExp(`(?<![.\\w$])${name}(?=\\s*[.\\[])`, 'g'), `this.${name}`);
  body = body.replace(new RegExp(`(?<![.\\w$])${name}(?!\\w)`, 'g'), `this.${name}`);
}

// ---- 6. 恢复临时标记 ----
body = body.replace(/__FN__(\w+)/g, '$1');
body = body.replace(/__FIELD__(\w+)/g, '$1');

// ---- 7. 缩进两格并拼装 ----
const indented = body
  .split(/\r?\n/)
  .map((line) => (line.trim().length === 0 ? '' : `  ${line}`))
  .join('\n')
  .replace(/^\s*\n+/, '')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/\s*$/, '\n');

const header = fs.readFileSync(args.header, 'utf8');
fs.writeFileSync(destPath, `${header}${indented}}\n`, 'utf8');

console.log(`已生成 ${destPath}`);
console.log(`  公有方法 ${exported.size} 个：${[...exported].join(', ')}`);
console.log(`  私有方法 ${fnNames.length - exported.size} 个`);
console.log(`  字段 ${fieldNames.length} 个：${fieldNames.join(', ') || '（无）'}`);
console.log(`  注入成员：${extraMembers.join(', ') || '（无）'}`);
