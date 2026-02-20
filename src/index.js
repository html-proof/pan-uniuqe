const fastify = require('fastify')({ logger: true });
require('dotenv').config();

// Register plugins
fastify.register(require('@fastify/cors'), {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});
fastify.register(require('@fastify/rate-limit'), {
    max: 20, // maximum of 20 requests per IP
    timeWindow: 1000 // per 1 second
});
fastify.register(require('@fastify/compress'), { global: true });

// Basic health check route
fastify.get('/', async (request, reply) => {
    return { status: 'ok', message: 'Music Backend is running' };
});

// Import and register routes
fastify.register(require('./routes/auth'), { prefix: '/auth' });
fastify.register(require('./routes/search'), { prefix: '/search' });
fastify.register(require('./routes/song'), { prefix: '/song' });
fastify.register(require('./routes/artist'), { prefix: '/artist' });
fastify.register(require('./routes/activity'), { prefix: '/activity' });
fastify.register(require('./routes/recommendations'), { prefix: '/recommendations' });
fastify.register(require('./routes/onboarding'), { prefix: '/onboarding' });
fastify.register(require('./routes/album'), { prefix: '/album' });

// Array of popular charts to pre-cache periodically
const popularQueries = [
    'arijit singh',
    'anirudh ravichander',
    'shreya ghoshal',
    'ar rahman',
    'animal',
    'jawan',
    'leo',
    'sid sriram'
];

// Pre-bake the cache for fallback trending IDs and popular charts
const preloadCache = async () => {
    try {
        const { getSongsBulk, getSearch } = require('./services/saavn');
        const { cache } = require('./services/cache');
        const defaultFallbackIds = ['fBGE4hKU', 'e4i4TdLr', 'wFRQqJeJ', 'u2D2mHdO', 'oqbXmtgZ', 'nXKbc8rl', '4tpEcBbk'];

        fastify.log.info('Preloading core trending songs into cache...');
        const bulkData = await getSongsBulk(defaultFallbackIds);

        if (bulkData && Array.isArray(bulkData)) {
            let loaded = 0;
            for (const song of bulkData) {
                if (song && song.id) {
                    // Set an ultra-long cache TTL for fallback data (24 hours) to shield the 429 limit
                    cache.set(`song:${song.id}`, song, 86400);
                    loaded++;
                }
            }
            fastify.log.info(`Preloaded ${loaded} essential songs into cache. Home Screen shielded.`);
        }

        fastify.log.info('Preloading popular search categories...');
        for (const query of popularQueries) {
            await getSearch(query, 1, 10);
            fastify.log.info(`Cached category: ${query}`);
            // Small delay to be polite
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

    } catch (e) {
        fastify.log.warn(`Failed to preload cache: ${e.message}`);
    }
};

// Start the server
const start = async () => {
    try {
        const port = process.env.PORT || 3000;
        await fastify.listen({ port, host: '0.0.0.0' });
        fastify.log.info(`Server listening on port ${port}`);

        // Start background workers
        require('./workers/updateWorker');

        // Prime the cache on boot
        setTimeout(preloadCache, 2000);

        // Re-prime the cache every 4 hours automatically to maintain instant search for Top Charts
        setInterval(preloadCache, 4 * 60 * 60 * 1000);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
