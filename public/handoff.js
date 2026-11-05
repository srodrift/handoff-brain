/* Handoff Brain: inherit any account in 60 seconds.
   Reads call transcripts per account and builds a handoff card: journey, risks, promises, next call, receipts.
   AI (Claude, Gemini or Groq via the local server), ElevenLabs voice briefing, Triggerware alerts.
   Every AI feature falls back to the prepared summary, so the demo never breaks. */
(function(){
const $ = id => document.getElementById(id);
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const S = {ai:false, voice:false, tw:false, provider:"", model:"", twErr:""};
const AIname = () => ({anthropic:"Claude",gemini:"Gemini",groq:"Groq"}[S.provider]||"AI");
const cards = {};      // id -> {card, source:"prepared"|"ai", at}
let current = ACCOUNTS[0].id;
let view = "start";
const kept = {};
let insights = {list: window.PREPARED_INSIGHTS||[], source:"prepared"};   // "acctId|promise text" -> {at, draft}
let audio = null;

/* ---------------- server plumbing ---------------- */
async function post(path, body){
  const r = await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(typeof j.error==="string"?j.error:(j.error&&j.error.message)||JSON.stringify(j.error||j));
  return j;
}
async function llm(system, user, max_tokens){ return (await post("/api/claude",{system,user,max_tokens:max_tokens||2000})).text; }
function parseJSON(t){
  const a=t.indexOf("{"), b=t.lastIndexOf("}");
  return JSON.parse(t.slice(a,b+1));
}
async function status(){
  try{
    const j = await (await fetch("/api/status",{cache:"no-store"})).json();
    const was = S.tw;
    Object.assign(S,{phone:!!j.phone,ai:j.claude,voice:j.voice,tw:j.triggerware,provider:j.provider||"anthropic",model:j.model,twErr:j.triggerware_error||""});
    if(S.tw && !was) startTW();
  }catch(e){}
  const d=(id,on,label,tip)=>{ const el=$(id); el.className="dot"+(on?" on":""); if(label) el.querySelector("span").textContent=label; el.title=tip; };
  d("d-ai",S.ai,AIname(),S.ai?`live · ${S.model}`:"off: add a key to .env");
  d("d-voice",S.voice,null,S.voice?"live":"off: add ELEVENLABS_API_KEY to .env");
  d("d-tw",S.tw,null,S.tw?"live: local Triggerware server":"off · "+S.twErr);
}

/* ---------------- data ---------------- */
const byId = id => ACCOUNTS.find(a=>a.id===id);
ACCOUNTS.forEach(a=>{ cards[a.id] = {card:a.prepared, source:"prepared"}; });
const sig = a => a.calls.map(c=>c.date+c.minutes+c.transcript.length).join("|");
async function loadCached(){
  try{ const j=await (await fetch("/api/cache/insights",{cache:"no-store"})).json();
    if(j && j.list && j.sig===ACCOUNTS.map(sig).join("||")) insights={list:j.list, source:"ai", by:j.by}; }catch(e){}
  await Promise.all(ACCOUNTS.map(async a=>{
    try{ const j = await (await fetch("/api/cache/card-"+a.id,{cache:"no-store"})).json();
      if(j && j.sig===sig(a) && j.card) cards[a.id]={card:j.card, source:"ai", at:j.at, by:j.by};
    }catch(e){}
  }));
}

/* ---------------- header + rail ---------------- */
function header(){
  const f=HANDOFF.from;
  $("handoff").innerHTML=`<span class="av from">${esc(f.name.split(" ").map(x=>x[0]).join(""))}</span><span><b>${esc(f.name)}</b> <span class="arrow">→</span> <b>You</b><br><span class="kv">${ACCOUNTS.length} accounts · ${esc(f.reason)}</span></span><span class="av to">YOU</span>`;
}
let readMin=0;
function savedStat(){ const m=Math.round(readMin/3); const el=$("saved"); if(el) el.querySelector("b").textContent= m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m} min`; }
function summary(){
  const all=ACCOUNTS.map(a=>cards[a.id].card);
  const red=all.filter(c=>c.health==="red").length;
  const prom=all.flatMap(c=>(c.promises||[]).filter(p=>p.who==="us"));
  const over=prom.filter(p=>/overdue|right after/i.test(p.due||"")).length;
  $("sum").innerHTML=`<div><b style="color:var(--red)">${red}</b><small>at risk</small></div><div><b>${prom.length}</b><small>promises we made</small></div><div><b style="color:${over?"var(--red)":"inherit"}">${over}</b><small>overdue</small></div>`;
}
function allPromises(){
  return ACCOUNTS.flatMap(a=>(cards[a.id].card.promises||[]).map(p=>({a,p,key:a.id+"|"+p.text,
    kind: (kept[a.id+"|"+p.text]&&kept[a.id+"|"+p.text].at)?"kept":(p.who!=="us"?"theirs":(/overdue|right after/i.test(p.due||"")?"broken":"due"))})));
}
function rail(){
  $("list").innerHTML = ACCOUNTS.map(a=>{ const c=cards[a.id].card;
    return `<button type="button" class="acct" data-id="${a.id}" aria-current="${view==="account"&&a.id===current}"><span class="hdot ${c.health}"></span><b>${esc(a.clinic)}</b><span class="st">${esc(c.stage)} · ${a.calls.length} call${a.calls.length>1?"s":""}</span><span class="why">${esc(c.health_reason)}</span></button>`; }).join("");
  $("list").querySelectorAll(".acct").forEach(b=>b.onclick=()=>{ current=b.dataset.id; view="account"; stopAudio(); $("chatlog").innerHTML=""; $("chatpanel").hidden=true; rail(); render(); });
  summary();
  const all=allPromises(), broken=all.filter(x=>x.kind==="broken").length, open=all.filter(x=>x.kind==="broken"||x.kind==="due").length;
  $("radarn").textContent=open; $("radarsub").textContent=broken?`${broken} broken · ${open} we still owe`:`${open} promises we still owe`;
  $("radarbtn").setAttribute("aria-pressed",String(view==="radar"));
  $("startbtn").setAttribute("aria-pressed",String(view==="start"));
  const urgent=ACCOUNTS.filter(a=>cards[a.id].card.health==="red").length;
  $("startsub").textContent= urgent?`${urgent} account${urgent>1?"s":""} need you this week`:"your first moves, most urgent first";
  $("pmbtn").setAttribute("aria-pressed",String(view==="insights"));
  const big=insights.list.filter(x=>(x.accounts||[]).length>=2).length;
  $("pmn").textContent=insights.list.length; $("pmsub").textContent=`${big} pattern${big===1?"":"s"} across 2+ accounts`;
}

/* ---------------- CRM note (Salesforce-ready) ---------------- */
function crmNote(a,c){
  if(c.crm_note) return c.crm_note;
  const last=a.calls[a.calls.length-1];
  const by=st=>(c.journey||[]).filter(j=>j.status===st).map(j=>j.step+(j.note?` (${j.note})`:""));
  return [`${a.clinic} · ${last.date} · ${last.title}`,
    ``,`SUMMARY: ${c.health_reason}`,
    ``,`DONE: ${by("done").join("; ")||"none"}`,
    `BLOCKED: ${by("blocked").join("; ")||"none"}`,
    ``,`PROMISES:`,...(c.promises||[]).map(p=>`- ${p.who==="us"?"We":"Customer"}: ${p.text} (${p.due||"no date"})`),
    ``,`NEXT STEPS:`,...(c.next_call||[]).map(x=>`- ${x}`),
    ``,`HEALTH: ${(c.health||"").toUpperCase()}`].join("\n");
}

/* ---------------- the card ---------------- */
function trackPct(c){
  const steps=HANDOFF.journey; let last=-1;
  steps.forEach((st,i)=>{ const j=(c.journey||[]).find(x=>x.step===st); if(j&&j.status!=="todo") last=i; });
  return last<0?0:Math.round(last/(steps.length-1)*100);
}
const STATUS = {done:"Done", in_progress:"In progress", blocked:"Blocked", todo:"Not started"};
const INT = {yes:["Integrated","int-yes"], csv:["CSV uploads only","int-csv"], pending:["Pending","int-pending"], no:["Not supported","int-no"]};
/* Grounding check: is the quote really in the transcripts? Deterministic, no AI involved. */
const norm=t=>String(t||"").toLowerCase().replace(/[\u2018\u2019\u201c\u201d"'`]/g,"").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
function verified(quote, acctId){
  const qn=norm(quote); if(qn.length<8) return false;
  const pool=(acctId?[byId(acctId)]:ACCOUNTS).filter(Boolean).flatMap(a=>a.calls.map(c=>norm(c.transcript))).join(" | ");
  if(pool.includes(qn)) return true;
  const w=qn.split(" "); if(w.length<6) return false;                     // allow light paraphrase at the edges
  for(let i=0;i+6<=w.length;i+=3){ if(!pool.includes(w.slice(i,i+6).join(" "))) return false; }
  return true;
}
function vbadge(quote, acctId){ return verified(quote,acctId)?`<span class="vf" title="These exact words appear in the call transcript">✓ verified in transcript</span>`:`<span class="vf no" title="Not found word-for-word in the transcripts">⚠ not found verbatim</span>`; }
function receipt(q,call,key){ return q?`<button type="button" class="rc" data-q="${key}">📎 ${esc(call||"call")}</button>`:""; }
function render(flash){
  if(view==="start") return renderStart();
  if(view==="radar") return renderRadar();
  if(view==="insights") return renderInsights();
  document.querySelector(".dock").hidden=false;
  const a=byId(current), {card:c, source, at, by}=cards[current];
  const mins=a.calls.reduce((s,x)=>s+(x.minutes||0),0);
  const quotes={}; let qi=0;
  const q = (quote,call)=>{ const k="q"+(qi++); quotes[k]={quote,call}; return quote?receipt(quote,call,k)+vbadge(quote,a.id):""; };
  const journey=(HANDOFF.journey).map(step=>{ const j=(c.journey||[]).find(x=>x.step===step)||{status:"todo",note:""};
    return `<div class="step ${j.status}"><span class="s">${STATUS[j.status]||j.status}</span><b>${esc(step)}</b>${j.note?`<p>${esc(j.note)}</p>`:""}</div>`; }).join("");
  const risks=(c.risks||[]).map((r,i)=>`<div class="item"><span class="num">${i+1}</span><span class="t">${esc(r.text)}</span><div class="meta">${q(r.quote,r.call)}</div></div>`).join("")||`<p class="empty">No risks found in the calls.</p>`;
  const proms=(c.promises||[]).map(p=>{ const over=/overdue|right after/i.test(p.due||""); const us=p.who==="us";
    return `<div class="item${over?" over":""}"><span class="owe ${us?"us":"them"}">${us?"WE OWE":"THEY OWE"}</span><span class="t">${esc(p.text)}</span><div class="meta">${over?`<span class="chip-over">OVERDUE</span>`:""}<span class="due">${esc((p.due||"no date").replace(/^Overdue:\s*/i,""))}</span>${q(p.quote,p.call)}</div></div>`; }).join("")||`<p class="empty">No promises found.</p>`;
  const f=c.facts||{}; const it=INT[f.integration]||[f.integration||"Unknown",""];
  const src = source==="ai" ? `<span class="chip ai">● Written by ${esc(by||AIname())}${at?` · ${esc(at)}`:""}</span>` : `<span class="chip">Prepared summary</span>`;
  const usOwe=(c.promises||[]).filter(p=>p.who==="us").length, overN=(c.promises||[]).filter(p=>p.who==="us"&&/overdue|right after/i.test(p.due||"")).length;
  $("card").innerHTML=`
  <div class="top">
    <div class="ttl"><h1>${esc(a.clinic)}</h1><span class="pill ${c.health}">${c.health==="red"?"AT RISK":c.health==="amber"?"WATCH":"ON TRACK"}</span></div>
    <div class="actions">
      <button type="button" class="btn primary" id="brief">🔊 Brief me in 60s</button>
      <button type="button" class="btn" id="reread">↻ Re-read with ${esc(AIname())}</button>
    </div>
    <div class="src">${src}<span class="chip" title="From the Salesforce account record">📍 ${esc(a.crm?a.crm.address:a.location)}</span>${a.crm?`<span class="chip">☎ ${esc(a.crm.main_line)} · ${esc(a.crm.primary_contact)} <small style="opacity:.6">· Salesforce</small></span>`:""}<span class="chip">Stage: <b>${esc(c.stage)}</b></span><span class="chip">${a.calls.length} call${a.calls.length>1?"s":""} · ${mins} min of transcript</span><span class="chip">PMS: <b>${esc(f.pms||"Unknown")}</b> · <b class="${it[1]}">${esc(it[0])}</b></span></div>
  </div>
  <div class="why-big ${c.health}${flash?" flash":""}"><span class="lbl">Where this account stands</span>${esc(c.health_reason)}</div>
  <div class="journey"><div class="track"><i style="width:0%" data-w="${trackPct(c)}"></i></div>${journey}</div>
  <div class="grid2">
    <div class="box"><h2>Risks <span class="cnt">${(c.risks||[]).length}</span></h2>${risks}</div>
    <div class="box"><h2>Promises made on calls <span class="cnt">${usOwe} we owe${overN?` · <span style="color:var(--red)">${overN} overdue</span>`:""}</span></h2>${proms}</div>
  </div>
  <div class="box next"><h2>Your next call: do this</h2><ol>${(c.next_call||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div>
  <details class="box fold"><summary><h2>Salesforce-ready note · latest call</h2><button type="button" class="btn small" id="copy">Copy note</button></summary><pre class="note" id="note">${esc(crmNote(a,c))}</pre></details>
  <details class="box fold"><summary><h2>Account facts</h2><span class="kv">plan, contacts, IT</span></summary>
    <div class="facts">
      <div class="fact"><small>Practice software</small><b>${esc(f.pms||"Unknown")}</b></div>
      <div class="fact"><small>Integration</small><b class="${it[1]}">${esc(it[0])}</b></div>
      <div class="fact"><small>Plan</small><b>${esc(f.plan||"Unknown")}</b></div>
      <div class="fact"><small>Contacts</small><b>${esc((f.contacts||[]).map(x=>x.name+(x.role?` (${x.role})`:"")).join(", ")||"Unknown")}</b></div>
      <div class="fact"><small>IT / server</small><b>${esc(f.it||"Unknown")}</b></div>
    </div></details>
  <details class="box fold"><summary><h2>Source calls (${a.calls.length})</h2><span class="kv">the transcripts the brain read</span></summary>${a.calls.map(x=>`<div class="tx"><b>${esc(x.date)} · ${esc(x.title)} · ${x.minutes} min</b>\n\n${esc(x.transcript)}</div>`).join("")}</details>`;
  $("card").querySelectorAll(".rc").forEach(b=>b.onclick=()=>{
    const item=b.closest(".item"); const open=item.querySelector(".quote");
    if(open){ open.remove(); return; }
    const d=quotes[b.dataset.q]; const el=document.createElement("div"); el.className="quote"; el.textContent=`“${d.quote}” (${d.call} call)`; item.appendChild(el);
  });
  [...$("card").children].forEach((el,i)=>el.style.setProperty("--i",i));
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ const t=$("card").querySelector(".track i"); if(t) t.style.width=t.dataset.w+"%"; }));
  $("brief").onclick=()=>brief(c);
  $("copy").onclick=async(e)=>{ e.preventDefault(); e.stopPropagation(); const t=$("note").textContent;
    try{ await navigator.clipboard.writeText(t); $("copy").textContent="Copied ✓"; }
    catch(e){ const r=document.createRange(); r.selectNodeContents($("note")); const sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); $("copy").textContent="Selected: press ⌘C"; }
    setTimeout(()=>{ const b=$("copy"); if(b) b.textContent="Copy note"; },2500); };
  $("reread").onclick=()=>analyze(current);
  $("chatq").placeholder=`Ask anything about ${a.clinic}…`;
}

