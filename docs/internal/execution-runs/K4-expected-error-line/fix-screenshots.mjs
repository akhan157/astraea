import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';
import assert from 'node:assert/strict';
const root='/home/ak/astraea-evidence/goal-collegiate-accuracy/K4';
const headers=await readFile('dist/_headers','utf8');const csp=headers.match(/^  Content-Security-Policy: (.+)$/m)[1];
const server=await preview({preview:{host:'127.0.0.1',port:0,headers:{'Content-Security-Policy':csp}}});let browser;
try {
 browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--renderer-process-limit=2','--num-raster-threads=2','--js-flags=--wasm-num-compilation-tasks=2']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});await page.addInitScript(()=>localStorage.setItem('astraea.workstation.toured','1'));
 const response=await page.goto(new URL('app/',server.resolvedUrls.local[0]).href);assert.ok(response.headers()['content-security-policy']);
 const stage=name=>page.getByRole('navigation',{name:'Pipeline stages'}).getByRole('button',{name,exact:true}).click();
 const run=async()=>{const b=page.getByRole('banner').getByRole('button',{name:/Run simulation/});await b.click({timeout:60000});await b.waitFor({state:'visible'});await page.locator('[aria-label^="Apogee (committed run) "]').waitFor({timeout:120000});};
 await run();await stage('Flight');await page.getByText('No error band: site temperature not set.').waitFor({timeout:60000});await page.screenshot({path:`${root}/screenshots/fix-no-temperature.png`,animations:'disabled'});
 for(const [name,expected] of [['byrum','±5.5']]){
  await stage('Mission');await page.getByLabel('Import file',{exact:true}).setInputFiles(`${root}/${name}.astraea.json`);
  await run();await stage('Flight');await page.getByText(`Typical error ${expected} % (dev. data, 20 airframes)`,{exact:true}).waitFor({timeout:120000});
  const line=page.getByText(`Typical error ${expected} % (dev. data, 20 airframes)`,{exact:true});const metrics=await line.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect(),b=el.getBoundingClientRect();return {textWidth:r.width,textHeight:r.height,containerWidth:b.width,containerHeight:b.height};});console.log(name,JSON.stringify(metrics));assert.ok(metrics.textWidth<=metrics.containerWidth && metrics.textHeight<=metrics.containerHeight+0.1);await page.screenshot({path:`${root}/screenshots/fix-${name}.png`,animations:'disabled'});
 }
} finally {await browser?.close();await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}
