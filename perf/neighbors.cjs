// Compare the optimized search with the preserved pre-followup implementation.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/ThinkPad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const results=[];
 for(const file of ['.performance/round2-before.js','zijian-github/app.js']){
  const page=await browser.newPage();
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8').replace('  els.input.value = DEFAULT_TEXT;','  window.searchNeighbors=assignNeighbors;\n  els.input.value = DEFAULT_TEXT;')}));
  await page.goto('http://127.0.0.1:4173/zijian-github/');
  results.push(await page.evaluate(async()=>{
   let seed=91;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
   const p=Array.from({length:2000},()=>({originX:random()*240-120,originY:random()*240-120}));
   // Equal distances, coincident origins, negative bucket coordinates and radius edges.
   for(const x of [-72,-58,0,58,72,72-1e-10,72+1e-10])for(const y of [-72,-58,0,58,72])p.push({originX:x,originY:y});
   for(let i=0;i<10;i++)p.push({originX:0,originY:0});
   let calls=0;const original=Math.hypot;Math.hypot=(...v)=>{calls++;return original(...v)};
   await searchNeighbors(p);Math.hypot=original;
   return {neighbors:p.map(x=>x.neighbors),calls};
  }));await page.close();
 }
 assert.deepEqual(results[1].neighbors,results[0].neighbors);
 assert.ok(results[1].calls<results[0].calls);
 console.log(JSON.stringify({result:'PASS',particles:results[0].neighbors.length,beforeDistanceCalls:results[0].calls,afterDistanceCalls:results[1].calls}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
