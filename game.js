/* Rogue-2048 Classic Animations Version (Gameplay unchanged) */

const SIZE = 4;
const BEST_KEY = 'rogue2048_best_roguelike';

// Config
const EVENT_PROBABILITY = 1.0;
const EVENT_TRIGGER_MODE = 'eachMax';
const EVENT_COOLDOWN = 2;
const ENABLE_WIN_CHECK = false;
const MAX_STATIC_CLASS = 2048;
const EVENT_FOR_POWERS_ONLY = false;
const CHANCE_GOOD_RATIO = 0.8;

// State
let grid = []; // stores tile ids or 0
let tiles = new Map(); // id -> {id,value,r,c, merging:false, removed:false, elem}
let nextTileId = 1;
let score = 0;
let best = safeParseInt(localStorage.getItem(BEST_KEY), 0);
let moves = 0;
let gameOver = false;
let isEventActive = false;
let blindMode = false;
let blindModeMovesLeft = 0;
let lastEventMove = -999;
let triggeredSet = new Set();
let triggeredHistory = [];
let lastMaxValue = 0;
let animating = false;

// DOM
const gridEl = document.getElementById('grid');
const gridBgEl = document.getElementById('gridBg');
const tileLayer = document.getElementById('tileLayer');
const scoreEl = document.getElementById('score');
const bestEl  = document.getElementById('best');
const endgameOverlay = document.getElementById('endgameOverlay');
const overlayTitle   = document.getElementById('overlayTitle');
const overlayText    = document.getElementById('overlayText');
const eventOverlay       = document.getElementById('eventOverlay');
const overlayTitleEvent  = document.getElementById('overlayTitleEvent');
const overlayTextEvent   = document.getElementById('overlayTextEvent');
const eventOptionsEl     = document.getElementById('eventOptions');
const statusBar          = document.getElementById('statusBar');

// Init BG cells
function createBackground(){
  gridBgEl.innerHTML = '';
  for (let i=0;i<SIZE*SIZE;i++){
    const d = document.createElement('div');
    d.className = 'cell-base';
    gridBgEl.appendChild(d);
  }
}
createBackground();
bestEl.textContent = best;

// Utilities
function safeParseInt(v,f=0){ const n=parseInt(v,10);return isNaN(n)?f:n; }
function getMaxTile(){
  let max = 0;
  tiles.forEach(t => { if (t.value>max) max=t.value; });
  return max;
}
function isPowerOfTwo(n){ return n>0 && (n&(n-1))===0; }
function collectEmpties(){
  const out=[];
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]===0) out.push([r,c]);
  return out;
}
function iterateTiles(fn){ tiles.forEach(fn); }
function hasValue(val){
  for (const t of tiles.values()) if (t.value===val) return true;
  return false;
}

// Init
function init(){
  grid = Array.from({length:SIZE},()=>Array(SIZE).fill(0));
  tiles.clear();
  nextTileId = 1;
  score = 0; moves=0;
  gameOver=false; isEventActive=false;
  blindMode=false; blindModeMovesLeft=0;
  lastEventMove=-999; triggeredSet.clear(); triggeredHistory=[]; lastMaxValue=0;
  tileLayer.innerHTML='';
  spawnRandom(); spawnRandom();
  renderStatic();
  enableInput();
  updateStatus('Game started.');
}
function spawnRandom(){
  const empties = collectEmpties();
  if (!empties.length) return false;
  const [r,c] = empties[(Math.random()*empties.length)|0];
  const val = Math.random()<0.9?2:4;
  const id = nextTileId++;
  grid[r][c]=id;
  const tile = createTile(id,val,r,c,true);
  tiles.set(id,tile);
  return true;
}