/* ---------------- Start here: the new owner's first moves ---------------- */
function rankAccounts(){
  const score=a=>{ const c=cards[a.id].card; const ps=(c.promises||[]).filter(p=>p.who==="us"&&!(kept[a.id+"|"+p.text]&&kept[a.id+"|"+p.text].at));
    const broken=ps.filter(p=>/overdue|right after/i.test(p.due||"")).length;
    return (c.health==="red"?100:c.health==="amber"?50:0)+broken*20+(c.risks||[]).length*3; };
  return ACCOUNTS.slice().sort((x,y)=>score(y)-score(x));
}
function renderStart(){
  document.querySelector(".dock").hidden=true;
  const ranked=rankAccounts();
  const red=ranked.filter(a=>cards[a.id].card.health==="red").length;
  $("card").innerHTML=`
  <div class="radar-hero">
    <div><h1>Start here. <em style="color:var(--accent)">${red} account${red===1?"":"s"}</em> need you this week.</h1>
      <p>The brain read every call ${esc(HANDOFF.from.name.split(" ")[0])} had with these customers and ranked what to do first. Each move says why, with the proof one click away.</p></div>
  </div>
  ${ranked.map((a,i)=>{ const c=cards[a.id].card;
    const ps=(c.promises||[]).filter(p=>p.who==="us"&&!(kept[a.id+"|"+p.text]&&kept[a.id+"|"+p.text].at));
    const broken=ps.filter(p=>/overdue|right after/i.test(p.due||""));
    const first=(c.next_call||[])[0]||"Review the handoff card.";
    const key=broken[0]?a.id+"|"+broken[0].text:"";
    const contact=(((c.facts||{}).contacts||[])[0]||{}).name;
    return `<div class="move ${c.health}">
      <span class="rank">${i+1}</span>
      <div>
        <h3>${esc(a.clinic)}${contact?` · ${esc(contact)}`:""}: ${esc(first)}</h3>
        <p class="because"><b>Why:</b> ${esc(c.health_reason)}</p>
        <div class="chips"><span class="chip">${esc(c.stage)}</span>${broken.length?`<span class="chip bad">${broken.length} broken promise${broken.length>1?"s":""}</span>`:""}${ps.length-broken.length?`<span class="chip">${ps.length-broken.length} we owe</span>`:""}<span class="chip">${(c.risks||[]).length} risk${(c.risks||[]).length===1?"":"s"}</span></div>
      </div>
      <div class="act">
        ${broken.length?`<button type="button" class="btn keep" data-keep="${esc(key)}">Keep the promise →</button>`:""}
        <button type="button" class="btn${broken.length?"":" primary"}" data-brief="${a.id}">🔊 Brief me</button>
        <button type="button" class="btn small ghost" data-open="${a.id}">Open account</button>
      </div>
      ${key&&kept[key]&&kept[key].draft?draftHTML(kept[key].draft,key):""}
    </div>`; }).join("")}`;
  [...$("card").children].forEach((el,i)=>el.style.setProperty("--i",i));
  $("card").querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{ current=b.dataset.open; view="account"; rail(); render(); $("card").parentElement.scrollTop=0; });
  $("card").querySelectorAll("[data-brief]").forEach(b=>b.onclick=()=>{ document.querySelectorAll("#brief").forEach(x=>{ if(x!==b) x.removeAttribute("id"); }); b.id="brief"; brief(cards[b.dataset.brief].card); });
  $("card").querySelectorAll("[data-keep]").forEach(b=>b.onclick=()=>keepPromise(b.dataset.keep,b));
  $("card").querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>copyDraft(b));
  $("card").querySelectorAll("[data-done]").forEach(b=>b.onclick=()=>{ kept[b.dataset.done].done=true; markKept(b.dataset.done); });
}

