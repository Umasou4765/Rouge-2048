/* Rogue-2048 (Endless + Rebalanced Chance/Fate + Animated Tiles) */

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
let grid = []; // 2D of tile objects or null
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
let tileIdSeq = 1;

// DOM
const gridEl = document.getElementById('grid');
const tilesLayer = document.getElementById('tilesLayer');
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

bestEl.textContent = best;

// Utilities
function safeParseInt(v,f=0){ const n=parseInt(v,10); return isNaN(n)?f:n; }
function getMaxTile(){
  let m=0;
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    const t=grid[r][c]; if (t && t.value>m) m=t.value;
  }
  return m;
}
function getMinNonZero(){
  let mn=Infinity;
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    const t=grid[r][c]; if (t && t.value>0 && t.value<mn) mn=t.value;
  }
  return mn===Infinity?0:mn;
}
function isPowerOfTwo(n){ return n>0 && (n & (n-1))===0; }

// Tile helpers
function makeTile(value){
  return { id: tileIdSeq++, value, justCreated:true, justMerged:false };
}

// Setup UI
function createGridUI(){
  gridEl.innerHTML='';
  for (let i=0;i<SIZE*SIZE;i++){
    const div=document.createElement('div');
    div.className='cell';
    gridEl.appendChild(div);
  }
}

function init(){
  grid = Array.from({length:SIZE},()=>Array(SIZE).fill(null));
  score=0; moves=0; gameOver=false; isEventActive=false;
  blindMode=false; blindModeMovesLeft=0;
  triggeredSet.clear(); triggeredHistory=[]; lastMaxValue=0;
  lastEventMove=-999; tileIdSeq=1;
  spawnRandom(); spawnRandom();
  hideOverlays();
  layoutTiles(true);
  enableInput();
  updateStatus('');
}

function spawnRandom(){
  const empties=[];
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if(!grid[r][c]) empties.push([r,c]);
  if(!empties.length) return false;
  const [r,c]=empties[(Math.random()*empties.length)|0];
  grid[r][c]=makeTile(Math.random()<0.9?2:4);
  return true;
}

// Movement
function move(dir){
  if (gameOver||isEventActive) return;
  const {moved, gained, mergedTiles, changedTiles}=performMove(dir);
  if(!moved) return;

  score+=gained;
  if(score>best){ best=score; localStorage.setItem(BEST_KEY,best); }

  if (blindModeMovesLeft>0){
    blindModeMovesLeft--;
    if (blindModeMovesLeft<=0){ blindMode=false; flashStatus('Blind ended.'); }
    else flashStatus(`Blind: ${blindModeMovesLeft} moves left.`);
  }

  spawnRandom();
  moves++;
  layoutTiles(false, mergedTiles, changedTiles);
  if (ENABLE_WIN_CHECK) checkWin();
  checkEnd();
  maybeTriggerEvent();
}

function performMove(dir){
  // directions: 0 left,1 down,2 right,3 up
  let moved=false, gained=0;
  const mergedTiles=[];
  const changedTiles=new Set();

  const vectors = {
    0:{dr:0,dc:1, startR:0,endR:SIZE,startC:0,endC:SIZE, stepR:1, stepC:1},
    2:{dr:0,dc:-1,startR:0,endR:SIZE,startC:SIZE-1,endC:-1,stepR:1, stepC:-1},
    3:{dr:1,dc:0, startR:0,endR:SIZE,startC:0,endC:SIZE, stepR:1, stepC:1},
    1:{dr:-1,dc:0,startR:SIZE-1,endR:-1,startC:0,endC:SIZE, stepR:-1, stepC:1}
  };
  const v=vectors[dir];

  function traverse(r,c){
    const tile = grid[r][c];
    if(!tile) return;
    let nr = r;
    let nc = c;
    while(true){
      const tr = nr + v.dr;
      const tc = nc + v.dc;
      if (tr<0||tr>=SIZE||tc<0||tc>=SIZE) break;
      const next = grid[tr][tc];
      if (next){
        if (next.value===tile.value && !next.mergedFrom && !tile.mergedFrom){
          // merge
          const newTile = makeTile(tile.value*2);
            newTile.justMerged=true;
            newTile.mergedFrom=[tile.id,next.id];
          grid[tr][tc]=newTile;
          grid[nr][nc]=null;
          gained+=newTile.value;
          mergedTiles.push(newTile.id);
          changedTiles.add(newTile.id);
          moved=true;
        }
        break;
      } else {
        nr = tr; nc = tc;
      }
    }
    if (nr!==r || nc!==c){
      grid[nr][nc]=tile;
      grid[r][c]=null;
      moved=true;
      changedTiles.add(tile.id);
    }
  }

  if (dir===0 || dir===2){
    for (let r=0;r<SIZE;r++){
      for (let c=v.startC; c!==v.endC; c+=v.stepC){
        traverse(r,c);
      }
    }
  } else {
    for (let c=0;c<SIZE;c++){
      for (let r=v.startR; r!==v.endR; r+=v.stepR){
        traverse(r,c);
      }
    }
  }
  return { moved, gained, mergedTiles, changedTiles };
}