// Tile creation
function createTile(id,value,r,c,isSpawn=false){
  const el=document.createElement('div');
  el.className='tile';
  el.dataset.id=id;
  const tObj = {id,value,r,c,elem:el,removed:false};
  styleTile(tObj);
  positionTile(tObj);
  if (isSpawn) el.classList.add('spawn');
  tileLayer.appendChild(el);
  return tObj;
}
function styleTile(tile){
  const el = tile.elem;
  el.classList.remove('merge-pop','small-text','tiny-text');
  el.textContent = blindMode ? '?' : tile.value;
  if (blindMode) {
    el.style.background = '#90a4ae';
    el.style.color = '#fff';
    return;
  }
  el.style.color = '';
  el.style.background = '';
  if (tile.value <= MAX_STATIC_CLASS){
    el.className = el.className.replace(/\bt-\d+\b/g,'').trim();
    el.classList.add(`t-${tile.value}`);
  } else {
    const hue = (Math.log2(tile.value)*37)%360;
    el.style.background = `hsl(${hue} 65% 50%)`;
    el.style.color='#fff';
  }
  if (tile.value >= 1024 && tile.value < 2048) el.classList.add('small-text');
  if (tile.value >= 2048) el.classList.add('tiny-text');
}
function positionTile(tile){
  const pctSize = 25; // 4 columns
  const gap = 16;
  // dynamic: compute actual pixel offset using element size
  // Use flex formula: width calc((100% - gaps - padding)/4)
  const layerRect = tileLayer.getBoundingClientRect();
  const baseRect = gridBgEl.children[ tile.r*SIZE + tile.c ].getBoundingClientRect();
  const layerLeft = layerRect.left;
  const layerTop  = layerRect.top;
  const x = baseRect.left - layerLeft;
  const y = baseRect.top - layerTop;
  tile.elem.style.transform = `translate(${x}px, ${y}px)`;
}

// Movement
function move(dir){
  if (gameOver || isEventActive || animating) return;
  const originalGrid = grid.map(r=>r.slice());
  const originalTiles = new Map();
  tiles.forEach(t => originalTiles.set(t.id,{...t}));

  const result = performMove(dir);
  if (!result.moved) return;

  animating = true;

  score += result.gained;
  if (score > best){ best=score; localStorage.setItem(BEST_KEY,best); }
  moves++;

  if (blindModeMovesLeft>0){
    blindModeMovesLeft--;
    if (blindModeMovesLeft<=0){ blindMode=false; updateStatus('Blind ended.'); }
    else updateStatus(`Blind: ${blindModeMovesLeft} moves left.`);
  }

  animateMovement(result, () => {
    spawnRandom();
    renderStatic();
    animating = false;
    if (ENABLE_WIN_CHECK) checkWin();
    checkEnd();
    maybeTriggerEvent();
  });
}

function performMove(dir){
  let moved=false,gained=0;
  function line(index,get,set){
    const arr=[];
    for (let i=0;i<SIZE;i++) arr.push(get(index,i));
    const filtered=arr.filter(v=>v!==0);
    const out=[]; let i=0;
    while(i<filtered.length){
      if (i+1<filtered.length && tiles.get(filtered[i]).value===tiles.get(filtered[i+1]).value){
        const aId=filtered[i], bId=filtered[i+1];
        const newVal = tiles.get(aId).value*2;
        const survivor = aId; // a survives
        tiles.get(survivor).value = newVal;
        tiles.get(bId).removed = true;
        gained += newVal;
        out.push(survivor);
        i+=2;
      } else {
        out.push(filtered[i]);
        i++;
      }
    }
    while(out.length<SIZE) out.push(0);
    for (let i=0;i<SIZE;i++){
      const prev = get(index,i);
      if (prev !== out[i]) moved=true;
      set(index,i,out[i]);
    }
  }
  if (dir===0){ // left
    lineLoopRows(line);
  } else if (dir===2){ // right
    lineLoopRows((idx,get,set)=>{
      line(idx,(r,c)=>get(r,SIZE-1-c),(r,c,v)=>set(r,SIZE-1-c,v));
    });
  } else if (dir===3){ // up
    lineLoopCols(line);
  } else if (dir===1){ // down
    lineLoopCols((idx,get,set)=>{
      line(idx,(c,r)=>get(SIZE-1-r,c),(c,r,v)=>set(SIZE-1-r,c,v));
    });
  }

  // remove merged tiles flagged removed
  tiles.forEach(t=>{
    if (t.removed){
      grid[t.r][t.c]=0; // temporary
    }
  });

  // rebuild grid positions -> update tile r,c
  for (let r=0;r<SIZE;r++){
    for (let c=0;c<SIZE;c++){
      const id = grid[r][c];
      if (id!==0){
        const t = tiles.get(id);
        t.r=r; t.c=c;
      }
    }
  }

  // Clean removed
  tiles.forEach((t,id)=>{
    if (t.removed){
      tiles.delete(id);
    }
  });

  return { moved, gained };
}

