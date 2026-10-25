// 바이러스 스텔라 - Cloudflare Worker (스텔컴퍼니와 같은 D1 + 디스코드 앱 공유)
// 환경변수: SESSION_SECRET, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, STELL_URL(스텔컴퍼니 주소, 선택)
// D1 바인딩 이름은 스텔컴퍼니와 똑같이 DB
const API="https://discord.com/api/v10",enc=new TextEncoder();
// 밸런스 조정은 여기서: p=판매가 범위, lv=보안 등급
const DOCS=[
 {id:1,t:"사내 연락망.xlsx",lv:1,p:[300,600]},
 {id:2,t:"공지사항 초안.docx",lv:1,p:[200,500]},
 {id:3,t:"이력서 보관함 (인사팀)",lv:2,p:[1500,2500]},
 {id:4,t:"고객 불만 접수 기록",lv:2,p:[1200,2200]},
 {id:5,t:"투자 계획서 (전략본부)",lv:3,p:[6000,9000]},
 {id:6,t:"징계 기록부 (감찰과)",lv:3,p:[5000,8000]},
 {id:7,t:"임원 급여 명세서",lv:4,p:[18000,28000]},
 {id:8,t:"사장 직인 인증키",lv:4,p:[25000,40000]}];
const LV={1:{s:8,ok:.85},2:{s:14,ok:.65},3:{s:24,ok:.45},4:{s:38,ok:.3}}; // s=크랙 시간(초), ok=성공률
const CD=15*60000,FINE=30000,LOCK=10*60000; // 성공 후 재침투 대기, 벌금, 차단 시간

let ready=false;
async function init(env){if(ready)return;await env.DB.batch([
 env.DB.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT)"),
 env.DB.prepare("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, data TEXT)"),
 env.DB.prepare("CREATE TABLE IF NOT EXISTS ledger (id TEXT, t INTEGER, kind TEXT, text TEXT, amt INTEGER)"),
 env.DB.prepare("CREATE TABLE IF NOT EXISTS hax (id TEXT PRIMARY KEY, data TEXT)"),
 env.DB.prepare("CREATE TABLE IF NOT EXISTS incidents (t INTEGER, id TEXT, kind TEXT, text TEXT)")]);ready=true}

