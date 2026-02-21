const { getSearch, getSearchSongs, mapSong } = require('../services/saavn');
const { getOrSetCache } = require('../services/cache');

async function routes(fastify, options) {
    fastify.get('/', async (request, reply) => {
        const { q, page = 1, limit = 20 } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        try {
            return await getOrSetCache(`search:all:${q}:${page}:${limit}`, 300, async () => {
                const data = await getSearch(q, page, limit);
                const results = data?.data || data;

                return {
                    songs: results?.songs?.results?.map(mapSong) || [],
                    albums: results?.albums?.results?.map(album => ({
                        id: album.id,
                        name: album.title,
                        artist: album.artist,
                        image: album.image?.find(i => i.quality === '150x150')?.url || album.image?.[0]?.url || '',
                        type: 'album'
                    })) || []
                };
            });
        } catch (error) {
            console.error('Search All route error:', error.message);
            return { songs: [], albums: [] };
        }
    });

    fastify.get('/songs', async (request, reply) => {
        const { q, page = 1, limit = 20 } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        try {
            return await getOrSetCache(`search:songs:${q}:${page}:${limit}`, 300, async () => {
                const data = await getSearchSongs(q, page, limit);
                if (data && data.data && data.data.results) {
                    return {
                        results: data.data.results.map(mapSong)
                    };
                }
                return data;
            });
        } catch (error) {
            console.error('Search Songs route error:', error.message);
            return { results: [] };
        }
    });

    // Similarly, endpoints for albums, artists, playlists can be added here
}

module.exports = routes;
