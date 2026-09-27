const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/ThinkPad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 for(const [label,file] of [['baseline','.performance/baseline-app.js'],['optimized','zijian-github/app.js']]){
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const source=fs.readFileSync(file,'utf8').replace('  els.input.value = DEFAULT_TEXT;', '  window.profileCompose=compose;\n  els.input.value = DEFAULT_TEXT;');
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source}));
  await page.goto('http://127.0.0.1:4173/zijian-github/');
  await page.evaluate(()=>{for(const [id,v] of Object.entries({'layout-width':1000,'layout-height':900,'font-size':18,'line-height':1,'letter-spacing':0}))document.getElementById(id).value=v;document.querySelector('#text-input').value=Array.from({length:1000},(_,i)=>String.fromCharCode(0x4e00+i)).join('')});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  await page.evaluate(()=>profileCompose());const {profile}=await cdp.send('Profiler.stop');
  fs.writeFileSync(`.performance/${label}.cpuprofile`,JSON.stringify(profile));
  const byId=new Map(profile.nodes.map(n=>[n.id,n.callFrame.functionName||'(anonymous)']));const totals={};
  profile.samples.forEach((id,i)=>{const n=byId.get(id);totals[n]=(totals[n]||0)+profile.timeDeltas[i]/1000});
  console.log(label,Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,12));await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
