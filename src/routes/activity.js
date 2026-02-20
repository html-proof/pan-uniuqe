const { db } = require('../config/firebase');

// Utility to push an item and keep only the last N items (e.g., 50)
async function pushWithLimit(ref, data, limit = 50) {
    const newRef = ref.push();
    await newRef.set(data);

    const snapshot = await ref.orderByChild('timestamp').once('value');
    if (snapshot.numChildren() > limit) {
        const items = [];
        snapshot.forEach((child) => { items.push(child); });
        const itemsToRemove = items.slice(0, items.length - limit);
        const updates = {};
        itemsToRemove.forEach((item) => { updates[item.key] = null; });
        await ref.update(updates);
    }
}

// Utility to increment a score in a taste profile
async function incrementTaste(ref, key, amount) {
    const itemRef = ref.child(key);
    await itemRef.transaction((currentValue) => {
        return (currentValue || 0) + amount;
    });
}

async function routes(fastify, options) {
    // Common middleware to extract userId (In production, use token verification middleware)
    fastify.addHook('preHandler', async (request, reply) => {
        const userId = request.headers['x-user-id'];
        if (!userId) {
            return reply.code(401).send({ error: 'x-user-id header missing' });
        }
        request.userId = userId;
    });

    fastify.post('/play', async (request, reply) => {
        const { songId, artist, language, album, fullyPlayed } = request.body;
        const userId = request.userId;
        const timestamp = Date.now();

        const userRef = db.ref(`users/${userId}`);

        // Track recently played
        await pushWithLimit(userRef.child('activity/recentlyPlayed'), { songId, timestamp }, 50);

        // Update taste profile
        if (artist) await incrementTaste(userRef.child('taste/artists'), artist, fullyPlayed ? 5 : 1);
        if (language) await incrementTaste(userRef.child('taste/languages'), language, 1);
        if (album) await incrementTaste(userRef.child('taste/albums'), album, fullyPlayed ? 3 : 1);

        return { success: true };
    });

    fastify.post('/skip', async (request, reply) => {
        const { songId, artist, album } = request.body;
        const userId = request.userId;

        const userRef = db.ref(`users/${userId}`);
        await pushWithLimit(userRef.child('activity/skippedSongs'), { songId, timestamp: Date.now() }, 50);

        // Decrease taste slightly
        if (artist) await incrementTaste(userRef.child('taste/artists'), artist, -2);
        if (album) await incrementTaste(userRef.child('taste/albums'), album, -1);

        return { success: true };
    });

    fastify.post('/search', async (request, reply) => {
        const { query } = request.body;
        const userId = request.userId;

        const userRef = db.ref(`users/${userId}`);
        await pushWithLimit(userRef.child('activity/searchHistory'), { query, timestamp: Date.now() }, 20);

        return { success: true };
    });

    fastify.post('/like', async (request, reply) => {
        const { songId, artist, language, album } = request.body;
        const userId = request.userId;

        const userRef = db.ref(`users/${userId}`);
        // A separate likes tree is better for tracking all likes
        await userRef.child(`activity/likedSongs/${songId}`).set(Date.now());

        if (artist) await incrementTaste(userRef.child('taste/artists'), artist, 10);
        if (language) await incrementTaste(userRef.child('taste/languages'), language, 5);
        if (album) await incrementTaste(userRef.child('taste/albums'), album, 5);

        return { success: true };
    });

    fastify.post('/current', async (request, reply) => {
        const { songId, artist, language, album } = request.body;
        const userId = request.userId;

        const userRef = db.ref(`users/${userId}`);
        // Overwrite current playing
        await userRef.child('activity/currentPlaying').set({
            songId,
            timestamp: Date.now()
        });

        // Optionally increment taste for currently playing
        if (artist) await incrementTaste(userRef.child('taste/artists'), artist, 1);
        if (language) await incrementTaste(userRef.child('taste/languages'), language, 1);
        if (album) await incrementTaste(userRef.child('taste/albums'), album, 1);

        return { success: true };
    });

    fastify.post('/next', async (request, reply) => {
        const { songId } = request.body;
        const userId = request.userId;

        const userRef = db.ref(`users/${userId}`);
        // Overwrite next song
        await userRef.child('activity/nextSongPlaying').set({
            songId,
            timestamp: Date.now()
        });

        return { success: true };
    });
}

module.exports = routes;
