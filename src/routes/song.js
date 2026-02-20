const { getSongDetails, mapSong } = require('../services/saavn');
const { getOrSetCache } = require('../services/cache');

async function routes(fastify, options) {
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;

        return await getOrSetCache(`song:${id}`, 3600, async () => {
            const data = await getSongDetails(id);
            return mapSong(data?.data?.[0] || data);
        });
    });

    fastify.post('/list', async (request, reply) => {
        const { ids } = request.body;
        if (!ids || !Array.isArray(ids)) {
            return reply.code(400).send({ error: 'IDs array is required' });
        }

        const songDetails = await Promise.all(
            ids.map(id =>
                getOrSetCache(`song:${id}`, 3600, async () => {
                    const data = await getSongDetails(id);
                    return mapSong(data?.data?.[0] || data);
                })
            )
        );

        return songDetails.filter(s => s !== null);
    });
}

module.exports = routes;
