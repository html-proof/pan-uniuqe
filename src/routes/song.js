const { getSongDetails, mapSong } = require('../services/saavn');
const { getOrSetCache } = require('../services/cache');

async function routes(fastify, options) {
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;
        const data = await getSongDetails(id);
        return mapSong(data?.data?.[0] || data);
    });

    fastify.post('/list', async (request, reply) => {
        const { ids } = request.body;
        if (!ids || !Array.isArray(ids)) {
            return reply.code(400).send({ error: 'IDs array is required' });
        }

        const { cache } = require('../services/cache');
        const { getSongsBulk } = require('../services/saavn');

        const songDetails = [];
        const missingIds = [];

        // 1. Check Cache
        for (const id of ids) {
            const cached = cache.get(`song:${id}`);
            if (cached) {
                // The cache holds the raw API response (the `{data: [...]}` object)
                const song = mapSong(cached?.data?.[0] || cached);
                if (song) songDetails.push(song);
            } else {
                missingIds.push(id);
            }
        }

        // 2. Fetch missing in bulk
        if (missingIds.length > 0) {
            try {
                // Ensure we don't exceed URL length limits by fetching max 50 at a time if needed, 
                // but for our app, lists are usually 10-20 long.
                const bulkData = await getSongsBulk(missingIds);

                for (const rawData of bulkData) {
                    // Cache the individual raw response so future single fetches hit cache
                    if (rawData && rawData.id) {
                        cache.set(`song:${rawData.id}`, rawData, 3600);
                        const song = mapSong(rawData);
                        if (song) songDetails.push(song);
                    }
                }
            } catch (error) {
                console.warn(`[SongList] Bulk fetch partially failed: ${error.message}`);
            }
        }

        return songDetails;
    });
}

module.exports = routes;
