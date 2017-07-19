function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DEFAULT_EXPIRY = 10 * 1000;
const LOCK_OBJSTORE_NAME = 'mutexes';

/**
 * The struct written to IDB holding details of the lock's current owner.
 */
interface LockMeta {
  /** ID of the lock's owner. */
  owner: string;
  /** Timestamp in ms when the lock expires. */
  expiresAt: number;
}

export interface Options {
  /**
   * The delay in ms before a lock expires.
   *
   * This delay exists to ensure that locks held by tabs which have since been
   * closed or are frozen (eg. for performance reasons) do not prevent other
   * tabs from acquiring the lock.
   */
  expiry?: number;
}

/**
 * A mutex for coordinating cross-tab activities.
 */
export default class Mutex {
  private _db: Promise<IDBDatabase>;
  private _name: string;
  private _id: string;
  private _opts: Options;

  /**
   * Initialize the mutex.
   *
   * @param dbName - Name of the IndexedDB database to use.
   * @param name - Name of the mutex. Only one instance of a
   *   a mutex, across all documents using the same origin and `dbName`
   *   can hold a mutex with a given `name` at any time.
   */
  constructor(dbName: string, name: string, options?: Options) {
    // nb. The DB version is explicitly specified as otherwise IE 11 fails to
    // run the `onupgradeneeded` handler.
    const openReq = indexedDB.open(dbName, 1);

    this._db = new Promise((resolve, reject) => {
      openReq.onupgradeneeded = () => {
        const db = openReq.result;
        db.createObjectStore(LOCK_OBJSTORE_NAME);
      };
      openReq.onsuccess = () => resolve(openReq.result);
      openReq.onerror = () => reject(openReq.error);
    });

    // Generate a good-enough random identifier for this instance.
    this._id = Math.round(Math.random() * 10000).toString();

    this._name = name;

    this._opts = options || {};
  }

  /**
   * Acquire the lock.
   *
   * If no other instance currently holds the lock, the previous lock has expired
   * or the current instance already holds the lock, then this resolves
   * immediately.
   *
   * Otherwise `lock()` waits until the current lock owner releases the lock or
   * it expires.
   *
   * Returns a Promise that resolves when the lock has been acquired.
   */
  async lock() {
    // Spin until we get the lock.
    while (true) {
      if (await this._tryLock()) {
        break;
      }
      await delay(250);
    }
  }

  /**
   * Release the lock.
   *
   * Releases the lock, regardless of who currently owns it or whether it is
   * currently locked.
   */
  async unlock() {
    const db = await this._db;
    const tx = db.transaction(LOCK_OBJSTORE_NAME, 'readwrite');
    const store = tx.objectStore(LOCK_OBJSTORE_NAME);
    const unlockReq = store.put({ expiresAt: 0, owner: null }, this._name);

    return new Promise((resolve, reject) => {
      unlockReq.onsuccess = () => resolve();
      unlockReq.onerror = () => reject(unlockReq.error);
    });
  }

  private async _tryLock() {
    const db = await this._db;
    const tx = db.transaction(LOCK_OBJSTORE_NAME, 'readwrite');
    const store = tx.objectStore(LOCK_OBJSTORE_NAME);

    // We use the `onsuccess` and `onerror` callbacks rather than writing a
    // generic request Promise-ifying function because of issues with
    // transactions being auto-closed when actions within a transaction span
    // Promise callbacks.
    //
    // See https://github.com/jakearchibald/idb/blob/2c601b060dc184b9241f00b91af94ae966704ee2/README.md#transaction-lifetime
    return new Promise((resolve, reject) => {
      const lockMetaReq = store.get(this._name);
      lockMetaReq.onsuccess = () => {
        const lockMeta = lockMetaReq.result;
        if (!lockMeta || lockMeta.owner === this._id || lockMeta.expiresAt < Date.now()) {
          const newLockMeta = {
            owner: this._id,
            expiresAt: Date.now() + (this._opts.expiry || DEFAULT_EXPIRY),
          };
          const writeReq = store.put(newLockMeta, this._name);
          writeReq.onsuccess = () => resolve(true);
          writeReq.onerror = () => reject(writeReq.error);
        } else {
          resolve(false);
        }
      };
      lockMetaReq.onerror = () => reject(lockMetaReq.error);
    });
  }
}
