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

// Start the server
const start = async () => {
    try {
        const port = process.env.PORT || 3000;
        // Listen on 0.0.0.0 for railway/docker
        await fastify.listen({ port, host: '0.0.0.0' });
        fastify.log.info(`Server listening on port ${port}`);

        // Start background workers
        require('./workers/updateWorker');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
