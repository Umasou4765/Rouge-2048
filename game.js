const SIZE = 4;
const BEST_KEY = 'rogue2048_best_roguelike';
let grid = [];
let score = 0;
let best = parseInt(localStorage.getItem(BEST_KEY) || '0');
let moves = 0;
let gameOver = false;
let isEventActive = false;
let triggeredMultiples = new Set();
let blindMode = false;
let blindModeMovesLeft = 0;
let lastEventMove = -999;
const EVENT_COOLDOWN = 2; // min moves between events (tunable)
const EVENT_FOR_POWERS_ONLY = false;

const gridEl = document.getElementById('grid');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const endgameOverlay = document.getElementById('endgameOverlay');
const eventOverlay = document.getElementById('eventOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const overlayTitleEvent = document.getElementById('overlayTitleEvent');
const overlayTextEvent = document.getElementById('overlayTextEvent');
const eventOptionsEl = document.getElementById('eventOptions');

bestEl.textContent = best;

function createGridUI() {
  gridEl.innerHTML = '';
  for (let i=0;i<SIZE*SIZE;i++){
    const div = document.createElement('div');
    div.className = 'cell';
    div.setAttribute('role','gridcell');
    gridEl.appendChild(div);
  }
}

function init() {
  grid = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  score = 0; moves = 0; gameOver = false; isEventActive = false;
  triggeredMultiples.clear();
  blindMode = false; blindModeMovesLeft = 0;
  spawnRandom(); spawnRandom();
  render();
  hideOverlays();
  enableInput();
}

function spawnRandom() {
  const empties = [];
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]===0) empties.push([r,c]);
  if (!empties.length) return false;
  const [r,c] = empties[Math.random()*empties.length|0];
  grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

function cloneGrid(g){ return g.map(row => row.slice()); }

function moveLeftProcess(g) {
  let moved = false, gained = 0;
  const mergedPositions = [];
  const ng = g.map((row,rIdx) => {
    const filtered = row.filter(v => v!==0);
    const newRow = [];
    for (let i=0;i<filtered.length;i++){
      if (i+1 < filtered.length && filtered[i] === filtered[i+1]) {
        const merged = filtered[i]*2;
        newRow.push(merged);
        mergedPositions.push({ row: rIdx, col: newRow.length-1 });
        gained += merged;
        i++;
      } else {
        newRow.push(filtered[i]);
      }
    }
    while (newRow.length < SIZE) newRow.push(0);
    return newRow;
  });
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (ng[r][c] !== g[r][c]) moved = true;
  return { newGrid: ng, moved, gained, mergedPositions };
}

function transpose(g){
  const ng = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) ng[r][c] = g[c][r];
  return ng;
}
const reverseRows = g => g.map(row => row.slice().reverse());

function move(dir){
  if (gameOver || isEventActive) return;
  let g = cloneGrid(grid);
  let result;
  switch(dir){
    case 0: result = moveLeftProcess(g); g = result.newGrid; break;
    case 3: g = transpose(g); result = moveLeftProcess(g); g = transpose(result.newGrid); break;
    case 2: g = reverseRows(g); result = moveLeftProcess(g); g = reverseRows(result.newGrid); break;
    case 1: g = transpose(g); g = reverseRows(g); result = moveLeftProcess(g);
            g = reverseRows(result.newGrid); g = transpose(g); break;
  }
  if (!result || !result.moved) return;

  grid = g.map(r => r.slice());
  score += result.gained;
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, best);
  }

  if (blindModeMovesLeft > 0) {
    blindModeMovesLeft--;
    if (blindModeMovesLeft <= 0) blindMode = false;
  }

  spawnRandom();
  moves++;
  render(result.mergedPositions);
  checkWin();
  checkEnd();
  maybeTriggerEvent();
}

function canMove(){
  for (let r=0;r<SIZE;r++){
    for (let c=0;c<SIZE;c++){
      const v = grid[r][c];
      if (v===0) return true;
      if (r+1 < SIZE && grid[r+1][c] === v) return true;
      if (c+1 < SIZE && grid[r][c+1] === v) return true;
    }
  }
  return false;
}

function checkEnd(){
  if (!canMove()) {
    endGame('Game Over', `You scored ${score} points in ${moves} moves.`);
  }
}

function checkWin(){
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) {
    if (grid[r][c] === 2048) {
      endGame('You Win!', `Reached 2048 in ${moves} moves. Score: ${score}.`);
      return;
    }
  }
}

