const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/ThinkPad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');const {instrument}=require('./benchmark.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const pages=[];
 for(const file of ['.performance/baseline-app.js','zijian-github/app.js']){
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:instrument(fs.readFileSync(file,'utf8'))}));
  await page.goto('http://127.0.0.1:4173/zijian-github/');pages.push(page);
 }
 let cases=0;
 for(const font of ['default','sans','kai'])for(const size of [18,31,54])for(const fragmentation of [0,35,50,100]){
  const results=[];
  for(const page of pages)results.push(await page.evaluate(async({font,size,fragmentation})=>{
   document.querySelector('#font-family').value=font;
   bench.controls['font-size'].value=size;bench.controls.fragmentation.value=fragmentation;
   document.querySelector('#text-input').value='汉字崩解，春风山水。汉字崩解，春风山水。';
   await bench.compose();bench.state.paused=true;
   const p=bench.state.particles;
   const parts=p.map(p=>[p.originX,p.originY,p.width,p.height,p.seed,p.fallback,p.neighbors,p.image.toDataURL()]);
   for(const color of ['#ff0044','#00ff00','#25231f']){document.querySelector('#text-color').value=color;bench.recolorParticles()}
   bench.burstAt(100,80,1,{x:150,y:50});for(let i=0;i<30;i++)bench.update(1/60);bench.draw();
   return {parts,motion:p.map(p=>[p.x,p.y,p.angle,p.active,p.damage]),image:document.querySelector('#stage').toDataURL()};
  },{font,size,fragmentation}));
  assert.deepEqual(results[1],results[0],`${font} ${size} ${fragmentation}`);cases++;
 }
 await browser.close();console.log(`PASS ${cases} baseline comparisons: particle geometry/order, seeds, neighbors, bitmap pixels, color changes, deterministic motion and canvas output`);
})().catch(e=>{console.error(e);process.exit(1)});
