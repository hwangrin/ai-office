// Translate static UI fragments before dynamic values are inserted. Entity data is never passed through ui().
const pairs=await fetch('/js/locales.json').then(r=>{if(!r.ok)throw new Error('Localization dictionary unavailable');return r.json();});
let language='en';try{language=localStorage.getItem('office.language')==='vi'?'vi':'en';}catch{}
const en=new Map(),vi=new Map();for(const [a,b] of pairs){en.set(a,a);if(!en.has(b))en.set(b,a);vi.set(a,b);vi.set(b,b);}
for(const [old,key] of Object.entries({"Model (bỏ trống = mặc định)":"Model (blank = default)","Agent chỉ nên đọc/ghi trong thư mục này.":"Agents should only read/write in this directory.","Giao brief":"Dispatch brief","Giao":"Dispatch","Gắn phiên":"Attach session","Gắn phiên có sẵn":"Attach existing session","Đang làm":"Working","Quan sát chỉ đọc":"Read-Only Observer","Lounge trung tâm":"Central lounge","Tuyển nhân viên mới":"Recruit employee","Tuyển":"Recruit","Người nhận":"Recipient","Số việc":"Task count"," việc":" tasks","Vào":"Input","Ra":"Output","Xin quyền: ":"Request permission: ","Đợi tải tệp lên xong rồi giao nhé":"Wait for uploads to finish before dispatching"})){en.set(old,en.get(key)||key);vi.set(old,vi.get(key)||old);}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const keys=[...en.keys()].sort((a,b)=>b.length-a.length);
const matcher=new RegExp(keys.map(escape).join('|'),'gu');
export const getLanguage=()=>language;
export function tr(value){if(value==null)return '';const text=String(value),map=language==='vi'?vi:en;if(map.has(text))return map.get(text);return text.replace(matcher,(hit,index,whole)=>{const left=whole[index-1],right=whole[index+hit.length];if((/^\p{L}/u.test(hit)&&left&&/\p{L}/u.test(left))||(/\p{L}$/u.test(hit)&&right&&/\p{L}/u.test(right)))return hit;return map.get(hit)||hit;});}
export function ui(strings,...values){return strings.reduce((out,part,i)=>out+tr(part)+(i<values.length?values[i]:''),'');}
const records=new WeakMap();
const skip='script,style,textarea,pre,code,[data-user-content],#p-name,#p-role,#feed,#log,.pv,.sess .top,.model-row td:first-child,.agent-row td:first-child b,option[data-user-content],select[name="to"] option,select[name="departmentId"] option,select[name="id"] option,.chip:not([class*="status-"])';
export function localizeDom(){
 document.documentElement.lang=language;document.title=language==='vi'?'Văn phòng ảo':'Virtual Office';
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()){
  if(!node.parentElement||node.parentElement.closest(skip))continue;
  const raw=node.textContent,trim=raw.trim();if(!trim)continue;
  const old=records.get(node),source=old&&raw===old.rendered?old.source:raw;
  const key=source.trim();if(!en.has(key))continue;
  const next=source.replace(key,language==='vi'?vi.get(key):en.get(key));records.set(node,{source,rendered:next});if(raw!==next)node.textContent=next;
 }
 for(const el of document.querySelectorAll('[placeholder],[title],[aria-label]')){
  if(el.closest('[data-user-content]'))continue;
  for(const attr of ['placeholder','title','aria-label']){const raw=el.getAttribute(attr);if(!raw)continue;const key=raw.trim();if(en.has(key)){const next=language==='vi'?vi.get(key):en.get(key);if(raw!==next)el.setAttribute(attr,next);}}
 }
}
export function setLanguage(next){if(!['en','vi'].includes(next))return;language=next;try{localStorage.setItem('office.language',next);}catch{}window.dispatchEvent(new Event('office-language'));localizeDom();}
let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;localizeDom();});}).observe(document.body,{childList:true,subtree:true});
localizeDom();

const messages=await fetch('/js/messages.json').then(r=>{if(!r.ok)throw new Error('UI messages unavailable');return r.json();});
export function message(key,values={}){const source=messages[language][key]??messages.en[key];if(typeof source!=='string')throw new Error('Missing message '+key);return Object.entries(values).reduce((text,[k,v])=>text.replaceAll('{'+k+'}',String(v)),source);}
export function countText(key,count){const n=Math.max(0,Math.trunc(Number(count)||0));const forms=messages[language][key]??messages.en[key];return forms[n===0?0:n===1?1:2].replace('{count}',String(n));}
