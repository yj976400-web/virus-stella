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
// 보안 겹: c=d(숫자) / h(숫자+A-F), len=자리수, tries=기회. 한 겹이라도 기회가 바닥나면 실패
const LAY={1:[{c:"d",len:3,tries:7}],2:[{c:"d",len:4,tries:8}],3:[{c:"d",len:4,tries:7},{c:"h",len:4,tries:8}],4:[{c:"h",len:5,tries:9},{c:"h",len:5,tries:9}]};
DOCS.forEach(d=>d.lay=LAY[d.lv]);
const SYS=[
 {id:11,t:"CCTV 관제 서버",lv:3,sys:"cctv",lay:[{c:"d",len:4,tries:7},{c:"h",len:5,tries:9}]},
 {id:12,t:"보안막 게이트웨이",lv:4,sys:"shield",lay:[{c:"d",len:4,tries:7},{c:"h",len:5,tries:9},{c:"h",len:6,tries:10}]},
 {id:13,t:"회사 관리자 콘솔",lv:4,sys:"admin",lay:[{c:"h",len:5,tries:9},{c:"h",len:6,tries:10},{c:"h",len:6,tries:9}]}];
const ALL=DOCS.concat(SYS);
// 튜토리얼 미션 (순서대로, 조건을 채우면 자동으로 보상 지급)
const TUT=[
 {t:"단말 열기",r:100,f:h=>h.st.help>=1,d:"VIRUS STELLA는 명령어로 서버를 해킹하는 게임이에요.\ncmd.exe 창 아래 입력칸에 명령어를 치고 Enter를 누르면 돼요.\n칩을 탭하면 입력칸에 자동으로 들어가요.\n먼저 [[help]] 를 입력해서 명령어 목록을 확인해 보세요."},
 {t:"대상 찾기",r:100,f:h=>h.st.scan>=1,d:"해킹은 '정찰 → 침투 → 탐색 → 반출' 순서로 해요.\n먼저 대상을 골라요. [[scan]] 을 입력하면 노릴 수 있는 서버 목록이 나와요.\n[번호], L은 보안 등급(높을수록 어렵고 비싸요)이에요. [SYS]는 회사 시스템 자체를 노리는 특수 대상이에요."},
 {t:"대상에 연결",r:150,f:h=>h.st.start>=1,d:"가장 쉬운 1번 '사내 연락망' 서버로 연습해요.\n[[hack 1]] 을 입력하면 서버에 연결돼요. 입력칸 앞의 표시가 서버 이름으로 바뀌고, 침투에 성공하기 전까지 제한 시간은 4분이고, 셸을 얻으면 없어져요.\n연결 중에는 help 로 쓸 수 있는 명령어를 볼 수 있어요."},
 {t:"1단계 정찰: 포트 스캔",r:150,f:h=>h.st.nmap>=1,d:"서버에는 '포트'라는 문이 있고, 열린 문마다 서비스가 돌아가요.\n[[nmap]] 으로 어떤 문이 열려 있는지 확인하세요.\n21=ftp(파일 전송), 22=ssh(원격 접속), 80=http(웹 관리 화면)처럼 번호와 서비스 이름이 나와요."},
 {t:"약점 찾기: 배너 읽기",r:150,f:h=>h.st.banner>=1,d:"서비스마다 '배너'라는 소개 문구가 있고, 허술한 곳은 약점이 그대로 적혀 있어요.\n열린 포트의 배너를 하나씩 읽어 보세요. 예: [[banner 21]]\n· '익명 접속 허용' → FTP 약점\n· '기본 계정, 비밀번호 정책 없음' → SSH 약점\n· '보안 패치 미적용' → 웹 패널 약점\n최신 패치나 인증 필수라고 적힌 곳은 안전한 곳이에요."},
 {t:"2단계 침투: 약점 공격",r:300,f:h=>h.st.shell>=1,d:"배너에서 찾은 약점에 맞는 도구를 골라 공격해요. 형식: exploit 도구 포트\n· [[exploit anon-login 21]] FTP 익명 접속 약점\n· [[exploit pw-spray 22]] SSH 기본 계정 약점\n· [[exploit webshell 80]] 웹 패널 패치 미적용 약점\n약점이 없는 곳을 공격하면 경보가 울려 추적도가 올라가요. 배너를 읽고 알맞은 한 줄만 입력하세요."},
 {t:"3단계 탐색: 파일 뒤지기",r:150,f:h=>h.st.cat>=1,d:"침투하면 서버 안에서 직접 파일을 뒤질 수 있어요.\n· [[ls]] 폴더 안 목록 / [[cd 폴더]] 이동 / [[cat readme.txt]] 파일 읽기\n· [[find 키워드]] 이름으로 파일 찾기\nreadme.txt 에 문서 위치 힌트가 있어요. 읽어 보세요."},
 {t:"4단계 반출: 문서 빼내기",r:300,f:h=>h.st.win>=1,d:"목표 문서를 찾았으면 반출해요. 형식: download 파일이름\n연락망 서버의 목표 파일은 contacts.xlsx 예요. ls 로 확인하고 [[download contacts.xlsx]] 를 입력하세요.\n성공하면 문서가 문서함에 들어와요. 엉뚱한 파일을 받으면 경보가 조금 올라가요."},
 {t:"흔적 지우기",r:200,f:h=>h.st.wipe>=1,d:"서버에는 접속 기록(로그)이 남아요. 지우지 않고 나오면 성공해도 추적도가 +10% 더 올라요.\n다음 서버에 침투한 뒤(예: [[hack 2]]) 반출하기 전에 [[wipe]] 로 로그를 지워 보세요. (추적도 -15%)\n이미 한 번 해봤다면 그대로 진행하면 돼요."},
 {t:"문서 판매",r:300,f:h=>h.sold>=1,d:"훔친 문서는 팔아야 돈이 돼요. [[files]] 로 문서 번호를 확인하고 [[sell 1]] 처럼 입력하세요. (1 대신 문서 번호)\n번호 뒤에 구매자를 붙여요: 1=마담K(안전) / 2=익명(값 ×1.4, 25% 함정) / 3=해외(값 ×1.8, 45% 함정)\n함정은 보안과가 위장한 구매자예요. 걸리면 문서를 뺏기고 벌금이에요."},
 {t:"도구 사기",r:200,f:h=>h.st.buy>=1,d:"번 돈으로 도구를 사서 더 유리하게 해킹해요. [[tools]] 로 목록을 보고 [[buy proxy]] 처럼 입력하세요.\n· proxy: 경보로 오르는 추적도를 줄여줘요 (1시간)\n· mod: 다음 침투에서 첫 경보 1회 면제\n· wipe: 추적도 -40%\n암시장 창의 버튼으로도 살 수 있어요."},
 {t:"5단계: 권한 상승",r:800,f:h=>(h.st.maxlv||0)>=3,d:"L3 이상 서버는 중요 문서가 admin 전용 금고(/srv/vault)에 있어요.\n힌트: 관리자가 지우지 않은 명령 기록(.history)에 비밀번호가 남아 있어요. 읽어서 [[su admin 비밀번호]] 로 권한을 올리세요.\n금고에는 '급여 백업' 같은 미끼 파일(허니팟)이 있어요. 목표 파일은 readme 와 목록으로 잘 구분하세요. (경보 +40%)\nL4 서버는 보안 에이전트가 전송을 막아요. ps 로 확인하고 [[kill stellguard]] 로 끄세요.\n예: [[hack 5]] 투자 계획서 서버 (L3)"},
 {t:"회사 시스템 노리기",r:1500,f:h=>h.st.cctv>=1,d:"[SYS] 대상이에요. [[hack 11]] 로 CCTV 관제 서버를 뚫고 cctv_master.key 를 반출하면 10분 동안 [[cctv]] 로 지금 접속 중인 직원을 볼 수 있어요. 보안과가 접속 중인지도 보여요.\n주의: 성공하면 회사 전체에 해킹 공지가 떠요. 보안과가 추적을 시작할 테니 훔친 문서는 서둘러 파세요."},
 {t:"졸업 과제: 보안막",r:2000,f:h=>h.st.shield>=1,d:"마지막 과제예요. [[hack 12]] 보안막 게이트웨이를 뚫으면 10분간 경보가 약해지고 보안 에이전트도 꺼져요.\n그 사이 [[hack 13]] 관리자 콘솔에 들어가면 5분간 [[forge 공지내용]] (위조 전체공지)과 [[fire 닉네임]] (직원 퇴직 처리)을 각각 한 번 쓸 수 있어요.\n보안막을 뚫으면 튜토리얼 끝이에요!"}];
