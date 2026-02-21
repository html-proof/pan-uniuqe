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
        // Don't cache errors 
        if (freshData && !freshData._isFallback) {
            cache.set(key, freshData, ttl);

            if (useFirebase && db) {
                // Determine if we have actual items or Empty Arrays
                const hasResults = Array.isArray(freshData.results) ? freshData.results.length > 0
                    : (Array.isArray(freshData.songs) && Array.isArray(freshData.albums)) ? (freshData.songs.length > 0 || freshData.albums.length > 0)
                        : true;

                // The user explicitly requested to save empty results to Firebase too
                // to prevent hammering Saavn for known dead queries
                // determine the raw search query (removing the "search:all:" prefixes)
                const queryParts = key.split(':');
                const rawQuery = queryParts.length >= 3 ? queryParts[2] : key;
                const sanitizedQuery = rawQuery.replace(/[.$#\[\]\/]/g, '_');

                try {
                    const sanitizedKey = key.replace(/[.$#\[\]\/]/g, '_');
                    db.ref(`search_cache/${sanitizedKey}`).set({
                        payload: freshData,
                        expiresAt: Date.now() + (ttl * 1000),
                        hasResults: hasResults
                    }).catch(e => console.error('[Cache DB Write Error]', e.message));
                    console.log(`[Cache DB MISS] Stored ${key} into Firebase RTDB (hasResults: ${hasResults})`);

                    // If no results, track this missing query for the admin
                    if (!hasResults && key.startsWith('search:all:')) {
                        const missingRef = db.ref(`missing_searches/${sanitizedQuery}`);
                        missingRef.once('value').then(snap => {
                            let count = 1;
                            if (snap.exists()) {
                                count = (snap.val().count || 0) + 1;
                            }
                            missingRef.set({
                                query: rawQuery,
                                count: count,
                                lastRequested: Date.now(),
                                adminAttention: count >= 2
                            });
                        }).catch(e => console.error('[Missing DB Write Error]', e.message));
                    }
                } catch (err) {
                    console.error('[Cache DB Error] Failed to write to Firebase:', err.message);
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
