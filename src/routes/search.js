const { getSearch, getSearchSongs } = require('../services/saavn');
const { getOrSetCache } = require('../services/cache');

// Helper to filter required fields
const mapSong = (song) => {
    // Extract all useful qualities (96, 160, 320) so the client can optimize data usage
    let streams = { low: '', medium: '', high: '' };

    if (song.downloadUrl && Array.isArray(song.downloadUrl)) {
        const q96 = song.downloadUrl.find(u => u.quality === '96kbps' || u.quality === '96');
        const q160 = song.downloadUrl.find(u => u.quality === '160kbps' || u.quality === '160');
        const q320 = song.downloadUrl.find(u => u.quality === '320kbps' || u.quality === '320');

        if (q96) streams.low = q96.url;
        if (q160) streams.medium = q160.url;
        if (q320) streams.high = q320.url;

        // Fallback if named qualities not found
        if (!streams.high && song.downloadUrl.length > 0) streams.high = song.downloadUrl[0].url;
    } else {
        streams.high = song.downloadUrl || song.url;
    }

    return {
        id: song.id,
        name: song.name || song.title,
        artist: song.primaryArtists || song.artists,
        album: song.album?.name || song.album,
        image: song.image,
        duration: song.duration,
        language: song.language,
        streams
    };
};

async function routes(fastify, options) {
    fastify.get('/', async (request, reply) => {
        const { q } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        return await getOrSetCache(`search:all:${q}`, 300, async () => {
            const data = await getSearch(q);
            return data; // Return full search results structure for /search
        });
    });

    fastify.get('/songs', async (request, reply) => {
        const { q } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        return await getOrSetCache(`search:songs:${q}`, 300, async () => {
            const data = await getSearchSongs(q);
            if (data && data.data && data.data.results) {
                return {
                    results: data.data.results.map(mapSong)
                };
            }
            return data;
        });
    });

    // Similarly, endpoints for albums, artists, playlists can be added here
}

module.exports = routes;
