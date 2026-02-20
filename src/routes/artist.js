const { getArtistDetails } = require('../services/saavn');
const { getOrSetCache } = require('../services/cache');

async function routes(fastify, options) {
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;

        return await getOrSetCache(`artist:${id}`, 86400, async () => {
            const data = await getArtistDetails(id);
            return data;
        });
    });
}

module.exports = routes;