/* ---------------- Product Insights (for PMs) ---------------- */
const TYPES={friction:"PRODUCT FRICTION",expectation:"EXPECTATION GAP",process:"PROCESS GAP",feature:"FEATURE REQUEST"};
function renderInsights(){
  document.querySelector(".dock").hidden=true;
  const L=insights.list.slice().sort((a,b)=>(b.accounts||[]).length-(a.accounts||[]).length);
  const N=ACCOUNTS.length, cl=id=>(byId(id)||{clinic:id}).clinic;
  $("card").innerHTML=`
  <div class="radar-hero">
    <div><h1>What every call is telling <em style="color:var(--violet)">product</em>.</h1>
      <p>One account's problem is a support ticket. The same problem across many accounts is a product decision. The brain reads every call and groups what customers say, with their own words as proof.</p></div>
    <div class="actions"><button type="button" class="btn" id="regen">↻ Re-read all calls with ${esc(AIname())}</button></div>
  </div>
  <div class="src"><span class="chip ${insights.source==="ai"?"ai":""}">${insights.source==="ai"?`● Written by ${esc(insights.by||AIname())} from ${ACCOUNTS.reduce((s,a)=>s+a.calls.length,0)} calls`:"Prepared from the demo calls"}</span><span class="chip">${N} accounts · ${fmtMin(totalMin())} of calls</span></div>
  ${L.map((x,i)=>{ const n=(x.accounts||[]).length;
    return `<div class="ins">
      <div><span class="tchip t-${esc(x.type)}">${TYPES[x.type]||esc(String(x.type||"").toUpperCase())}</span><h3>${esc(x.title)}</h3><p class="why">${esc(x.why)}</p></div>
      <div class="reach"><b>${n} <span style="font-size:16px;color:var(--mute)">of ${N}</span></b><div class="dots5">${ACCOUNTS.map(a=>`<i class="${(x.accounts||[]).includes(a.id)?"on":""}" title="${esc(a.clinic)}"></i>`).join("")}</div><small>${(x.accounts||[]).map(cl).map(esc).join(" · ")}</small></div>
      <div class="quotes">${(x.quotes||[]).slice(0,3).map(q=>`<div class="q2"><span>${esc(cl(q.acct))} call · ${vbadge(q.text,q.acct)}</span>“${esc(q.text)}”</div>`).join("")}</div>
      <div class="fix"><p><b>Suggested fix:</b> ${esc(x.fix||"")}</p><button type="button" class="btn small" data-ticket="${i}">Copy as ticket</button></div>
    </div>`; }).join("")}`;
  [...$("card").children].forEach((el,i)=>el.style.setProperty("--i",i));
  $("card").querySelectorAll("[data-ticket]").forEach(b=>b.onclick=async()=>{
    const x=L[+b.dataset.ticket];
    const t=[`Title: ${x.title}`,`Type: ${TYPES[x.type]||x.type}`,`Affects: ${(x.accounts||[]).length} of ${N} onboarding accounts (${(x.accounts||[]).map(cl).join(", ")})`,``,`Problem`,x.why,``,`Customer evidence`,...(x.quotes||[]).map(q=>`- ${cl(q.acct)}: "${q.text}"`),``,`Suggested fix`,x.fix||"",``,`Source: Handoff Brain, call transcripts`].join("\n");
    try{ await navigator.clipboard.writeText(t); b.textContent="Copied ✓"; }catch(e){ b.textContent="Copy failed"; }
    setTimeout(()=>{ b.textContent="Copy as ticket"; },2200);
  });
  $("regen").onclick=regenInsights;
}
async function regenInsights(){
  if(!S.ai){ toast("AI is off. Add a key to .env and restart the server."); return; }
  const b=$("regen"); b.disabled=true; b.innerHTML=`<span class="bars"><i></i><i></i><i></i><i></i></span> ${esc(AIname())} is reading every call…`;
  try{
    const all=ACCOUNTS.map(a=>`## ACCOUNT ${a.id} (${a.clinic})\n`+a.calls.map(c=>`### ${c.date}: ${c.title}\n${c.transcript}`).join("\n\n")).join("\n\n");
    const j=parseJSON(await llm("You are a product analyst. From customer onboarding call transcripts across several accounts, find the patterns a product manager should act on. Group by theme, count how many accounts each affects, and back every theme with exact customer or consultant quotes. Never invent quotes. Reply with JSON only.",
      `${all}\n\nReturn JSON: {"insights":[{"title":"short theme","type":"friction|expectation|process|feature","accounts":["account ids"],"why":"1-2 plain sentences","quotes":[{"acct":"account id","text":"exact words"}],"fix":"one concrete product suggestion"}]}. 4-7 insights, most widespread first.`,3500));
    if(!j.insights||!j.insights.length) throw new Error("no insights returned");
    insights={list:j.insights, source:"ai", by:AIname()};
    post("/api/cache/insights",{sig:ACCOUNTS.map(sig).join("||"),list:j.insights,by:AIname()}).catch(()=>{});
    rail(); renderInsights();
  }catch(e){ toast(`${AIname()} couldn't finish (${e.message.slice(0,140)}). Showing the prepared insights.`); b.disabled=false; b.textContent=`↻ Re-read all calls with ${AIname()}`; }
}