function lineLoopRows(fn){
  for (let r=0;r<SIZE;r++){
    fn(r,(row,col)=>grid[row][col],(row,col,v)=>{grid[row][col]=v;});
  }
}
function lineLoopCols(fn){
  for (let c=0;c<SIZE;c++){
    fn(c,(col,row)=>grid[row][col],(col,row,v)=>{grid[row][col]=v;});
  }
}

// Animation
function animateMovement(result, done){
  // Before animation: capture target positions
  tiles.forEach(styleTile);
  requestAnimationFrame(()=>{
    tiles.forEach(positionTile);
    // Add merge-pop after transition ends for tiles whose value just changed (duplicates logic: they were survivors of merges)
    const changed = [];
    tiles.forEach(t=>{
      // heuristic: if tile just got even number >2 and existed previously? We'll store last value on element dataset
      const prevVal = t.elem.dataset.val ? parseInt(t.elem.dataset.val,10) : t.value;
      if (t.value !== prevVal){
        changed.push(t);
      }
      t.elem.dataset.val = t.value;
    });

    const duration = 130;
    setTimeout(()=>{
      changed.forEach(t=>{
        t.elem.classList.add('merge-pop');
        setTimeout(()=>t.elem.classList.remove('merge-pop'),180);
      });
      done();
    }, duration+20);
  });
}

// Rendering (static state only)
function renderStatic(){
  // Remove missing tile elements
  const existingIds = new Set([...tiles.keys()].map(id=>String(id)));
  [...tileLayer.children].forEach(el=>{
    if (!existingIds.has(el.dataset.id)) el.remove();
  });
  tiles.forEach(tile=>{
    styleTile(tile);
    positionTile(tile);
  });
  scoreEl.textContent = score;
  bestEl.textContent = best;
}

// End / Win
function canMove(){
  // empty
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]===0) return true;
  // merges
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    const id=grid[r][c]; if (!id) continue;
    const v=tiles.get(id).value;
    if (r+1<SIZE && grid[r+1][c] && tiles.get(grid[r+1][c]).value===v) return true;
    if (c+1<SIZE && grid[r][c+1] && tiles.get(grid[r][c+1]).value===v) return true;
  }
  return false;
}
function checkEnd(){
  if (!canMove()) endGame('Game Over',`You scored ${score} in ${moves} moves.`);
}
function checkWin(){
  tiles.forEach(t=>{
    if (t.value===2048){
      endGame('You Win!',`Reached 2048 in ${moves} moves. Score: ${score}.`);
    }
  });
}
function endGame(title,text){
  if (gameOver) return;
  gameOver=true;
  disableInput();
  if (score>best){ best=score; localStorage.setItem(BEST_KEY,best);}
  overlayTitle.textContent=title;
  overlayText.textContent=`${text} (Best: ${best})`;
  endgameOverlay.style.display='flex';
}

