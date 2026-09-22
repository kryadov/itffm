/**
 * A tiny best-effort key/value cache over one IndexedDB object store — the glue
 * shared by every module that saves a network answer for next time: OSM
 * (`geo/cache.ts`), geocoding (`geo/geocodeCache.ts`) and terrain tiles
 * (`terrain/terrarium.ts`). Each of those owns its own database, so one place's
 * cache can never crowd out or corrupt another's.
 *
 * Every call swallows its own errors — caching is an optimisation, never a
 * dependency, so a private-browsing tab, a blocked IndexedDB or a full quota
 * just runs uncached instead of throwing and losing the place, the map data or
 * the terrain the player came here for.
 */
function openStore(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(storeName)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet<T>(dbName: string, storeName: string, key: string): Promise<T | undefined> {
  try {
    const db = await openStore(dbName, storeName)
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
        req.onsuccess = () => resolve(req.result as T | undefined)
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

export async function idbPut(dbName: string, storeName: string, key: string, value: unknown): Promise<void> {
  try {
    const db = await openStore(dbName, storeName)
    try {
      await new Promise<void>((resolve, reject) => {
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value, key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  } catch {
    /* best-effort */
  }
}

/** Every key currently in the store — used to size it up before deciding what
 *  to evict (see `terrain/terrarium.ts`'s tile cap). */
export async function idbKeys(dbName: string, storeName: string): Promise<string[]> {
  try {
    const db = await openStore(dbName, storeName)
    try {
      return await new Promise((resolve) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAllKeys()
        req.onsuccess = () => resolve(req.result.filter((k): k is string => typeof k === 'string'))
        req.onerror = () => resolve([])
      })
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

export async function idbDelete(dbName: string, storeName: string, key: string): Promise<void> {
  try {
    const db = await openStore(dbName, storeName)
    try {
      await new Promise<void>((resolve) => {
        const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
      })
    } finally {
      db.close()
    }
  } catch {
    /* best-effort */
  }
}
