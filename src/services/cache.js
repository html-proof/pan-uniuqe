const NodeCache = require('node-cache');
const { db } = require('../config/firebase');

// Standard TTL for cache
// Search: 10 mins, Songs: 6 hours, Artists: 24 hours
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
const pendingPromises = new Map();

// Helper to use cache directly
async function getOrSetCache(key, ttl, fetchFunction, useFirebase = false) {
    if (pendingPromises.has(key)) {
        return pendingPromises.get(key);
    }

    const promise = (async () => {
        const cachedData = cache.get(key);
        if (cachedData) {
            return cachedData;
        }

        if (useFirebase && db) {
            try {
                const sanitizedKey = key.replace(/[.$#\[\]\/]/g, '_');
                const ref = db.ref(`search_cache/${sanitizedKey}`);
                const snapshot = await ref.once('value');
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    if (data && data.expiresAt > Date.now() && data.payload) {
                        console.log(`[Cache DB HIT] Retrieved ${key} from Firebase RTDB`);
                        cache.set(key, data.payload, ttl);
                        return data.payload;
                    }
                }
            } catch (err) {
                console.error('[Cache DB Error] Failed to read from Firebase:', err.message);
            }
        }

        const freshData = await fetchFunction();
        // Don't cache empty results or errors
        if (freshData && !freshData._isFallback) {
            cache.set(key, freshData, ttl);

            if (useFirebase && db) {
                // Only cache in Firebase if there are valid results
                const hasResults = Array.isArray(freshData.results) ? freshData.results.length > 0 : true;
                if (hasResults) {
                    try {
                        const sanitizedKey = key.replace(/[.$#\[\]\/]/g, '_');
                        db.ref(`search_cache/${sanitizedKey}`).set({
                            payload: freshData,
                            expiresAt: Date.now() + (ttl * 1000)
                        }).catch(e => console.error('[Cache DB Write Error]', e.message));
                        console.log(`[Cache DB MISS] Stored ${key} into Firebase RTDB`);
                    } catch (err) {
                        console.error('[Cache DB Error] Failed to write to Firebase:', err.message);
                    }
                }
            }
        }

        return freshData;
    })();

    pendingPromises.set(key, promise);

    try {
        return await promise;
    } finally {
        pendingPromises.delete(key);
    }
}

module.exports = {
    cache,
    getOrSetCache
};
