# idb-mutex

A mutex for coordinating activities across browser tabs, implemented using
IndexedDB.

This library requires a browser that [supports
IndexedDB](http://caniuse.com/#feat=indexeddb) and either native Promise support
or a polyfill.

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

// Create a mutex, specifying the name of the backing IndexedDB database to use,
// and the name of the lock.
// Only one tab will be able to lock a mutex with a given database name
// and mutex name at any time.
const mu = new Mutex('myapp', 'mylock');

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