// Events Trigger
function eventShouldTrigger(maxTile){
  if (maxTile < 8) return false;
  if (EVENT_FOR_POWERS_ONLY && !isPowerOfTwo(maxTile)) return false;
  switch (EVENT_TRIGGER_MODE){
    case 'eachMax':
    case 'powerOfTwo':
      if (EVENT_TRIGGER_MODE==='powerOfTwo' && !isPowerOfTwo(maxTile)) return false;
      if (triggeredSet.has(maxTile)) return false;
      triggeredSet.add(maxTile); return true;
    case 'multipleOf8':
      if (maxTile % 8 !== 0) return false;
      if (triggeredSet.has(maxTile)) return false;
      triggeredSet.add(maxTile); return true;
    case 'everyIncrement':
      if (maxTile>lastMaxValue){ triggeredHistory.push(maxTile); lastMaxValue=maxTile; return true; }
      return false;
    default: return false;
  }
}
function maybeTriggerEvent(){
  if (isEventActive || animating) return;
  if (moves - lastEventMove < EVENT_COOLDOWN) return;
  const maxTile = getMaxTile();
  if (!eventShouldTrigger(maxTile)) return;
  if (Math.random() > EVENT_PROBABILITY) return;
  lastEventMove = moves;
  showEvent(maxTile);
}

// Effects
const chanceGoodEffects = [
  {
    id:'AddMaxTile',
    label:'Add one tile equal to current max',
    run:()=>{
      const empties=collectEmpties(); if(!empties.length) return;
      const [r,c]=empties[(Math.random()*empties.length)|0];
      spawnCustom(r,c,getMaxTile());
    }
  },
  {
    id:'DoubleRandomSmallRank',
    label:'All tiles of a random small rank doubled',
    run:()=>{
      const present=[2,4,8].filter(v=>hasValue(v));
      if(!present.length)return;
      const chosen=present[(Math.random()*present.length)|0];
      tiles.forEach(t=>{ if(t.value===chosen) t.value*=2; styleTile(t); });
    }
  },
  {
    id:'SpawnPair48',
    label:'Spawn two tiles (4 or 8)',
    run:()=>{
      for(let k=0;k<2;k++){
        const empties=collectEmpties(); if(!empties.length) return;
        const [r,c]=empties[(Math.random()*empties.length)|0];
        spawnCustom(r,c, Math.random()<0.5?4:8);
      }
    }
  },
  {
    id:'UpgradeLowestThree',
    label:'Lowest up to three tiles doubled',
    run:()=>{
      const arr=[...tiles.values()].filter(t=>!t.removed).sort((a,b)=>a.value-b.value).slice(0,3);
      arr.forEach(t=>{ t.value*=2; styleTile(t); });
    }
  }
];
const chanceHindranceEffects = [
  {
    id:'HalveSingleMax',
    label:'One max tile halved',
    run:()=>{
      const max=getMaxTile();
      const arr=[...tiles.values()].filter(t=>t.value===max);
      if(!arr.length)return;
      const t=arr[(Math.random()*arr.length)|0];
      t.value=Math.max(1,Math.floor(t.value/2));
      styleTile(t);
    }
  }
];
const fateEffects = [
  { id:'AllBecomeMax', weight:5, label:'All tiles become current max', run:()=>{
    const m=getMaxTile(); tiles.forEach(t=>{ if(t.value>0) t.value=m; styleTile(t);});
  }},
  { id:'SpawnHighTile', weight:5, label:'Spawn a high tile (max*2)', run:()=>{
    const m=getMaxTile(); const val=Math.min(m*2,8192);
    const empties=collectEmpties();
    if(empties.length){const [r,c]=empties[(Math.random()*empties.length)|0]; spawnCustom(r,c,val);}
    else {
      const any=[...tiles.values()];
      const t=any[(Math.random()*any.length)|0];
      t.value=val; styleTile(t);
    }
  }},
  { id:'RandomFactorGlobal', weight:15, label:'Random global factor (×0.5 / ×2 / ×4 / ×8)', run:()=>{
    const roll=Math.random();
    let f; if(roll<0.60) f=0.5; else if(roll<0.85) f=2; else if(roll<0.97) f=4; else f=8;
    tiles.forEach(t=>{ if(t.value){ t.value=Math.max(1,Math.floor(t.value*f)); styleTile(t);} });
  }},
  { id:'ShuffleAll', weight:10, label:'Board shuffled', run:()=>{
    const list=[...tiles.values()];
    const empties=[];
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) empties.push([r,c]);
    shuffleArray(empties);
    for (let i=0;i<list.length;i++){
      const [r,c]=empties[i];
      grid[list[i].r][list[i].c]=0;
      list[i].r=r; list[i].c=c;
      grid[r][c]=list[i].id;
      positionTile(list[i]);
    }
  }},
  { id:'HalveAllAbove32', weight:15, label:'All tiles ≥32 halved', run:()=>{
    tiles.forEach(t=>{ if(t.value>=32){ t.value=Math.max(1,Math.floor(t.value/2)); styleTile(t);} });
  }},
  { id:'BlindFive', weight:10, label:'Blind mode for 5 moves', run:()=>{
    blindMode=true; blindModeMovesLeft=5; tiles.forEach(styleTile);
  }},
  { id:'DecayAll', weight:15, label:'All tiles halved', run:()=>{
    tiles.forEach(t=>{ t.value=Math.max(1,Math.floor(t.value/2)); styleTile(t); });
  }},
  { id:'PurgeRandomRow', weight:5, label:'One random row cleared', run:()=>{
    const row=(Math.random()*SIZE)|0;
    for (let c=0;c<SIZE;c++){
      const id=grid[row][c];
      if (id){
        const t=tiles.get(id);
        t.elem.remove();
        tiles.delete(id);
        grid[row][c]=0;
      }
    }
  }},
  { id:'StripMaxTiles', weight:10, label:'All max tiles reduced (halved)', run:()=>{
    const m=getMaxTile();
    tiles.forEach(t=>{ if(t.value===m){ t.value=Math.max(1,Math.floor(t.value/2)); styleTile(t);} });
  }},
  { id:'ResetHalfBoard', weight:10, label:'Half of non-zero tiles reset to 2', run:()=>{
    const list=[...tiles.values()];
    shuffleArray(list);
    const cut=Math.floor(list.length/2);
    for (let i=0;i<cut;i++){ list[i].value=2; styleTile(list[i]); }
  }}
];

