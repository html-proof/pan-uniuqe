require('dotenv').config();
const admin = require('firebase-admin');

// We use the service account file copied into the config directory
// In a REAL production environment on Railway, you might want to parse 
// this from an environment variable (e.g. FIREBASE_PRIVATE_KEY) instead
// of including the JSON file in the repository (which is bad practice).
// For now, it will load it conditionally or just from the JSON.
let serviceAccount = {};

// Parsing from env mapping if on railway
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    try {
        // Remove surrounding quotes if they were added by the hosting provider/UI
        if (raw.startsWith('"') && raw.endsWith('"')) {
            raw = raw.substring(1, raw.length - 1).trim();
        }

        console.log(`Attempting to parse FIREBASE_SERVICE_ACCOUNT (Length: ${raw.length})`);

        if (raw && !raw.startsWith('{')) {
            console.log('Detected Base64 encoding, decoding...');
            try {
                const decoded = Buffer.from(raw, 'base64').toString('utf-8');
                serviceAccount = JSON.parse(decoded);
                console.log('Successfully parsed Base64 JSON');
            } catch (base64Error) {
                console.error(`Base64 decode/parse failed: ${base64Error.message}`);
                // If it looks like base64 but fails, we continue to fallback 
            }
        } else {
            // AUTO-FIX: Railway sometimes messes up backslashes in JSON env vars
            // It might turn \n into \\n or \x (corrupted). 
            try {
                serviceAccount = JSON.parse(raw);
                console.log('Successfully parsed raw JSON');
            } catch (initialError) {
                console.warn('Initial JSON parse failed, attempting auto-fix for escape characters...');
                // Try to fix common corruption patterns like \x or bad \n
                const fixed = raw.replace(/\\x/g, '\\n').replace(/\\([^"\\/bfnrtu])/g, '$1');
                serviceAccount = JSON.parse(fixed);
                console.log('Successfully parsed auto-fixed JSON');
            }
        }
    } catch (e) {
        console.error('CRITICAL: FIREBASE_SERVICE_ACCOUNT parsing failed:', e.message);

        // Advanced Debugging: Find the problematic character
        const match = e.message.match(/at position (\d+)/);
        if (match && raw) {
            const pos = parseInt(match[1], 10);
            const start = Math.max(0, pos - 20);
            const end = Math.min(raw.length, pos + 20);
            console.error(`Context at error (pos ${pos}): "...${raw.substring(start, end).replace(/\n/g, '\\n')}..."`);
        }
    }
}

// Fallback logic if JSON parsing failed or wasn't provided
if (!serviceAccount || !serviceAccount.privateKey) {
    console.log('Falling back to individual Firebase environment variables...');
    serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };
}

// Final Validation before initialization
if (!serviceAccount.projectId || !serviceAccount.privateKey || !serviceAccount.clientEmail) {
    console.warn('WARNING: Firebase credentials appear incomplete. Ensure FIREBASE_SERVICE_ACCOUNT or individual vars are set correctly.');
}

let db = null;
let auth = null;

if (!admin.apps.length) {
    try {
        if (serviceAccount.projectId && serviceAccount.privateKey) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: process.env.DATABASE_URL || "https://sample-music-65323-default-rtdb.asia-southeast1.firebasedatabase.app"
            });
            console.log('Firebase initialized successfully');
            db = admin.database();
            auth = admin.auth();
        } else {
            console.error('CRITICAL: Cannot initialize Firebase - missing Project ID or Private Key');
        }
    } catch (initError) {
        console.error('FATAL: Firebase initialization failed:', initError.message);
    }
} else {
    db = admin.database();
    auth = admin.auth();
}

module.exports = { admin, db, auth };
