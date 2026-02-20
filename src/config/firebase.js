require('dotenv').config();
const admin = require('firebase-admin');

// We use the service account file copied into the config directory
// In a REAL production environment on Railway, you might want to parse 
// this from an environment variable (e.g. FIREBASE_PRIVATE_KEY) instead
// of including the JSON file in the repository (which is bad practice).
// For now, it will load it conditionally or just from the JSON.
let serviceAccount;
// Parsing from env mapping if on railway
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        // Support Base64 encoding for better reliability
        if (raw && !raw.startsWith('{')) {
            serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
        } else {
            serviceAccount = JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error parsing FIREBASE_SERVICE_ACCOUNT:', e.message);
        // Fallback to individual vars if JSON fails
        serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        };
    }
} else {
    try {
        serviceAccount = require('./firebase-service-account.json');
    } catch (e) {
        serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        };
    }
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.DATABASE_URL || "https://sample-music-65323-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
}

const db = admin.database();
const auth = admin.auth();

module.exports = { admin, db, auth };
