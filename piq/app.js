(() => {
  const $ = s => document.querySelector(s);
  const setup = $('#setup'), entry = $('#session-entry'), live = $('#live'), connection = $('#connection');
  let backend = localStorage.getItem('pbq_backend') || '';
  let sessionCode = new URLSearchParams(location.search).get('session') || localStorage.getItem('pbq_session') || '';
  let state = null;
  let timer = null;
  let player = loadPlayer();

  function apiBase(){ return backend.replace(/\/$/, '') + '/wp-json/pbq/v1'; }
  function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function modeName(m){ return ({fifo:'Paddle stack / FIFO', balanced:'Balanced fair play', challenge:'Challenge court · winners stay & split'}[m]||m); }
  function loadPlayer(){ try{return JSON.parse(localStorage.getItem('pbq_player')||'null')}catch{return null} }
  function savePlayer(p){ player=p; localStorage.setItem('pbq_player',JSON.stringify(p)); }
  function clearPlayer(){ player=null; localStorage.removeItem('pbq_player'); }
  function toast(msg){ const t=$('#toast');t.textContent=msg;t.hidden=false;setTimeout(()=>t.hidden=true,2200); }

  async function request(path, options={}){
    const res=await fetch(apiBase()+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message||'Request failed');
    return data;
  }

  function initialize(){
    if(!backend){ setup.hidden=false; entry.hidden=true; return; }
    setup.hidden=true; entry.hidden=false;
    if(sessionCode){ $('#session-code').value=sessionCode; openSession(sessionCode); }
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  $('#backend-form').addEventListener('submit',e=>{e.preventDefault();backend=$('#backend-url').value.trim().replace(/\/$/,'');localStorage.setItem('pbq_backend',backend);setup.hidden=true;entry.hidden=false;toast('Backend saved');});
  $('#session-form').addEventListener('submit',e=>{e.preventDefault();openSession($('#session-code').value.trim().toUpperCase());});
  $('#change-session').addEventListener('click',()=>{clearInterval(timer);live.hidden=true;entry.hidden=false;history.replaceState({},'',location.pathname);});
  $('#join-toggle').addEventListener('click',()=>openJoin());
  $('#close-join').addEventListener('click',()=>$('#join-dialog').close());

  async function openSession(code){
    if(!backend) return;
    try{
      connection.textContent='Connecting…';
      const data=await request(`/session/${encodeURIComponent(code)}`);
      sessionCode=data.session.code; localStorage.setItem('pbq_session',sessionCode);
      const url=new URL(location.href);url.searchParams.set('session',sessionCode);history.replaceState({},'',url);
      state=data; entry.hidden=true; live.hidden=false; connection.textContent='Live'; render();
      clearInterval(timer);timer=setInterval(refresh,3000);
    }catch(err){connection.textContent='Not connected';toast(err.message);}
  }

  async function refresh(){
    if(!sessionCode||document.hidden) return;
    try{state=await request(`/session/${encodeURIComponent(sessionCode)}`);connection.textContent='Live';render();}
    catch(err){connection.textContent='Reconnecting…';}
  }

  function render(){
    const s=state.session;
    $('#session-name').textContent=s.name;$('#session-mode').textContent=modeName(s.mode).toUpperCase();
    $('#session-meta').textContent=`Code ${s.code} · ${s.status} · game to ${s.score_to}, win by ${s.win_by}`;
    $('#stat-waiting').textContent=state.stats.waiting;$('#stat-courts').textContent=s.num_courts;$('#stat-estimate').textContent=`${state.stats.estimated_wait_minutes_for_new_player}m`;
    $('#last-updated').textContent=`Updated ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    $('#courts').innerHTML=state.courts.map(renderCourt).join('');
    $('#queue-notices').innerHTML=(state.queue_notices||[]).map(n=>`<div class="queue-notice"><strong>Queue override:</strong> ${esc(n.player_name)} moved ${esc(n.direction)} — ${esc(n.reason)}</div>`).join('');
    $('#queue').innerHTML=renderQueue();
    renderMe();
  }

  function renderCourt(c){
    if(!c.game) return `<article class="court open"><div><div class="court-name">${esc(c.label)}</div><div class="muted">Open court</div></div></article>`;
    const pill=p=>`<span class="player-pill">${esc(p?.name||'?')} <small>${p?.skill?.toFixed?.(1)||''}</small></span>`;
    return `<article class="court"><div class="court-name">${esc(c.label)}</div><div class="muted">In play</div><div class="versus"><div class="team">${c.game.team_a.map(pill).join('')}</div><span class="vs">VS</span><div class="team">${c.game.team_b.map(pill).join('')}</div></div></article>`;
  }

  function renderQueue(){
    if(!state.queue.length) return `<div class="empty">Nobody is waiting. This is a good time to join.</div>`;
    return `<div class="queue-row queue-head"><span>#</span><span>Player</span><span>Skill</span><span class="hide-mobile">Wait</span><span class="hide-mobile">Games</span></div>${state.queue.map(p=>`<div class="queue-row ${player&&p.id===player.id?'is-me':''}"><span class="position">${p.position}</span><span><strong>${esc(p.name)}</strong>${player&&p.id===player.id?' · You':''}</span><span>${p.skill.toFixed(1)}</span><span class="hide-mobile">${Math.floor(p.wait_seconds/60)}m</span><span class="hide-mobile">${p.games_played}</span></div>`).join('')}`;
  }

  function renderMe(){
    const card=$('#my-card');
    if(!player||player.session!==sessionCode){card.hidden=true;$('#join-toggle').hidden=false;return;}
    const q=state.queue.find(p=>p.id===player.id);
    const other=state.players.find(p=>p.id===player.id);
    const court=state.courts.find(c=>c.game&&[...c.game.team_a,...c.game.team_b].some(p=>p&&p.id===player.id));
    let status=q?'waiting':court?'playing':other?.status||'unknown';
    let headline='You are in this session'; let detail='';
    if(q){headline=`You’re #${q.position} in queue`;detail=`Waiting ${Math.floor(q.wait_seconds/60)} min · ${q.games_played} games played`;}
    else if(court){headline=`You’re on ${court.label}`;detail='Have a great game.';}
    else if(status==='resting'){headline='You’re resting';detail='Resume when you are ready. You will rejoin at the back of the queue.';}
    else if(status==='holding'){headline='You won — stay on court';detail='Challenge mode keeps the winning pair for the next game.';}
    card.innerHTML=`<div><h3>${esc(headline)}</h3><div class="muted">${esc(detail)}</div></div><div class="my-actions">${status==='waiting'?'<button class="btn ghost" data-self="rest">Take a rest</button>':''}${status==='resting'?'<button class="btn primary" data-self="resume">Resume queue</button>':''}${['waiting','resting'].includes(status)?'<button class="btn ghost danger" data-self="leave">Leave session</button>':''}</div>`;
    card.hidden=false;$('#join-toggle').hidden=true;
    card.querySelectorAll('[data-self]').forEach(b=>b.addEventListener('click',()=>selfAction(b.dataset.self)));
  }

  function openJoin(){
    const select=$('#skill-select');select.innerHTML='';
    for(let x=state.session.skill_min;x<=state.session.skill_max+0.01;x+=.5){const o=document.createElement('option');o.value=x.toFixed(1);o.textContent=x.toFixed(1);if(Math.abs(x-3)<.1)o.selected=true;select.appendChild(o)}
    $('#join-dialog').showModal();
  }

  $('#join-form').addEventListener('submit',async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);
    try{
      const data=await request(`/session/${encodeURIComponent(sessionCode)}/join`,{method:'POST',body:JSON.stringify({name:f.get('name'),skill:Number(f.get('skill'))})});
      savePlayer({id:data.player.id,token:data.token,session:sessionCode,name:data.player.name});state=data.state;$('#join-dialog').close();render();toast('You’re in the queue');
    }catch(err){toast(err.message)}
  });

  async function selfAction(action){
    try{
      const data=await request(`/player/${player.id}/action`,{method:'POST',headers:{'X-PBQ-Player-Token':player.token},body:JSON.stringify({action})});state=data.state;
      if(action==='leave'){clearPlayer();toast('You left the session');}else toast(action==='rest'?'Resting':'Back in queue');render();
    }catch(err){toast(err.message)}
  }

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  initialize();
})();
