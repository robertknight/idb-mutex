'use strict';

const { assert } = require('chai');
const sinon = require('sinon');

global.indexedDB = require('fake-indexeddb');
const Mutex = require('../dist').default;

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function createDatabase(dbName, storeName) {
  const dbReq = indexedDB.open(dbName, 1);
  dbReq.onupgradeneeded = () => {
    const db = dbReq.result;
    db.createObjectStore(storeName);
  };
  return promisifyRequest(dbReq);
}

describe('Mutex', () => {
  // Fake timers, if used by current test.
  let clock;

  afterEach(() => {
    if (clock) {
      clock.restore();
    }
  });

  describe('#lock', () => {
    it('locks immediately if uncontended', () => {
      const mu = new Mutex('foo');
      return mu.lock();
    });

    it('waits if the lock is contended', () => {
      const muA = new Mutex('bar');
      const muB = new Mutex('bar');

      var events = [];
      return muA.lock().then(() => {
        events.push('lock-a');

        setTimeout(() => {
          events.push('unlock-a');
          muA.unlock();
        }, 10);
        return muB.lock();
      }).then(() => {
        events.push('lock-b');

        assert.deepEqual(events, [
          'lock-a',
          'unlock-a',
          'lock-b',
        ]);
      });
    });

    it('locks when the previous lock expires', () => {
      var nativeSetInterval = setInterval;
      clock = sinon.useFakeTimers();

      const muA = new Mutex('baz');
      const muB = new Mutex('baz');

      // fake-indexeddb use timeouts internally.
      // Increment the fake clock regularly to fire those.
      const ticker  = nativeSetInterval(() => clock.tick(5), 5);

      return muA.lock().then(() => {
        clock.tick(10 * 1000);
        return muB.lock();
      }).then(() => {
        clock.restore();
        clearTimeout(ticker);
      });
    });

    it('locks immediately if already locked', () => {
      const mu = new Mutex('wibble');
      return mu.lock().then(() => {
        return mu.lock();
      });
    });
  });

  describe('#unlock', () => {
    it('unlocks a locked mutex', () => {
      const mu = new Mutex('unlock');
      return mu.lock().then(() => {
        return mu.unlock();
      }).then(() => {
        return mu.lock();
      }).then(() => {
        return mu.unlock();
      });
    });

    it('does nothing if the mutex is already unlocked', () => {
      const mu = new Mutex('unlock2');
      return mu.unlock();
    });
  });

  context('when an existing database is provided', () => {
    it('uses the existing database', () => {
      const db = createDatabase('newdb', 'locks');
      const mu = new Mutex('foo', db, { objectStoreName: 'locks' });
      return mu.lock().then(() => {
        return db;
      }).then(db => {
        // Read lock object from store and check that it was stored in the
        // expected place.
        const tx = db.transaction('locks');
        const store = tx.objectStore('locks');
        return promisifyRequest(store.get('foo'));
      }).then(lockInfo => {
        assert.isObject(lockInfo);
        assert.isString(lockInfo.owner);
        assert.isAbove(lockInfo.expiresAt, Date.now());
      });
    });
  });
});
