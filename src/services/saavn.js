const axios = require('axios');
require('dotenv').config();

const SAAVN_BASE_URL = process.env.SAAVN_API_URL || 'https://saavn.sumit.co';

const saavnClient = axios.create({
    baseURL: SAAVN_BASE_URL,
    timeout: 10000,
});

// Helper for delaying retries
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Global semaphore to ensure only ONE request hits Saavn at a time
let requestQueue = Promise.resolve();

// Simple retry wrapper for axios with global serialization
async function saavnRequest(url, retries = 5) {
    const executeRequest = async () => {
        for (let i = 0; i < retries; i++) {
            try {
                return await saavnClient.get(url);
            } catch (error) {
                const is429 = error.response && error.response.status === 429;
                if (is429 && i < retries - 1) {
                    // Exponential backoff: 1s, 2s, 4s, 8s... + jitter
                    const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                    console.warn(`Saavn API [429]: Retrying ${url} in ${Math.round(delay)}ms (Attempt ${i + 1}/${retries})`);
                    await sleep(delay);
                    continue;
                }
                throw error;
            }
        }
    };

    // Serialize all requests through the global queue
    // We use .catch(() => {}) to ensure the chain continues even if a request ultimately fails
    const result = new Promise((resolve, reject) => {
        requestQueue = requestQueue.catch(() => { }).then(async () => {
            try {
                const response = await executeRequest();
                resolve(response);
            } catch (err) {
                reject(err);
            }
        });
    });

    return result;
}

async function getSearch(query, page = 1, limit = 10) {
    const { data } = await saavnRequest(`/api/search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
    return data;
}

async function getSearchSongs(query, page = 1, limit = 10) {
    const { data } = await saavnRequest(`/api/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
    return data;
}

async function getSongDetails(id) {
    const { data } = await saavnRequest(`/api/songs/${id}`);
    return data;
}

async function getArtistDetails(id) {
    // Some versions of the API use /api/artists?id=, others use /api/artists/id
    // We'll try the most common one first.
    const { data } = await saavnRequest(`/api/artists?id=${id}`);
    return data;
}

async function getRecommendationsForSong(id) {
    const { data } = await saavnRequest(`/api/songs/${id}/suggestions`);
    return data;
}

async function getAlbumDetails(id) {
    const { data } = await saavnRequest(`/api/albums?id=${id}`);
    return data;
}

const mapAlbum = (album) => {
    if (!album) return null;

    let imageUrl = '';
    if (album.image && Array.isArray(album.image)) {
        const quality150 = album.image.find(i => i.quality === '150x150') || album.image[0];
        imageUrl = quality150.url || quality150;
    } else if (album.image && typeof album.image === 'string') {
        imageUrl = album.image.replace('500x500', '150x150');
    }

    return {
        id: album.id,
        name: album.name || album.title,
        artist: album.artist || (album.artists && album.artists.primary ? album.artists.primary.map(a => a.name).join(', ') : 'Unknown Artist'),
        image: imageUrl,
        year: album.year,
        language: album.language,
        songCount: album.songCount,
        songs: album.songs ? album.songs.map(mapSong) : []
    };
};

const mapSong = (song) => {
    if (!song) return null;

    const getArtistName = (data) => {
        if (!data) return 'Unknown Artist';
        if (typeof data === 'string') return data;
        if (Array.isArray(data)) {
            return data.map(a => (typeof a === 'object' ? a.name : a)).filter(Boolean).join(', ');
        }
        if (typeof data === 'object') return data.name || data.title || 'Unknown Artist';
        return String(data);
    };

    const getAlbumName = (data) => {
        if (!data) return 'Unknown Album';
        if (typeof data === 'string') return data;
        if (typeof data === 'object') return data.name || data.title || 'Unknown Album';
        return String(data);
    };

    // Extract all useful qualities (96, 160, 320) so the client can optimize data usage
    let streams = { low: '', medium: '', high: '' };

    if (song.downloadUrl && Array.isArray(song.downloadUrl)) {
        const q96 = song.downloadUrl.find(u => u.quality === '96kbps' || u.quality === '96');
        const q160 = song.downloadUrl.find(u => u.quality === '160kbps' || u.quality === '160');
        const q320 = song.downloadUrl.find(u => u.quality === '320kbps' || u.quality === '320');

        if (q96) streams.low = q96.url;
        if (q160) streams.medium = q160.url;
        if (q320) streams.high = q320.url;

        // Fallback if named qualities not found
        if (!streams.high && song.downloadUrl.length > 0) streams.high = song.downloadUrl[0].url;
    } else {
        streams.high = song.downloadUrl || song.url;
    }

    // Force data-saver 150x150 images directly instead of sending arrays
    let imageUrl = '';
    if (song.image && Array.isArray(song.image)) {
        const quality150 = song.image.find(i => i.quality === '150x150') || song.image[0];
        imageUrl = quality150.url || quality150;
    } else if (song.image && typeof song.image === 'string') {
        imageUrl = song.image.replace('500x500', '150x150');
    }

    return {
        id: song.id,
        name: song.name || song.title,
        artist: getArtistName(song.primaryArtists || song.artists),
        album: getAlbumName(song.album),
        image: imageUrl,
        duration: song.duration,
        language: song.language,
        streams
    };
};

module.exports = {
    getSearch,
    getSearchSongs,
    getSongDetails,
    getArtistDetails,
    getRecommendationsForSong,
    getAlbumDetails,
    mapSong,
    mapAlbum,
};
