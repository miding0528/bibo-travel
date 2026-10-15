// 檢查：原始碼裡每個「Tailwind 認得的 class」是否真的出現在 dist 的 CSS（取代原型 CDN 掃 DOM 的行為）。
// 用法：npm run build && node scripts/audit-tailwind.mjs
import fs from 'fs';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import cfg from '../tailwind.config.js';
import { fileURLToPath } from 'url';
const root=fileURLToPath(new URL('../', import.meta.url));
const js=fs.readFileSync(root+'src/main.js','utf8').split(String.fromCharCode(92)+"'").join("'").split(String.fromCharCode(92)+'"').join('"');
const html=fs.readFileSync(root+'index.html','utf8');
const seed=fs.readFileSync(root+'src/data/seed.json','utf8');
const toks=new Set();
for(const src of [js,html,seed]){
  for(const m of src.matchAll(/class(?:Name)?\s*=\s*\\?["']([^"'<>]*)["']/g)) m[1].split(/\s+/).forEach(t=>t&&toks.add(t));
  // also any quoted string consisting of class-like tokens
  for(const m of src.matchAll(/["']([a-z:\-\[\]\.\/0-9#_!%(),\s']+)["']/gi)) m[1].split(/\s+/).forEach(t=>{const bare=t.replace(/\[[^\]]*\]/g,'[]');if(/^[a-z!\-][\w:\-\[\]\.\/#%()!]*$/i.test(bare)&&t.length>2)toks.add(t)});
}
const css=fs.readdirSync(root+'dist/static').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(root+'dist/static/'+f,'utf8')).join('\n');
const esc=t=>t.replace(/[^\w-]/g,c=>String.fromCharCode(92)+c);
let missing=[];
const list=[...toks];
// generate in chunks
const config={...cfg, content:[{raw:'x'}]};
async function gen(batch){
  const c={...cfg, content:[{raw:batch.join(' ')}], corePlugins:{preflight:false}};
  const r=await postcss([tailwind(c)]).process('@tailwind utilities;@tailwind components;',{from:undefined});
  return r.css;
}
let n=0;
for(let i=0;i<list.length;i+=1){
  const t=list[i];
  const out=await gen([t]);
  if(out.trim()){ // valid tailwind class
    n++;
    // does dist css have the rule? compare by looking for escaped selector
    if(!css.includes('.'+esc(t))) missing.push(t);
  }
}
console.log('tokens',list.length,'valid tailwind',n,'missing in dist',missing);