// ---- 가상 서버 (전부 게임 속 허구) ----
const FILE={1:"contacts.xlsx",2:"notice_draft.docx",3:"resume_archive.zip",4:"complaints.csv",5:"invest_plan.pdf",6:"discipline_log.xlsx",7:"exec_payroll.xlsx",8:"ceo_seal.key",11:"cctv_master.key",12:"gateway_rules.conf",13:"admin_token.key"};
const DEC=[["meeting_minutes.txt","지난주 회의록. 특이사항 없음."],["menu_2026.pdf","구내식당 메뉴표."],["old_backup.tar","오래된 백업. 내용이 손상되어 있다."],["vacation_plan.xlsx","휴가 일정표."],["printer_setup.doc","프린터 설정 안내."],["it_ticket_221.txt","IT 요청 #221: 모니터 교체."]];
const SV={ftp:{p:21,ok:"StellFTP 2.1 ready | 익명(anonymous) 접속 허용",no:"StellFTP 3.0 ready | 인증 필수"},ssh:{p:22,ok:"StellSSH 1.0 | 기본 계정 operator, 비밀번호 정책 없음",no:"StellSSH 2.4 | 키 인증 전용"},http:{p:80,ok:"StellPanel 0.9 | 보안 패치 미적용 (legacy)",no:"StellPanel 3.2 | 최신 패치 적용"},smb:{p:445,ok:"StellShare 1.1 | 읽기 전용 공유",no:"StellShare 1.1 | 읽기 전용 공유"},db:{p:3306,ok:"StellDB 5.0 | 외부 접속 차단",no:"StellDB 5.0 | 외부 접속 차단"}};
const TOOL={"anon-login":"ftp","pw-spray":"ssh","webshell":"http"};
const rnd=a=>a[Math.floor(Math.random()*a.length)],shuf=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(x=>x[1]);
function mkHost(d){const lv=Math.min(4,d.lv),vs=rnd(["ftp","ssh","http"]),oth=shuf(["ftp","ssh","http","smb","db"].filter(x=>x!==vs)).slice(0,2);
 const ports=shuf([vs,...oth]).map(s=>({s,p:SV[s].p,v:s===vs})),goal=FILE[d.id],gp=(lv<=1?"/home/guest/":lv===2?"/srv/docs/":"/srv/vault/")+goal,f={};
 const pw=[...crypto.getRandomValues(new Uint8Array(6))].map(x=>"abcdefghjkmnpqrstuvwxyz23456789"[x%31]).join("");
 f["/var/log/auth.log"]="Oct 26 02:11 sshd: guest session opened\nOct 26 02:14 sshd: admin session closed\nOct 26 03:40 stellguard: heartbeat ok";
 f["/home/guest/readme.txt"]=lv<=1?"서버 점검 중입니다. 업무 문서는 이 폴더에 있습니다.":lv===2?"업무 문서는 /srv/docs 에 보관합니다. 파일이 많으면 find 를 쓰세요.":"중요 문서는 /srv/vault (admin 전용)에 있습니다. 관리자가 쉘 기록(.history)을 안 지우고 퇴근한 것 같다.";
 if(lv>=2)shuf(DEC).slice(0,3).forEach(x=>{f["/srv/docs/"+x[0]]=x[1]});
 if(lv>=3){f["/home/guest/.history"]="ls\ncd /srv/docs\nsu admin "+pw+"\nls /srv/vault\nexit";f["/srv/vault/payroll_final_BACKUP.xlsx"]="[HONEYPOT]"}
 f[gp]="[암호화된 문서 데이터]";
 return{name:(d.sys?"sys-":"srv-")+rnd(["hr","fin","ops","cs","st"])+"-0"+(1+Math.floor(Math.random()*9)),ip:"10."+Math.floor(Math.random()*200+10)+"."+Math.floor(Math.random()*250)+"."+Math.floor(Math.random()*250+2),ports,files:f,goal,gp,adm:pw,lv,guard:lv>=4}}
const BUY=[{n:"마담 K",x:1,st:0},{n:"익명 구매자",x:1.4,st:.25},{n:"해외 바이어",x:1.8,st:.45}]; // x=가격 배수, st=함정(보안과 위장) 확률
const CD=15*60000,FINE=30000,LOCK=0; // 문서 재침투 대기, 벌금, 접속 차단(0=없음)

let ready=false;
async function init(env){if(ready)return;await env.DB.batch([
 env.DB.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT)"),
 env.DB.prepare("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, data TEXT)"),
 env.DB.prepare("CREATE TABLE IF NOT EXISTS ledger (id TEXT, t INTEGER, kind TEXT, text TEXT, amt INTEGER)"),
 env.DB.prepare("CREATE TABLE IF NOT EXISTS hax (id TEXT PRIMARY KEY, data TEXT)"),
 env.DB.prepare("CREATE TABLE IF NOT EXISTS incidents (t INTEGER, id TEXT, kind TEXT, text TEXT)"),env.DB.prepare("CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, t INTEGER)"),env.DB.prepare("CREATE TABLE IF NOT EXISTS notices (t INTEGER, kind TEXT, text TEXT)"),env.DB.prepare("CREATE TABLE IF NOT EXISTS flags (k TEXT PRIMARY KEY, until INTEGER)")]);ready=true}

