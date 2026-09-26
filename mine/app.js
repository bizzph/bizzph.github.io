(() => {
  const levels = {
    easy:{rows:9,cols:9,mines:10,cell:34},
    medium:{rows:14,cols:14,mines:35,cell:30},
    hard:{rows:16,cols:30,mines:100,cell:30}
  };

  let level='easy', cfg=levels.easy, mode='shovel', cells=[], started=false, finished=false;
  let flags=0,moves=0,seconds=0,timer=null,deferredPrompt=null,manualCell=null;
  const PB_KEY='minesweeper.personalBests.v1';

  const $=id=>document.getElementById(id);
  const board=$('board'), scroller=$('scroller'), mineCount=$('mineCount'), time=$('time'),
        movesEl=$('moves'), status=$('status'), shovel=$('shovel'), flag=$('flag'), bestBadge=$('bestBadge');


  function loadPBs(){
    try{
      const data=JSON.parse(localStorage.getItem(PB_KEY)||'{}');
      return data && typeof data==='object' ? data : {};
    }catch(_){ return {}; }
  }
  function getPB(){
    const pb=loadPBs()[level];
    return pb && Number.isFinite(Number(pb.time)) ? pb : null;
  }
  function updatePBBadge(isNew=false){
    const pb=getPB();
    bestBadge.textContent=pb ? `PB ${formatTime(pb.time)}` : 'PB --';
    bestBadge.classList.toggle('new',isNew);
    if(isNew) setTimeout(()=>bestBadge.classList.remove('new'),1800);
  }
  function formatTime(total){
    total=Math.max(0,Number(total)||0);
    const m=Math.floor(total/60), sec=total%60;
    return m ? `${m}:${String(sec).padStart(2,'0')}` : `${sec}s`;
  }
  function savePBIfBetter(){
    const all=loadPBs(), previous=all[level];
    if(!previous || seconds < Number(previous.time)){
      all[level]={time:seconds,moves:moves,savedAt:new Date().toISOString()};
      try{ localStorage.setItem(PB_KEY,JSON.stringify(all)); }catch(_){}
      updatePBBadge(true);
      return true;
    }
    updatePBBadge(false);
    return false;
  }

  function syncViewport(){
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
  }
  syncViewport();
  window.addEventListener('resize',syncViewport,{passive:true});
  if(window.visualViewport){
    visualViewport.addEventListener('resize',syncViewport,{passive:true});
    visualViewport.addEventListener('scroll',syncViewport,{passive:true});
  }

  function setCell(px){
    manualCell=Math.max(22,Math.min(44,Math.round(px)));
    document.documentElement.style.setProperty('--cell',manualCell+'px');
  }
  function autoCell(){
    const w=scroller.clientWidth-24, h=scroller.clientHeight-24;
    if(level==='easy'){
      setCell(Math.min(40,(w-(cfg.cols-1)*3)/cfg.cols,(h-(cfg.rows-1)*3)/cfg.rows));
    } else if(level==='medium'){
      setCell(Math.min(34,Math.max(24,(w-(cfg.cols-1)*3)/cfg.cols)));
    } else {
      setCell(Math.max(28,Math.min(34,h/11)));
    }
  }
  function fitWidth(){
    const w=scroller.clientWidth-20;
    setCell((w-(cfg.cols-1)*3)/cfg.cols);
    requestAnimationFrame(()=>{scroller.scrollLeft=0;scroller.scrollTop=0});
  }

  function setMode(m){
    mode=m;
    shovel.classList.toggle('active',m==='shovel');
    flag.classList.toggle('active',m==='flag');
    shovel.setAttribute('aria-pressed',m==='shovel');
    flag.setAttribute('aria-pressed',m==='flag');
    if(navigator.vibrate) navigator.vibrate(8);
  }

  function empty(){
    cells=Array.from({length:cfg.rows*cfg.cols},(_,i)=>({i,mine:false,open:false,flag:false,count:0}));
  }
  function neighbors(i){
    const r=Math.floor(i/cfg.cols),c=i%cfg.cols,a=[];
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      if(!dr&&!dc)continue;
      const rr=r+dr,cc=c+dc;
      if(rr>=0&&rr<cfg.rows&&cc>=0&&cc<cfg.cols)a.push(rr*cfg.cols+cc);
    }
    return a;
  }
  function placeMines(safe){
    const ban=new Set([safe,...neighbors(safe)]);
    const pool=cells.map(x=>x.i).filter(i=>!ban.has(i));
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
    pool.slice(0,cfg.mines).forEach(i=>cells[i].mine=true);
    cells.forEach(c=>{if(!c.mine)c.count=neighbors(c.i).filter(i=>cells[i].mine).length});
  }
  function startTimer(){
    if(timer)return;
    timer=setInterval(()=>{seconds++;time.textContent=seconds},1000);
  }
  function stopTimer(){clearInterval(timer);timer=null}
  function toast(msg,type=''){
    status.textContent=msg; status.className='status show '+type;
    clearTimeout(toast.t); toast.t=setTimeout(()=>status.classList.remove('show'),1600);
  }
  function render(){
    board.style.gridTemplateColumns=`repeat(${cfg.cols},var(--cell))`;
    board.innerHTML='';
    cells.forEach(c=>{
      const b=document.createElement('button');
      b.className='cell'; b.dataset.i=c.i; b.setAttribute('aria-label',`Cell ${c.i+1}`);
      if(c.open){
        b.classList.add('open');
        if(c.mine){b.classList.add('mine');b.textContent='💣'}
        else if(c.count){b.textContent=c.count;b.classList.add('n'+c.count)}
      }else if(c.flag){b.classList.add('flagged');b.textContent='🚩'}
      board.appendChild(b);
    });
  }
  function flood(i){
    const q=[i],seen=new Set;
    while(q.length){
      const n=q.shift(); if(seen.has(n))continue;seen.add(n);
      const c=cells[n]; if(c.flag||c.mine)continue;
      c.open=true;
      if(c.count===0)neighbors(n).forEach(x=>{if(!cells[x].open&&!cells[x].mine)q.push(x)});
    }
  }
  function reveal(i){
    const c=cells[i];if(finished||c.open||c.flag)return;
    if(!started){started=true;placeMines(i);startTimer()}
    moves++;movesEl.textContent=moves;
    if(c.mine){c.open=true;lose();return}
    flood(i);checkWin();render();
  }
  function toggleFlag(i){
    if(finished)return;
    const c=cells[i];if(c.open)return;
    if(!c.flag&&flags>=cfg.mines){toast('All flags are already placed');return}
    c.flag=!c.flag;flags+=c.flag?1:-1;moves++;movesEl.textContent=moves;mineCount.textContent=cfg.mines-flags;
    render();checkWin();
  }
  function chord(i){
    const c=cells[i];if(!c.open||!c.count||finished)return;
    const ns=neighbors(i),f=ns.filter(n=>cells[n].flag).length;
    if(f!==c.count)return;
    let hit=false;
    ns.forEach(n=>{
      const x=cells[n];
      if(!x.open&&!x.flag){if(x.mine){x.open=true;hit=true}else flood(n)}
    });
    moves++;movesEl.textContent=moves;
    hit?lose():(checkWin(),render());
  }
  function lose(){
    finished=true;stopTimer();cells.forEach(c=>{if(c.mine)c.open=true});
    if(navigator.vibrate)navigator.vibrate([80,50,120]);
    render();toast('Boom — new game?','lose');
  }
  function checkWin(){
    const safe=cfg.rows*cfg.cols-cfg.mines;
    if(cells.filter(c=>c.open&&!c.mine).length===safe){
      finished=true;stopTimer();cells.forEach(c=>{if(c.mine)c.flag=true});
      flags=cfg.mines;mineCount.textContent=0;render();
      if(navigator.vibrate)navigator.vibrate([30,40,30]);
      const isPB=savePBIfBetter();
      toast(isPB ? `New personal best · ${formatTime(seconds)} 🏆` : `Cleared in ${formatTime(seconds)} 🎉`,'win');
    }
  }
  function newGame(){
    stopTimer();cfg=levels[level];started=false;finished=false;flags=0;moves=0;seconds=0;
    mineCount.textContent=cfg.mines;time.textContent=0;movesEl.textContent=0;empty();render();updatePBBadge(false);
    requestAnimationFrame(()=>{autoCell();scroller.scrollTo(0,0)});
  }

  let down=null,moved=false;
  scroller.addEventListener('pointerdown',e=>{
    down={x:e.clientX,y:e.clientY};moved=false;
  },{passive:true});
  scroller.addEventListener('pointermove',e=>{
    if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)moved=true;
  },{passive:true});
  scroller.addEventListener('pointerup',()=>{down=null},{passive:true});

  board.addEventListener('click',e=>{
    const el=e.target.closest('.cell');if(!el||moved)return;
    const i=+el.dataset.i,c=cells[i];
    if(c.open&&mode==='shovel'){chord(i);return}
    mode==='flag'?toggleFlag(i):reveal(i);
  });
  board.addEventListener('contextmenu',e=>{
    const el=e.target.closest('.cell');if(!el)return;e.preventDefault();toggleFlag(+el.dataset.i);
  });

  shovel.onclick=()=>setMode('shovel'); flag.onclick=()=>setMode('flag'); $('newGame').onclick=newGame;
  document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{
    level=b.dataset.level;
    document.querySelectorAll('[data-level]').forEach(x=>x.classList.toggle('active',x===b));
    newGame();
  });
  $('zoomIn').onclick=()=>setCell((manualCell||cfg.cell)+3);
  $('zoomOut').onclick=()=>setCell((manualCell||cfg.cell)-3);
  $('fitBtn').onclick=fitWidth;

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();deferredPrompt=e;$('installBtn').classList.add('show');
  });
  $('installBtn').onclick=async()=>{
    if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;
    $('installBtn').classList.remove('show');
  };
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));

  window.addEventListener('resize',()=>requestAnimationFrame(autoCell),{passive:true});
  newGame();
})();
