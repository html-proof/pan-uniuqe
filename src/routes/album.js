const { getAlbumDetails, mapAlbum } = require('../services/saavn');
const { getOrSetCache } = require('../services/cache');

async function routes(fastify, options) {
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;

        return await getOrSetCache(`album:${id}`, 3600, async () => {
            const data = await getAlbumDetails(id);
            if (data && data.success && data.data) {
                return mapAlbum(data.data);
            }
            return data;
        });
    });
}

module.exports = routes;
