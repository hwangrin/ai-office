// Authoring tool: wraps static UI literals only; interpolated entity data remains untouched.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'public/js/main.js');
const dict=JSON.parse(fs.readFileSync(path.join(root,'public/js/locales.json'),'utf8')).flat();
const source=fs.readFileSync(file,'utf8');if(source.startsWith('// localized-static-ui')){console.log('Already localized');process.exit(0);}
let i=0,out='',depth=0,protectedDepth=null;
const has=s=>dict.some(k=>s.includes(k));
function quoted(q){const start=i++;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i++]===q)break;}return source.slice(start,i);}
function code(stop=false){let local=0;while(i<source.length){const c=source[i],n=source[i+1];
 if(c==='/'&&n==='/'){const e=source.indexOf('\n',i);out+=source.slice(i,e<0?source.length:e);i=e<0?source.length:e;continue;}
 if(c==='/'&&n==='*'){const e=source.indexOf('*/',i+2);out+=source.slice(i,e+2);i=e+2;continue;}
 if(c==='/'&&(/[([=,:!?;&|{}]$/.test(out.trimEnd())||/\breturn$/.test(out.trimEnd()))){const start=i++;let cls=false;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='[')cls=true;if(source[i]===']')cls=false;if(source[i++]==='/'&&!cls)break;}while(/[a-z]/i.test(source[i]||'')&&i<source.length)i++;out+=source.slice(start,i);continue;}
 if(c==='"'||c==="'"){const token=quoted(c);let value;try{value=Function('return ('+token+')')();}catch{out+=token;continue;}const isKey=/^\s*:/.test(source.slice(i));const already=/\btr\(\s*$/.test(out);out+=typeof value==='string'&&has(value)&&protectedDepth===null&&!isKey&&!already?'tr('+token+')':token;continue;}
 if(c==='`'){const tagged=/\bui\s*$/.test(out);out+=(tagged?'':'ui')+'`';i++;while(i<source.length){if(source[i]==='\\'){out+=source.slice(i,i+2);i+=2;continue;}if(source[i]==='`'){out+='`';i++;break;}if(source[i]==='$'&&source[i+1]==='{'){out+='$'+'{';i+=2;code(true);continue;}out+=source[i++];}continue;}
 if(c==='{'){if(/\bconst\s+DEPT_(DISPLAY_EN|VI)\s*=\s*$/.test(out))protectedDepth=depth+1;depth++;local++;}
 if(c==='}'){if(stop&&local===0){out+=c;i++;return;}if(protectedDepth===depth)protectedDepth=null;depth--;local--;}
 out+=c;i++;
}}
code();fs.writeFileSync(file,'// localized-static-ui\n'+out);console.log('STATIC_UI_LOCALIZED');
