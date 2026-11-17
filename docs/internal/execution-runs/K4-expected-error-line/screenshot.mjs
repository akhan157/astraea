import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';
const headers = await readFile('dist/_headers','utf8');
const csp = headers.match(/^  Content-Security-Policy: (.+)$/m)[1];
const server = await preview({preview:{host:'127.0.0.1',port:0,headers:{'Content-Security-Policy':csp}}});
let browser;
try {
 browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.addInitScript(()=>localStorage.setItem('astraea.workstation.toured','1'));
 await page.goto(new URL('app/',server.resolvedUrls.local[0]).href);
 await page.getByRole('banner').getByRole('button',{name:/Run simulation/}).click({timeout:60000});
 await page.locator('[aria-label^="Apogee (committed run) "]').waitFor({timeout:120000});
 await page.getByRole('navigation',{name:'Pipeline stages'}).getByRole('button',{name:'Flight',exact:true}).click();
 await page.getByText('No expected-error band for this flight.').waitFor({timeout:60000});
 await page.screenshot({path:'/home/ak/astraea-evidence/goal-collegiate-accuracy/K4/screenshots/final-no-band-1280.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/home/ak/astraea-evidence/goal-collegiate-accuracy/K4/screenshots/final-no-band-phone.png',animations:'disabled'});
} finally { await browser?.close(); await new Promise((res,rej)=>server.httpServer.close(e=>e?rej(e):res())); }