function endGame(title,text){
  if (gameOver) return;
  gameOver = true;
  disableInput();
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY,best);
  }
  overlayTitle.textContent = title;
  overlayText.textContent = `${text} (Best: ${best})`;
  endgameOverlay.style.display = 'flex';
}

function render(mergedPositions = []){
  const cells = gridEl.querySelectorAll('.cell');
  let maxV = 0, minV = Infinity;
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    const v = grid[r][c];
    if (v !== 0){
      if (v > maxV) maxV = v;
      if (v < minV) minV = v;
    }
  }
  if (minV === Infinity) minV = 0;

  cells.forEach((cell,i) => {
    const r = (i / SIZE) | 0;
    const c = i % SIZE;
    const v = grid[r][c];
    cell.className = 'cell';
    cell.style.background = '';
    cell.style.color = '';
    if (v===0){
      cell.textContent = '';
      return;
    }
    if (blindMode) {
      cell.textContent = '?';
      cell.classList.add('t-large');
    } else {
      cell.textContent = v;
      const className = `t-${v}`;
      cell.classList.add(className);
      if (v >= 1024) cell.classList.add('t-large');
      // Fallback dynamic coloring if class not defined:
      if (!document.querySelector(`.${className}`) || !cell.classList.contains(className)) {
        const hue = (Math.log2(v) * 37) % 360;
        cell.style.background = `hsl(${hue} 65% 55%)`;
        cell.style.color = '#fff';
      }
    }
  });

  // Add merged animation
  mergedPositions.forEach(mp => {
    const idx = mp.row * SIZE + mp.col;
    const cell = cells[idx];
    if (cell) {
      cell.classList.add('merged');
      setTimeout(() => cell.classList.remove('merged'), 180);
    }
  });

  scoreEl.textContent = score;
  bestEl.textContent = best;
}

function maybeTriggerEvent(){
  if (isEventActive) return;
  if (moves - lastEventMove < EVENT_COOLDOWN) return;

  // compute current max tile
  let maxTile = 0;
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c] > maxTile) maxTile = grid[r][c];

  if (maxTile < 8) return;
  if (EVENT_FOR_POWERS_ONLY && (maxTile & (maxTile - 1)) !== 0) return;

  // Only trigger once per exact max value
  if (triggeredMultiples.has(maxTile)) return;

  // Probability gate (example 70%)
  if (Math.random() > 0.70) return;

  triggeredMultiples.add(maxTile);
  lastEventMove = moves;
  showEvent(maxTile);
}

