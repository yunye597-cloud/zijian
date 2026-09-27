// Run from workspace root. PLAYWRIGHT_PATH / BROWSER_PATH may override local tools.
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'C:/Users/ThinkPad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const label=process.argv[2]||'baseline';
const sourcePath=process.argv[3]||'.performance/baseline-app.js';
const trials=Number(process.env.TRIALS||3);
const throttle=Number(process.env.CPU_RATE||1);
const instrumentation=`
  window.bench={state, compose, update, burstAt, draw, recolorParticles, controls, totals:{}};
  const timed=(name,fn)=>(...args)=>{const t=performance.now();const done=()=>{const v=bench.totals[name] ||= {ms:0,calls:0};v.ms+=performance.now()-t;v.calls++};const out=fn(...args);if(out?.then)return out.finally(done);done();return out;};
  layoutGlyphs=timed('layout',layoutGlyphs);
  splitGlyph=timed('splitGlyph',splitGlyph);
  findConnectedComponents=timed('connected',findConnectedComponents);
  splitComponentsIntoCells=timed('cells',splitComponentsIntoCells);
  createPiece=timed('pieces',createPiece);
  assignNeighbors=timed('neighbors',assignNeighbors);
  recolorParticles=timed('recolor',recolorParticles);
  const originalRead=CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData=function(...args){const t=performance.now();const out=originalRead.apply(this,args);const v=bench.totals.read ||= {ms:0,calls:0};v.ms+=performance.now()-t;v.calls++;return out;};
  const create=document.createElement.bind(document);
  document.createElement=(...args)=>{if(args[0]==='canvas'){const v=bench.totals.canvas ||= {ms:0,calls:0};v.calls++}return create(...args)};
`;
function instrument(source){return source.replace('  els.input.value = DEFAULT_TEXT;',instrumentation+'\n  els.input.value = DEFAULT_TEXT;')}
module.exports={instrument};
if(require.main===module)(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const rows=[];
 for(const kind of ['repeat','unique'])for(const n of [50,200,500,1000]){
  for(let trial=0;trial<trials;trial++){
   const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
   await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:instrument(fs.readFileSync(sourcePath,'utf8'))}));
   const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});
   await page.goto('http://127.0.0.1:4173/zijian-github/');
   await page.evaluate(({kind,n})=>{for(const [id,v] of Object.entries({'layout-width':1000,'layout-height':900,'font-size':18,'line-height':1,'letter-spacing':0}))bench.controls[id].value=v;document.querySelector('#text-input').value=kind==='repeat'?'汉字崩解春风山水'.repeat(Math.ceil(n/8)).slice(0,n):Array.from({length:n},(_,i)=>String.fromCharCode(0x4e00+i)).join('')},{kind,n});
   for(const pass of ['cold','warm']){
    const row=await page.evaluate(async()=>{
     const long=[];const obs=new PerformanceObserver(l=>long.push(...l.getEntries().map(x=>x.duration)));obs.observe({type:'longtask'});
     bench.totals={};const start=performance.now();document.querySelector('#compose-button').click();
     while(bench.state.generating)await new Promise(r=>setTimeout(r,0));
     const ready=performance.now()-start;await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
     const painted=performance.now()-start;obs.disconnect();
     return {ready,painted,parts:bench.state.particles.length,glyphs:document.querySelector('#stat-glyphs').textContent,totals:bench.totals,longest:Math.max(0,...long)};
    });rows.push({kind,n,trial,pass,...row});
   }
   await page.close();
  }
  console.log(label,kind,n,'done');
 }
 fs.mkdirSync('.performance',{recursive:true});
 fs.writeFileSync(path.join('.performance',label+'.json'),JSON.stringify({browser:browser.version(),throttle,trials,rows},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
