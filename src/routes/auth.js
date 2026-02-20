const { auth, db } = require('../config/firebase');

async function routes(fastify, options) {
    fastify.post('/login', async (request, reply) => {
        try {
            const { token } = request.body;
            if (!token) {
                return reply.code(400).send({ error: 'Token is required' });
            }

            // Verify the ID token
            const decodedToken = await auth.verifyIdToken(token);
            const uid = decodedToken.uid;

            // Correctly check if preferences exist in the DB (onboarding completed)
            const prefSnapshot = await db.ref(`users/${uid}/preferences`).once('value');
            const preferences = prefSnapshot.val() || {};

            const onboardingCompleted =
                preferences.languages && preferences.languages.length > 0 &&
                preferences.artists && preferences.artists.length > 0;

            await userRef.update(userData);

            return {
                success: true,
                onboardingCompleted,
                user: { uid, ...userData }
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(401).send({ error: 'Unauthorized', details: error.message });
        }
    });
}

module.exports = routes;