/* ---------------- Promise Radar ---------------- */
function renderRadar(){
  document.querySelector(".dock").hidden=true;
  const all=allPromises();
  const lanes=[["broken","Broken · we said it and it didn't happen"],["due","Due · we owe this soon"],["theirs","The customer owes us"],["kept","Kept"]];
  const n=k=>all.filter(x=>x.kind===k).length;
  const row=x=>{ const {a,p,kind,key}=x; const c=cards[a.id].card; const k=kept[key];
    const who=p.who==="us"?HANDOFF.from.name.split(" ")[0]:(((c.facts||{}).contacts||[{}])[0].name||"Customer");
    const dueTxt=esc((p.due||"no date").replace(/^Overdue:\s*/i,""));
    if(kind==="broken"){
      return `<div class="prom broken" data-key="${esc(key)}">
        <span class="who">BROKEN</span>
        <div><div class="what">${esc(p.text)}</div>
          <div class="acc"><span class="hdot ${c.health}"></span><b>${esc(a.clinic)}</b><span>${esc(c.health==="red"?"account at risk":"account to watch")}</span></div>
          ${p.quote?`<div class="heard"><span class="mic" aria-hidden="true">🎙</span><div><span class="hk">${esc(who)} said on the ${esc(p.call||"")} call ${vbadge(p.quote,a.id)}</span>“${esc(p.quote)}”</div></div>`:""}
          <div class="nofollow">✕ No later call confirms it happened · was due ${dueTxt}</div>
        </div>
        <div class="act"><button type="button" class="btn keep" data-keep="${esc(key)}">Keep this promise →</button><button type="button" class="btn small ghost" data-open="${a.id}">Open account</button></div>
        ${k&&k.draft?draftHTML(k.draft,key):""}
      </div>`;
    }
    return `<div class="prom line ${kind}" data-key="${esc(key)}">
      <span class="who">${kind==="due"?"WE OWE":kind==="theirs"?"THEY OWE":"KEPT ✓"}</span>
      <div class="lmain"><span class="what">${esc(p.text)}</span><span class="acc"><span class="hdot ${c.health}"></span><b>${esc(a.clinic)}</b><span>${dueTxt}</span>${p.quote?`<button type="button" class="rc" data-quote="${esc(p.quote)}" data-call="${esc(p.call||"")}">📎 ${esc(p.call||"quote")}</button>`:""}</span></div>
      <div class="act row">${kind==="due"?`<button type="button" class="btn small" data-keep="${esc(key)}">Keep →</button>`:""}${kind!=="kept"?`<button type="button" class="btn small ghost" data-open="${a.id}">Open</button>`:""}</div>
      ${k&&k.draft?draftHTML(k.draft,key):""}
    </div>`; };
  $("card").innerHTML=`
  <div class="radar-hero">
    <div><h1>${n("broken")?`<em>${n("broken")} broken promise${n("broken")>1?"s":""}</em> to customers.`:"No broken promises right now."}</h1>
      <p>Every promise below was said out loud on a customer call and never written down. The brain found them in the transcripts, and it can keep them for you.</p></div>
    <div class="rstats"><div class="rstat"><b style="color:var(--red)">${n("broken")}</b><small>broken</small></div><div class="rstat"><b>${n("due")}</b><small>we owe</small></div><div class="rstat"><b style="color:var(--violet)">${n("theirs")}</b><small>they owe</small></div><div class="rstat"><b style="color:var(--green)">${n("kept")}</b><small>kept</small></div></div>
  </div>
  ${lanes.filter(([k])=>n(k)).map(([k,t])=>`<div class="lane"><h2>${t} <span class="cnt">${n(k)}</span></h2>${all.filter(x=>x.kind===k).map(row).join("")}</div>`).join("")}`;
  [...$("card").children].forEach((el,i)=>el.style.setProperty("--i",i));
  $("card").querySelectorAll(".rc").forEach(b=>b.onclick=()=>{ const host=b.closest(".lmain")||b.closest(".prom"); const ex=host.querySelector(".quote"); if(ex){ex.remove();return;} const el=document.createElement("div"); el.className="quote"; el.style.marginTop="8px"; el.textContent=`“${b.dataset.quote}” (${b.dataset.call} call)`; host.appendChild(el); });
  $("card").querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{ current=b.dataset.open; view="account"; rail(); render(); $("card").parentElement.scrollTop=0; });
  $("card").querySelectorAll("[data-keep]").forEach(b=>b.onclick=()=>keepPromise(b.dataset.keep,b));
  $("card").querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>copyDraft(b));
  $("card").querySelectorAll("[data-done]").forEach(b=>b.onclick=()=>{ kept[b.dataset.done].done=true; markKept(b.dataset.done); });
}
function draftHTML(d,key,done){
  return `<div class="draft"><span class="lbl">Follow-up written by ${esc(d.by||AIname())} from the call · ${esc(d.channel||"email")}</span>${d.subject?`<div class="subj">Subject: ${esc(d.subject)}</div>`:""}<pre>${esc(d.body)}</pre>
    <div class="row"><button type="button" class="btn small" data-copy="1">Copy message</button>${kept[key]&&kept[key].done?"":`<button type="button" class="btn small primary" data-done="${esc(key)}">I sent it · mark kept ✓</button>`}</div></div>`;
}
async function copyDraft(b){
  const d=b.closest(".draft"); const t=(d.querySelector(".subj")?d.querySelector(".subj").textContent+"\n\n":"")+d.querySelector("pre").textContent;
  try{ await navigator.clipboard.writeText(t); b.textContent="Copied ✓"; }catch(e){ const r=document.createRange(); r.selectNodeContents(d.querySelector("pre")); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent="Selected: press ⌘C"; }
}
async function keepPromise(key,btn){
  const [id,...rest]=key.split("|"); const text=rest.join("|"); const a=byId(id); const p=(cards[id].card.promises||[]).find(x=>x.text===text);
  btn.disabled=true; btn.innerHTML=`<span class="bars"><i></i><i></i><i></i><i></i></span> Writing…`;
  let d;
  try{
    if(!S.ai) throw new Error("AI off");
    const j=parseJSON(await llm("You write the follow-up message that keeps a promise an onboarding consultant made to a customer on a call. Use ONLY facts from the transcript. Never invent a status, date or result you don't know: put it in [square brackets] for the sender to fill in. Warm, short, plain English, signed by the new account owner. Reply with JSON only.",
      `Customer: ${a.clinic}\nThe person who made the promise has handed the account to the sender.\nPROMISE: ${p.text} (due: ${p.due})\nQUOTE: ${p.quote}\n\nTRANSCRIPTS:\n${a.calls.map(c=>`### ${c.date}: ${c.title}\n${c.transcript}`).join("\n\n")}\n\nReturn JSON: {"channel":"email","subject":"","body":"under 120 words"}`,1500));
    d={...j, by:AIname()};
  }catch(e){
    const name=((cards[id].card.facts||{}).contacts||[{}])[0].name||"there";
    d={channel:"email", by:"template", subject:`Following up: ${p.text.replace(/\.$/,"")}`,
       body:`Hi ${name},\n\nI've taken over your account from ${HANDOFF.from.name}. On our ${p.call} call we promised to ${p.text.charAt(0).toLowerCase()+p.text.slice(1).replace(/\.$/,"")}. Here's where that stands: [status].\n\nI'll stay on this until it's done. Reply here or call me any time.\n\n[Your name]`};
  }
  kept[key]={draft:d}; render();
}
function markKept(key){ kept[key].at=Date.now(); render(); rail(); publish(); toast("Promise marked as kept. Triggerware will drop it from open promises."); }

/* ---------------- AI: read calls -> handoff card ---------------- */
const SCHEMA = `{"health":"red|amber|green","health_reason":"1-2 plain sentences: where the account stands and the single biggest reason",
"stage":"one of the journey steps","facts":{"pms":"","integration":"yes|csv|pending|no","plan":"","addons":[],"contacts":[{"name":"","role":""}],"it":""},
"journey":[{"step":"<exact journey step name>","status":"done|in_progress|blocked|todo","note":"short"}],
"where_it_stands":["3 short bullets"],
"risks":[{"text":"plain sentence","quote":"exact words from the transcript","call":"<call date>"}],
"promises":[{"who":"us|customer","text":"what was promised","due":"date or 'Overdue: ...' if it should already have happened","quote":"exact words","call":"<call date>"}],
"next_call":["3-5 concrete actions for the next call, most important first"],
"summary_60s":"a spoken briefing of about 110 words for the person inheriting the account",
"crm_note":"a CRM activity note for the latest call, ready to paste into Salesforce: Summary, Done, Blocked, Promises (who/what/when), Next steps. Plain text, short lines."}`;
async function analyze(id, quiet){
  if(!S.ai){ toast("AI is off. Add a key to .env and restart the server."); return; }
  const a=byId(id); const btn=$("reread"); if(btn){ btn.disabled=true; btn.innerHTML=`<span class="bars" style="color:var(--accent)"><i></i><i></i><i></i><i></i></span> ${esc(AIname())} is reading ${a.calls.length} call${a.calls.length>1?"s":""}…`; }
  try{
    const calls=a.calls.map(c=>`### Call ${c.date}: ${c.title} (${c.minutes} min)\n${c.transcript}`).join("\n\n");
    const txt=await llm(
      "You are Handoff Brain. An onboarding consultant is inheriting a customer account from a colleague who is leaving. Read the call transcripts and write the handoff card. Use ONLY what the transcripts say; never invent facts, names or dates. Quotes must be copied exactly from the transcripts. A promise that should already have happened (e.g. 'right after this call') and has no later confirmation is overdue. Reply with JSON only.",
      `Today: ${new Date().toDateString()}\nCustomer: ${a.clinic} (${a.location})\nOnboarding journey steps, in order: ${HANDOFF.journey.join(" → ")}\n\nTRANSCRIPTS:\n${calls}\n\nReturn JSON exactly in this shape:\n${SCHEMA}`, 3000);
    const card=parseJSON(txt);
    if(!card.health||!card.journey) throw new Error("The AI reply was missing fields.");
    const at=new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
    cards[id]={card, source:"ai", at, by:AIname()};
    readMin+=a.calls[a.calls.length-1].minutes||0; savedStat();
    post("/api/cache/card-"+id,{sig:sig(a),card,at,by:AIname()}).catch(()=>{});
    publish();
    if(id===current) render(true); rail();
    return true;
  }catch(e){
    if(!quiet) toast(`${AIname()} couldn't read the calls (${e.message.slice(0,160)}). Showing the prepared summary.`);
    if(id===current) render(); return false;
  }
}

/* ---------------- Ask this account ---------------- */
async function askAccount(qtext){
  const a=byId(current), log=$("chatlog");
  $("chatpanel").hidden=false;
  const me=document.createElement("div"); me.className="msg me"; me.textContent=qtext; log.appendChild(me);
  const bot=document.createElement("div"); bot.className="msg bot"; log.appendChild(bot);
  const scroll=()=>{ log.scrollTop=log.scrollHeight; };
  if(!S.ai){ bot.innerHTML=`<span class="err">AI is off. Add a key to .env and restart the server.</span>`; scroll(); return; }
  bot.innerHTML=`<span class="thinking">${esc(AIname())} is reading ${esc(a.clinic)}'s calls…</span>`; scroll();
  try{
    const j=parseJSON(await llm("You answer questions about one customer account You are a senior onboarding consultant helping a teammate who just inherited this account. Facts must come ONLY from its Salesforce account record and call transcripts; if they don't cover a fact, say so. But when the teammate asks what to do, what options exist, or what to ask, think for yourself: give concrete, practical recommendations from your own expertise in 'advice', grounded in what the calls say. For record facts (address, phone, contact), answer from the record and leave quote empty. Reply with JSON only.",
      `ACCOUNT RECORD (Salesforce): ${JSON.stringify(Object.assign({clinic:a.clinic,location:a.location},a.crm||{}))}\n\nTRANSCRIPTS:\n${a.calls.map(c=>`### ${c.date}: ${c.title}\n${c.transcript}`).join("\n\n")}\n\nQUESTION: ${qtext}\n\nReturn JSON: {"answer":"2-3 plain sentences of what the record and calls say","advice":["your own recommendation or question to ask, if the question asks for advice; otherwise empty list"],"quote":"exact supporting words or empty","call":"call date or empty"}`,1200));
    bot.innerHTML=`<span class="who">${esc(a.clinic)}</span>${esc(j.answer)}${(j.advice||[]).filter(Boolean).length?`<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.35)"><b style="color:var(--violet);font-size:12px;letter-spacing:.04em">💡 BRAIN'S RECOMMENDATION (not from the calls)</b><ul style="margin:6px 0 0 18px;padding:0">${j.advice.filter(Boolean).map(x=>`<li style="margin:3px 0">${esc(x)}</li>`).join("")}</ul></div>`:""}${j.quote?`<div class="quote">“${esc(j.quote)}” (${esc(j.call)} call) ${vbadge(j.quote,a.id)}</div>`:""}`;
  }catch(e){ bot.innerHTML=`<span class="err">Couldn't answer: ${esc(e.message.slice(0,200))}</span>`; }
  scroll();
}
$("chatf").onsubmit=e=>{ e.preventDefault(); const v=$("chatq").value.trim(); if(!v) return; $("chatq").value=""; askAccount(v); };
$("chatclose").onclick=()=>{ $("chatpanel").hidden=true; };

/* ---------------- Voice briefing ---------------- */
function stopAudio(){ if(audio){ audio.pause(); audio=null; } if(window.speechSynthesis) speechSynthesis.cancel(); }
async function brief(c){
  const b=$("brief");
  if(audio || (window.speechSynthesis&&speechSynthesis.speaking)){ stopAudio(); b.innerHTML="🔊 Brief me in 60s"; return; }
  const text=c.summary_60s||c.health_reason;
  b.disabled=true; b.innerHTML=`<span class="bars"><i></i><i></i><i></i><i></i></span> Preparing voice…`;
  try{
    if(!S.voice) throw new Error("voice off");
    const r=await fetch("/api/tts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text})});
    if(!r.ok) throw new Error(await r.text());
    audio=new Audio(URL.createObjectURL(await r.blob()));
    audio.onended=()=>{ audio=null; b.innerHTML="🔊 Brief me in 60s"; };
    await audio.play();
    b.disabled=false; b.innerHTML=`<span class="bars"><i></i><i></i><i></i><i></i></span> Playing · click to stop`;
  }catch(e){
    b.disabled=false;
    b.innerHTML="🔊 Brief me in 60s"; toast("ElevenLabs voice isn't available right now (check credits).");
  }
}

/* ---------------- Add a transcript ---------------- */
const SAMPLE = {acct:"lakeview", date:"May 13", title:"Follow-up: texting status and port", minutes:14, transcript:
`You: Hi Rosa, I've taken over your account from Maya. I wanted to start with texting, since I know that's what worried you.
Rosa: Yes. Is it working?
You: Your texting registration was rejected once more because the brand name didn't match the IRS letter. I corrected it to exactly "Lakeview Family Dental" and resubmitted. It was approved this morning. Can you send a test text now?
Rosa: Let me try. ... It went through! Finally.
Rosa: Okay, then I'll go ahead and cancel the old provider like I planned.
You: Great. For the port, did you find an invoice?
Rosa: I logged into the provider portal and downloaded one. I'll email it to you today.
You: Perfect. Once I have it I'll submit the port for the 22nd. And let's book phone installation for next Tuesday at 10, where we'll set up your call queue.
Rosa: Tuesday at 10 works.`};
function openModal(){
  $("m-acct").innerHTML=ACCOUNTS.map(a=>`<option value="${a.id}" ${a.id===current?"selected":""}>${esc(a.clinic)}</option>`).join("");
  $("m-out").innerHTML=""; $("modal").hidden=false; $("m-text").focus();
}
$("add").onclick=openModal;
$("startbtn").onclick=()=>{ view="start"; stopAudio(); rail(); render(); $("card").parentElement.scrollTop=0; };
$("pmbtn").onclick=()=>{ view="insights"; stopAudio(); rail(); render(); $("card").parentElement.scrollTop=0; };
$("radarbtn").onclick=()=>{ view="radar"; stopAudio(); rail(); render(); $("card").parentElement.scrollTop=0; };
$("m-cancel").onclick=()=>{ $("modal").hidden=true; };
$("modal").addEventListener("click",e=>{ if(e.target.id==="modal") $("modal").hidden=true; });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") $("modal").hidden=true; });
$("m-sample").onclick=()=>{ $("m-acct").value=SAMPLE.acct; $("m-text").value=SAMPLE.transcript; };
$("m-go").onclick=async()=>{
  const id=$("m-acct").value, text=$("m-text").value.trim(); if(!text) return;
  if(!S.ai){ $("m-out").innerHTML=`<p class="err">Reading a new call needs AI. Add a key to .env and restart the server.</p>`; return; }
  const a=byId(id);
  const isSample = text===SAMPLE.transcript;
  a.calls.push({date: isSample?SAMPLE.date:new Date().toLocaleDateString([], {month:"short",day:"numeric"}), title: isSample?SAMPLE.title:"New call", minutes: isSample?SAMPLE.minutes:Math.max(1,Math.round(text.split(/\s+/).length/150)), transcript:text});
  $("modal").hidden=true; current=id; rail(); render();
  const ok=await analyze(id);
  if(!ok){ a.calls.pop(); rail(); render(); }
};

/* ---------------- Hands-free calls: recorder inbox ---------------- */
const seenCalls=new Set();
function parseCall(name,text){
  const lines=text.split(/\r?\n/); const head=lines[0]||""; const parts=head.split(" · ").map(x=>x.trim());
  let date=new Date().toLocaleDateString([], {month:"short",day:"numeric"}), title="New call", minutes=Math.max(1,Math.round(text.split(/\s+/).length/150)), body=text;
  if(parts.length>=3){ date=parts[1]; title=parts[2]; const m=(parts[3]||"").match(/(\d+)\s*min/); if(m) minutes=+m[1]; body=lines.slice(1).join("\n").trim(); }
  return {date,title,minutes,transcript:body,file:name};
}
async function matchAccount(text){
  const t=text.toLowerCase();
  const hit=ACCOUNTS.find(a=>t.includes(a.clinic.toLowerCase()) || t.includes(a.clinic.toLowerCase().split(" ").slice(0,2).join(" ")));
  if(hit) return hit;
  if(!S.ai) return null;
  try{ const j=parseJSON(await llm("Match a call transcript to one customer account. Reply with JSON only.",`ACCOUNTS:\n${ACCOUNTS.map(a=>`${a.id}: ${a.clinic} (${a.location})`).join("\n")}\n\nTRANSCRIPT:\n${text.slice(0,4000)}\n\nReturn JSON: {"account":"account id or null"}`,300));
    return byId(j.account)||null; }catch(e){ return null; }
}
async function ingestFile(name, quietBoot){
  if(seenCalls.has(name)) return; seenCalls.add(name);
  let text; try{ text=(await (await fetch("/api/inbox/"+encodeURIComponent(name),{cache:"no-store"})).json()).text; }catch(e){ return; }
  if(!text) return;
  const a=await matchAccount(text);
  if(!a){ if(!quietBoot) toast(`New call "${name}" arrived, but the brain couldn't tell which account it belongs to.`); return; }
  const call=parseCall(name,text);
  if(a.calls.some(c=>c.file===name||c.transcript===call.transcript)) return;
  a.calls.push(call);
  const rec=$("recorder"); rec.classList.remove("incoming"); $("rec-sub").textContent="Watching the inbox for new transcripts";
  if(quietBoot) return; // cached card for the new call signature is loaded by loadCached()
  toast(`📞 New call synced from the recorder: ${a.clinic} · ${call.title}. Reading it now…`);
  current=a.id; view="account"; rail(); render();
  const ok=await analyze(a.id);
  if(ok){ const c=cards[a.id].card; toast(`${a.clinic} updated from the new call: now ${c.health==="red"?"AT RISK":c.health==="amber"?"WATCH":"ON TRACK"}.`); }
}
let inboxTimer=null;
async function pollInbox(quietBoot){
  try{ const j=await (await fetch("/api/inbox",{cache:"no-store"})).json();
    for(const f of j.files||[]) await ingestFile(f, quietBoot);
  }catch(e){}
}
$("rec-demo").onclick=async()=>{
  const b=$("rec-demo"); b.disabled=true;
  try{ await post("/api/recorder/demo",{delay:6}); }catch(e){ b.disabled=false; toast("Couldn't reach the server."); return; }
  $("recorder").classList.add("incoming");
  let n=6; $("rec-sub").textContent=`Recorder is finishing a call… (${n}s)`;
  const t=setInterval(()=>{ n--; if(n>0) $("rec-sub").textContent=`Recorder is finishing a call… (${n}s)`; else { clearInterval(t); $("rec-sub").textContent="Transcript arriving…"; b.disabled=false; } },1000);
};

/* ---------------- Exit call: the brain interviews the departing owner ---------------- */
const CALL={qs:[],i:-1,answers:[],t0:0,timer:null,rec:null,chunks:[],audio:null,typing:false};
function callQuestions(){
  const first=HANDOFF.from.name.split(" ")[0]; const qs=[];
  rankAccounts().forEach(a=>{ const c=cards[a.id].card;
    const ps=(c.promises||[]).filter(p=>p.who==="us"&&/overdue|right after/i.test(p.due||"")&&!(kept[a.id+"|"+p.text]&&kept[a.id+"|"+p.text].at));
    ps.forEach(p=>qs.push({acct:a.id, text:`${first}, on the ${p.call} call you told ${a.clinic}: "${String(p.quote).replace(/[.!?]+$/,"")}." Did that happen? If not, what should I know before I call them?`}));
  });
  rankAccounts().filter(a=>cards[a.id].card.health==="red"&&!qs.some(q=>q.acct===a.id)).slice(0,1).forEach(a=>
    qs.push({acct:a.id, text:`${first}, what's the one thing about ${a.clinic} that isn't in your notes, but I need to know?`}));
  return qs.slice(0,3);
}
function callStatus(t){ $("call-status").textContent=t; }
function tick(){ const s=Math.floor((Date.now()-CALL.t0)/1000); $("call-time").textContent=`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }
function openCall(){
  Object.assign(CALL,{qs:callQuestions(),i:-1,answers:[],typing:false,phoneTranscript:null});
  $("call-q").innerHTML=`<div class="who">🧠 Handoff Brain</div>I found ${CALL.qs.length} gap${CALL.qs.length===1?"":"s"} that the call notes can't answer. ${esc(HANDOFF.from.name)} leaves Friday, so let's ask her now. It takes about two minutes.`;
  $("call-a").innerHTML=""; $("call-next").textContent=S.phone?"📞 Call Maya's phone":"Start call"; $("call-next").className="btn primary"; $("call-time").textContent="00:00";
  $("call-type").textContent=S.phone?"Call in browser instead":"Type instead"; CALL.browser=!S.phone;
  document.querySelector(".callsheet").classList.remove("live"); callStatus("The brain asks what isn't in the notes, before she leaves");
  $("callm").hidden=false;
}
async function speak(text){
  try{ if(CALL.audio){CALL.audio.pause();}
    if(!S.voice) throw 0;
    const r=await fetch("/api/tts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text})});
    if(!r.ok) throw 0;
    CALL.audio=new Audio(URL.createObjectURL(await r.blob()));
    await new Promise(res=>{ CALL.audio.onended=res; CALL.audio.onerror=res; CALL.audio.play().catch(res); });
  }catch(e){
    await new Promise(res=>setTimeout(res, 600)); // no robotic fallback voice: the question stays on screen
  }
}
async function askNext(){
  CALL.i++;
  if(CALL.i>=CALL.qs.length) return finishCall();
  const q=CALL.qs[CALL.i];
  $("call-q").innerHTML=`<div class="who">🧠 Handoff Brain is asking <span class="qstep">question ${CALL.i+1} of ${CALL.qs.length} · ${esc(byId(q.acct).clinic)}</span></div>${esc(q.text)}`;
  $("call-next").disabled=true; callStatus("Speaking…");
  await speak(q.text);
  $("call-next").disabled=false;
  if(CALL.typing){ showTyping(); return; }
  startRec();
}
function showTyping(){
  callStatus("Type the answer, then press Next");
  let ta=$("call-ta"); if(!ta){ ta=document.createElement("textarea"); ta.id="call-ta"; ta.setAttribute("aria-label","Answer"); $("call-a").appendChild(ta); }
  ta.value=""; ta.focus(); $("call-next").textContent="Next question →"; $("call-next").className="btn primary";
}
async function startRec(){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    CALL.chunks=[]; CALL.rec=new MediaRecorder(stream);
    CALL.rec.ondataavailable=e=>CALL.chunks.push(e.data);
    CALL.rec.start();
    CALL.stream=stream;
    callStatus(`🎙 Listening to ${HANDOFF.from.name.split(" ")[0]}…`); $("call-next").textContent="■ Done answering"; $("call-next").className="btn rec";
  }catch(e){ CALL.typing=true; toast("Microphone isn't available, so type the answer instead."); showTyping(); }
}
async function stopRec(){
  return new Promise(res=>{
    CALL.rec.onstop=async()=>{
      CALL.stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(CALL.chunks,{type:CALL.rec.mimeType||"audio/webm"});
      callStatus("Transcribing…"); $("call-next").disabled=true;
      let text="";
      try{ const r=await fetch("/api/stt",{method:"POST",headers:{"content-type":blob.type},body:blob}); const j=await r.json(); if(!r.ok) throw new Error(JSON.stringify(j.error)); text=j.text||""; }
      catch(e){ toast("Couldn't transcribe that answer, so type it instead."); CALL.typing=true; $("call-next").disabled=false; showTyping(); CALL.i--; res(null); return; }
      $("call-next").disabled=false; res(text);
    };
    CALL.rec.stop();
  });
}
function recordAnswer(text){
  const q=CALL.qs[CALL.i]; CALL.answers.push({acct:q.acct,q:q.text,a:text.trim()||"(no answer)"});
  const el=document.createElement("div"); el.className="a"; el.innerHTML=`<span>${esc(HANDOFF.from.name)} · about ${esc(byId(q.acct).clinic)}</span>${esc(text)}`;
  const ta=$("call-ta"); if(ta) ta.remove();
  $("call-a").appendChild(el); $("call-a").scrollTop=1e6;
}
$("call-next").onclick=async()=>{
  if(CALL.i===-1 && !CALL.browser){ return phoneCall(); }
  if(CALL.i===-1){
    const sh=document.querySelector(".callsheet"); sh.classList.add("ringing"); $("call-next").disabled=true; callStatus("Calling Maya Chen…");
    await new Promise(r=>setTimeout(r,2200));
    sh.classList.remove("ringing"); sh.classList.add("live"); callStatus("Connected · browser call");
    CALL.t0=Date.now(); CALL.timer=setInterval(tick,500); $("call-next").disabled=false; return askNext(); }
  if(CALL.typing){ const ta=$("call-ta"); if(!ta) return; recordAnswer(ta.value); return askNext(); }
  if(CALL.rec && CALL.rec.state==="recording"){ const t=await stopRec(); if(t===null) return; recordAnswer(t); return askNext(); }
};
$("call-type").onclick=()=>{ if(!CALL.browser && CALL.i===-1){ CALL.browser=true; $("call-next").textContent="Start call"; $("call-type").textContent="Type instead"; return; } CALL.typing=true; if(CALL.rec&&CALL.rec.state==="recording"){ CALL.rec.onstop=()=>CALL.stream.getTracks().forEach(t=>t.stop()); CALL.rec.stop(); } if(CALL.i>=0) showTyping(); };
$("call-end").onclick=()=>{ if(CALL.answers.length) finishCall(); else closeCall(); };
async function phoneCall(){
  const sh=document.querySelector(".callsheet"); const btn=$("call-next"); btn.disabled=true;
  sh.classList.add("ringing"); callStatus("Dialing Maya's phone through Guava…");
  let conv;
  try{ const j=await post("/api/call/phone",{questions:CALL.qs.map(q=>q.text), name:HANDOFF.from.name}); conv=j.conversation_id||j.conversationId; if(!conv) throw new Error(JSON.stringify(j).slice(0,160)); }
  catch(e){ sh.classList.remove("ringing"); btn.disabled=false; toast("Couldn't start the phone call ("+e.message.slice(0,140)+"). Use the browser call."); CALL.browser=true; btn.textContent="Start call"; $("call-type").textContent="Type instead"; return; }
  callStatus("Ringing Maya's phone… pick up!"); CALL.t0=Date.now(); CALL.timer=setInterval(tick,500);
  $("call-q").innerHTML=`<div class="who">🧠 Handoff Brain is on the phone with ${esc(HANDOFF.from.name)}</div>It will ask ${CALL.qs.length} question${CALL.qs.length===1?"":"s"}. The transcript appears here live.`;
  let shown=0, connected=false;
  const poll=async()=>{
    try{ const r=await (await fetch("/api/call/status/"+encodeURIComponent(conv),{cache:"no-store"})).json();
      const t=r.transcript||[];
      if((t.length||r.status==="in-progress") && !connected){ connected=true; sh.classList.remove("ringing"); sh.classList.add("live"); callStatus("Connected · phone call"); }
      for(;shown<t.length;shown++){ const el=document.createElement("div"); el.className="a"; el.innerHTML=`<span>${t[shown].role==="agent"?"Handoff Brain":esc(HANDOFF.from.name)}</span>${esc(t[shown].message)}`; $("call-a").appendChild(el); $("call-a").scrollTop=1e6; }
      if(["done","failed"].includes(r.status)){ 
        const first=HANDOFF.from.name.split(" ")[0];
        const text=t.map(x=>`${x.role==="agent"?"Handoff Brain":first}: ${x.message}`).join("\n");
        CALL.answers=CALL.qs.map(q=>({acct:q.acct,q:q.text,a:""}));
        CALL.phoneTranscript=text; return finishCall();
      }
    }catch(e){}
    CALL.poll=setTimeout(poll,2500);
  };
  CALL.poll=setTimeout(poll,3000);
}
function closeCall(){ clearTimeout(CALL.poll); clearInterval(CALL.timer); if(CALL.audio) CALL.audio.pause(); if(window.speechSynthesis) speechSynthesis.cancel(); if(CALL.rec&&CALL.rec.state==="recording"){ CALL.rec.onstop=()=>CALL.stream.getTracks().forEach(t=>t.stop()); CALL.rec.stop(); } $("callm").hidden=true; }
async function finishCall(){
  clearInterval(CALL.timer);
  const mins=Math.max(1,Math.round((Date.now()-CALL.t0)/60000));
  const today=new Date().toLocaleDateString([], {month:"short",day:"numeric"});
  $("call-q").innerHTML=`<div class="who">🧠 Handoff Brain</div>Thanks, ${esc(HANDOFF.from.name.split(" ")[0])}. Updating the brain with what you said…`;
  callStatus("Call ended · updating accounts"); $("call-next").disabled=true; document.querySelector(".callsheet").classList.remove("live");
  await speak(`Thanks ${HANDOFF.from.name.split(" ")[0]}. I've updated the brain.`);
  const byAcct={}; CALL.answers.forEach(x=>{ (byAcct[x.acct]=byAcct[x.acct]||[]).push(x); });
  const ids=Object.keys(byAcct);
  ids.forEach(id=>{ byId(id).calls.push({date:today, title:`Exit call with ${HANDOFF.from.name}`, minutes:mins, exit:true,
    transcript: CALL.phoneTranscript || byAcct[id].map(x=>`Handoff Brain: ${x.q}\n${HANDOFF.from.name.split(" ")[0]}: ${x.a}`).join("\n")}); });
  CALL.phoneTranscript=null;
  closeCall(); view="start"; rail(); render();
  toast(`Exit call saved. Re-reading ${ids.length} account${ids.length===1?"":"s"} with ${HANDOFF.from.name.split(" ")[0]}'s answers…`);
  const ok=await Promise.all(ids.map(id=>analyze(id,true)));
  rail(); render();
  toast(ok.some(Boolean)?`Brain updated from the exit call: ${ids.map(id=>byId(id).clinic).join(", ")}.`:`Saved the exit call. ${AIname()} couldn't re-read it right now; open the account and press Re-read.`);
  publish();
}
$("callbtn").onclick=openCall;

/* ---------------- Triggerware: accounts + promises as live tables ---------------- */
function publish(){
  const accounts=ACCOUNTS.map(a=>({account_id:a.id, clinic:a.clinic, health:cards[a.id].card.health, stage:cards[a.id].card.stage, reason:cards[a.id].card.health_reason}));
  const promises=ACCOUNTS.flatMap(a=>(cards[a.id].card.promises||[]).filter(p=>!(kept[a.id+"|"+p.text]&&kept[a.id+"|"+p.text].at)).map(p=>({account_id:a.id, clinic:a.clinic, promise:p.text, due:p.due||"", owner:p.who})));
  post("/api/data",{accounts,promises}).then(()=>{
    if(!S.tw) return;
    // Run the standing triggers now so alerts appear immediately, not at the next scheduled minute.
    ["hb_at_risk_accounts","hb_open_promises"].forEach(n=>post("/api/tw/run",{name:n}).catch(()=>{}));
  }).catch(()=>{});
}
let seq=0, twTimer=null;
const seen=new Set();
function startTW(){ publish(); if(!twTimer) twTimer=setInterval(pollTW,1500); $("alerts").innerHTML=`<p class="empty">Triggerware is watching ${ACCOUNTS.length} accounts. Alerts appear when an account turns red or a new promise is found.</p>`; }
async function pollTW(){
  try{ const j=await (await fetch("/api/tw/events?since="+seq,{cache:"no-store"})).json();
    j.events.forEach(ev=>{
      const key=ev.kind+"|"+ev.trigger+"|"+ev.row.join("|"); if(seen.has(key)) return; seen.add(key);
      if(ev.trigger==="hb_new_calls"){ if(ev.kind==="added" && !seenCalls.has(ev.row[0])){ const box=$("alerts"); if(box.querySelector(".empty")) box.innerHTML=""; const el=document.createElement("div"); el.className="alert"; el.style.borderColor="rgba(56,214,255,.6)"; el.innerHTML=`<b style="color:var(--accent)">New call transcript detected</b><br>${esc(ev.row[0])}<span class="kv">trigger hb_new_calls</span>`; box.prepend(el); ingestFile(ev.row[0]); } return; }
      if(ev.kind==="deleted" && ev.trigger==="hb_open_promises"){ const box=$("alerts"); if(box.querySelector(".empty")) box.innerHTML=""; const el=document.createElement("div"); el.className="alert"; el.style.borderColor="rgba(74,222,128,.6)"; el.innerHTML=`<b style="color:var(--green)">Promise kept · ${esc(ev.row[1])}</b><br>${esc(ev.row[2])}<span class="kv">trigger hb_open_promises · row removed</span>`; box.prepend(el); return; }
      if(ev.kind==="deleted" && ev.trigger!=="hb_at_risk_accounts") return;
      const box=$("alerts"); if(box.querySelector(".empty")) box.innerHTML="";
      const el=document.createElement("div");
      const when=new Date(ev.at*1000).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"});
      if(ev.trigger==="hb_at_risk_accounts" && ev.kind==="deleted"){ el.className="alert"; el.style.borderColor="rgba(74,222,128,.6)"; el.innerHTML=`<b style="color:var(--green)">${esc(ev.row[1])} is no longer at risk</b><span class="kv">trigger hb_at_risk_accounts · row removed · ${when}</span>`; }
      else if(ev.trigger==="hb_at_risk_accounts"){ el.className="alert red"; el.innerHTML=`<b>${esc(ev.row[1])} is at risk</b><br>${esc(ev.row[3])}<span class="kv">trigger hb_at_risk_accounts · ${new Date(ev.at*1000).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"})}</span>`; }
      else if(ev.trigger==="hb_open_promises"){ el.className="alert"; el.innerHTML=`<b>Open promise · ${esc(ev.row[1])}</b><br>${esc(ev.row[2])} <span style="color:var(--mute)">(${esc(ev.row[3])})</span><span class="kv">trigger hb_open_promises</span>`; }
      else return;
      box.prepend(el);
    });
    seq=Math.max(seq,j.seq||0);
  }catch(e){}
}

/* ---------------- toast ---------------- */
function toast(msg){
  document.querySelectorAll(".toast").forEach(x=>x.remove());
  const t=document.createElement("div"); t.className="toast";
  t.setAttribute("role","status");
  t.style.cssText="position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:min(640px,calc(100% - 32px));background:#1a2238;border:1px solid var(--line);color:var(--ink);padding:12px 16px;border-radius:10px;z-index:30;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.5)";
  t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),7000);
}

/* ---------------- intro scene ---------------- */
function totalMin(){ return ACCOUNTS.reduce((s,a)=>s+a.calls.reduce((t,c)=>t+(c.minutes||0),0),0); }
function fmtMin(m){ return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m} min`; }
function intro(){
  const f=HANDOFF.from, calls=ACCOUNTS.reduce((s,a)=>s+a.calls.length,0);
  $("intro-in").innerHTML=`
    <div class="ibrand"><span class="brand">HANDOFF<span>·</span>BRAIN</span><span class="itag">The company brain that keeps your word.</span></div>
    <span class="eyebrow">Handoff · inherited today</span>
    <h1>${esc(f.name)} leaves Friday.<br>You inherit <em>${ACCOUNTS.length} accounts</em>.</h1>
    <p class="lede">The truth about each account is buried in <b>${calls} call transcripts, ${fmtMin(totalMin())}</b> of talking, and notes that may never have been written up. Reading it all takes most of your first day.</p>
    <button type="button" class="go" id="go">Read everything in 60 seconds →</button>
    <button type="button" class="skip" id="skip">Skip to the dashboard</button>
    <div class="ifeat">
      <div data-go="startbtn"><b>→ Start here</b><span>Your first moves across every inherited account, most urgent first.</span></div>
      <div data-go="radarbtn"><b>◎ Promise Radar</b><span>Every promise made on a customer call, and the ones that were broken.</span></div>
      <div data-go="pmbtn"><b>◆ Product Insights</b><span>What all the calls are telling product, in customers' own words.</span></div>
      <div data-go="call"><b>📞 Exit call</b><span>The brain interviews ${esc(f.name.split(" ")[0])} before she leaves, and learns what the notes miss.</span></div>
    </div>
    <div class="ipow">Powered by <b>${AIname()}</b> · <b>ElevenLabs</b> voice · <b>Triggerware</b> live triggers · <b>AppStarter</b> spec</div>`;
  $("go").onclick=scan; $("skip").onclick=closeIntro;
  document.querySelectorAll("#intro-in [data-go]").forEach(d=>{ d.setAttribute("role","button"); d.tabIndex=0; d.onclick=()=>{ const g=d.dataset.go; closeIntro(); setTimeout(()=>{ if(g==="call") openCall(); else $(g).click(); },120); }; });
}
function closeIntro(){ if(!readMin){ readMin=totalMin(); savedStat(); } const el=$("intro"); el.classList.add("out"); setTimeout(()=>{ el.hidden=true; },650); rail(); render(); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function scan(){
  $("intro-in").innerHTML=`
    <span class="eyebrow">Reading ${ACCOUNTS.length} accounts</span>
    <div class="counters"><div><b id="c-min">0</b><small>minutes of calls read</small></div><div><b id="c-risk" style="color:var(--red)">0</b><small>risks found</small></div><div><b id="c-prom">0</b><small>promises found</small></div><div><b id="c-over" style="color:var(--red)">0</b><small>overdue</small></div></div>
    <div class="scan">${ACCOUNTS.map(a=>`<div class="scan-row" id="sr-${a.id}"><span class="hdot" style="background:#2a3352"></span><b>${esc(a.clinic)}</b><span class="res">waiting</span><div class="bar"><i></i></div></div>`).join("")}</div>`;
  let mins=0,risks=0,proms=0,over=0;
  const tick=(id,to)=>{ const el=$(id); const from=+el.textContent; const t0=performance.now();
    const step=now=>{ const k=Math.min(1,(now-t0)/600); el.textContent=Math.round(from+(to-from)*k); if(k<1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  const finish=a=>{
    const row=$("sr-"+a.id), bar=row.querySelector(".bar i"), res=row.querySelector(".res");
    const c=cards[a.id].card;
    bar.style.width="100%";
    row.querySelector(".hdot").className="hdot "+c.health; row.querySelector(".hdot").style.background="";
    res.textContent=(cards[a.id].source==="ai"?`read by ${cards[a.id].by||AIname()} · `:"prepared summary · ")+(c.health==="red"?"AT RISK":c.health==="amber"?"watch":"on track");
    if(cards[a.id].source!=="ai"){ readMin+=a.calls.reduce((t,x)=>t+(x.minutes||0),0); }
    mins+=a.calls.reduce((t,x)=>t+(x.minutes||0),0); risks+=(c.risks||[]).length;
    const ps=(c.promises||[]).filter(p=>p.who==="us"); proms+=ps.length; over+=ps.filter(p=>/overdue|right after/i.test(p.due||"")).length;
    tick("c-min",mins); tick("c-risk",risks); tick("c-prom",proms); tick("c-over",over);
  };
  // Read all accounts at the same time; each one shows its verdict as soon as it is done.
  await Promise.all(ACCOUNTS.map(async (a,i)=>{
    const row=$("sr-"+a.id), bar=row.querySelector(".bar i"), res=row.querySelector(".res");
    await sleep(i*180);
    bar.style.width="35%";
    if(S.ai && cards[a.id].source!=="ai"){
      res.textContent=`${AIname()} is reading…`;
      const grow=setInterval(()=>{ const w=parseFloat(bar.style.width)||35; if(w<90) bar.style.width=(w+4)+"%"; },900);
      await Promise.race([analyze(a.id,true), sleep(25000)]);
      clearInterval(grow);
    } else { res.textContent="reading…"; await sleep(500+i*150); }
    finish(a);
  }));
  readMin=Math.max(readMin,totalMin()); savedStat();
  view="start"; // land on the new owner's first moves
  await sleep(700);
  closeIntro();
}

/* ---------------- boot ---------------- */
(async()=>{
  header(); rail(); render(); intro();
  await status(); setInterval(status,5000);
  await pollInbox(true);                  // calls that arrived earlier are part of each account's history
  await loadCached(); rail(); render();
  if(S.ai) ACCOUNTS.filter(a=>a.calls.some(c=>c.file) && cards[a.id].source!=="ai").forEach(a=>analyze(a.id,true));
  inboxTimer=setInterval(()=>pollInbox(false),2500); // fallback if Triggerware is offline; Triggerware usually fires first
  if(!S.tw){ $("alerts").innerHTML=`<p class="empty">Triggerware is offline. ${esc(S.twErr||"")}</p>`; }
  publish();
})();
})();
