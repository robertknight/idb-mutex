var m = new Mutex('thelock');

var lockStateEl = document.querySelector('#lockState');
var lockEl = document.querySelector('#lockBtn');
lockBtn.addEventListener('click', function () {
  lockStateEl.textContent = 'Locking...';
  m.lock().then(function () {
    lockStateEl.textContent = 'Got lock';
  }).catch(function (err) {
    lockStateEl.textContent = 'Error acquiring lock: ' + err.toString();
  });
});

var unlockEl = document.querySelector('#unlockBtn');
unlockEl.addEventListener('click', function () {
  lockStateEl.textContent = 'Unlocking...';
  m.unlock().then(function () {
    lockStateEl.textContent = 'Unlocked';
  }).catch(function (err) {
    lockStateEl.textContent = 'Error unlocking: ' + err.toString();
  });
});
