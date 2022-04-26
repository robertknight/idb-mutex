**Update 2022-04-26: The functionality provided by this library has been superceded by the native [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). This library may be useful in older browsers. See also [this issue](https://github.com/w3c/web-locks/issues/50) for Web Locks API polyfill discussions.**

----

# idb-mutex

A mutex for coordinating activities across browser tabs, implemented using IndexedDB ([browser support](http://caniuse.com/#feat=indexeddb)).

## Introduction

JavaScript does not have threads, but instances of an application in different
browser tabs can still perform actions concurrently. In some cases, you may want
to prevent multiple tabs from performing an action at the same time.

This library provides a mutex backed by the transactional guarantees of the
IndexedDB API.

## Usage

```
npm install idb-mutex
```

```js
import Mutex from 'idb-mutex'

// Create a mutex, specifying the name of the lock.
//
// Only one tab will be able to lock a mutex with a given name at any time.
const mu = new Mutex('mylock');

mu.lock().then(() => {
  // This code will only be executed by one browser tab at a time.

  // ...

  // Release the lock when done.
  return mu.unlock();
}).catch(err => {
  // Handle failure to acquire lock.
  console.error(err);
});
```

## API

See [the type definitions](https://unpkg.com/idb-mutex/dist/index.d.ts) for full
details of the API of the module.

Using arguments to the `Mutex` constructor, you can customize:

 - Which IndexedDB database and object store within that database is used. By
   default a database named 'idb-mutex' with a single object store named
   'mutexes' is created automatically.

 - The time before locks acquired with `lock()` automatically expire. Automatic
   expiration prevents frozen or closed browser tabs from holding locks
   indefinitely.

 - How long `Mutex#lock` waits between attempts to lock if the lock is
   contended.

## Implementation

There are a number of other libraries that provide similar locks. However, they
generally use
[Local Storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

In modern multi-process browsers [such as
Chrome](https://groups.google.com/a/chromium.org/forum/#!topic/chromium-dev/O7cTL4oC_VE)
writes to local storage have implementation-defined behavior with respect to
when they become visible to other processes (ie. browser tabs). IndexedDB on the
other hand provides clearer transactional semantics which can be used to
implement an atomic compare-and-exchange operation that forms the basis of a
mutex.
