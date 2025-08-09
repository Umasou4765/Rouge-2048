/* Rogue-2048 */

const SIZE = 4;
const BEST_KEY = 'rogue2048_best_roguelike';
const STATE_KEY = 'rogue2048_state_roguelike';

const EVENT_PROBABILITY = 1.0;
const EVENT_TRIGGER_MODE = 'eachMax';
const EVENT_COOLDOWN = 2;
const MAX_STATIC_CLASS = 2048;
const EVENT_FOR_POWERS_ONLY = false;

const CHANCE_GOOD_RATIO = 0.8;
const CHEAT_HOLD_MS = 10000; 

let tiles = [];
let nextTileId = 1;
let grid = [];
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

const gridEl = document.getElementById('grid');
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

let tilesLayer;
let bgCells = [];
let cellPositions = null;

let cheatTimerId = null;
let cheatActive = false;

function safeParseInt(v,f=0){ const n=parseInt(v,10); return isNaN(n)?f:n; }
function debounce(fn, ms) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
}

function createGridUI(){
  gridEl.innerHTML = '';
  for (let i=0;i<SIZE*SIZE;i++){
    const bg = document.createElement('div');
    bg.className = 'bg-cell';
    gridEl.appendChild(bg);
  }
  bgCells = Array.from(gridEl.querySelectorAll('.bg-cell'));
  tilesLayer = document.createElement('div');
  tilesLayer.className = 'tiles';
  gridEl.appendChild(tilesLayer);
  computeCellPositions();
  window.addEventListener('resize', debounce(()=>{ computeCellPositions(); render(); },120));
}

function computeCellPositions(){
  cellPositions = [];
  const rectParent = gridEl.getBoundingClientRect();
  bgCells.forEach((cell,i)=>{
    const r = (i/SIZE)|0;
    const c = i%SIZE;
    const rct = cell.getBoundingClientRect();
    cellPositions[r] = cellPositions[r] || [];
    cellPositions[r][c] = {
      x: rct.left - rectParent.left,
      y: rct.top - rectParent.top,
      w: rct.width,
      h: rct.height
    };
  });
}

function init(){
  const savedState = localStorage.getItem(STATE_KEY);
  if (savedState) {
    const state = JSON.parse(savedState);
    tiles = state.tiles;
    nextTileId = state.nextTileId;
    score = state.score;
    moves = state.moves;
    isEventActive = state.isEventActive;
    blindMode = state.blindMode;
    blindModeMovesLeft = state.blindModeMovesLeft;
    lastEventMove = state.lastEventMove;
    triggeredHistory = state.triggeredHistory;
    triggeredSet = new Set(state.triggeredSet);
    lastMaxValue = state.lastMaxValue;
    gameOver = false;
    updateStatus('Game loaded.');
  } else {
    tiles = [];
    nextTileId = 1;
    score = 0; moves = 0;
    gameOver = false;
    isEventActive = false;
    blindMode = false; blindModeMovesLeft = 0;
    triggeredSet.clear();
    triggeredHistory = [];
    lastMaxValue = 0;
    lastEventMove = -999;
    spawnRandom(); spawnRandom();
    updateStatus('New game started.');
  }
  syncGrid();
  hideOverlays();
  enableInput();
  render(true);
}

