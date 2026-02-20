const { db } = require('../config/firebase');

async function routes(fastify, options) {
    fastify.get('/:userId', async (request, reply) => {
        const { userId } = request.params;
        const userRef = db.ref(`users/${userId}/recommendations`);

        const snapshot = await userRef.once('value');
        if (!snapshot.exists()) {
            return {
                homeFeed: [],
                continueListening: [],
                becauseYouListenedTo: {}
            };
        }

        return snapshot.val();
    });
}

module.exports = routes;