// Event System
function showEvent(triggerValue){
  isEventActive=true;
  disableInput();
  overlayTitleEvent.textContent='Event!';
  overlayTextEvent.textContent=`Max tile ${triggerValue}. Choose your path.`;
  eventOptionsEl.innerHTML='';
  addEventOption('Chance','Mostly helpful (small risk).','chance',()=>{
    const isGood=Math.random()<CHANCE_GOOD_RATIO;
    const pool=isGood?chanceGoodEffects:chanceHindranceEffects;
    const chosen=pool[(Math.random()*pool.length)|0];
    chosen.run();
    closeEvent();
    afterEventRender();
    updateStatus(`Chance -> ${isGood?'Good':'Hindrance'}: ${chosen.label}`);
  });
  addEventOption('Fate','High risk gambling (heavier negatives).','fate',()=>{
    const chosen=weightedPick(fateEffects);
    chosen.run();
    closeEvent();
    afterEventRender();
    updateStatus(`Fate: ${chosen.label}`);
  });
  eventOverlay.style.display='flex';
  setTimeout(()=>{
    const first=eventOptionsEl.querySelector('.event-option');
    if(first) first.focus();
  },40);
}
function addEventOption(title,desc,cls,handler){
  const d=document.createElement('div');
  d.className=`event-option ${cls}`;
  d.innerHTML=`<strong>${title}</strong><div>${desc}</div>`;
  d.onclick=handler;
  eventOptionsEl.appendChild(d);
}
function weightedPick(list){
  const total=list.reduce((a,e)=>a+e.weight,0);
  let roll=Math.random()*total;
  for (const e of list){
    if (roll < e.weight) return e;
    roll -= e.weight;
  }
  return list[list.length-1];
}
function closeEvent(){
  isEventActive=false;
  eventOverlay.style.display='none';
  enableInput();
}
function afterEventRender(){
  tiles.forEach(styleTile);
  renderStatic();
}