function saveState(){
  const state = {
    tiles: tiles,
    nextTileId: nextTileId,
    score: score,
    moves: moves,
    isEventActive: isEventActive,
    blindMode: blindMode,
    blindModeMovesLeft: blindModeMovesLeft,
    lastEventMove: lastEventMove,
    triggeredHistory: triggeredHistory,
    triggeredSet: Array.from(triggeredSet),
    lastMaxValue: lastMaxValue,
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function spawnRandom(){
  const empties = collectEmpties();
  if (!empties.length) return false;
  const [r,c] = empties[(Math.random()*empties.length)|0];
  tiles.push({
    id: nextTileId++,
    value: Math.random()<0.9?2:4,
    row: r,
    col: c,
    prevRow: r,
    prevCol: c,
    new: true,
    merged: false,
    removed: false
  });
  return true;
}

function syncGrid(){
  grid = Array.from({length:SIZE},()=>Array(SIZE).fill(0));
  tiles.forEach(t=>{ if(!t.removed) grid[t.row][t.col] = t.value; });
}

function getMaxTile(){
  let m=0; tiles.forEach(t=>{ if(!t.removed && t.value>m) m=t.value; }); return m;
}

function collectEmpties(){
  const occ = Array.from({length:SIZE},()=>Array(SIZE).fill(false));
  tiles.forEach(t=>{ if(!t.removed) occ[t.row][t.col]=true; });
  const out=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(!occ[r][c]) out.push([r,c]);
  return out;
}
function collectAll(){
  const out=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) out.push([r,c]);
  return out;
}
function iterateTiles(fn){
  tiles.forEach(t=>{ if(!t.removed) fn(t); });
}

function move(dir){
  if (gameOver || isEventActive) return;
  let moved=false;

  tiles.forEach(t=>{
    t.prevRow = t.row;
    t.prevCol = t.col;
    t.merged = false;
  });

  const lines = SIZE;
  if (dir===0 || dir===2){
    for (let r=0;r<lines;r++){
      const lineTiles = tiles.filter(t=>!t.removed && t.row===r)
        .sort((a,b)=> dir===0 ? a.col - b.col : b.col - a.col);
      processLine(lineTiles, dir, r);
    }
  } else {
    for (let c=0;c<lines;c++){
      const lineTiles = tiles.filter(t=>!t.removed && t.col===c)
        .sort((a,b)=> dir===3 ? a.row - b.row : b.row - a.row);
      processLine(lineTiles, dir, c);
    }
  }

  function processLine(lineTiles, dir, index){
    let result = [];
    lineTiles.forEach(tile=>{
      if (tile.removed) return;
      if (result.length){
        const last = result[result.length-1];
        if (last.value === tile.value && !last.merged){
          last.value *= 2;
          last.merged = true;
            tile.removed = true;
          score += last.value;
          if (tile.prevRow!==last.row || tile.prevCol!==last.col) moved = true;
          return;
        }
      }
      result.push(tile);
    });

    result.forEach((tile,i)=>{
      let targetRow = tile.row;
      let targetCol = tile.col;
      if (dir===0){ targetRow = index; targetCol = i; }
      if (dir===2){ targetRow = index; targetCol = SIZE-1 - i; }
      if (dir===3){ targetCol = index; targetRow = i; }
      if (dir===1){ targetCol = index; targetRow = SIZE-1 - i; }
      if (tile.row!==targetRow || tile.col!==targetCol){
        tile.row = targetRow;
        tile.col = targetCol;
        moved = true;
      }
    });
  }

  const before = tiles.length;
  tiles = tiles.filter(t=>!t.removed);
  if (tiles.length !== before) moved = true;

  if (!moved) {
    tiles.forEach(t=>{ t.new=false; t.merged=false; });
    return;
  }

  if (score > best){
    best = score;
    localStorage.setItem(BEST_KEY, best);
  }

  if (blindModeMovesLeft > 0){
    blindModeMovesLeft--;
    if (blindModeMovesLeft <= 0){
      blindMode = false;
      updateStatus('Blind ended.');
    } else {
      updateStatus(`Blind: ${blindModeMovesLeft} moves left.`);
    }
  }

  spawnRandom();
  moves++;
  syncGrid();
  render();
  checkEnd();
  maybeTriggerEvent();
  saveState();
}

function canMove(){
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const v = grid[r][c];
      if (v===0) return true;
      if (r+1<SIZE && grid[r+1][c]===v) return true;
      if (c+1<SIZE && grid[r][c+1]===v) return true;
    }
  }
  return false;
}

function checkEnd(){
  if (!canMove()){
    endGame('Game Over', `You scored ${score} in ${moves} moves.`);
  }
}

function endGame(title,text){
  if (gameOver) return;
  gameOver = true;
  disableInput();
  if (score > best){
    best = score;
    localStorage.setItem(BEST_KEY, best);
  }
  overlayTitle.textContent = title;
  overlayText.textContent = `${text} (Best: ${best})`;
  endgameOverlay.style.display = 'flex';
  localStorage.removeItem(STATE_KEY);
}

