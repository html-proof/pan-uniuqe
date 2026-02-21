const { getSearch, getSearchSongs, getSearchAlbums, mapSong, mapAlbum } = require('../services/saavn');
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
                    albums: albumsData?.data?.results?.map(mapAlbum) || []
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

    fastify.get('/albums', async (request, reply) => {
        const { q, page = 1, limit = 20 } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        try {
            return await getOrSetCache(`search:albums:${q}:${page}:${limit}`, 300, async () => {
                const data = await getSearchAlbums(q, page, limit);
                if (data && data.data && data.data.results) {
                    return {
                        results: data.data.results.map(mapAlbum)
                    };
                }
                return data;
            });
        } catch (error) {
            console.error('Search Albums route error:', error.message);
            return { results: [] };
        }
    });

    fastify.get('/artists', async (request, reply) => {
        const { q, page = 1, limit = 10 } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        try {
            return await getOrSetCache(`search:artists:${q}:${page}:${limit}`, 300, async () => {
                const data = await getSearchArtists(q, page, limit);
                return data;
            });
        } catch (error) {
            console.error('Search Artists route error:', error.message);
            return { results: [] };
        }
    });

    fastify.get('/playlists', async (request, reply) => {
        const { q, page = 1, limit = 10 } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        try {
            return await getOrSetCache(`search:playlists:${q}:${page}:${limit}`, 300, async () => {
                const data = await getSearchPlaylists(q, page, limit);
                return data;
            });
        } catch (error) {
            console.error('Search Playlists route error:', error.message);
            return { results: [] };
        }
    });
}

module.exports = routes;
