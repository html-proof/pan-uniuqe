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

        const songDetails = [];
        for (const id of ids) {
            try {
                const data = await getSongDetails(id);
                if (data) {
                    const song = mapSong(data?.data?.[0] || data);
                    if (song) songDetails.push(song);
                }
            } catch (error) {
                console.warn(`[SongList] Soft-failing fetch for song ${id}: ${error.message}`);
                // Continue to the next song instead of crashing the whole batch
            }
        }

        return songDetails.filter(s => s !== null);
    });
}

module.exports = routes;
