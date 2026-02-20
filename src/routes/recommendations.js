const { db } = require('../config/firebase');

async function routes(fastify, options) {
    fastify.get('/:userId', async (request, reply) => {
        const { userId } = request.params;

        if (!db) {
            return reply.status(503).send({ error: 'Database unavailable' });
        }

        const userRef = db.ref(`users/${userId}/recommendations`);

        const snapshot = await userRef.once('value');
        if (!snapshot.exists()) {
            console.log(`No recommendations found in DB for user ${userId}`);
            return {
                homeFeed: [],
                continueListening: [],
                becauseYouListenedTo: {}
            };
        }

        const data = snapshot.val();
        console.log(`Returning recommendations for ${userId}: homeFeed(${data.homeFeed?.length || 0}), continueListening(${data.continueListening?.length || 0})`);
        return data;
    });
}

module.exports = routes;
