const fastify = require('fastify')({ logger: true });
require('dotenv').config();

// Register plugins
fastify.register(require('@fastify/cors'), {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
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

// Pre-bake the cache for fallback trending IDs so Home Screen never suffers 429
const preloadCache = async () => {
    try {
        const { getSongsBulk } = require('./services/saavn');
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

        // Prime the cache
        setTimeout(preloadCache, 2000);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