// Helpers
function spawnCustom(r,c,val){
  if (grid[r][c]) return;
  const id=nextTileId++;
  grid[r][c]=id;
  const tile=createTile(id,val,r,c,true);
  tiles.set(id,tile);
}
function shuffleArray(a){
  for (let i=a.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0;
    [a[i],a[j]]=[a[j],a[i]];
  }
}

// Input
function keyHandler(e){
  if (gameOver || isEventActive) return;
  switch(e.key){
    case 'ArrowLeft': case 'a': move(0); break;
    case 'ArrowRight': case 'd': move(2); break;
    case 'ArrowUp': case 'w': move(3); break;
    case 'ArrowDown': case 's': move(1); break;
  }
}
let touchStartX=0,touchStartY=0,touchEndX=0,touchEndY=0;
function touchStartHandler(e){
  if (gameOver || isEventActive) return;
  if (e.touches.length===1){
    touchStartX=touchEndX=e.touches[0].clientX;
    touchStartY=touchEndY=e.touches[0].clientY;
  }
}
function touchMoveHandler(e){
  if (gameOver || isEventActive) return;
  if (e.touches.length===1){
    touchEndX=e.touches[0].clientX;
    touchEndY=e.touches[0].clientY;
  }
}
function touchEndHandler(){
  if (gameOver || isEventActive) return;
  const dx=touchEndX-touchStartX;
  const dy=touchEndY-touchStartY;
  if (Math.abs(dx)<30 && Math.abs(dy)<30) return;
  if (Math.abs(dx)>Math.abs(dy)){
    dx>0?move(2):move(0);
  } else {
    dy>0?move(1):move(3);
  }
}
function disableInput(){
  window.removeEventListener('keydown', keyHandler);
  window.removeEventListener('touchstart', touchStartHandler);
  window.removeEventListener('touchmove', touchMoveHandler);
  window.removeEventListener('touchend', touchEndHandler);
}
function enableInput(){
  window.addEventListener('keydown', keyHandler);
  window.addEventListener('touchstart', touchStartHandler,{passive:true});
  window.addEventListener('touchmove', touchMoveHandler,{passive:true});
  window.addEventListener('touchend', touchEndHandler,{passive:true});
}

// UI
function updateStatus(msg){
  if(!statusBar) return;
  statusBar.textContent='';
  const tag=document.createElement('span');
  tag.className='tag';
  tag.textContent='EVENT';
  if (msg.startsWith('Game')) tag.textContent='INFO';
  if (msg.startsWith('Blind')) tag.textContent='BLIND';
  if (msg.startsWith('Chance')) tag.textContent='CHANCE';
  if (msg.startsWith('Fate')) tag.textContent='FATE';
  statusBar.appendChild(tag);
  const txt=document.createElement('span');
  txt.textContent=' '+msg;
  statusBar.appendChild(txt);
  statusBar.classList.remove('flash');
  void statusBar.offsetWidth;
  statusBar.classList.add('flash');
}
function hideOverlays(){
  endgameOverlay.style.display='none';
  eventOverlay.style.display='none';
}

// Buttons
document.getElementById('btnRestart').addEventListener('click', ()=>init());
document.getElementById('btnRestart2').addEventListener('click', ()=>init());
document.getElementById('btnCloseEvent').addEventListener('click', ()=>closeEvent());

// Start
init();
