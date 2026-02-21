const { getSearch, getSearchSongs, getSearchAlbums, mapSong } = require('../services/saavn');
const { getOrSetCache } = require('../services/cache');

async function routes(fastify, options) {
    fastify.get('/', async (request, reply) => {
        const { q, page = 1, limit = 20 } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        try {
            return await getOrSetCache(`search:all:${q}:${page}:${limit}`, 300, async () => {
                const [songsData, albumsData] = await Promise.all([
                    getSearchSongs(q, page, limit),
                    getSearchAlbums(q, page, limit)
                ]);

                return {
                    songs: songsData?.data?.results?.map(mapSong) || [],
                    albums: albumsData?.data?.results?.map(album => ({
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
