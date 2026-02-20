require('dotenv').config();
const admin = require('firebase-admin');

// We use the service account file copied into the config directory
// In a REAL production environment on Railway, you might want to parse 
// this from an environment variable (e.g. FIREBASE_PRIVATE_KEY) instead
// of including the JSON file in the repository (which is bad practice).
// For now, it will load it conditionally or just from the JSON.
let serviceAccount = {};

// 1. Try to load from the JSON file first (if it exists)
try {
    serviceAccount = require('./firebase-service-account.json');
} catch (e) {
    // No local JSON file, that's fine for production
}

// 2. Override with FIREBASE_SERVICE_ACCOUNT (JSON or Base64) if it exists
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    try {
        if (raw.startsWith('"') && raw.endsWith('"')) {
            raw = raw.substring(1, raw.length - 1).trim();
        }

        console.log(`Attempting to parse FIREBASE_SERVICE_ACCOUNT (Length: ${raw.length})`);

        if (raw && !raw.startsWith('{')) {
            console.log('Detected Base64 encoding, decoding...');
            const decoded = Buffer.from(raw, 'base64').toString('utf-8');
            serviceAccount = JSON.parse(decoded);
            console.log('Successfully parsed Base64 JSON');
        } else {
            serviceAccount = JSON.parse(raw);
            console.log('Successfully parsed raw JSON');
        }
    } catch (e) {
        console.error('CRITICAL: FIREBASE_SERVICE_ACCOUNT parsing failed:', e.message);
    }
}

// 3. Normalize keys (JSON uses snake_case, JS code often uses camelCase)
if (serviceAccount.project_id) serviceAccount.projectId = serviceAccount.project_id;
if (serviceAccount.private_key) serviceAccount.privateKey = serviceAccount.private_key;
if (serviceAccount.client_email) serviceAccount.clientEmail = serviceAccount.client_email;

// 4. Fallback to individual vars if still missing pieces
if (!serviceAccount.projectId || !serviceAccount.privateKey) {
    console.log('Falling back to individual Firebase environment variables...');
    if (process.env.FIREBASE_PROJECT_ID) serviceAccount.projectId = process.env.FIREBASE_PROJECT_ID;
    if (process.env.FIREBASE_CLIENT_EMAIL) serviceAccount.clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    if (process.env.FIREBASE_PRIVATE_KEY) {
        serviceAccount.privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    }
}

// Final Validation before initialization
const hasCreds = serviceAccount.projectId && serviceAccount.privateKey && serviceAccount.clientEmail;

let db = null;
let auth = null;

if (!admin.apps.length) {
    try {
        if (hasCreds) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: process.env.DATABASE_URL || "https://sample-music-65323-default-rtdb.asia-southeast1.firebasedatabase.app"
            });
            console.log('Firebase initialized successfully');
        } else {
            console.error('CRITICAL: Cannot initialize Firebase - missing credentials (project_id, private_key, or client_email)');
        }
    } catch (initError) {
        console.error('FATAL: Firebase initialization failed:', initError.message);
    }
}

// Export db and auth even if they are null, routes should handle it
try {
    db = admin.database();
    auth = admin.auth();
} catch (e) {
    console.warn('Firebase services unavailable:', e.message);
}

module.exports = { admin, db, auth };
