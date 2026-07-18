import { chromium } from '@playwright/test';
const T='https://mind.avirspace.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function once(){
  const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
  await p.goto(T+'/login'); await p.fill('#email','owner@avir-test.dev'); await p.fill('#password','TestPersona!2026');
  await p.getByRole('button',{name:'Sign in'}).click();
  await p.waitForURL(/command-center/,{timeout:30000}).catch(()=>{});
  const resp=await p.goto(T+'/signals',{waitUntil:'commit'}).catch(()=>null);
  const h=resp? resp.headers()['x-avir-sess'] : undefined;
  await b.close();
  return h;
}
for(let i=1;i<=20;i++){
  const h=await once().catch(e=>'ERR:'+String(e).slice(0,40));
  if(h!==undefined){ console.log('RESULT x-avir-sess =>', h); process.exit(0); }
  console.log(`try ${i}: header absent (old middleware still live)`);
  await sleep(22000);
}
console.log('TIMEOUT: header never appeared'); process.exit(1);
