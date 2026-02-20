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

            const userRef = db.ref(`users/${uid}/profile`);
            const snapshot = await userRef.once('value');

            const userData = {
                name: decodedToken.name || '',
                email: decodedToken.email || '',
                picture: decodedToken.picture || '',
                lastLoginAt: Date.now()
            };

            if (!snapshot.exists()) {
                userData.createdAt = Date.now();
                // Preferences will be populated later via /onboarding/save
                userData.preferredLanguages = [];
                userData.preferredArtists = [];
            }

            await userRef.update(userData);

            return { success: true, user: { uid, ...userData } };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(401).send({ error: 'Unauthorized', details: error.message });
        }
    });
}

module.exports = routes;
