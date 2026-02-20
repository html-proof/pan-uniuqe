const NodeCache = require('node-cache');

// Standard TTL for cache
// Search: 5 mins, Songs: 1 hour, Artists: 24 hours
const cache = new NodeCache({ stdTTL: 300, checkperiod: 120 });

// Helper to use cache directly
async function getOrSetCache(key, ttl, fetchFunction) {
    const cachedData = cache.get(key);
    if (cachedData) {
        return cachedData;
    }

    const freshData = await fetchFunction();
    // Don't cache empty results or errors
    if (freshData) {
        cache.set(key, freshData, ttl);
    }

    return freshData;
}

module.exports = {
    cache,
    getOrSetCache
};
