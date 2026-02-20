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
                // Set initial onboarding tastes if passed from frontend
                const { onboardingLanguages, onboardingArtists } = request.body;

                userData.preferredLanguages = onboardingLanguages || [];
                userData.preferredArtists = onboardingArtists || [];

                // Also map them into the taste profile directly for immediate recommendations!
                if (onboardingLanguages) {
                    for (const lang of onboardingLanguages) {
                        await db.ref(`users/${uid}/taste/languages/${lang}`).set(10); // Heavy initial weight
                    }
                }
                if (onboardingArtists) {
                    for (const startist of onboardingArtists) {
                        await db.ref(`users/${uid}/taste/artists/${startist}`).set(20); // Heavy initial weight
                    }
                }
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