function render(){
  if (!cellPositions) computeCellPositions();
  const existing = new Map();
  tilesLayer.querySelectorAll('.tile').forEach(el=>{
    existing.set(+el.dataset.id, el);
  });

  tiles.forEach(tile=>{
    const pos = cellPositions[tile.row][tile.col];
    const prevPos = cellPositions[tile.prevRow][tile.prevCol];
    let el = existing.get(tile.id);
    const wasNew = tile.new;
    const wasMerged = tile.merged;

    if (!el){
      el = document.createElement('div');
      el.className = 'tile';
      el.dataset.id = tile.id;
      tilesLayer.appendChild(el);
      el.style.setProperty('--x', prevPos.x+'px');
      el.style.setProperty('--y', prevPos.y+'px');
      void el.offsetWidth;
    }

    el.textContent = blindMode ? '?' : tile.value;
    el.className = 'tile';
    if (!blindMode){
      if (tile.value <= MAX_STATIC_CLASS){
        el.classList.add(`t-${tile.value}`);
        if (tile.value >= 1024) el.classList.add('t-large');
      } else {
        const hue = (Math.log2(tile.value)*37)%360;
        el.style.background = `hsl(${hue} 65% 50%)`;
        el.style.color='#fff';
        el.classList.add('t-large');
      }
    } else {
      el.classList.add('t-large');
      el.style.background = '#455a64';
    }

    if (wasNew) el.classList.add('tile-new');
    if (wasMerged) el.classList.add('tile-merged');

    el.style.setProperty('--x', pos.x+'px');
    el.style.setProperty('--y', pos.y+'px');

    tile.new = false;
    tile.merged = false;
    existing.delete(tile.id);
  });

  existing.forEach((el)=> el.remove());

  scoreEl.textContent = score;
  bestEl.textContent = best;
}

