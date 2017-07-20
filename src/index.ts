function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const DEFAULT_EXPIRY = 10 * 1000;

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
   *
   * Defaults to DEFAULT_EXPIRY
   */
  expiry?: number;

  /**
   * The name of the object store in the database to use.
   *
   * If an existing database is passed to the constructor, that database must
   * have an object store of this name.
   *
   * Defaults to 'mutexes'.
   */
  objectStoreName?: string;

  /**
   * The amount of time to wait in ms between attempts to lock if the lock is
   * contended.
   *
   * Note that `lock()` does not spin at all if the lock is not currently held.
   *
   * Defaults to 50ms.
   */
  spinDelay?: number;
}

/**
 * A mutex for coordinating cross-tab activities.
 */
export default class Mutex {
  private _db: Promise<IDBDatabase>;
  private _objectStoreName: string;
  private _name: string;
  private _id: string;
  private _expiry: number;
  private _spinDelay: number;

  /**
   * Initialize the mutex.
   *
   * @param name - Name of the mutex.
   * @param db - Existing database to use. If null, an IndexedDB database named
   *   'idb-mutex' is created. If an existing database is provided it must have
   *   an object store name matching `options.objectStoreName`.
   * @param options
   */
  constructor(name: string, db?: Promise<IDBDatabase>|null, options?: Options) {
    // Generate a good-enough random identifier for this instance.
    this._id = Math.round(Math.random() * 10000).toString();

    this._objectStoreName = 'mutexes';
    if (options && options.objectStoreName) {
      this._objectStoreName = options.objectStoreName;
    }

    this._db = db || this._initDb(this._objectStoreName);
    this._name = name;
    this._expiry = (options && options.expiry) ? options.expiry : DEFAULT_EXPIRY;
    this._spinDelay = (options && options.spinDelay) ? options.spinDelay : 50;
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
      await delay(this._spinDelay);
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
    const tx = db.transaction(this._objectStoreName, 'readwrite');
    const store = tx.objectStore(this._objectStoreName);
    const unlockReq = store.put({ expiresAt: 0, owner: null }, this._name);

    return new Promise((resolve, reject) => {
      unlockReq.onsuccess = () => resolve();
      unlockReq.onerror = () => reject(unlockReq.error);
    });
  }

  private _initDb(objectStoreName: string) {
    // nb. The DB version is explicitly specified as otherwise IE 11 fails to
    // run the `onupgradeneeded` handler.
    return new Promise<IDBDatabase>((resolve, reject) => {
      const openReq = indexedDB.open('idb-mutex', 1);
      openReq.onupgradeneeded = () => {
        const db = openReq.result;
        db.createObjectStore(objectStoreName);
      };
      openReq.onsuccess = () => resolve(openReq.result);
      openReq.onerror = () => reject(openReq.error);
    });
  }

  private async _tryLock() {
    const db = await this._db;
    const tx = db.transaction(this._objectStoreName, 'readwrite');
    const store = tx.objectStore(this._objectStoreName);

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
            expiresAt: Date.now() + this._expiry,
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
