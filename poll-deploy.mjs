import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const URL=env.NEXT_PUBLIC_SUPABASE_URL, ANON=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TARGET='https://mind.avirspace.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function probe(){
  const sb=createClient(URL,ANON);
  await sb.auth.signInWithPassword({email:'owner@avir-test.dev',password:'TestPersona!2026'});
  await sb.rpc('reset_my_web_sessions');
  const b=await chromium.launch();
  const ctx=await b.newContext(); const p=await ctx.newPage();
  await p.goto(TARGET+'/login');
  await p.fill('#email','owner@avir-test.dev'); await p.fill('#password','TestPersona!2026');
  await p.getByRole('button',{name:'Sign in'}).click();
  await p.waitForURL(/command-center/,{timeout:30000}).catch(()=>{});
  await p.goto(TARGET+'/settings/sessions').catch(()=>{});
  await p.waitForTimeout(1500);
  await b.close();
  const {data}=await sb.rpc('get_user_sessions');
  const rows=Array.isArray(data)?data:[];
  const live=rows.find(r=>String(r.user_agent||'').includes('Mozilla'));
  return live?live.user_agent:null;
}
for(let i=1;i<=18;i++){
  try{ const ua=await probe(); if(ua){ console.log('DEPLOYED after',i,'tries — live session UA:',ua.slice(0,60)); process.exit(0);} console.log(`try ${i}: no live session yet`);}
  catch(e){ console.log(`try ${i}: err ${String(e).slice(0,80)}`);}
  await sleep(25000);
}
console.log('TIMEOUT: middleware session row never appeared'); process.exit(1);
