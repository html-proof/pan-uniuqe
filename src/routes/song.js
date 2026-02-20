const { getSongDetails } = require('../services/saavn');
const { getOrSetCache } = require('../services/cache');

async function routes(fastify, options) {
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;

        return await getOrSetCache(`song:${id}`, 3600, async () => {
            const data = await getSongDetails(id);
            return data;
        });
    });
}

module.exports = routes;