function eventShouldTrigger(maxTile){
  if (maxTile < 8) return false;
  if (EVENT_FOR_POWERS_ONLY && (maxTile & (maxTile-1))!==0) return false;
  switch (EVENT_TRIGGER_MODE){
    case 'eachMax':
    case 'powerOfTwo':
      if (EVENT_TRIGGER_MODE==='powerOfTwo' && (maxTile & (maxTile-1))!==0) return false;
      if (triggeredSet.has(maxTile)) return false;
      triggeredSet.add(maxTile); return true;
    case 'multipleOf8':
      if (maxTile%8!==0) return false;
      if (triggeredSet.has(maxTile)) return false;
      triggeredSet.add(maxTile); return true;
    case 'everyIncrement':
      if (maxTile>lastMaxValue){
        triggeredHistory.push(maxTile);
        lastMaxValue = maxTile;
        return true;
      }
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
  lastEventMove = moves;
  showEvent(maxTile);
}

const chanceGoodEffects = [
  {
    id:'AddMaxTile',
    label:'Add one tile equal to current max',
    run:()=>{
      const empties = collectEmpties();
      if (!empties.length) return;
      const [r,c] = empties[(Math.random()*empties.length)|0];
      tiles.push({id:nextTileId++,value:getMaxTile(),row:r,col:c,prevRow:r,prevCol:c,new:true,merged:false,removed:false});
      syncGrid();
    }
  },
  {
    id:'DoubleRandomSmallRank',
    label:'All tiles of a random small rank (2/4/8) doubled',
    run:()=>{
      const ranks = [2,4,8].filter(v=>tiles.some(t=>!t.removed && t.value===v));
      if (!ranks.length) return;
      const chosen = ranks[(Math.random()*ranks.length)|0];
      tiles.forEach(t=>{ if(!t.removed && t.value===chosen){ t.value*=2; t.merged=true; } });
      syncGrid();
    }
  },
  {
    id:'SpawnPair48',
    label:'Spawn two tiles (4 or 8)',
    run:()=>{
      for(let i=0;i<2;i++){
        const empties = collectEmpties();
        if(!empties.length) break;
        const [r,c] = empties[(Math.random()*empties.length)|0];
        tiles.push({id:nextTileId++,value:Math.random()<0.5?4:8,row:r,col:c,prevRow:r,prevCol:c,new:true,merged:false,removed:false});
      }
      syncGrid();
    }
  },
  {
    id:'UpgradeLowestThree',
    label:'Lowest up to three tiles doubled',
    run:()=>{
      const list = tiles.filter(t=>!t.removed).map(t=>t).sort((a,b)=>a.value-b.value).slice(0,3);
      list.forEach(t=>{ t.value*=2; t.merged=true; });
      syncGrid();
    }
  }
];

const chanceHindranceEffects = [
  {
    id:'HalveSingleMax',
    label:'One max tile halved',
    run:()=>{
      const m = getMaxTile();
      const arr = tiles.filter(t=>!t.removed && t.value===m);
      if (!arr.length) return;
      const t = arr[(Math.random()*arr.length)|0];
      t.value = Math.max(2, Math.floor(t.value/2));
      syncGrid();
    }
  }
];

const fateEffects = [
  {
    id:'AllBecomeMax', weight:5,
    label:'All tiles become current max',
    run:()=>{
      const m = getMaxTile();
      tiles.forEach(t=>{ if(!t.removed) t.value=m; });
      syncGrid();
    }
  },
  {
    id:'SpawnHighTile', weight:5,
    label:'Spawn a high tile (max*2)',
    run:()=>{
      const m = getMaxTile();
      const val = Math.min(m*2, 8192);
      const empties = collectEmpties();
      if (empties.length){
        const [r,c] = empties[(Math.random()*empties.length)|0];
        tiles.push({id:nextTileId++,value:val,row:r,col:c,prevRow:r,prevCol:c,new:true,merged:false,removed:false});
      } else {
        const all = collectAll();
        const [r,c] = all[(Math.random()*all.length)|0];
        tiles.push({id:nextTileId++,value:val,row:r,col:c,prevRow:r,prevCol:c,new:true,merged:false,removed:false});
      }
      syncGrid();
    }
  },
  {
    id:'RandomFactorGlobal', weight:15,
    label:'Random global factor (×0.5 / ×2 / ×4 / ×8)',
    run:()=>{
      const roll=Math.random(); let factor;
      if (roll<0.60) factor=0.5;
      else if (roll<0.85) factor=2;
      else if (roll<0.97) factor=4;
      else factor=8;
      tiles.forEach(t=>{ if(!t.removed) t.value=Math.max(2,Math.floor(t.value*factor)); });
      syncGrid();
    }
  },
  {
    id:'ShuffleAll', weight:10,
    label:'Board shuffled',
    run:()=>{
      const positions = collectAll();
      shuffleArray(positions);
      tiles.forEach((t,i)=>{
        const [r,c] = positions[i];
        t.prevRow=t.row; t.prevCol=t.col;
        t.row=r; t.col=c;
      });
      syncGrid();
    }
  },
  {
    id:'HalveAllAbove32', weight:15,
    label:'All tiles ≥32 halved',
    run:()=>{
      tiles.forEach(t=>{ if(!t.removed && t.value>=32) t.value=Math.max(2,Math.floor(t.value/2)); });
      syncGrid();
    }
  },
  {
    id:'BlindFive', weight:10,
    label:'Blind mode for 5 moves',
    run:()=>{
      blindMode=true; blindModeMovesLeft=5;
    }
  },
  {
    id:'DecayAll', weight:15,
    label:'All tiles halved',
    run:()=>{
      tiles.forEach(t=>{ if(!t.removed) t.value=Math.max(2,Math.floor(t.value/2)); });
      syncGrid();
    }
  },
  {
    id:'PurgeRandomRow', weight:5,
    label:'One random row cleared',
    run:()=>{
      const row = (Math.random()*SIZE)|0;
      tiles.forEach(t=>{ if(!t.removed && t.row===row){ t.removed=true; } });
      tiles = tiles.filter(t=>!t.removed);
      syncGrid();
    }
  },
  {
    id:'StripMaxTiles', weight:10,
    label:'All max tiles reduced (halved)',
    run:()=>{
      const m = getMaxTile();
      tiles.forEach(t=>{ if(!t.removed && t.value===m) t.value=Math.max(2,Math.floor(t.value/2)); });
      syncGrid();
    }
  },
  {
    id:'ResetHalfBoard', weight:10,
    label:'Half of non-zero tiles reset to 2',
    run:()=>{
      const list = tiles.filter(t=>!t.removed);
      shuffleArray(list);
      const cut = Math.floor(list.length/2);
      for(let i=0;i<cut;i++) list[i].value=2;
      syncGrid();
    }
  }
];

function showEvent(triggerValue){
  isEventActive = true;
  disableInput();
  overlayTitleEvent.textContent='Event!';
  overlayTextEvent.textContent=`Max tile ${triggerValue}. Choose your path.`;
  eventOptionsEl.innerHTML='';

  addEventOption('Chance','Mostly helpful (small risk).','chance',()=>{
    const isGood = Math.random()<CHANCE_GOOD_RATIO;
    const pool = isGood ? chanceGoodEffects : chanceHindranceEffects;
    const chosen = pool[(Math.random()*pool.length)|0];
    chosen.run();
    closeEvent();
    render();
    updateStatus(`Chance -> ${isGood?'Good':'Hindrance'}: ${chosen.label}`);
  });

  addEventOption('Fate','High risk gambling (heavier negatives).','fate',()=>{
    const chosen = weightedPick(fateEffects);
    chosen.run();
    closeEvent();
    render();
    updateStatus(`Fate: ${chosen.label}${blindMode?' (Blind)':''}`);
  });

  eventOverlay.style.display='flex';
  setTimeout(()=>{
    const first=eventOptionsEl.querySelector('.event-option');
    if(first) first.focus();
  },20);
}

function addEventOption(title,desc,cls,handler){
  const div=document.createElement('div');
  div.className=`event-option ${cls}`;
  div.innerHTML=`<strong>${title}</strong><div>${desc}</div>`;
  div.onclick=handler;
  eventOptionsEl.appendChild(div);
}

function weightedPick(list){
  const total = list.reduce((a,e)=>a+e.weight,0);
  let roll = Math.random()*total;
  for(const e of list){
    if (roll < e.weight) return e;
    roll -= e.weight;
  }
  return list[list.length-1];
}

function closeEvent(){
  isEventActive=false;
  eventOverlay.style.display='none';
  enableInput();
  render();
}

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
  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;
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

function hideOverlays(){
  endgameOverlay.style.display='none';
  eventOverlay.style.display='none';
}
function updateStatus(msg){
  if (statusBar){
    statusBar.textContent = msg;
    if (/Fate/.test(msg)) statusBar.style.color='#b71c1c';
    else if (/Chance/.test(msg)) statusBar.style.color='#0d47a1';
    else statusBar.style.color='#0d47a1';
  }
}

function shuffleArray(a){
  for(let i=a.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0;
    [a[i],a[j]]=[a[j],a[i]];
  }
}


function startCheatHold(){
  if (!gameOver) return;
  if (cheatTimerId) clearTimeout(cheatTimerId);
  cheatActive = true;
  cheatTimerId = setTimeout(()=>{
    if (cheatActive && gameOver){
      cheatContinueGame();
    }
  }, CHEAT_HOLD_MS);
  overlayTitle.classList.add('holding');
}
function cancelCheatHold(){
  cheatActive = false;
  if (cheatTimerId){
    clearTimeout(cheatTimerId);
    cheatTimerId = null;
  }
  overlayTitle.classList.remove('holding');
}
function cheatContinueGame(){
  rearrangeTopTwoRowsSorted();
  gameOver = false;
  endgameOverlay.style.display='none';
  enableInput();
  saveState();
  updateStatus('Cheat activated: continued.');
  render();
}

function rearrangeTopTwoRowsSorted(){
 
  let list = tiles.filter(t=>!t.removed);

  list.sort((a,b)=>b.value - a.value);

  const keep = list.slice(0, 8);
  const remove = list.slice(8);
  remove.forEach(t=> t.removed = true);


  tiles.forEach(t=>{
    if(!t.removed && (t.row===2 || t.row===3)) {
  
    }
  });

  // 5. 重新给前 8 个（或少于 8 个）分配位置：行 0-1，列 0-3
  keep.forEach((t,i)=>{
    const newRow = Math.floor(i/4);
    const newCol = i%4;
    t.prevRow = t.row;
    t.prevCol = t.col;
    t.row = newRow;
    t.col = newCol;
    t.new = true;
  });

  tiles = tiles.filter(t=>!t.removed);

  syncGrid();
}

overlayTitle.addEventListener('pointerdown', startCheatHold);
overlayTitle.addEventListener('pointerup', cancelCheatHold);
overlayTitle.addEventListener('pointerleave', cancelCheatHold);
overlayTitle.addEventListener('pointercancel', cancelCheatHold);

document.getElementById('btnRestart').addEventListener('click',()=>{
  localStorage.removeItem(STATE_KEY);
  init();
});
document.getElementById('btnRestart2').addEventListener('click',()=>{
  localStorage.removeItem(STATE_KEY);
  init();
});
document.getElementById('btnCloseEvent').addEventListener('click',()=>closeEvent());

document.addEventListener('DOMContentLoaded', ()=>{
  createGridUI();
  init();
});