async function hmac(env,v){const k=await crypto.subtle.importKey("raw",enc.encode(env.SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const s=await crypto.subtle.sign("HMAC",k,enc.encode(v));return[...new Uint8Array(s)].map(b=>b.toString(16).padStart(2,"0")).join("")}
const sign=async(env,v)=>v+"."+await hmac(env,v);
const unsign=async(env,s)=>{if(!s)return null;const i=s.lastIndexOf(".");const v=s.slice(0,i);return(await sign(env,v))===s?v:null};
const cookies=r=>Object.fromEntries((r.headers.get("Cookie")||"").split("; ").filter(Boolean).map(c=>{const i=c.indexOf("=");return[c.slice(0,i),c.slice(i+1)]}));
const json=(code,o)=>new Response(JSON.stringify(o),{status:code,headers:{"Content-Type":"application/json"}});
const getUser=async(env,id)=>{const r=await env.DB.prepare("SELECT username FROM users WHERE id=?").bind(id).first();return r?r.username:null};
const getMember=async(env,id)=>{const r=await env.DB.prepare("SELECT data FROM members WHERE id=?").bind(id).first();return r?JSON.parse(r.data):null};
const getHax=async(env,id)=>{const r=await env.DB.prepare("SELECT data FROM hax WHERE id=?").bind(id).first();
 const o=Object.assign({docs:[],cd:{},trace:0,tt:0,lock:0,att:null,hacks:0,sold:0,earn:0,tutN:0,cctv:0,admin:null,tools:{proxy:0,mod:0}},r?JSON.parse(r.data):{});
 if(o.tv!==3){o.tv=3;o.tutN=0}o.st=Object.assign({scan:0,start:0,win:0,buy:0,sys:0,cctv:0,help:0,status:0,files:0,guess:0,maxlv:0,shield:0,nmap:0,banner:0,shell:0,ls:0,cat:0,su:0,kill:0,wipe:0},o.st);return o};
const putHax=(env,id,h)=>env.DB.prepare("INSERT OR REPLACE INTO hax (id,data) VALUES (?,?)").bind(id,JSON.stringify(h)).run();
const inc=(env,id,kind,text)=>env.DB.prepare("INSERT INTO incidents (t,id,kind,text) VALUES (?,?,?,?)").bind(Date.now(),id,kind,text);
const led=(env,id,text,amt)=>env.DB.prepare("INSERT INTO ledger (id,t,kind,text,amt) VALUES (?,?,?,?,?)").bind(id,Date.now(),"hack",text,amt);
const pay=(env,id,amt)=>env.DB.prepare("UPDATE members SET data=json_set(data,'$.money',json_extract(data,'$.money')+?) WHERE id=?").bind(amt,id);
const curTrace=(h,n)=>Math.max(0,h.trace-(n-h.tt)/30000); // 30초마다 1% 감소
const view=(h,n)=>({trace:Math.round(curTrace(h,n)),lock:h.lock>n?h.lock:0,docs:h.docs,hacks:h.hacks,sold:h.sold,earn:h.earn||0,cctv:h.cctv>n?h.cctv:0,admin:h.admin&&h.admin.until>n?{forge:h.admin.forge,fire:h.admin.fire,until:h.admin.until}:null,tools:{proxy:h.tools.proxy>n?h.tools.proxy:0,mod:h.tools.mod||0},
 cd:Object.fromEntries(Object.entries(h.cd).filter(([,v])=>v>n))});
const rpw=()=>{const c="abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";const u=crypto.getRandomValues(new Uint8Array(9));return[...u].map(x=>c[x%c.length]).join("")};

function dcPost(env,ctx,kind,text){if(!env.DISCORD_BOT_TOKEN||!env.NOTICE_CHANNEL_ID)return;
 const T={hack:["긴급 해킹 경보",0xc4271a],ceo:["회사 공지",0x1d4f9c],sec:["보안과 소식",0x1d7a55]}[kind]||["공지",0x555555];
 const p=fetch(API+"/channels/"+env.NOTICE_CHANNEL_ID+"/messages",{method:"POST",headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN,"Content-Type":"application/json"},
  body:JSON.stringify({embeds:[{title:T[0],description:String(text).slice(0,500),color:T[1],timestamp:new Date().toISOString()}],allowed_mentions:{parse:[]}})})
  .then(async r=>{if(!r.ok)console.log("notice post fail",r.status,await r.text())}).catch(e=>console.log("notice post err",e&&e.message));
 if(ctx&&ctx.waitUntil)ctx.waitUntil(p)}

export default{async fetch(req,env,ctx){
 const url=new URL(req.url),ck=cookies(req),id=await unsign(env,ck.sid).catch(()=>null);
 try{
 if(!env.SESSION_SECRET)return new Response("환경변수 SESSION_SECRET 이 설정되지 않았습니다. Cloudflare 대시보드의 Variables and Secrets 를 확인하세요.",{status:500,headers:{"Content-Type":"text/plain; charset=utf-8"}});
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
  if(act==="me"){const sh=await env.DB.prepare("SELECT until FROM flags WHERE k='shield'").first();
   return json(200,{user:{id,username:un},member:mem?{name:mem.name,dept:mem.dept,money:mem.money}:null,can:!!mem&&mem.dept==="none",hax:view(h,n),shield:sh&&sh.until>n?sh.until:0,tut:{n:h.tutN||0,total:TUT.length,steps:TUT.map(x=>({t:x.t,d:x.d,r:x.r,ok:!!x.f(h)}))},
    docs:ALL.map(d=>({id:d.id,t:d.t,lv:d.lv,sys:d.sys||""}))})}
  if(act==="notice"){const rs=(await env.DB.prepare("SELECT t,kind,text FROM notices WHERE t>? ORDER BY t DESC LIMIT 8").bind(n-600000).all()).results||[];return json(200,{list:rs.filter(x=>x.kind!=="hack"||n-x.t<300000).slice(0,3)})}
  if(req.method!=="POST")return json(405,{error:"POST만 가능합니다."});
  if(act==="ping"){await env.DB.prepare("INSERT OR REPLACE INTO seen (id,t) VALUES (?,?)").bind(id,Date.now()).run();return json(200,{ok:true})}
  const b=await req.json().catch(()=>({}));
  if(!mem)return json(400,{error:"스텔컴퍼니에 가입한 뒤 퇴사해야 활동할 수 있습니다."});
  if(mem.dept!=="none")return json(400,{error:"스텔컴퍼니에 재직 중이라 접속할 수 없습니다. 먼저 퇴사하세요."});
  const shUntil=async()=>{const r=await env.DB.prepare("SELECT until FROM flags WHERE k='shield'").first();return r&&r.until>n?r.until:0};
  const onSec=async()=>(await env.DB.prepare("SELECT COUNT(*) AS c FROM members m JOIN seen s ON s.id=m.id WHERE json_extract(m.data,'$.dept')='sec' AND s.t>?").bind(n-90000).first()).c||0;
  const ntc=(kind,text)=>{dcPost(env,ctx,kind,text);return env.DB.prepare("INSERT INTO notices (t,kind,text) VALUES (?,?,?)").bind(Date.now(),kind,text)};
  const bump=add=>{h.trace=curTrace(h,n)+add;h.tt=n};
  const bust=async(why,kind)=>{h.trace=0;h.tt=n;h.lock=LOCK?n+LOCK:0;h.docs=[];h.att=null;h.cctv=0;h.admin=null;const fine=Math.min(FINE,mem.money||0),sts=[inc(env,id,kind,why)];
   if(fine>0)sts.push(pay(env,id,-fine),led(env,id,"해킹 적발 벌금",-fine));await env.DB.batch(sts);return fine};
  const mkSec=(c,len)=>{const a=[...(c==="h"?"0123456789ABCDEF":"0123456789")];for(let i=a.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint8Array(1))[0]%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,len).join("")};
  const trs=(L,adj)=>Math.max(3,L.tries+adj);
  const win=async(d,extra)=>{const px=h.tools.proxy>n;bump((px?6:10)+extra);h.att=null;h.hacks++;h.cd[d.id]=n+(d.sys?20*60000:CD);
   if(d.sys){h.st.sys++;if(d.sys==="cctv")h.st.cctv++;if(d.sys==="shield")h.st.shield++}else{h.st.win++;h.st.maxlv=Math.max(h.st.maxlv||0,d.lv)}
   let msg;const sts=[inc(env,id,"breach",d.t)];
   if(!d.sys){h.docs.push({id:d.id,t:d.t,lv:d.lv,price:d.p[0]+Math.floor(Math.random()*(d.p[1]-d.p[0]+1))});msg="문서 확보: "+d.t}
   else if(d.sys==="cctv"){h.cctv=n+600000;msg="CCTV 관제 접근 권한 획득 (10분). cctv 를 입력하면 화면이 열립니다.";sts.push(ntc("hack","회사 CCTV 관제 서버가 해킹당했습니다!"))}
   else if(d.sys==="shield"){sts.push(env.DB.prepare("INSERT OR REPLACE INTO flags (k,until) VALUES ('shield',?)").bind(n+600000),ntc("hack","회사 보안막이 뚫렸습니다! 10분간 모든 시스템이 취약합니다."));msg="보안막 붕괴 (10분). 경보가 약해지고 관리자 콘솔에 접근할 수 있습니다."}
   else{h.admin={until:n+300000,forge:1,fire:1};msg="관리자 콘솔 접속 성공 (5분). forge <내용> 위조 공지, fire <이름> 직원 퇴직 처리 (각 1회)";sts.push(ntc("hack","회사 관리자 콘솔이 해킹당했습니다!"))}
   await putHax(env,id,h);await env.DB.batch(sts);return msg};
  if(act==="start"){const d=ALL.find(x=>x.id===Number(b.doc));if(!d)return json(400,{error:"없는 대상입니다."});
   if(h.lock>n)return json(400,{error:"접속이 차단되었습니다."});
   if((h.cd[d.id]||0)>n)return json(400,{error:"이 서버는 경계 중입니다. "+Math.ceil((h.cd[d.id]-n)/60000)+"분 뒤에 다시 시도하세요."});
   if(!d.sys&&h.docs.some(x=>x.id===d.id))return json(400,{error:"이미 확보한 문서입니다. 먼저 판매하세요."});
   const sh=await shUntil();if(d.sys==="admin"&&!sh)return json(400,{error:"보안막이 살아 있어 관리자 콘솔에 접근할 수 없습니다. 먼저 보안막을 뚫으세요."});
   const cut=sh?0:Math.min(3,await onSec()),mod=(h.tools.mod||0)>0;if(mod)h.tools.mod--;if(h.att)bump(15);
   const H=mkHost(d);if(sh)H.guard=false;h.att={doc:d.id,at:n,host:H,user:null,cwd:"",cut,sh:!!sh,wiped:false,guardOff:false,free:mod};h.st.start++;await putHax(env,id,h);
   const out=[["> 대상 연결: "+H.name+" ("+H.ip+") · 보안 L"+d.lv,"dm"],["침투에 성공하기 전까지 제한 시간 4분 (셸을 얻으면 없어집니다). 먼저 nmap 으로 열린 포트를 확인하세요. (help)","dm"]];
   if(cut)out.push(["보안과 "+cut+"명 접속 중: 명령할 때마다 추적도가 조금씩 올라갑니다.","er"]);if(sh)out.push(["보안막 붕괴 상태: 경보가 약해졌습니다.","gr"]);if(mod)out.push(["실수 보험 적용: 첫 경보 1회 면제","gr"]);
   return json(200,{out,pr:"["+H.name+"]$",t:d.t,lv:d.lv,hax:view(h,n)})}
  if(act==="ev"){const k=String(b.k||"");if(["help","status","files"].includes(k)){h.st[k]++;await putHax(env,id,h)}return json(200,{ok:true})}
  if(act==="scan"){h.st.scan++;await putHax(env,id,h);return json(200,{ok:true})}
  if(act==="tutclaim"){const s0=TUT[h.tutN||0];if(!s0||!s0.f(h))return json(400,{error:"완료한 미션이 없습니다."});h.tutN=(h.tutN||0)+1;await putHax(env,id,h);
   await env.DB.batch([pay(env,id,s0.r),led(env,id,"튜토리얼 보상: "+s0.t,s0.r)]);return json(200,{t:s0.t,r:s0.r})}
  if(act==="rank"){const rs=(await env.DB.prepare("SELECT x.data AS data,u.username AS un FROM hax x LEFT JOIN users u ON u.id=x.id").all()).results||[];
   const list=rs.map(r=>{const o=JSON.parse(r.data);return{n:r.un||"익명",earn:o.earn||0,sold:o.sold||0}}).filter(x=>x.earn>0).sort((a,b)=>b.earn-a.earn).slice(0,10);return json(200,{list})}
  if(act==="abort"){if(h.att){h.att=null;bump(15);await putHax(env,id,h)}return json(200,{hax:view(h,n)})}
  if(act==="sh"){const a=h.att;if(!a)return json(400,{error:"진행 중인 침투가 없습니다. hack <번호> 로 연결하세요."});
   const o=[],P=(t,c)=>o.push([t,c||""]),H=a.host,D=ALL.find(x=>x.id===a.doc),px=h.tools.proxy>n;
   if(!a.user&&n>a.at+240000){h.att=null;bump(15);await putHax(env,id,h);return json(200,{out:[["연결 시간 초과. 세션이 끊겼습니다. 추적도 +15%","er"]],end:"fail",pr:"",hax:view(h,n)})}
   const ar=String(b.c||"").trim().slice(0,100).split(/\s+/),c=(ar[0]||"").toLowerCase(),a1=ar[1]||"",a2=ar[2]||"";
   const pen=v=>{if(a.free){a.free=false;P("(실수 보험으로 경보를 막았습니다)","gr");return}bump(v*(px?.6:1))};
   const res=p=>{const q=!p||p==="~"?"/home/guest":p[0]==="/"?p:a.cwd+"/"+p,r=[];for(const t of q.split("/")){if(!t||t===".")continue;if(t==="..")r.pop();else r.push(t)}return"/"+r.join("/")};
   const kids=d=>{const set=new Set(),pre=d==="/"?"/":d+"/";for(const k of Object.keys(H.files))if(k.startsWith(pre)){const r=k.slice(pre.length).split("/");set.add(r.length>1?r[0]+"/":r[0])}return[...set]};
   const denied=p=>p.startsWith("/srv/vault")&&a.user!=="admin",need=()=>{if(!a.user){P("먼저 침투해서 셸을 얻어야 합니다. (exploit)","er");return true}return false};
   let end=null;
   switch(c){
    case"help":h.st.help++;["nmap                    열린 포트 스캔","banner <포트>           서비스 정보 (약점 단서)","exploit <도구> <포트>   침투: anon-login / pw-spray / webshell","ls [폴더] cd <폴더> cat <파일> find <키워드> pwd whoami","ps / kill <이름>        프로세스 확인과 종료","su <계정> <비번>        권한 상승","wipe                    로그 삭제 (추적도 -15%)","download <파일>         문서 반출 (성공 조건)","exit                    연결 종료"].forEach(l=>P(l,"dm"));break;
    case"nmap":h.st.nmap++;P("Scanning "+H.ip+" ("+H.name+")");H.ports.forEach(r=>P(r.p+"/tcp  open  "+r.s));P("banner <포트> 로 서비스 정보를 확인하세요.","dm");break;
    case"banner":{const r=H.ports.find(q=>q.p===Number(a1));if(!r)P("그 포트는 닫혀 있습니다.","er");else{h.st.banner++;P(r.p+"/"+r.s+" : "+(r.v?SV[r.s].ok:SV[r.s].no))}break}
    case"exploit":{if(a.user){P("이미 셸을 획득했습니다.","er");break}const sv=TOOL[a1],r=H.ports.find(q=>q.p===Number(a2));
     if(!sv){P("알 수 없는 도구입니다. (anon-login / pw-spray / webshell)","er");break}if(!r){P("그 포트는 닫혀 있습니다.","er");break}
     if(r.s===sv&&r.v){a.user="guest";a.cwd="/home/guest";h.st.shell++;await inc(env,id,"breach","[침입 진행 중] "+H.name+" · "+D.t).run();P("[+] 침투 성공. guest 셸을 획득했습니다.","gr");P("ls 로 둘러보세요.","dm")}
     else{P(r.s===sv?"[!] 공격이 막혔습니다. 이 서비스에는 해당 약점이 없습니다. 경보 +6%":"[!] 서비스와 맞지 않는 도구입니다. 경보 +6%","er");pen(6)}break}
    case"whoami":if(need())break;P(a.user);break;
    case"pwd":if(need())break;P(a.cwd);break;
    case"ls":{if(need())break;const d=res(a1||".");if(denied(d)){P("접근 거부: 권한이 필요합니다.","er");break}const k=kids(d);if(!k.length)P("(비어 있거나 없는 폴더)","dm");else{h.st.ls++;P(k.join("   "))}break}
    case"cd":{if(need())break;const d=res(a1||"~");if(denied(d)){P("접근 거부: 권한이 필요합니다.","er");break}if(!kids(d).length){P("그런 폴더가 없습니다.","er");break}a.cwd=d;break}
    case"cat":{if(need())break;const p=res(a1);if(denied(p)){P("접근 거부","er");break}const t=H.files[p];if(t===undefined)P("그런 파일이 없습니다.","er");else{h.st.cat++;t.split("\n").forEach(l=>P(l))}break}
    case"find":{if(need())break;const kw=a1.toLowerCase();if(!kw){P("사용법: find <키워드>","er");break}const r=Object.keys(H.files).filter(p=>p.toLowerCase().includes(kw)&&!denied(p));if(!r.length)P("결과 없음","dm");else r.forEach(p=>P(p));break}
    case"ps":if(need())break;P("PID  NAME");P("101  sshd");P("233  stellweb");if(H.guard&&!a.guardOff)P("417  stellguard   (보안 에이전트)","er");break;
    case"kill":{if(need())break;if(a1==="stellguard"&&H.guard&&!a.guardOff){a.guardOff=true;h.st.kill++;P("[+] stellguard 종료. 전송 차단이 해제되었습니다.","gr")}else P("그런 프로세스가 없습니다.","er");break}
    case"su":{if(need())break;if(H.lv<3){P("이 서버에서는 권한 상승이 필요 없습니다.","dm");break}if(a1==="admin"&&a2===H.adm){a.user="admin";h.st.su++;P("[+] admin 권한을 획득했습니다.","gr")}else{P("[!] 인증 실패. 경보 +8%","er");pen(8)}break}
    case"wipe":{if(need())break;if(H.lv>=3&&a.user!=="admin"){P("권한이 부족해 로그를 지울 수 없습니다. (su)","er");break}if(a.wiped){P("이미 정리했습니다.","dm");break}a.wiped=true;h.trace=Math.max(0,curTrace(h,n)-15);h.tt=n;h.st.wipe++;P("[+] /var/log 정리 완료. 추적도 -15%","gr");break}
    case"download":{if(need())break;const p=Object.keys(H.files).find(q=>a1.includes("/")?q===res(a1):q.split("/").pop()===a1);
     if(!p||denied(p)){P("그런 파일이 없거나 권한이 없습니다.","er");break}
     if(H.files[p]==="[HONEYPOT]"){delete H.files[p];P("[!] 허니팟이었습니다! 보안 시스템이 반응했습니다. 경보 +40%","er");bump(40);break}
     if(p!==H.gp){P("[~] 내려받았지만 쓸모없는 파일입니다. 경보 +3%","dm");bump(3);break}
     if(H.guard&&!a.guardOff){P("[!] stellguard 가 전송을 차단했습니다. 경보 +35% (ps, kill 로 먼저 종료하세요)","er");bump(35);break}
     const extra=a.wiped?0:10,msg=await win(D,extra);P("[+] 반출 완료: "+H.goal,"gr");P(msg,"gr");if(!a.wiped)P("로그를 지우지 않아 흔적이 남았습니다. 추적도 +10%","er");end="ok";break}
    case"exit":case"quit":h.att=null;end="quit";P("연결을 종료했습니다.","dm");break;
    case"":break;
    default:P("알 수 없는 명령입니다. help","dm")}
   if(!end&&a.cut)bump(a.cut*.5);
   if(!end&&h.trace>=60&&!a.alerted){a.alerted=true;await inc(env,id,"alert","의심 접속 시도 · "+H.name+" ("+D.t+")").run()}
   let fine=0;if(end!=="ok"&&end!=="quit"&&h.trace>=100){fine=await bust(D.t,"caught");end="caught";P("[!!] 추적당했습니다! 보유 문서 압수"+(fine?", 벌금 "+fine+"원":"")+".","er")}
   if(end!=="ok")await putHax(env,id,h);
   return json(200,{out:o,end,pr:end?"":(a.user?a.user+"@"+H.name+":"+a.cwd+"$":"["+H.name+"]$"),hax:view(h,n)})}
  if(act==="cctv"){if(!(h.cctv>n))return json(400,{error:"CCTV 접근 권한이 없습니다. CCTV 관제 서버를 먼저 해킹하세요."});
   const rs=(await env.DB.prepare("SELECT m.data AS data FROM seen s JOIN members m ON m.id=s.id WHERE s.t>?").bind(n-90000).all()).results||[],rooms={};let c=0;
   for(const r of rs){const x=JSON.parse(r.data),k=x.dept==="vp"||x.dept==="ceo"?"boss":(x.dept||"none");(rooms[k]=rooms[k]||[]).push(x.name);c++}
   return json(200,{rooms,count:c,until:h.cctv})}
  if(act==="forge"){if(!(h.admin&&h.admin.until>n&&h.admin.forge>0))return json(400,{error:"관리자 세션이 없거나 이미 사용했습니다."});
   const tx=String(b.text||"").trim().slice(0,120);if(!tx)return json(400,{error:"내용을 입력하세요."});
   h.admin.forge=0;await putHax(env,id,h);await ntc("ceo",tx).run();return json(200,{ok:true})}
  if(act==="fire"){if(!(h.admin&&h.admin.until>n&&h.admin.fire>0))return json(400,{error:"관리자 세션이 없거나 이미 사용했습니다."});
   const nm=String(b.name||"").trim(),rs=(await env.DB.prepare("SELECT id,data FROM members").all()).results||[],t=rs.find(r=>JSON.parse(r.data).name===nm);
   if(!t||t.id===id)return json(400,{error:"그런 직원이 없습니다."});const x=JSON.parse(t.data);
   if(x.dept==="vp"||x.dept==="ceo")return json(400,{error:"부사장과 사장은 건드릴 수 없습니다."});if(x.dept==="none")return json(400,{error:"이미 퇴사한 직원입니다."});
   x.dept="none";x.xp=0;h.admin.fire=0;await putHax(env,id,h);
   await env.DB.batch([env.DB.prepare("UPDATE members SET data=? WHERE id=?").bind(JSON.stringify(x),t.id),ntc("hack","관리자 콘솔 조작으로 "+x.name+" 님이 퇴직 처리되었습니다.")]);return json(200,{ok:true,name:x.name})}
  if(act==="buy"){const IT={proxy:[2000,"프록시 서버"],mod:[1500,"브루트포스 모듈"],wipe:[3000,"로그 삭제기"]},it=IT[b.item];if(!it)return json(400,{error:"없는 상품입니다."});
   if(mem.money<it[0])return json(400,{error:"돈이 부족합니다. ("+it[0]+"원 필요)"});
   h.st.buy++;if(b.item==="proxy")h.tools.proxy=Math.max(n,h.tools.proxy||0)+3600000;if(b.item==="mod")h.tools.mod=(h.tools.mod||0)+1;if(b.item==="wipe"){h.trace=Math.max(0,curTrace(h,n)-40);h.tt=n}
   await putHax(env,id,h);await env.DB.batch([pay(env,id,-it[0]),led(env,id,it[1]+" 구매",-it[0])]);return json(200,{item:it[1],hax:view(h,n)})}
  if(act==="sell"){const i=h.docs.findIndex(x=>x.id===Number(b.doc)),B=BUY[Number(b.buyer)||0];if(i<0)return json(400,{error:"보유하지 않은 문서입니다."});if(!B)return json(400,{error:"없는 구매자입니다."});
   const d=h.docs[i];
   if(Math.random()<B.st){const fine=await bust(d.t,"sting");await putHax(env,id,h);return json(200,{sting:true,fine,who:B.n,hax:view(h,n)})}
   h.docs.splice(i,1);h.sold++;const amt=Math.round(d.price*B.x);h.earn=(h.earn||0)+amt;await putHax(env,id,h);
   await env.DB.batch([pay(env,id,amt),led(env,id,"기밀문서 판매: "+d.t,amt),inc(env,id,"leak",d.t)]);
   return json(200,{paid:amt,t:d.t,who:B.n,hax:view(h,n)})}
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
.cg{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.cam{border:1px solid var(--ln);background:#06080a repeating-linear-gradient(0deg,#ffffff07 0 1px,transparent 1px 3px);padding:8px 10px;min-height:88px;font-size:12px}.cam b{display:block;color:var(--gr);font-size:11px;margin-bottom:4px}
#tut{position:fixed;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);width:min(290px,calc(100vw - 16px));z-index:9000;background:#0b0e12ee;border:1px solid var(--ln);box-shadow:0 12px 40px #000a;backdrop-filter:blur(6px)}
#tth{padding:8px 10px;cursor:pointer;display:flex;gap:8px;align-items:center;font-size:12px}#tth b{color:var(--ac);letter-spacing:.08em}#tth span{flex:1;text-align:right;color:var(--tx);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ttb{border-top:1px solid var(--ln);padding:6px 10px;max-height:46vh;overflow:auto}
.ts{padding:4px 0;font-size:12px;color:var(--dm)}.ts.dn{opacity:.5}.ts.cu{color:var(--tx)}.ts.cu div{margin:3px 0 3px 12px;color:var(--tx);line-height:1.6}.ts.cu .lv2{color:var(--gr)}.chip{display:inline-block;border:1px solid var(--ac);color:var(--ac);padding:0 6px;margin:1px 2px;cursor:pointer;font:inherit}.chip:hover{background:var(--ac);color:#000}
.fxo{animation:fo .7s}.fxb{animation:fb .7s}
@keyframes fo{0%{box-shadow:inset 0 0 0 5px #6dffb0cc}100%{box-shadow:inset 0 0 0 0 transparent}}
@keyframes fb{0%{box-shadow:inset 0 0 0 5px #ff4d3dcc}100%{box-shadow:inset 0 0 0 0 transparent}}
@media(max-width:700px){#tut{top:calc(env(safe-area-inset-top,0px) + 40px)}}
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
  <button onclick="open_('crack')"><b>##</b><span>대상목록</span></button>
  <button onclick="open_('files')"><b>[=]</b><span>문서함</span></button>
  <button onclick="open_('shop')"><b>$</b><span>암시장</span></button>
  <button onclick="open_('cctv')"><b>o</b><span>CCTV</span></button>
  <button onclick="open_('rank')"><b>#</b><span>랭킹</span></button>
  <button onclick="open_('note')"><b>i</b><span>README</span></button>
 </div>
 <div class="win" id="w-term" style="left:110px;top:24px;width:600px;height:410px"><div class="tb"><b>cmd.exe</b><span><i onclick="hide('term')">_</i><i onclick="shut('term')">×</i></span></div><div class="bd" id="tout"></div><div class="pr"><span id="ps">C:\Stella&gt;</span><input id="cin" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div></div>
 <div class="win" id="w-crack" style="left:170px;top:70px;width:520px;height:440px"><div class="tb"><b>대상 목록</b><span><i onclick="hide('crack')">_</i><i onclick="shut('crack')">×</i></span></div><div class="bd"><div id="tl" style="white-space:normal"></div></div></div>
 <div class="win" id="w-files" style="left:230px;top:50px;width:500px;height:380px"><div class="tb"><b>문서함</b><span><i onclick="hide('files')">_</i><i onclick="shut('files')">×</i></span></div><div class="bd"><div id="fh" class="dm" style="margin-bottom:8px"></div><div id="fl" style="white-space:normal"></div></div></div>
 <div class="win" id="w-shop" style="left:260px;top:60px;width:470px;height:360px"><div class="tb"><b>암시장</b><span><i onclick="hide('shop')">_</i><i onclick="shut('shop')">×</i></span></div><div class="bd"><div id="sh" class="dm" style="margin-bottom:8px"></div><div id="sl2" style="white-space:normal"></div></div></div>
 <div class="win" id="w-cctv" style="left:200px;top:40px;width:560px;height:420px"><div class="tb"><b>CCTV 관제</b><span><i onclick="hide('cctv')">_</i><i onclick="shut('cctv')">×</i></span></div><div class="bd"><div id="cch" class="dm" style="margin-bottom:8px"></div><div id="cct" class="cg"></div></div></div>
 <div class="win" id="w-rank" style="left:240px;top:70px;width:440px;height:380px"><div class="tb"><b>블랙마켓 랭킹</b><span><i onclick="hide('rank')">_</i><i onclick="shut('rank')">×</i></span></div><div class="bd"><div class="dm" style="margin-bottom:8px">문서 판매 누적 수익 기준 · 등급: 뉴비 → 스크립트키디(3천) → 크래커(1.5만) → 블랙햇(5만) → 팬텀(15만)</div><div id="rk" style="white-space:normal"></div></div></div>
 <div class="win" id="w-note" style="left:290px;top:40px;width:440px;height:330px"><div class="tb"><b>README.txt</b><span><i onclick="hide('note')">_</i><i onclick="shut('note')">×</i></span></div><div class="bd"><div>VIRUS STELLA

우리는 스텔컴퍼니의 지하실을 연다.

1. cmd에서 scan 으로 대상을 찾는다.
2. hack 번호 로 서버에 연결해 nmap 으로 정찰하고, banner 로 약점을 읽어 exploit 으로 침투한다. ls, cat 으로 파일을 뒤져 download 로 문서를 빼낸다.
3. 문서함에서 구매자를 골라 판다. 값을 더 쳐주는 쪽일수록 보안과의 함정일 확률이 높다.
4. 암시장에서 프록시, 실수 보험, 로그 삭제기를 산다.
5. CCTV 서버를 뚫으면 지금 접속 중인 직원을 볼 수 있다. 보안막을 뚫으면 모두가 약해지고, 관리자 콘솔은 공지 위조와 직원 퇴직이 가능하다. 이 셋을 당하면 회사 전체에 공지가 뜬다.

실수할 때마다 추적도가 오른다. 100%가 되거나 보안과에 신원이 추적당하면 보유 문서는 압수되고 벌금이 나간다. 접속 중인 보안과 직원이 많을수록 명령마다 추적도가 더 오른다.

스텔컴퍼니에서 퇴사한 무직자만 활동할 수 있다. 대금은 개인 자산으로 입금된다.</div></div></div>
</div>
<div id="menu" hidden><button onclick="open_('term')">cmd.exe</button><button onclick="open_('crack')">대상목록</button><button onclick="open_('files')">문서함</button><button onclick="open_('shop')">암시장</button><button onclick="open_('cctv')">CCTV</button><button onclick="open_('rank')">랭킹</button><a href="__STELL__" target="_blank" rel="noopener">스텔컴퍼니 사이트</a><a href="/auth/logout">접속 종료</a></div>
<div id="tut" hidden><div id="tth"><b>TUTORIAL</b><span id="ttn"></span></div><div id="ttb" hidden></div></div>
<div id="bar"><button id="st" onclick="$('#menu').hidden=!$('#menu').hidden">STELLA</button><div id="tabs"></div><span id="tr"></span></div>
<script>
const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms)),won=n=>Number(n||0).toLocaleString("ko-KR")+"원";
let S=null,zi=10;const W={},T=$("#tout"),NAMES={term:"cmd.exe",crack:"대상목록",files:"문서함",shop:"암시장",cctv:"CCTV",rank:"랭킹",note:"README"};
async function api(p,b){const r=await fetch("/api/"+p,b?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}:{});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"오류");return j}
function mkLog(box){return(t,el,c)=>{if(!el){el=document.createElement("div");box.appendChild(el)}el.textContent=t;el.className=c||"";box.scrollTop=1e9;return el}}
const out=mkLog(T);
document.querySelectorAll(".win").forEach(el=>{W[el.id.slice(2)]={el,tab:null}});
function open_(k){const w=W[k];w.el.classList.add("on");w.el.style.zIndex=++zi;
 if(!w.tab){w.tab=document.createElement("button");w.tab.textContent=NAMES[k];w.tab.onclick=()=>{(w.el.classList.contains("on")&&+w.el.style.zIndex===zi)?hide(k):open_(k)};$("#tabs").appendChild(w.tab)}
 $("#menu").hidden=true;if(k==="files")drawFiles();if(k==="crack")drawTargets();if(k==="shop")drawShop();if(k==="cctv")drawCctv();if(k==="rank")drawRank();if(k==="term"&&innerWidth>700)$("#cin").focus()}
function hide(k){W[k].el.classList.remove("on")}
function shut(k){hide(k);if(W[k].tab){W[k].tab.remove();W[k].tab=null}}
document.querySelectorAll(".tb").forEach(tb=>{tb.onpointerdown=e=>{if(e.target.tagName==="I"||innerWidth<=700)return;const el=tb.parentNode;el.style.zIndex=++zi;
 const dx=e.clientX-el.offsetLeft,dy=e.clientY-el.offsetTop;
 const mv=v=>{el.style.left=Math.max(0,v.clientX-dx)+"px";el.style.top=Math.max(0,v.clientY-dy)+"px"};
 const up=()=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up)};addEventListener("pointermove",mv);addEventListener("pointerup",up)}});

async function load(){S=await api("me");if(!S.user)return;const t=S.hax.trace;
 $("#tr").innerHTML="";const a=document.createElement("span");a.textContent="추적 "+t+"%"+(S.hax.lock>Date.now()?" (차단)":"");a.style.color=t>=70?"var(--ac)":t>=40?"#ffb84d":"var(--dm)";
 $("#tr").append("["+rankT(S.hax.earn)+"] ",a,"  "+(S.member?won(S.member.money):"외부인"))}
function drawTargets(){const b=$("#tl");b.innerHTML="";if(!S)return;S.docs.forEach(d=>{const r=document.createElement("div");r.className="row";
 const cd=(S.hax.cd[d.id]||0)>Date.now(),have=!d.sys&&S.hax.docs.some(x=>x.id===d.id);
 r.innerHTML="<span class='lv'></span><span class='nm'></span><button></button>";r.children[0].textContent="L"+d.lv;r.children[1].textContent=(d.sys?"[SYS] ":"")+d.t;
 const bt=r.children[2];bt.textContent=have?"보유":cd?"경계중":"연결";bt.disabled=have||cd||!!G;bt.onclick=()=>{open_("term");run(d.id,out)};b.appendChild(r)})}
function drawFiles(){const f=$("#fl");f.innerHTML="";if(!S)return;
 $("#fh").textContent=S.member?"개인 자산 "+won(S.member.money)+" · 판매 "+S.hax.sold+"건 · 시도 "+S.hax.hacks+"회":"스텔컴퍼니에 가입한 뒤 퇴사해야 활동할 수 있습니다.";
 if(!S.hax.docs.length){f.innerHTML="<div class='dm'>확보한 문서가 없습니다.</div>";return}
 S.hax.docs.forEach(d=>{const r=document.createElement("div");r.className="row";r.innerHTML="<span class='lv'></span><span class='nm'></span><button></button>";
  r.children[0].textContent="L"+d.lv;r.children[1].textContent=d.t+"  ("+won(d.price)+")";r.children[2].remove();[["마담K ×1.0",0],["익명 ×1.4 ⚠",1],["해외 ×1.8 ⚠⚠",2]].forEach(([tx,bi])=>{const bt=document.createElement("button");bt.textContent=tx;bt.style.fontSize="11px";bt.onclick=()=>sell(d.id,bi,mkLog(T));r.appendChild(bt)});f.appendChild(r)})}
async function refresh(){await load();await claimTut();drawTargets();drawFiles();drawShop();drawTut()}

let G=null;
const setPr=()=>{$("#ps").textContent=G?G.pr:"C:\\Stella>"};
const pr=(L,o)=>o.forEach(([t,c])=>L(t,0,c));
async function run(id,L){if(G){L("이미 연결 중입니다. exit 로 종료하세요.",0,"er");return}
 try{const a=await api("start",{doc:id});G={L,pr:a.pr,t:a.t};setPr();pr(L,a.out);await refresh()}catch(e){L(e.message,0,"er")}}
async function sh(line){const L=G.L;
 try{const r=await api("sh",{c:line});pr(L,r.out);G.pr=r.pr||"";
  if(r.end){if(r.end==="ok")fx("fxo");if(r.end==="caught"||r.end==="fail")fx("fxb");G=null}setPr()}catch(e){L(e.message,0,"er");G=null;setPr()}
 await refresh()}
async function sell(id,bi,L){try{const r=await api("sell",{doc:id,buyer:bi});if(r.sting)fx("fxb");else fx("fxo");
  if(r.sting)L(r.who+"는 보안과의 함정이었습니다! 문서 압수"+(r.fine?", 벌금 "+won(r.fine):"")+".",0,"er");
  else L("판매 완료: "+r.t+" → "+r.who+" +"+won(r.paid),0,"gr")}catch(e){L(e.message,0,"er")}await refresh()}
async function buy(item,L){try{const r=await api("buy",{item});L(r.item+" 구매 완료",0,"gr")}catch(e){L(e.message,0,"er")}await refresh()}
const rankT=e=>e>=150000?"팬텀":e>=50000?"블랙햇":e>=15000?"크래커":e>=3000?"스크립트키디":"뉴비";
function fx(c){const d=$("#desk");d.classList.remove("fxo","fxb");void d.offsetWidth;d.classList.add(c)}
let tutOpen=true;
function chips(line,box){line.split(/(\[\[.+?\]\])/).forEach(p=>{const m=p.match(/^\[\[(.+)\]\]$/);
 if(m){const c=document.createElement("code");c.textContent=m[1];c.className="chip";c.onclick=()=>{open_("term");const i=$("#cin");i.value=m[1];i.focus()};box.appendChild(c)}else if(p)box.appendChild(document.createTextNode(p))})}
function drawTut(){const p=$("#tut");if(!S||!S.tut||S.tut.n>=S.tut.total){p.hidden=true;return}p.hidden=false;const T0=S.tut,cur=T0.steps[T0.n];
 $("#ttn").textContent="STEP "+(T0.n+1)+"/"+T0.total+" · "+cur.t+(tutOpen?"":" ▸");const b=$("#ttb");b.hidden=!tutOpen;b.innerHTML="";
 T0.steps.forEach((x,i)=>{if(i>T0.n+1)return;const e=document.createElement("div");e.className="ts"+(i<T0.n?" dn":i===T0.n?" cu":"");const h=document.createElement("b");
  h.textContent=(i<T0.n?"✓ ":i===T0.n?"▶ ":"· ")+x.t+(i>=T0.n?"  +"+won(x.r):"");e.appendChild(h);
  if(i===T0.n){x.d.split("\n").forEach(l=>{const d=document.createElement("div");chips(l,d);e.appendChild(d)});
   if(G){const d=document.createElement("div");d.className="lv2";d.textContent="▷ 연결 중: "+G.t+"  ("+G.pr+")";e.appendChild(d)}}
  b.appendChild(e)})}
$("#tth").onclick=()=>{tutOpen=!tutOpen;drawTut()};
async function claimTut(){if(!S||!S.tut)return;for(let i=0;i<8;i++){const T0=S.tut;if(T0.n>=T0.total||!T0.steps[T0.n].ok)break;
 try{const r=await api("tutclaim",{});out("[튜토리얼] 미션 완료: "+r.t+"  +"+won(r.r),0,"gr");fx("fxo");await load()}catch(e){break}}}
async function drawRank(){const b=$("#rk");try{const r=await api("rank",{});b.innerHTML="";if(!r.list.length){b.textContent="아직 기록이 없습니다.";return}
 r.list.forEach((x,i)=>{const e=document.createElement("div");e.className="row";e.innerHTML="<span class='lv'></span><span class='nm'></span><span class='dm'></span>";
  e.children[0].textContent="#"+(i+1);e.children[1].textContent=x.n+"  ["+rankT(x.earn)+"]";e.children[2].textContent=won(x.earn);b.appendChild(e)})}catch(e){b.textContent=e.message}}
const mins=t=>Math.max(0,Math.ceil((t-Date.now())/60000));
async function exec(s){const p=s.trim().split(/\s+/),c=(p[0]||"").toLowerCase(),n=Number(p[1]);out((G?G.pr:"C:\\Stella>")+" "+s);
 if(G){if(c==="clear"){T.innerHTML="";return}await sh(s);return}
 if(!c)return;
 if(c==="help"){try{await api("ev",{k:"help"})}catch(e){}["help            명령어 목록","scan            침투 대상 스캔","hack <번호>     대상 서버에 연결해 침투 시작 (연결 후 help)","files           확보한 문서 목록","sell <번호> [1~3]  문서 판매 (1=마담K 2=익명 3=해외)","tools / buy proxy|mod|wipe  도구","cctv            CCTV 관제 화면 (서버 해킹 후)","forge <내용>    위조 전체공지 (관리자 세션)","fire <이름>     직원 퇴직 처리 (관리자 세션)","status          추적도와 잔액","rank            해커 랭킹","mission         튜토리얼 미션 열기/닫기","connect stell-company  내부망 접속","clear           화면 지우기"].forEach(l=>out(l,0,"dm"));await refresh();return}
 if(c==="clear"){T.innerHTML="";return}
 if(c==="whoami"){out(S.user.username+(S.member?" / 스텔컴퍼니 "+S.member.name:" / 외부인"));return}
 if(c==="status"){try{await api("ev",{k:"status"})}catch(e){}await refresh();out("추적도 "+S.hax.trace+"%");out("확보 문서 "+S.hax.docs.length+"개 / 개인 자산 "+(S.member?won(S.member.money):"스텔컴퍼니 미가입"));
  if(S.hax.cctv)out("CCTV 접근 "+mins(S.hax.cctv)+"분 남음",0,"gr");if(S.hax.admin)out("관리자 세션 "+mins(S.hax.admin.until)+"분 남음 (forge "+S.hax.admin.forge+" / fire "+S.hax.admin.fire+")",0,"gr");
  if(S.shield>Date.now())out("보안막 붕괴 중 ("+mins(S.shield)+"분)",0,"er");return}
 if(c==="connect"){for(const l of ["터널 생성 중...","프록시 3단 경유","핸드셰이크 완료","스텔컴퍼니 내부망 연결됨. scan 으로 대상을 확인하세요."]){out("> "+l,0,"gr");await sleep(350)}return}
 if(c==="scan"){out("> 포트 스캔 중...",0,"dm");try{await api("scan",{})}catch(e){}await sleep(700);await refresh();
  S.docs.forEach(d=>{const cd=(S.hax.cd[d.id]||0)>Date.now(),have=!d.sys&&S.hax.docs.some(x=>x.id===d.id),lock=d.sys==="admin"&&S.shield<Date.now();
   out("["+d.id+"] L"+d.lv+"  "+(d.sys?"[SYS] ":"")+d.t+"  "+(have?"(보유)":cd?"(경계중)":lock?"(보안막 필요)":"(연결 가능)"+(d.sys?SD[d.sys]:"")),0,have||cd||lock?"dm":"")});return}
 if(c==="files"){try{await api("ev",{k:"files"})}catch(e){}await refresh();if(!S.hax.docs.length)out("확보한 문서가 없습니다.",0,"dm");S.hax.docs.forEach(d=>out("["+d.id+"] "+d.t+"  "+won(d.price)));return}
 if(c==="hack"||c==="crack"){if(!n){out("사용법: hack <번호>  (scan으로 번호 확인)",0,"er");return}await run(n,out);return}
 if(c==="sell"){if(!n){out("사용법: sell <번호> [1~3]  (files로 번호 확인)",0,"er");return}await sell(n,(Number(p[2])||1)-1,out);return}
 if(c==="tools"){await load();toolLines().forEach(l=>out(l));return}
 if(c==="buy"){if(!p[1]){out("사용법: buy proxy|mod|wipe",0,"er");return}await buy(p[1],out);return}
 if(c==="rank"){open_("rank");return}
 if(c==="mission"){tutOpen=!tutOpen;drawTut();return}
 if(c==="cctv"){try{await api("cctv",{});open_("cctv");out("CCTV 관제 화면을 열었습니다.",0,"gr")}catch(e){out(e.message,0,"er")}return}
 if(c==="forge"){const tx=s.trim().slice(5).trim();if(!tx){out("사용법: forge <공지 내용>",0,"er");return}try{await api("forge",{text:tx});out("위조 공지를 전송했습니다.",0,"gr")}catch(e){out(e.message,0,"er")}await refresh();return}
 if(c==="fire"){const tx=s.trim().slice(4).trim();if(!tx){out("사용법: fire <직원 닉네임>",0,"er");return}try{const r=await api("fire",{name:tx});out(r.name+" 님을 퇴직 처리했습니다.",0,"gr")}catch(e){out(e.message,0,"er")}await refresh();return}
 if(["nmap","banner","exploit","ls","cd","cat","find","pwd","whoami","ps","kill","su","wipe","download","exit","quit"].includes(c)){out("아직 서버에 연결되어 있지 않습니다. scan 으로 번호를 확인하고 hack <번호> 로 먼저 연결하세요. (예: hack 1)",0,"er");return}
 out("'"+p[0]+"' 은(는) 알 수 없는 명령입니다. help 를 입력하세요.",0,"er")}
const SD={cctv:"  → 성공하면 10분간 cctv 화면",shield:"  → 성공하면 10분간 경보 약화 + 관리자 콘솔 해금",admin:"  → 성공하면 5분간 forge / fire"};
const TOOLS=[["proxy","프록시 서버","경보로 오르는 추적도 감소, 1시간 (2,000원)"],["mod","실수 보험","다음 침투에서 첫 경보 1회 면제 (1,500원)"],["wipe","로그 삭제기","추적도 -40% (3,000원)"]];
function toolLines(){const t=S.hax.tools,l=[];l.push("프록시 "+(t.proxy>Date.now()?mins(t.proxy)+"분 남음":"없음")+" / 모듈 "+t.mod+"개");TOOLS.forEach(x=>l.push(x[0]+"  "+x[1]+" - "+x[2]));return l}
function drawShop(){const f=$("#sl2");f.innerHTML="";if(!S)return;const t=S.hax.tools;
 $("#sh").textContent=(S.member?"개인 자산 "+won(S.member.money):"스텔컴퍼니 가입 필요")+" · 프록시 "+(t.proxy>Date.now()?mins(t.proxy)+"분":"없음")+" · 모듈 "+t.mod+"개";
 TOOLS.forEach(x=>{const r=document.createElement("div");r.className="row";r.innerHTML="<span class='nm'></span><button>구매</button>";r.children[0].textContent=x[1]+" - "+x[2];r.children[1].onclick=()=>buy(x[0],mkLog($("#sh")));f.appendChild(r)})}
const RM=[["office","사무실"],["cs","고객지원과"],["hr","인사팀"],["st","전략본부"],["ad","감찰과"],["sec","보안과실"],["boss","임원실"],["none","로비 / 외부"]];
async function drawCctv(){const g=$("#cct"),hd=$("#cch");if(!S)return;
 try{const r=await api("cctv",{});hd.textContent="LIVE · 접속자 "+r.count+"명 · 접근 "+mins(r.until)+"분 남음";g.innerHTML="";
  RM.forEach(([k,t],i)=>{const c=document.createElement("div");c.className="cam";const b=document.createElement("b");b.textContent="CAM-0"+(i+1)+"  "+t;c.appendChild(b);const ls=r.rooms[k]||[];
   if(!ls.length){const e=document.createElement("div");e.className="dm";e.textContent="(비어 있음)";c.appendChild(e)}
   ls.forEach(nm=>{const e=document.createElement("div");e.textContent="● "+nm;c.appendChild(e)});g.appendChild(c)})}
 catch(e){hd.textContent=e.message;g.innerHTML=""}}
setInterval(()=>{if(W.cctv&&W.cctv.el.classList.contains("on"))drawCctv()},5000);
$("#cin").addEventListener("keydown",async e=>{if(e.key!=="Enter")return;const v=e.target.value;e.target.value="";await exec(v)});
T.parentNode.addEventListener("click",()=>{if(innerWidth>700)$("#cin").focus()});

(async function boot(){const L=mkLog($("#bt"));
 for(const l of ["VIRUS STELLA BIOS v1.0","메모리 검사... OK","암호화 모듈 로드... OK","익명 네트워크 연결... OK","세션 확인 중..."]){L(l);await sleep(230)}
 try{await load();drawTut()}catch(e){}
 $("#boot").hidden=true;if(!S||!S.user){$("#lock").hidden=false;return}
 open_("term");out("VIRUS STELLA 단말에 접속했습니다. "+S.user.username,0,"gr");out("help 를 입력하면 명령어를 볼 수 있습니다.",0,"dm");if(!S.can)out("경고: 스텔컴퍼니에서 퇴사한 무직자만 작업할 수 있습니다. 지금은 열람만 가능합니다.",0,"er");
 setInterval(()=>{if(!G)refresh()},20000)})();
</script>
<script>
(function(){const bar=document.createElement("div");bar.style.cssText="position:fixed;top:0;left:0;right:0;z-index:99999;font:700 13px/1.45 system-ui,sans-serif";document.body.appendChild(bar);
const hid=new Set(),LB={hack:"[긴급] ",ceo:"[공지] ",sec:"[보안] "},CL={hack:"#c4271a",ceo:"#1d4f9c",sec:"#1d7a55"};
async function p(){try{const r=await fetch("/api/notice");if(!r.ok)return;const j=await r.json();bar.innerHTML="";
 j.list.filter(x=>!hid.has(x.t)).forEach(x=>{const d=document.createElement("div");d.style.cssText="padding:10px 14px;display:flex;gap:10px;justify-content:space-between;color:#fff;background:"+(CL[x.kind]||"#333");
  const s=document.createElement("span");s.textContent=(LB[x.kind]||"")+x.text;const c=document.createElement("b");c.textContent="×";c.style.cursor="pointer";c.onclick=()=>{hid.add(x.t);d.remove()};d.append(s,c);bar.appendChild(d)})}catch(e){}}
const hb=()=>fetch("/api/ping",{method:"POST"}).catch(()=>{});hb();p();setInterval(p,6000);setInterval(hb,30000)})();
</script></body></html>`;