// End / Win
function canMove(){
  for (let r=0;r<SIZE;r++){
    for (let c=0;c<SIZE;c++){
      const t=grid[r][c];
      if(!t) return true;
      if (r+1<SIZE && grid[r+1][c] && grid[r+1][c].value===t.value) return true;
      if (c+1<SIZE && grid[r][c+1] && grid[r][c+1].value===t.value) return true;
    }
  }
  return false;
}
function checkEnd(){
  if(!canMove()) endGame('Game Over', `You scored ${score} in ${moves} moves.`);
}
function checkWin(){
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    const t=grid[r][c];
    if (t && t.value===2048){
      endGame('You Win!', `Reached 2048 in ${moves} moves. Score: ${score}.`);
      return;
    }
  }
}
function endGame(title,text){
  if(gameOver) return;
  gameOver=true;
  disableInput();
  if(score>best){ best=score; localStorage.setItem(BEST_KEY,best); }
  overlayTitle.textContent=title;
  overlayText.textContent=`${text} (Best: ${best})`;
  endgameOverlay.style.display='flex';
}

// Rendering & Animation
function layoutTiles(initial=false, mergedIds=[], movedSet=new Set()){
  const existing = new Map();
  tilesLayer.querySelectorAll('.tile').forEach(el => {
    existing.set(+el.dataset.id, el);
  });

  const cellRects = [];
  const gridRect = tilesLayer.getBoundingClientRect();
  const bgCells = gridEl.children;
  for (let i=0;i<bgCells.length;i++){
    cellRects.push(bgCells[i].getBoundingClientRect());
  }

  function placeTile(tile,r,c){
    const rect = cellRects[r*SIZE + c];
    const x = rect.left - gridRect.left;
    const y = rect.top - gridRect.top;
    let el = existing.get(tile.id);
    const isNew = !!tile.justCreated;
    if (!el){
      el = document.createElement('div');
      el.className='tile';
      el.dataset.id=tile.id;
      tilesLayer.appendChild(el);
    }
    const v = tile.value;
    el.textContent = blindMode ? '?' : v;
    el.className='tile';
    if (!blindMode){
      if (v<=MAX_STATIC_CLASS){
        el.classList.add(`t-${v}`);
      } else {
        const hue = (Math.log2(v)*37)%360;
        el.style.background=`hsl(${hue} 65% 50%)`;
      }
    } else {
      el.classList.add('t-2');
    }
    if (v>=1024) el.classList.add('small-font');
    if (v>=16384) el.classList.add('tiny-font');

    el.style.setProperty('--x', x+'px');
    el.style.setProperty('--y', y+'px');

    if (isNew){
      el.classList.add('new');
      tile.justCreated=false;
    }
    if (tile.justMerged){
      el.classList.add('merged');
      tile.justMerged=false;
    } else if (movedSet.has(tile.id)){
      el.classList.add('bump');
      setTimeout(()=>el.classList.remove('bump'),420);
    }
  }

  for (let r=0;r<SIZE;r++){
    for (let c=0;c<SIZE;c++){
      const t=grid[r][c];
      if (t) placeTile(t,r,c);
    }
  }

  // Remove tiles that were merged away
  existing.forEach((el,id)=>{
    if (!findTileById(id)){
      el.style.transition='transform 110ms ease, opacity 110ms';
      el.style.opacity='0';
      setTimeout(()=> el.remove(), 120);
    }
  });

  scoreEl.textContent=score;
  bestEl.textContent=best;
}

function findTileById(id){
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    const t=grid[r][c];
    if (t && t.id===id) return t;
  }
  return null;
}

// Event Trigger Policy
function eventShouldTrigger(maxTile){
  if (maxTile<8) return false;
  if (EVENT_FOR_POWERS_ONLY && !isPowerOfTwo(maxTile)) return false;
  switch (EVENT_TRIGGER_MODE){
    case 'eachMax':
    case 'powerOfTwo':
      if (EVENT_TRIGGER_MODE==='powerOfTwo' && !isPowerOfTwo(maxTile)) return false;
      if (triggeredSet.has(maxTile)) return false;
      triggeredSet.add(maxTile); return true;
    case 'multipleOf8':
      if (maxTile%8!==0) return false;
      if (triggeredSet.has(maxTile)) return false;
      triggeredSet.add(maxTile); return true;
    case 'everyIncrement':
      if (maxTile>lastMaxValue){ lastMaxValue=maxTile; triggeredHistory.push(maxTile); return true; }
      return false;
    default: return false;
  }
}
function maybeTriggerEvent(){
  if (isEventActive) return;
  if (moves - lastEventMove < EVENT_COOLDOWN) return;
  const maxTile = getMaxTile();
  if (!eventShouldTrigger(maxTile)) return;
  if (Math.random()>EVENT_PROBABILITY) return;
  lastEventMove=moves;
  showEvent(maxTile);
}

