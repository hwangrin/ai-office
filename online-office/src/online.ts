/** Standalone Office frontend + the existing Native Partners adapter.
 * No executors, provider credentials, new agent backend or conversation store. */
import express from 'express';
import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {WebSocketServer} from 'ws';
import {NativePartnersBridge,nativeCookie} from './nativePartners.ts';
import {resolveOfficeMountPath} from './office-path.ts';

const upstream=process.env.OFFICE_JAVIS_ORIGIN||'https://hwangrin.cloud';
const officeMountPath=resolveOfficeMountPath(process.env.OFFICE_MOUNT_PATH);
const officeEntryPath=officeMountPath+'/';
export function createOnlineOffice(origin=process.env.OFFICE_PUBLIC_ORIGIN||'https://hwangrin.cloud'){
 const own=new URL(origin),app=express();app.disable('x-powered-by');
 const records=new Map<string,{bridge:NativePartnersBridge,router:express.Router,token:string,at:number}>();
 const departments=JSON.parse(readFileSync('office.config.json','utf8')).departments;
 app.get('/health',(_req,res)=>res.json({ok:true,application:'ai-office',mode:'LIVE_NATIVE_PARTNERS'}));
 const office=express.Router();
 const authRequired=(req:express.Request,res:express.Response)=>{if(req.path==='/'){res.status(401).type('html').send(`<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Office</title><body style="background:#101113;color:#ece8df;font:16px system-ui;padding:32px"><h1>AI Office</h1><p>Đăng nhập Javis để mở văn phòng.<br>Sign in to Javis to open your office.</p><p><a style="color:#d9b46a" href="/">Đăng nhập / Sign in</a></p><p><a style="color:#d9b46a" href="${officeEntryPath}">Mở lại văn phòng / Reopen Office</a></p></body></html>`);}else res.status(401).json({auth_required:true});};
 office.use(async(req,res,next)=>{
  res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'});
  if(req.headers.host!==own.host){res.sendStatus(403);return;}
  if(!['GET','HEAD'].includes(req.method)&&(req.get('Origin')!==own.origin||req.get('Sec-Fetch-Site')!=='same-origin')){res.sendStatus(403);return;}
  try{
   const cookie=nativeCookie(req);
   // Verify the existing Javis session for every request, including all licensed assets.
   // No Office login, cookie minting, auth cache or bearer credential is introduced.
   const check=await fetch(upstream+'/brains',{headers:{Cookie:cookie,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
   if(!check.ok){if(check.status===401||check.status===403)authRequired(req,res);else res.sendStatus(503);return;}
   const brains=await check.json();if(!Array.isArray(brains.brains))throw Error('invalid_native_contract');
   const key=createHash('sha256').update(cookie).digest('hex');let record=records.get(key);
   if(!record){
    for(const [key,value]of records)if(Date.now()-value.at>43200000)records.delete(key);
    if(records.size>=100){res.sendStatus(503);return;}
    const bridge=new NativePartnersBridge(departments),token=randomBytes(24).toString('hex');
    record={bridge,token,router:bridge.router(token,own.origin),at:Date.now()};records.set(key,record);
   }
   record.at=Date.now();res.locals.office=record;next();
  }catch(e){if((e as any)?.code==='AUTH_ERROR')authRequired(req,res);else res.sendStatus(503);}
 });
 // No cloud fixture in V1: an old DEMO URL or stale local preference cannot reach Javis.
 office.post('/api/connection-mode',express.json({limit:'1kb'}),(req,res,next)=>{if(req.body?.mode==='FIXTURE'){res.status(423).json({code:'demo_not_deployed'});return;}next();});
 office.use((req,res,next)=>res.locals.office.router(req,res,next));
 office.get('/',(_req,res)=>res.type('html').send(readFileSync('public/index.html','utf8').replace('__OFFICE_TOKEN__',res.locals.office.token)));
 office.use('/vendor/three',express.static(path.resolve('node_modules/three')));
 office.use('/vendor/fonts',express.static(path.resolve('node_modules/@fontsource')));
 office.use(express.static(path.resolve('public'),{index:false,dotfiles:'deny'}));
 office.use((_req,res)=>res.sendStatus(404));
 app.use(officeMountPath,office);
 const server=http.createServer(app),wss=new WebSocketServer({noServer:true});
 server.on('upgrade',async(req,socket,head)=>{
  try{
   const u=new URL(req.url||'/',own);
    if(req.headers.host!==own.host||req.headers.origin!==own.origin||u.pathname!==officeMountPath+'/ws')throw Error('origin_refused');
   const cookie=nativeCookie(req as any),key=createHash('sha256').update(cookie).digest('hex'),record=records.get(key);
   const supplied=u.searchParams.get('token')||'';if(!record||supplied.length!==record.token.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(record.token)))throw Error('token_refused');
   const r=await fetch(upstream+'/brains',{headers:{Cookie:cookie},redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('session_refused');
   // Scene socket only. Native chat uses the established, session-filtered WSS adapter.
   wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  }catch{socket.destroy();}
 });
 server.on('close',()=>wss.close());
 return {app,server};
}
if(process.env.OFFICE_START==='1'){
 if(upstream!=='https://hwangrin.cloud'||process.env.OFFICE_PUBLIC_ORIGIN!=='https://hwangrin.cloud')throw Error('Unexpected production origin');
 const {server}=createOnlineOffice();server.listen(4810,'0.0.0.0',()=>console.log('AI Office ready on internal port 4810'));
 process.on('SIGTERM',()=>server.close());
}
