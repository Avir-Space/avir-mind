import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
await sb.auth.signInWithPassword({email:'owner@avir-test.dev',password:'TestPersona!2026'});
const {data:st}=await sb.from('aircraft_state').select('aircraft_id,state').eq('state','on_ground').limit(1);
const {data:ac}=await sb.from('aircraft').select('tail_number').eq('id',st[0].aircraft_id).single();
const tail=ac.tail_number;
const T='https://mind.avirspace.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function attempt(){
  const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
  let diag=null;
  p.on('console',m=>{const t=m.text();if(t.includes('DRAG-DIAG'))diag=t;});
  await p.goto(T+'/login');await p.fill('#email','owner@avir-test.dev');await p.fill('#password','TestPersona!2026');await p.getByRole('button',{name:'Sign in'}).click();
  await p.waitForURL(/command-center/,{timeout:60000});
  await p.goto(T+'/fleet'); await p.locator('div.select-none.bg-card').first().waitFor({timeout:30000});
  const card=p.locator('div.select-none.bg-card').filter({hasText:tail}).first();
  const handle=card.getByRole('button',{name:'Drag aircraft'});
  const col=p.getByText('In Air',{exact:true}).locator('xpath=ancestor::div[contains(@class,"min-w-[280px]")][1]');
  const hb=await handle.boundingBox(); const cb=await col.boundingBox();
  await p.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2); await p.mouse.down();
  await p.mouse.move(hb.x+14,hb.y+14,{steps:6});
  await p.mouse.move(cb.x+cb.width/2,cb.y+cb.height*0.4,{steps:16});
  await p.mouse.move(cb.x+cb.width/2+3,cb.y+cb.height*0.4+3,{steps:4});
  await p.waitForTimeout(200); await p.mouse.up(); await p.waitForTimeout(400);
  const dep=await p.getByText('Confirm departure').isVisible().catch(()=>false);
  await b.close();
  return {diag,dep};
}
for(let i=1;i<=14;i++){
  const {diag,dep}=await attempt().catch(e=>({diag:'ERR '+String(e).slice(0,40),dep:false}));
  if(diag){ console.log(`try ${i}: ${diag} | Confirm departure: ${dep}`); if(String(diag).includes('over')){process.exit(0);} }
  else console.log(`try ${i}: no DRAG-DIAG yet, dialog: ${dep}`);
  await sleep(20000);
}
console.log('TIMEOUT'); process.exit(1);