// Effects (Chance & Fate)
const chanceGoodEffects = [
  {
    id:'AddMaxTile', label:'Add one tile equal to current max',
    run: () => {
      const empties = collectEmpties();
      if(!empties.length) return;
      const [r,c] = empties[(Math.random()*empties.length)|0];
      grid[r][c]=makeTile(getMaxTile());
    }
  },
  {
    id:'DoubleRandomSmallRank', label:'All tiles of a random small rank (2/4/8) doubled',
    run: () => {
      const ranks=[2,4,8].filter(v=>hasValue(v));
      if(!ranks.length) return;
      const chosen=ranks[(Math.random()*ranks.length)|0];
      iterateTiles((t,r,c)=>{ if (t.value===chosen){ t.value*=2; t.justMerged=true; }});
    }
  },
  {
    id:'SpawnPair48', label:'Spawn two tiles (4 or 8)',
    run: () => {
      for(let i=0;i<2;i++){
        const empties=collectEmpties();
        if(!empties.length) return;
        const [r,c]=empties[(Math.random()*empties.length)|0];
        grid[r][c]=makeTile(Math.random()<0.5?4:8);
      }
    }
  },
  {
    id:'UpgradeLowestThree', label:'Lowest up to three tiles doubled',
    run: () => {
      const tiles=[];
      iterateTiles((t,r,c)=>tiles.push(t));
      tiles.sort((a,b)=>a.value-b.value);
      tiles.slice(0,3).forEach(t=>{ t.value*=2; t.justMerged=true; });
    }
  }
];
const chanceHindranceEffects = [
  {
    id:'HalveSingleMax', label:'One max tile halved',
    run: () => {
      const m=getMaxTile();
      const coords=[];
      for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
        const t=grid[r][c]; if(t && t.value===m) coords.push(t);
      }
      if(!coords.length) return;
      const t=coords[(Math.random()*coords.length)|0];
      t.value=Math.max(1,Math.floor(t.value/2)); t.justMerged=true;
    }
  }
];

const fateEffects=[
  { id:'AllBecomeMax', weight:5, label:'All tiles become current max',
    run:()=>{ const m=getMaxTile(); iterateTiles(t=>{ t.value=m; t.justMerged=true; }); } },
  { id:'SpawnHighTile', weight:5, label:'Spawn a high tile (max*2)',
    run:()=>{ const m=getMaxTile(); const val=Math.min(m*2,8192);
      const empties=collectEmpties();
      if(empties.length){ const [r,c]=empties[(Math.random()*empties.length)|0]; grid[r][c]=makeTile(val);}
      else {
        const all=[]; for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) all.push([r,c]);
        const [r,c]=all[(Math.random()*all.length)|0]; grid[r][c]=makeTile(val);
      }}},
  { id:'RandomFactorGlobal', weight:15, label:'Random global factor (×0.5 / ×2 / ×4 / ×8)',
    run:()=>{ const roll=Math.random(); let f;
      if(roll<0.60) f=0.5; else if(roll<0.85) f=2; else if(roll<0.97) f=4; else f=8;
      iterateTiles(t=>{ t.value=Math.max(1,Math.floor(t.value*f)); t.justMerged=true; }); } },
  { id:'ShuffleAll', weight:10, label:'Board shuffled',
    run:()=>{ const flat=[]; iterateTiles(t=>flat.push(t)); shuffleArray(flat);
      let i=0; for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){ grid[r][c]= flat[i++] || null; } } },
  { id:'HalveAllAbove32', weight:15, label:'All tiles ≥32 halved',
    run:()=>{ iterateTiles(t=>{ if(t.value>=32){ t.value=Math.max(1,Math.floor(t.value/2)); t.justMerged=true; } }); } },
  { id:'BlindFive', weight:10, label:'Blind mode for 5 moves',
    run:()=>{ blindMode=true; blindModeMovesLeft=5; } },
  { id:'DecayAll', weight:15, label:'All tiles halved',
    run:()=>{ iterateTiles(t=>{ t.value=Math.max(1,Math.floor(t.value/2)); t.justMerged=true; }); } },
  { id:'PurgeRandomRow', weight:5, label:'One random row cleared',
    run:()=>{ const r=(Math.random()*SIZE)|0; for(let c=0;c<SIZE;c++) grid[r][c]=null; } },
  { id:'StripMaxTiles', weight:10, label:'All max tiles reduced (halved)',
    run:()=>{ const m=getMaxTile(); iterateTiles(t=>{ if(t.value===m){ t.value=Math.max(1,Math.floor(t.value/2)); t.justMerged=true; } }); } },
  { id:'ResetHalfBoard', weight:10, label:'Half of non-zero tiles reset to 2',
    run:()=>{ const tiles=[]; iterateTiles(t=>tiles.push(t)); shuffleArray(tiles);
      const cut=Math.floor(tiles.length/2);
      for(let i=0;i<cut;i++){ tiles[i].value=2; tiles[i].justMerged=true; } } },
];

