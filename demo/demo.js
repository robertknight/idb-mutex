const m = new Mutex('testapp', 'thelock');

const lockStateEl = document.querySelector('#lockState');
const lockEl = document.querySelector('#lockBtn');
lockBtn.addEventListener('click', () => {
  lockStateEl.textContent = 'Locking...';
  m.lock().then(() => {
    lockStateEl.textContent = 'Got lock';
  }).catch(err => {
    lockStateEl.textContent = `Error acquiring lock: ${err.toString()}`;
  });
});

const unlockEl = document.querySelector('#unlockBtn');
unlockEl.addEventListener('click', () => {
  lockStateEl.textContent = 'Unlocking...';
  m.unlock().then(() => {
    lockStateEl.textContent = 'Unlocked';
  }).catch(err => {
    lockStateEl.textContent = `Error unlocking: ${err.toString()}`;
  });
});
