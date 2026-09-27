const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/ThinkPad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');const {instrument}=require('./benchmark.cjs');
const label=process.argv[2]||'round2-before',source=process.argv[3]||'.performance/round2-before.js';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const rows=[];
 const variants=process.env.COMPARE === 'ablation'
  ? [['baseline','.performance/round2-before.js'],['schedule','.performance/schedule-only.js'],['cache','.performance/cache-only.js'],['current','.performance/round3-before.js']]
  : process.env.COMPARE === 'final' ? [['before','.performance/round2-before.js'],['final','zijian-github/app.js']] : process.env.COMPARE ? [['before','.performance/round2-before.js'],['render','.performance/round2-render.js'],['layered','zijian-github/app.js']] : [[label,source]];
 for(const kind of ['repeat','unique'])for(let trial=0;trial<Number(process.env.TRIALS||3);trial++)for(const [variant,input]of (trial%2 ? [...variants].reverse() : variants)){
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const extra=`
    resizeCanvas=timed('resize',resizeCanvas);draw=timed('draw',draw);
    if(typeof waitForPaint==='function')waitForPaint=timed('waitForPaint',waitForPaint);
    const fontLoad=document.fonts.load.bind(document.fonts);document.fonts.load=timed('fontLoad',fontLoad);
    for(const name of ['width','height']){const d=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,name);Object.defineProperty(HTMLCanvasElement.prototype,name,{...d,set(value){if(this.id==='stage'){const v=bench.totals.dimensionWrites ||= {calls:0};v.calls++}d.set.call(this,value)}})}
  `;
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:instrument(fs.readFileSync(input,'utf8')).replace('  els.input.value = DEFAULT_TEXT;',extra+'\n  els.input.value = DEFAULT_TEXT;')}));
  await page.goto('http://127.0.0.1:4173/zijian-github/');
  await page.evaluate(kind=>{for(const [id,v]of Object.entries({'layout-width':1000,'layout-height':900,'font-size':18,'line-height':1,'letter-spacing':0}))bench.controls[id].value=v;document.querySelector('#text-input').value=kind==='repeat'?'汉字崩解春风山水'.repeat(125):Array.from({length:1000},(_,i)=>String.fromCharCode(0x4e00+i)).join('')},kind);
  for(const [step,fragmentation]of [['initial',50],['same',50],['components',35],['crumbs',90],['back',50]]){
   const result=await page.evaluate(async fragmentation=>{
    bench.controls.fragmentation.value=fragmentation;bench.totals={};const start=performance.now();
    await bench.compose();const ready=performance.now()-start;
    await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));const painted=performance.now()-start;
    return {ready,painted,totals:bench.totals,parts:bench.state.particles.length};
   },fragmentation);rows.push({variant,kind,trial,step,fragmentation,...result});
  }
  await page.close();console.log(variant,kind,trial,'done');
 }
 fs.writeFileSync('.performance/'+label+'.json',JSON.stringify({browser:browser.version(),rows},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