/* ===== Event System (simplified reuse of your original with additions) ===== */
function showEvent(triggerValue){
  isEventActive = true;
  disableInput();
  overlayTitleEvent.textContent = 'Event!';
  overlayTextEvent.textContent = `Max tile ${triggerValue}. Choose one:`;
  eventOptionsEl.innerHTML = '';

  // Helpers
  const getMax = () => Math.max(...grid.flat());
  const getMinNonZero = () => {
    let min = Infinity;
    for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
      const v = grid[r][c];
      if (v!==0 && v < min) min = v;
    }
    return min === Infinity ? 0 : min;
  };

  const goodEvents = [
    {
      text: 'Add a tile equal to current max',
      action: () => {
        const empties = [];
        for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]===0) empties.push([r,c]);
        if (empties.length){
          const [r,c] = empties[Math.random()*empties.length|0];
            grid[r][c] = getMax();
        }
      }
    },
    {
      text: 'Double all tiles of a random small rank (2/4/8)',
      action: () => {
        const picks = [2,4,8];
        const chosen = picks[Math.random()*picks.length|0];
        for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]===chosen) grid[r][c]*=2;
      }
    }
  ];

  const badEvents = [
    {
      text: 'Halve the maximum tile',
      action: () => {
        const m = getMax();
        for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++)
          if (grid[r][c]===m) grid[r][c] = Math.max(1, Math.floor(grid[r][c]/2));
      }
    },
    {
      text: 'Halve all 4/8/16 tiles',
      action: () => {
        const set = new Set([4,8,16]);
        for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (set.has(grid[r][c])) grid[r][c] = Math.max(1,Math.floor(grid[r][c]/2));
      }
    }
  ];

  const chaosEvents = [
    {
      text: 'Shuffle everything',
      action: () => {
        const flat = grid.flat();
        for (let i=flat.length-1;i>0;i--){
          const j = (Math.random()*(i+1))|0;
          [flat[i],flat[j]] = [flat[j],flat[i]];
        }
        for (let i=0;i<flat.length;i++){
          grid[(i/SIZE)|0][i%SIZE] = flat[i];
        }
      }
    },
    {
      text: 'Blind mode for 5 moves',
      action: () => {
        blindMode = true;
        blindModeMovesLeft = 5;
      }
    },
    {
      text: 'All tiles become the maximum tile',
      action: () => {
        const m = getMax();
        for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) grid[r][c] = m;
      }
    },
    {
      text: 'All tiles become the smallest nonzero tile',
      action: () => {
        const mn = getMinNonZero();
        for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]!==0) grid[r][c] = mn;
      }
    },
    {
      text: 'Spawn a 2048 (or replace random)',
      action: () => {
        const empties = [];
        for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]===0) empties.push([r,c]);
        if (empties.length){
          const [r,c] = empties[Math.random()*empties.length|0];
          grid[r][c] = 2048;
        } else {
          const all = [];
          for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) all.push([r,c]);
          const [r,c] = all[Math.random()*all.length|0];
          grid[r][c] = 2048;
        }
      }
    },
    {
      text: 'Random factor (×0.5 / ×2 / ×4)',
      action: () => {
        const factors = [0.5,2,4];
        const f = factors[Math.random()*factors.length|0];
        for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
          if (grid[r][c]!==0) grid[r][c] = Math.max(1, Math.floor(grid[r][c]*f));
        }
      }
    },
    {
      text: 'Nothing happens',
      action: () => {}
    }
  ];

  const good = goodEvents[Math.random()*goodEvents.length|0];
  const bad = badEvents[Math.random()*badEvents.length|0];

  function addOption(label, obj){
    const div = document.createElement('div');
    div.className = 'event-option';
    div.innerHTML = `<strong>${label}</strong><br>${obj.text}`;
    div.onclick = () => {
      obj.action();
      closeEvent();
    };
    eventOptionsEl.appendChild(div);
  }

  addOption('Good', good);
  addOption('Bad', bad);
  chaosEvents.forEach((ev,i)=> addOption('Chaos '+(i+1), ev));

  eventOverlay.style.display = 'flex';
  // Focus management
  setTimeout(() => {
    const first = eventOptionsEl.querySelector('.event-option');
    if (first) first.tabIndex = 0, first.focus();
  }, 10);
}

function closeEvent(){
  isEventActive = false;
  eventOverlay.style.display = 'none';
  enableInput();
  render();
}

function hideOverlays(){
  endgameOverlay.style.display = 'none';
  eventOverlay.style.display = 'none';
}

function keyHandler(e){
  if (gameOver || isEventActive) return;
  switch(e.key){
    case 'ArrowLeft':
    case 'a': move(0); break;
    case 'ArrowDown':
    case 's': move(1); break;
    case 'ArrowRight':
    case 'd': move(2); break;
    case 'ArrowUp':
    case 'w': move(3); break;
  }
}

let touchStartX=0,touchStartY=0,touchEndX=0,touchEndY=0;
function touchStartHandler(e){
  if (gameOver || isEventActive) return;
  if (e.touches.length === 1){
    touchStartX = touchEndX = e.touches[0].clientX;
    touchStartY = touchEndY = e.touches[0].clientY;
  }
}
function touchMoveHandler(e){
  if (gameOver || isEventActive) return;
  if (e.touches.length === 1){
    touchEndX = e.touches[0].clientX;
    touchEndY = e.touches[0].clientY;
  }
}
function touchEndHandler(){
  if (gameOver || isEventActive) return;
  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;
  if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    dx > 0 ? move(2) : move(0);
  } else {
    dy > 0 ? move(1) : move(3);
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
  window.addEventListener('touchstart', touchStartHandler, { passive: true });
  window.addEventListener('touchmove', touchMoveHandler, { passive: true });
  window.addEventListener('touchend', touchEndHandler, { passive: true });
}

// Buttons
document.getElementById('btnRestart').addEventListener('click', () => { init(); endgameOverlay.style.display='none'; });
document.getElementById('btnRestart2').addEventListener('click', () => { init(); endgameOverlay.style.display='none'; });
document.getElementById('btnCloseEvent').addEventListener('click', () => { closeEvent(); });

// Start
createGridUI();
init();