// Event System
function showEvent(triggerValue){
  isEventActive=true;
  disableInput();
  overlayTitleEvent.textContent='Event!';
  overlayTextEvent.textContent=`Max tile ${triggerValue}. Choose your path.`;
  eventOptionsEl.innerHTML='';

  addEventOption('Chance','Mostly helpful (small risk).','chance',()=>{
    const isGood = Math.random()<CHANCE_GOOD_RATIO;
    const pool = isGood? chanceGoodEffects : chanceHindranceEffects;
    const chosen = pool[(Math.random()*pool.length)|0];
    chosen.run();
    closeEvent();
    layoutTiles(false);
    flashStatus(`Chance -> ${isGood?'Good':'Hindrance'}: ${chosen.label}`);
  });

  addEventOption('Fate','High risk gambling (heavier negatives).','fate',()=>{
    const chosen=weightedPick(fateEffects);
    chosen.run();
    closeEvent();
    layoutTiles(false);
    flashStatus(`Fate: ${chosen.label}`);
  });

  eventOverlay.style.display='flex';
  setTimeout(()=>{
    const first=eventOptionsEl.querySelector('.event-option');
    if(first) first.focus();
  },30);
}

function addEventOption(title, desc, cls, handler){
  const div=document.createElement('div');
  div.className=`event-option ${cls}`;
  div.innerHTML=`<strong>${title}</strong><div>${desc}</div>`;
  div.onclick=handler;
  eventOptionsEl.appendChild(div);
}

function weightedPick(list){
  const total=list.reduce((a,e)=>a+e.weight,0);
  let roll=Math.random()*total;
  for (const e of list){
    if (roll<e.weight) return e;
    roll-=e.weight;
  }
  return list[list.length-1];
}

function closeEvent(){
  isEventActive=false;
  eventOverlay.style.display='none';
  enableInput();
  layoutTiles(false);
}

// Helpers
function iterateTiles(fn){
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const t=grid[r][c]; if(t) fn(t,r,c);
  }
}
function collectEmpties(){
  const out=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(!grid[r][c]) out.push([r,c]);
  return out;
}
function shuffleArray(a){
  for(let i=a.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0;
    [a[i],a[j]]=[a[j],a[i]];
  }
}
function hasValue(v){
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    const t=grid[r][c]; if(t && t.value===v) return true;
  }
  return false;
}

// Input
function keyHandler(e){
  if(gameOver||isEventActive) return;
  switch(e.key){
    case'ArrowLeft':case'a': move(0); break;
    case'ArrowRight':case'd': move(2); break;
    case'ArrowUp':case'w': move(3); break;
    case'ArrowDown':case's': move(1); break;
  }
}
let touchStartX=0,touchStartY=0,touchEndX=0,touchEndY=0;
function touchStartHandler(e){
  if(gameOver||isEventActive) return;
  if(e.touches.length===1){
    touchStartX=touchEndX=e.touches[0].clientX;
    touchStartY=touchEndY=e.touches[0].clientY;
  }
}
function touchMoveHandler(e){
  if(gameOver||isEventActive) return;
  if(e.touches.length===1){
    touchEndX=e.touches[0].clientX;
    touchEndY=e.touches[0].clientY;
  }
}
function touchEndHandler(){
  if(gameOver||isEventActive) return;
  const dx=touchEndX-touchStartX;
  const dy=touchEndY-touchStartY;
  if(Math.abs(dx)<30 && Math.abs(dy)<30) return;
  if(Math.abs(dx)>Math.abs(dy)) dx>0?move(2):move(0);
  else dy>0?move(1):move(3);
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
function hideOverlays(){
  endgameOverlay.style.display='none';
  eventOverlay.style.display='none';
}
function updateStatus(msg){
  if(statusBar){
    statusBar.textContent=msg;
  }
}
function flashStatus(msg){
  if(!statusBar) return;
  statusBar.textContent=msg;
  statusBar.classList.remove('flash');
  void statusBar.offsetWidth; // reflow
  statusBar.classList.add('flash');
}

// Buttons
document.getElementById('btnRestart').addEventListener('click',()=>init());
document.getElementById('btnRestart2').addEventListener('click',()=>init());
document.getElementById('btnCloseEvent').addEventListener('click',()=>closeEvent());

// Start
createGridUI();
init();