async function hmac(env,v){const k=await crypto.subtle.importKey("raw",enc.encode(env.SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const s=await crypto.subtle.sign("HMAC",k,enc.encode(v));return[...new Uint8Array(s)].map(b=>b.toString(16).padStart(2,"0")).join("")}
const sign=async(env,v)=>v+"."+await hmac(env,v);
const unsign=async(env,s)=>{if(!s)return null;const i=s.lastIndexOf(".");const v=s.slice(0,i);return(await sign(env,v))===s?v:null};
const cookies=r=>Object.fromEntries((r.headers.get("Cookie")||"").split("; ").filter(Boolean).map(c=>{const i=c.indexOf("=");return[c.slice(0,i),c.slice(i+1)]}));
const json=(code,o)=>new Response(JSON.stringify(o),{status:code,headers:{"Content-Type":"application/json"}});
const getUser=async(env,id)=>{const r=await env.DB.prepare("SELECT username FROM users WHERE id=?").bind(id).first();return r?r.username:null};
const getMember=async(env,id)=>{const r=await env.DB.prepare("SELECT data FROM members WHERE id=?").bind(id).first();return r?JSON.parse(r.data):null};
const getHax=async(env,id)=>{const r=await env.DB.prepare("SELECT data FROM hax WHERE id=?").bind(id).first();return Object.assign({docs:[],cd:{},trace:0,tt:0,lock:0,att:null,hacks:0,sold:0},r?JSON.parse(r.data):{})};
const putHax=(env,id,h)=>env.DB.prepare("INSERT OR REPLACE INTO hax (id,data) VALUES (?,?)").bind(id,JSON.stringify(h)).run();
const inc=(env,id,kind,text)=>env.DB.prepare("INSERT INTO incidents (t,id,kind,text) VALUES (?,?,?,?)").bind(Date.now(),id,kind,text);
const led=(env,id,text,amt)=>env.DB.prepare("INSERT INTO ledger (id,t,kind,text,amt) VALUES (?,?,?,?,?)").bind(id,Date.now(),"hack",text,amt);
const pay=(env,id,amt)=>env.DB.prepare("UPDATE members SET data=json_set(data,'$.money',json_extract(data,'$.money')+?) WHERE id=?").bind(amt,id);
const curTrace=(h,n)=>Math.max(0,h.trace-(n-h.tt)/30000); // 30초마다 1% 감소
const view=(h,n)=>({trace:Math.round(curTrace(h,n)),lock:h.lock>n?h.lock:0,docs:h.docs,hacks:h.hacks,sold:h.sold,
 cd:Object.fromEntries(Object.entries(h.cd).filter(([,v])=>v>n))});
const rpw=()=>{const c="abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";const u=crypto.getRandomValues(new Uint8Array(9));return[...u].map(x=>c[x%c.length]).join("")};

export default{async fetch(req,env){
 const url=new URL(req.url),ck=cookies(req),id=await unsign(env,ck.sid);
 try{
 await init(env);
 if(url.pathname==="/auth/logout"){const h=new Headers({Location:"/"});h.append("Set-Cookie","sid=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0");return new Response(null,{status:302,headers:h})}
 if(url.pathname==="/auth/discord"){const st=crypto.randomUUID();
  return new Response(null,{status:302,headers:{"Set-Cookie":`st=${await sign(env,st)}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`,
   Location:`https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(url.origin+"/auth/callback")}&response_type=code&scope=identify&state=${st}`}})}
 if(url.pathname==="/auth/callback"){const st=await unsign(env,ck.st);if(!st||st!==url.searchParams.get("state"))return json(400,{error:"잘못된 요청"});
  const t=await(await fetch(API+"/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code:url.searchParams.get("code")||"",redirect_uri:url.origin+"/auth/callback"})})).json();
  const u=await(await fetch(API+"/users/@me",{headers:{Authorization:"Bearer "+t.access_token}})).json();
  if(!u.id)return json(400,{error:"로그인 실패"});
  await env.DB.prepare("INSERT OR REPLACE INTO users (id,username) VALUES (?,?)").bind(u.id,u.username).run();
  return new Response(null,{status:302,headers:{"Set-Cookie":`sid=${await sign(env,u.id)}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=2592000`,Location:"/"}})}

 if(url.pathname.startsWith("/api/")){const act=url.pathname.slice(5);
  const un=id?await getUser(env,id):null;
  if(!un)return act==="me"?json(200,{user:null}):json(401,{error:"로그인이 필요합니다."});
  const n=Date.now(),h=await getHax(env,id),mem=await getMember(env,id);
  if(act==="me")return json(200,{user:{id,username:un},member:mem?{name:mem.name,dept:mem.dept,money:mem.money}:null,can:!!mem&&mem.dept==="none",hax:view(h,n),
   docs:DOCS.map(d=>({id:d.id,t:d.t,lv:d.lv,sec:LV[d.lv].s}))});
  if(req.method!=="POST")return json(405,{error:"POST만 가능합니다."});
  const b=await req.json().catch(()=>({}));
  if(!mem)return json(400,{error:"스텔컴퍼니에 가입한 뒤 퇴사해야 활동할 수 있습니다."});
  if(mem.dept!=="none")return json(400,{error:"스텔컴퍼니에 재직 중이라 접속할 수 없습니다. 먼저 퇴사하세요."});
  if(act==="start"){const d=DOCS.find(x=>x.id===Number(b.doc));if(!d)return json(400,{error:"없는 대상입니다."});
   if(h.lock>n)return json(400,{error:"추적당해 접속이 차단되었습니다. "+Math.ceil((h.lock-n)/60000)+"분 뒤에 다시 시도하세요."});
   if((h.cd[d.id]||0)>n)return json(400,{error:"이 서버는 경계 중입니다. "+Math.ceil((h.cd[d.id]-n)/60000)+"분 뒤에 다시 시도하세요."});
   if(h.docs.some(x=>x.id===d.id))return json(400,{error:"이미 확보한 문서입니다. 먼저 판매하세요."});
   h.att={doc:d.id,at:n,dur:LV[d.lv].s*1000};await putHax(env,id,h);return json(200,{dur:h.att.dur,lv:d.lv,t:d.t})}
  if(act==="finish"){const a=h.att;if(!a)return json(400,{error:"진행 중인 해킹이 없습니다."});
   if(n<a.at+a.dur-700)return json(400,{error:"아직 크랙이 끝나지 않았습니다."});
   const d=DOCS.find(x=>x.id===a.doc),ok=Math.random()<LV[d.lv].ok,tr=curTrace(h,n);h.att=null;h.hacks++;h.tt=n;
   if(ok){h.trace=tr+10;h.cd[d.id]=n+CD;h.docs.push({id:d.id,t:d.t,lv:d.lv,price:d.p[0]+Math.floor(Math.random()*(d.p[1]-d.p[0]+1))});
    await putHax(env,id,h);await inc(env,id,"breach",d.t).run();return json(200,{ok:true,pw:rpw(),hax:view(h,n)})}
   h.trace=tr+25;let caught=false,fine=0;
   if(h.trace>=100){caught=true;h.trace=0;h.lock=n+LOCK;h.docs=[];const sts=[inc(env,id,"caught",d.t)];
    if(mem){fine=Math.min(FINE,mem.money||0);if(fine>0){sts.push(pay(env,id,-fine),led(env,id,"해킹 적발 벌금",-fine))}}
    await env.DB.batch(sts)}
   await putHax(env,id,h);return json(200,{ok:false,caught,fine,hax:view(h,n)})}
  if(act==="sell"){
   const i=h.docs.findIndex(x=>x.id===Number(b.doc));if(i<0)return json(400,{error:"보유하지 않은 문서입니다."});
   const d=h.docs.splice(i,1)[0];h.sold++;await putHax(env,id,h);
   await env.DB.batch([pay(env,id,d.price),led(env,id,"기밀문서 판매: "+d.t,d.price),inc(env,id,"leak",d.t)]);
   return json(200,{paid:d.price,t:d.t,hax:view(h,n)})}
  return json(404,{error:"없는 요청"})}
 return new Response(HTML.replace("__STELL__",env.STELL_URL||"#"),{headers:{"Content-Type":"text/html; charset=utf-8"}})
 }catch(e){return json(500,{error:"서버 오류: "+(e&&e.message?e.message:e)})}}};

// 주의: 아래 HTML 안에서는 백틱과 ${ 를 쓰지 마세요 (String.raw 템플릿)
const HTML=String.raw`<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>VIRUS STELLA</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#090b0e;--pn:#0f1318;--ln:#232b36;--tx:#d5dce6;--dm:#74818f;--ac:#ff4d3d;--gr:#6dffb0}
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{height:100%;margin:0;background:var(--bg);color:var(--tx);font:13px/1.55 "JetBrains Mono",ui-monospace,Menlo,monospace;overflow:hidden}
button{font:inherit;color:inherit;background:none;border:1px solid var(--ln);padding:5px 12px;cursor:pointer}
button:hover:not(:disabled){border-color:var(--ac);color:var(--ac)}button:disabled{opacity:.4;cursor:default}
#desk{position:fixed;left:0;right:0;top:0;bottom:calc(42px + env(safe-area-inset-bottom,0px));padding-top:env(safe-area-inset-top,0px);
 background:radial-gradient(900px 500px at 15% 0,#18202b 0,transparent 70%),radial-gradient(700px 400px at 100% 100%,#2a1210 0,transparent 70%),var(--bg)}
#ic{position:absolute;left:12px;top:calc(12px + env(safe-area-inset-top,0px));display:grid;gap:14px}
#ic button{border:0;width:84px;padding:0;text-align:center;color:var(--tx)}
#ic b{display:block;width:46px;height:46px;margin:0 auto 4px;border:1px solid var(--ln);background:var(--pn);line-height:44px;font-size:15px;color:var(--gr)}
#ic span{font-size:11px;color:var(--dm)}
.win{position:absolute;display:none;flex-direction:column;background:var(--pn);border:1px solid var(--ln);box-shadow:0 18px 50px #000b}
.win.on{display:flex}
.tb{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid var(--ln);background:#0b0e12;cursor:move;touch-action:none;user-select:none}
.tb b{font-size:12px;letter-spacing:.06em;color:var(--dm)}.tb i{font-style:normal;padding:0 8px;cursor:pointer;color:var(--dm)}.tb i:hover{color:var(--ac)}
.bd{flex:1;overflow:auto;padding:10px 12px;min-height:0}.bd div{white-space:pre-wrap;word-break:break-all}
.pr{display:flex;gap:8px;border-top:1px solid var(--ln);padding:8px 12px;align-items:center}.pr span{color:var(--ac);white-space:nowrap}
.pr input{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--gr);font:inherit}
.dm{color:var(--dm)}.gr{color:var(--gr)}.er{color:var(--ac)}
.row{display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--ln)}.row .nm{flex:1;min-width:0;word-break:break-all}
.lv{border:1px solid var(--ln);padding:0 6px;color:var(--ac);font-size:11px}
.pg{height:4px;background:var(--ln);margin:10px 0}.pg i{display:block;height:100%;width:0;background:var(--ac)}
#bar{position:fixed;left:0;right:0;bottom:0;height:calc(42px + env(safe-area-inset-bottom,0px));padding-bottom:env(safe-area-inset-bottom,0px);display:flex;align-items:center;gap:8px;padding-left:6px;padding-right:12px;background:#0b0e12;border-top:1px solid var(--ln);z-index:9999}
#st{font-weight:700;letter-spacing:.08em;color:var(--ac);border-color:var(--ac)}
#tabs{flex:1;display:flex;gap:6px;overflow-x:auto;min-width:0}#tabs button{white-space:nowrap;font-size:12px}
#tr{color:var(--dm);font-size:12px;white-space:nowrap}
#menu{position:fixed;left:6px;bottom:calc(48px + env(safe-area-inset-bottom,0px));width:220px;background:var(--pn);border:1px solid var(--ln);z-index:10000;box-shadow:0 18px 50px #000b}
#menu button,#menu a{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--ln);padding:11px 14px;color:var(--tx);text-decoration:none}
#menu a:hover,#menu button:hover{background:#161c24;color:var(--ac)}
#boot,#lock{position:fixed;inset:0;z-index:20000;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px}
#boot pre{margin:0;color:var(--dm);font:inherit;width:100%;max-width:520px}
#lock{flex-direction:column;gap:18px;text-align:center}
#lock h1{margin:0;font-size:clamp(28px,9vw,54px);letter-spacing:.12em}#lock h1 span{color:var(--ac)}
#lock p{margin:0;color:var(--dm);max-width:30em}
.btn{display:inline-block;border:1px solid var(--ac);color:var(--ac);padding:12px 26px;text-decoration:none}.btn:hover{background:var(--ac);color:#000}
@media(max-width:700px){.win{left:0!important;top:0!important;right:0;bottom:0;width:auto!important;height:auto!important}.tb{cursor:default}#ic{grid-template-columns:repeat(3,84px)}}
</style></head><body>
<div id="boot"><pre id="bt"></pre></div>
<div id="lock" hidden><h1>VIRUS <span>STELLA</span></h1><p>이 단말은 인가된 구성원만 접속할 수 있다. 디스코드 인증으로 신원을 확인한다.</p><a class="btn" href="/auth/discord">디스코드로 접속</a></div>
<div id="desk">
 <div id="ic">
  <button onclick="open_('term')"><b>&gt;_</b><span>cmd.exe</span></button>
  <button onclick="open_('crack')"><b>##</b><span>PassCrack</span></button>
  <button onclick="open_('files')"><b>[=]</b><span>문서함</span></button>
  <button onclick="open_('note')"><b>i</b><span>README</span></button>
 </div>
 <div class="win" id="w-term" style="left:110px;top:24px;width:600px;height:410px"><div class="tb"><b>cmd.exe</b><span><i onclick="hide('term')">_</i><i onclick="shut('term')">×</i></span></div><div class="bd" id="tout"></div><div class="pr"><span>C:\Stella&gt;</span><input id="cin" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div></div>
 <div class="win" id="w-crack" style="left:170px;top:70px;width:520px;height:440px"><div class="tb"><b>PassCrack v2.4</b><span><i onclick="hide('crack')">_</i><i onclick="shut('crack')">×</i></span></div><div class="bd"><div id="tl" style="white-space:normal"></div><div class="pg"><i id="pgi"></i></div><div id="cl"></div></div></div>
 <div class="win" id="w-files" style="left:230px;top:50px;width:500px;height:380px"><div class="tb"><b>문서함</b><span><i onclick="hide('files')">_</i><i onclick="shut('files')">×</i></span></div><div class="bd"><div id="fh" class="dm" style="margin-bottom:8px"></div><div id="fl" style="white-space:normal"></div></div></div>
 <div class="win" id="w-note" style="left:290px;top:40px;width:440px;height:330px"><div class="tb"><b>README.txt</b><span><i onclick="hide('note')">_</i><i onclick="shut('note')">×</i></span></div><div class="bd"><div>VIRUS STELLA

우리는 스텔컴퍼니의 지하실을 연다.

1. cmd에서 scan 으로 대상을 찾는다.
2. crack 번호 로 비밀번호를 푼다.
3. 문서함에서 팔아 현금으로 바꾼다.

보안 등급이 높을수록 값이 비싸고 들킬 확률도 높다. 실패할 때마다 추적도가 오르고, 100%가 되면 보유 문서는 압수되며 벌금이 나간다.

스텔컴퍼니에서 퇴사한 무직자만 활동할 수 있다. 대금은 개인 자산으로 입금된다.</div></div></div>
</div>
<div id="menu" hidden><button onclick="open_('term')">cmd.exe</button><button onclick="open_('crack')">PassCrack</button><button onclick="open_('files')">문서함</button><a href="__STELL__" target="_blank" rel="noopener">스텔컴퍼니 사이트</a><a href="/auth/logout">접속 종료</a></div>
<div id="bar"><button id="st" onclick="$('#menu').hidden=!$('#menu').hidden">STELLA</button><div id="tabs"></div><span id="tr"></span></div>
<script>
const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms)),won=n=>Number(n||0).toLocaleString("ko-KR")+"원";
let S=null,busy=false,zi=10;const W={},T=$("#tout"),NAMES={term:"cmd.exe",crack:"PassCrack",files:"문서함",note:"README"};
async function api(p,b){const r=await fetch("/api/"+p,b?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}:{});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"오류");return j}
function mkLog(box){return(t,el,c)=>{if(!el){el=document.createElement("div");box.appendChild(el)}el.textContent=t;el.className=c||"";box.scrollTop=1e9;return el}}
const out=mkLog(T);
document.querySelectorAll(".win").forEach(el=>{W[el.id.slice(2)]={el,tab:null}});
function open_(k){const w=W[k];w.el.classList.add("on");w.el.style.zIndex=++zi;
 if(!w.tab){w.tab=document.createElement("button");w.tab.textContent=NAMES[k];w.tab.onclick=()=>{(w.el.classList.contains("on")&&+w.el.style.zIndex===zi)?hide(k):open_(k)};$("#tabs").appendChild(w.tab)}
 $("#menu").hidden=true;if(k==="files")drawFiles();if(k==="crack")drawTargets();if(k==="term"&&innerWidth>700)$("#cin").focus()}
function hide(k){W[k].el.classList.remove("on")}
function shut(k){hide(k);if(W[k].tab){W[k].tab.remove();W[k].tab=null}}
document.querySelectorAll(".tb").forEach(tb=>{tb.onpointerdown=e=>{if(e.target.tagName==="I"||innerWidth<=700)return;const el=tb.parentNode;el.style.zIndex=++zi;
 const dx=e.clientX-el.offsetLeft,dy=e.clientY-el.offsetTop;
 const mv=v=>{el.style.left=Math.max(0,v.clientX-dx)+"px";el.style.top=Math.max(0,v.clientY-dy)+"px"};
 const up=()=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up)};addEventListener("pointermove",mv);addEventListener("pointerup",up)}});

async function load(){S=await api("me");if(!S.user)return;const t=S.hax.trace;
 $("#tr").innerHTML="";const a=document.createElement("span");a.textContent="추적 "+t+"%"+(S.hax.lock>Date.now()?" (차단)":"");a.style.color=t>=70?"var(--ac)":t>=40?"#ffb84d":"var(--dm)";
 $("#tr").append(a,"  "+(S.member?won(S.member.money):"외부인"))}
function drawTargets(){const b=$("#tl");b.innerHTML="";if(!S)return;S.docs.forEach(d=>{const r=document.createElement("div");r.className="row";
 const cd=(S.hax.cd[d.id]||0)>Date.now(),have=S.hax.docs.some(x=>x.id===d.id);
 r.innerHTML="<span class='lv'></span><span class='nm'></span><button></button>";r.children[0].textContent="L"+d.lv;r.children[1].textContent=d.t;
 const bt=r.children[2];bt.textContent=have?"보유":cd?"경계중":"침투";bt.disabled=have||cd||busy;bt.onclick=()=>run(d.id,mkLog($("#cl")));b.appendChild(r)})}
function drawFiles(){const f=$("#fl");f.innerHTML="";if(!S)return;
 $("#fh").textContent=S.member?"개인 자산 "+won(S.member.money)+" · 판매 "+S.hax.sold+"건 · 시도 "+S.hax.hacks+"회":"스텔컴퍼니에 가입한 뒤 퇴사해야 활동할 수 있습니다.";
 if(!S.hax.docs.length){f.innerHTML="<div class='dm'>확보한 문서가 없습니다.</div>";return}
 S.hax.docs.forEach(d=>{const r=document.createElement("div");r.className="row";r.innerHTML="<span class='lv'></span><span class='nm'></span><button></button>";
  r.children[0].textContent="L"+d.lv;r.children[1].textContent=d.t+"  ("+won(d.price)+")";r.children[2].textContent="판매";r.children[2].onclick=()=>sell(d.id,mkLog(T));f.appendChild(r)})}
async function refresh(){await load();drawTargets();drawFiles()}

async function run(id,L){if(busy){L("이미 크랙이 진행 중입니다.",0,"er");return}
 let a;try{a=await api("start",{doc:id})}catch(e){L(e.message,0,"er");return}
 busy=true;drawTargets();L("> "+a.t+" 에 접속 중...",0,"dm");await sleep(500);L("> 방화벽 우회 시도 (보안 L"+a.lv+")",0,"dm");
 const el=L(""),t0=Date.now(),ch="abcdef0123456789!@#$%&";
 while(Date.now()-t0<a.dur+300){const p=Math.min(1,(Date.now()-t0)/a.dur),g=Array.from({length:14},()=>ch[Math.random()*ch.length|0]).join("");
  L("["+"#".repeat(Math.floor(p*20)).padEnd(20,".")+"] "+Math.floor(p*99)+"%  "+g,el,"gr");$("#pgi").style.width=p*100+"%";await sleep(70)}
 try{const r=await api("finish",{});
  if(r.ok){L("["+"#".repeat(20)+"] 100%  "+r.pw,el,"gr");L("접근 성공. 문서 확보: "+a.t,0,"gr")}
  else if(r.caught){L("접근 거부",el,"er");L("추적당했습니다. 보유 문서 압수"+(r.fine?", 벌금 "+won(r.fine):"")+". 10분간 접속이 차단됩니다.",0,"er")}
  else L("접근 거부. 추적도가 올라갔습니다.",el,"er")}catch(e){L(e.message,0,"er")}
 busy=false;$("#pgi").style.width="0";await refresh()}
async function sell(id,L){try{const r=await api("sell",{doc:id});L("판매 완료: "+r.t+" +"+won(r.paid),0,"gr")}catch(e){L(e.message,0,"er")}await refresh()}

async function exec(s){const p=s.trim().split(/\s+/),c=(p[0]||"").toLowerCase(),n=Number(p[1]);out("C:\\Stella> "+s);
 if(!c)return;
 if(c==="help"){["help            명령어 목록","scan            침투 가능한 대상 스캔","crack <번호>    비밀번호 크랙 시작","files           확보한 문서 목록","sell <번호>     문서 판매","status          추적도와 잔액","connect stell-company  내부망 접속","clear           화면 지우기"].forEach(l=>out(l,0,"dm"));return}
 if(c==="clear"){T.innerHTML="";return}
 if(c==="whoami"){out(S.user.username+(S.member?" / 스텔컴퍼니 "+S.member.name:" / 외부인"));return}
 if(c==="status"){await load();out("추적도 "+S.hax.trace+"%"+(S.hax.lock>Date.now()?"  [접속 차단 중]":""));out("확보 문서 "+S.hax.docs.length+"개 / 잔액 "+(S.member?won(S.member.money):"스텔컴퍼니 미가입"));return}
 if(c==="connect"){for(const l of ["터널 생성 중...","프록시 3단 경유","핸드셰이크 완료","스텔컴퍼니 내부망 연결됨. scan 으로 대상을 확인하세요."]){out("> "+l,0,"gr");await sleep(350)}return}
 if(c==="scan"){out("> 포트 스캔 중...",0,"dm");await sleep(700);await refresh();
  S.docs.forEach(d=>{const cd=(S.hax.cd[d.id]||0)>Date.now(),have=S.hax.docs.some(x=>x.id===d.id);out("["+d.id+"] L"+d.lv+"  "+d.t+"  "+(have?"(보유)":cd?"(경계중)":"("+d.sec+"초)"),0,have||cd?"dm":"")});return}
 if(c==="files"){await load();if(!S.hax.docs.length)out("확보한 문서가 없습니다.",0,"dm");S.hax.docs.forEach(d=>out("["+d.id+"] "+d.t+"  "+won(d.price)));return}
 if(c==="crack"){if(!n){out("사용법: crack <번호>  (scan으로 번호 확인)",0,"er");return}await run(n,out);return}
 if(c==="sell"){if(!n){out("사용법: sell <번호>  (files로 번호 확인)",0,"er");return}await sell(n,out);return}
 out("'"+p[0]+"' 은(는) 알 수 없는 명령입니다. help 를 입력하세요.",0,"er")}
$("#cin").addEventListener("keydown",async e=>{if(e.key!=="Enter")return;const v=e.target.value;e.target.value="";await exec(v)});
T.parentNode.addEventListener("click",()=>{if(innerWidth>700)$("#cin").focus()});

(async function boot(){const L=mkLog($("#bt"));
 for(const l of ["VIRUS STELLA BIOS v1.0","메모리 검사... OK","암호화 모듈 로드... OK","익명 네트워크 연결... OK","세션 확인 중..."]){L(l);await sleep(230)}
 try{await load()}catch(e){}
 $("#boot").hidden=true;if(!S||!S.user){$("#lock").hidden=false;return}
 open_("term");out("VIRUS STELLA 단말에 접속했습니다. "+S.user.username,0,"gr");out("help 를 입력하면 명령어를 볼 수 있습니다.",0,"dm");if(!S.can)out("경고: 스텔컴퍼니에서 퇴사한 무직자만 작업할 수 있습니다. 지금은 열람만 가능합니다.",0,"er");
 setInterval(()=>{if(!busy)refresh()},20000)})();
</script></body></html>`;
