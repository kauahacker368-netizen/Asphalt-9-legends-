// Asphalt Hub — coletor de fontes OFICIAIS. Node 20+, sem dependências.
// Só publica o que tiver URL oficial + data real encontrada na fonte. Nunca inventa.
import fs from "node:fs";
const UA={"user-agent":"AsphaltHubBot/1.0 (fan site; leitura de páginas públicas oficiais)"};
const YT=process.env.YT_CHANNEL_ID||""; // ID do canal oficial (UC...), configure em Settings > Variables
const NEWS_PAGES=[["Asphalt Legends (site oficial)","https://asphaltlegends.com/news"],["Gameloft Newsroom","https://www.gameloft.com/newsroom/"]];
const EVENT_PAGE="https://asphaltlegends.com/event";
const db=JSON.parse(fs.readFileSync("data.json","utf8")),errors=[],before=JSON.stringify(db);
const get=async u=>{const r=await fetch(u,{headers:UA,signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`${u} → HTTP ${r.status}`);return r.text()};
const norm=s=>s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g," ").trim();
const dec=s=>(s||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim();
const meta=(h,p)=>{const a=h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)`,"i"))||h.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`,"i"));return a?dec(a[1]):""};
const jsonld=h=>[...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{try{const j=JSON.parse(m[1]);return Array.isArray(j)?j:(j["@graph"]||[j])}catch{return[]}});
const known=u=>db.news.some(n=>n.u==u)||db.events.some(e=>e.u==u);
const seenTitle=t=>db.news.some(n=>norm(n.t)==norm(t));
const cat=t=>/update|atualiza/i.test(t)?["Atualizações","🏎️"]:/event|season|temporada|evento/i.test(t)?["Eventos","🏁"]:/car|supercar|porsche|audi|ferrari|lambo/i.test(t)?["Carros","🔥"]:["Notícias","📰"];
const iso=d=>{const t=new Date(d);return isNaN(t)?null:t.toISOString()};

async function news(){ // 1) links de artigos nas páginas oficiais (RSS é tentado primeiro)
 for(const [name,page] of NEWS_PAGES){try{
  const base=new URL(page).origin;let links=[];
  for(const f of ["feed","rss","feed.xml","rss.xml"]){try{const x=await get(new URL(f,page.endsWith("/")?page:page+"/"));if(/<item|<entry/.test(x)){links=[...x.matchAll(/<link>([^<]+)<\/link>|<link[^>]+href="([^"]+)"/g)].map(m=>m[1]||m[2]);break}}catch{}}
  if(!links.length){const h=await get(page);links=[...h.matchAll(/href=["']([^"'#?]*\/(?:news|newsroom)\/[a-z0-9][a-z0-9-]{8,}\/?)["']/gi)].map(m=>new URL(m[1],base).href)}
  for(const u of [...new Set(links)].filter(u=>!known(u)).slice(0,10)){try{
   const h=await get(u),t=meta(h,"og:title")||dec((h.match(/<title>([^<]*)/i)||[])[1]),ld=jsonld(h).find(o=>o.datePublished),d=iso(meta(h,"article:published_time")||(ld&&ld.datePublished));
   if(!t||!d){errors.push(`Ignorado (sem título/data oficial): ${u}`);continue}
   if(seenTitle(t))continue;
   const [c,e]=cat(t),x=meta(h,"og:description")||meta(h,"description");
   db.news.push({t,d:d.slice(0,10),c,e,s:name,u,x:x||"Leia o comunicado completo na fonte oficial."});
   const body=h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g," ");
   const m=body.match(/(?:promo(?:tional)? code|redeem code|c[óo]digo(?: promocional)?)\s*[:\-–]?\s*["“]?([A-Z0-9]{6,16})\b/);
   if(m&&/\d/.test(m[1])&&!db.codes.some(k=>k.code==m[1]))db.codes.push({code:m[1],reward:t,d:d.slice(0,10),u,valid:null});
  }catch(e){errors.push(String(e.message||e))}}
 }catch(e){errors.push(`${name}: ${e.message||e}`)}}}

async function youtube(){
 if(!YT){errors.push("YouTube: defina a variável YT_CHANNEL_ID para ativar o canal oficial.");return}
 try{const x=await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${YT}`);
  for(const m of x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)){const g=r=>dec((m[1].match(r)||[])[1]),u=g(/<link[^>]+href="([^"]+)"/),t=g(/<title>([^<]*)/),d=iso(g(/<published>([^<]*)/));
   if(u&&t&&d&&!known(u)&&!seenTitle(t))db.news.push({t,d:d.slice(0,10),c:"Vídeos",e:"▶️",s:"YouTube oficial do Asphalt Legends",u,x:"Vídeo publicado no canal oficial."})}
 }catch(e){errors.push("YouTube: "+(e.message||e))}}

async function events(){ // só dados estruturados (JSON-LD Event) com início e fim reais
 try{const h=await get(EVENT_PAGE),ev=jsonld(h).filter(o=>/Event/.test(o["@type"]||"")&&o.name&&o.startDate&&o.endDate);
  if(!ev.length)errors.push("Eventos: página sem dados estruturados de datas; nada publicado (evita inventar datas).");
  for(const o of ev){const a=iso(o.startDate),b=iso(o.endDate);if(!a||!b)continue;
   const url=o.url?new URL(o.url,EVENT_PAGE).href:EVENT_PAGE,cur=db.events.find(e=>e.u==url||norm(e.n)==norm(o.name));
   if(cur){if(cur.a!=a||cur.b!=b){cur.a=a;cur.b=b;cur.s="Site oficial Asphalt Legends";cur.u=url}}
   else db.events.push({n:dec(o.name),a,b,car:"Veja detalhes na fonte oficial",r:dec(o.description||"").slice(0,240)||"Evento divulgado no site oficial.",s:"Site oficial Asphalt Legends",u:url})}
 }catch(e){errors.push("Eventos: "+(e.message||e))}}

await Promise.all([news(),youtube(),events()]);
const now=new Date(),total=NEWS_PAGES.length+2,fails=errors.filter(e=>!/^Ignorado/.test(e)).length;
db.codes.forEach(c=>c.exp=!!c.valid&&new Date(c.valid)<now);
if(JSON.stringify(db)!=before)fs.writeFileSync("data.json",JSON.stringify(db,null,1));
fs.writeFileSync("status.json",JSON.stringify({lastCheck:now.toISOString(),lastSuccess:fails>=total?JSON.parse(fs.readFileSync("status.json","utf8")).lastSuccess:now.toISOString(),nextCheck:new Date(+now+30*60e3).toISOString(),status:fails==0?"ok":fails>=total?"error":"partial",errors:errors.slice(0,10)},null,1));
console.log(errors.join("\n")||"ok");
