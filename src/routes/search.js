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

    // Force data-saver 150x150 images directly instead of sending arrays
    let imageUrl = '';
    if (song.image && Array.isArray(song.image)) {
        const quality150 = song.image.find(i => i.quality === '150x150') || song.image[0];
        imageUrl = quality150.url || quality150;
    } else if (song.image && typeof song.image === 'string') {
        imageUrl = song.image.replace('500x500', '150x150');
    }

    return {
        id: song.id,
        name: song.name || song.title,
        artist: song.primaryArtists || song.artists,
        album: song.album?.name || song.album,
        image: imageUrl,
        duration: song.duration,
        language: song.language,
        streams
    };
};

async function routes(fastify, options) {
    fastify.get('/', async (request, reply) => {
        const { q, page = 1, limit = 10 } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        return await getOrSetCache(`search:all:${q}:${page}:${limit}`, 300, async () => {
            const data = await getSearch(q, page, limit);
            return data;
        });
    });

    fastify.get('/songs', async (request, reply) => {
        const { q, page = 1, limit = 10 } = request.query;
        if (!q) return reply.code(400).send({ error: 'Query is required' });

        return await getOrSetCache(`search:songs:${q}:${page}:${limit}`, 300, async () => {
            const data = await getSearchSongs(q, page, limit);
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
