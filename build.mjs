import { readFile, writeFile, mkdir, copyFile, readdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'dist');
const sourceOut = path.join(out, 'source');
const modules = new Map();
const rootPrefix = root + path.sep;
const safePath = (from, spec) => {
  if (!spec.startsWith('.')) throw new Error(`External dependency rejected: ${spec}`);
  const resolved = path.resolve(path.dirname(from), spec);
  if (!resolved.startsWith(rootPrefix)) throw new Error('Import leaves project');
  return resolved;
};
async function bundle(file) {
  if (modules.has(file)) return modules.get(file).id;
  const id = modules.size;
  const module = { id, code: '' };
  modules.set(file, module);
  let code = await readFile(file, 'utf8');
  const imports = [...code.matchAll(/^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm)];
  for (const match of imports) {
    const dep = await bundle(safePath(file, match[2]));
    const binding = match[1].trim();
    let statement;
    if (binding.startsWith('{')) statement = `const ${binding.replace(/\bas\b/g, ':')} = __require(${dep});`;
    else if (binding.startsWith('* as ')) statement = `const ${binding.slice(5)} = __require(${dep});`;
    else throw new Error(`Unsupported import in ${file}: ${binding}`);
    code = code.replace(match[0], '\n' + statement + '\n');
  }
  const exports = [];
  code = code.replace(/\bexport\s+(const|let|var|function|class)\s+(\w+)/g, (_, type, name) => { exports.push([name, name]); return `${type} ${name}`; });
  code = code.replace(/\bexport\s*\{([^}]+)\};?/g, (_, names) => { for (const item of names.split(',')) { const [local, name] = item.trim().split(/\s+as\s+/); if (local) exports.push([name || local, local]); } return ''; });
  if (/\bimport\s*\(|^\s*(?:import|export)\s/m.test(code)) throw new Error(`Unsupported module syntax: ${file}`);
  module.code = `${code}\nObject.assign(exports, {${exports.map(([name, local]) => `${JSON.stringify(name)}:${local}`).join(',')}});`;
  return id;
}
await mkdir(out, { recursive: true });
let html = await readFile(path.join(root, 'index.html'), 'utf8');
const styles = [];
for (const match of [...html.matchAll(/<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/g)]) {
  const file = safePath(path.join(root, 'index.html'), match[1].startsWith('.') ? match[1] : './' + match[1]);
  styles.push(file);
  const css = await readFile(file, 'utf8');
  html = html.replace(match[0], () => `<style>${css}</style>`);
}
const entry = await bundle(path.join(root, 'src', 'app.js'));
const js = `(()=>{'use strict';const __modules={${[...modules.values()].map(m => `${m.id}:(exports)=>{\n${m.code}\n}`).join(',\n')}};const __cache={};function __require(id){if(__cache[id])return __cache[id];const exports=__cache[id]={};__modules[id](exports);return exports;}__require(${entry});})();`;
const script = `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`;
const scriptTag = /<script\b[^>]*src=["'][^"']*app\.js["'][^>]*>\s*<\/script>/;
if (!scriptTag.test(html)) throw new Error('index.html must reference src/app.js');
html = html.replace(scriptTag, () => script);
const license = await readFile(path.join(root, 'LICENSE'), 'utf8');
html = html.replace('</head>', `<meta name="generator" content="Last Beacon Complete offline build"><!--\n${license}\n--></head>`);
await writeFile(path.join(out, 'last-beacon.html'), html);
const documents = ['LICENSE', 'README.md', 'SOURCES.md', 'THIRD_PARTY_NOTICES.md', 'TEST-REPORT.md', 'RESEARCH.md', 'CHANGELOG.md', 'PROVENANCE.md', 'IMPLEMENTATION.md', 'start.cmd', 'server.mjs'];
for (const name of documents) await copyFile(path.join(root, name), path.join(out, name));
const sourceFiles = [...modules.keys(), ...styles, ...['index.html', 'build.mjs', 'package.json', ...documents].map(name => path.join(root, name))];
for (const name of await readdir(path.join(root, 'tests'))) if (name.endsWith('.mjs')) sourceFiles.push(path.join(root, 'tests', name));
for (const directory of ['docs', 'scripts']) {
  await cp(path.join(root, directory), path.join(out, directory), { recursive: true });
  await cp(path.join(root, directory), path.join(sourceOut, directory), { recursive: true });
}
const manifest = [];
for (const file of [...new Set(sourceFiles)]) {
  const relative = path.relative(root, file);
  const target = path.join(sourceOut, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(file, target);
  manifest.push({ path: relative.replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
}
for (const directory of ['docs', 'scripts']) {
  async function record(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) await record(p);
      else manifest.push({ path: path.relative(root, p).replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(p)).digest('hex') });
    }
  }
  await record(path.join(root, directory));
}
await writeFile(path.join(out, 'BUILD-MANIFEST.json'), JSON.stringify({ entry: 'src/app.js', modules: [...modules.keys()].map(file => path.relative(root, file).replaceAll('\\', '/')), singleHTML: { file: 'last-beacon.html', sha256: createHash('sha256').update(html).digest('hex') }, sourceFiles: manifest }, null, 2));
console.log(`Built dist/last-beacon.html: ${Buffer.byteLength(html)} bytes, ${modules.size} local modules. No runtime dependencies.`);
