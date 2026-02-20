const { db } = require('../config/firebase');
const { generateRecommendationsForUser } = require('../services/recommendationEngine');

const UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

async function runWorker() {
    console.log('Worker: Starting recommendation update cycle...');
    try {
        if (!db) {
            console.warn('Worker: skipping cycle, database unavailable');
            return;
        }
        const usersSnap = await db.ref('users').once('value');
        if (usersSnap.exists()) {
            const users = usersSnap.val();

            // In production, batch these or use a message queue rather than 
            // updating all users sequentially, but this works for demo/early stage
            for (const userId of Object.keys(users)) {
                await generateRecommendationsForUser(userId);
                // Throttle to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        console.log('Worker: Cycle complete.');
    } catch (error) {
        console.error('Worker: Error in update cycle', error);
    }
}

// Start worker loop
// setInterval(runWorker, UPDATE_INTERVAL_MS);

// Run immediately on boot
// setTimeout(runWorker, 5000);

module.exports = { runWorker }; // Exporting in case we ever want to run manually
