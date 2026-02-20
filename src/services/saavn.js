const axios = require('axios');
const { getOrSetCache } = require('./cache');
require('dotenv').config();

const SAAVN_BASE_URL = process.env.SAAVN_API_URL || 'https://saavn.sumit.co';

const saavnClient = axios.create({
    baseURL: SAAVN_BASE_URL,
    timeout: 10000,
});

// Helper for delaying retries
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Circuit Breaker state
let saavnBlockedUntil = 0;

// Simple retry wrapper for axios without local queue bottleneck
async function saavnRequest(url, retries = 2) {
    if (Date.now() < saavnBlockedUntil) {
        throw new Error(`[Circuit Breaker] Saavn temporarly disabled (Cloudflare limited). Try again in ${Math.ceil((saavnBlockedUntil - Date.now()) / 1000)}s`);
    }

    for (let i = 0; i < retries; i++) {
        try {
            return await saavnClient.get(url);
        } catch (error) {
            const is429 = error.response && error.response.status === 429;

            // If cloudflare blocked the UNOFFICIAL wrapper API globally
            if (is429) {
                saavnBlockedUntil = Date.now() + 60000; // block for 60s
                console.error(`[Circuit Breaker] Cloudflare 429 Limit Hit! Blocking all Saavn API calls for 60s.`);
                throw new Error("Saavn temporarily disabled (429 Rate Limit)");
            }

            if (i < retries - 1) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                console.warn(`Saavn API Error: Retrying ${url} in ${Math.round(delay)}ms (Attempt ${i + 1}/${retries})`);
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }
}

async function getSearch(query, page = 1, limit = 10) {
    try {
        return await getOrSetCache(`search:${query}:${page}:${limit}`, 600, async () => {
            const { data } = await saavnRequest(`/api/search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
            return data;
        });
    } catch (e) {
        if (e.message.includes("available") || e.message.includes("429") || e.message.includes("disabled")) {
            return { results: [], _isFallback: true };
        }
        throw e;
    }
}

async function getSearchSongs(query, page = 1, limit = 10) {
    try {
        return await getOrSetCache(`searchSongs:${query}:${page}:${limit}`, 600, async () => {
            const { data } = await saavnRequest(`/api/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
            return data;
        });
    } catch (e) {
        if (e.message.includes("disabled") || e.message.includes("429")) {
            return { results: [], _isFallback: true };
        }
        throw e;
    }
}

async function getSongDetails(id) {
    if (!id || id === 'Unknown Artist') return null;
    return await getOrSetCache(`song:${id}`, 21600, async () => {
        const { data } = await saavnRequest(`/api/songs/${id}`);
        return data;
    });
}

async function getArtistDetails(id) {
    if (!id || id === 'Unknown Artist') return null;
    return await getOrSetCache(`artist:${id}`, 86400, async () => {
        // User requested exactly: /api/artists/{id}
        const { data } = await saavnRequest(`/api/artists/${id}`);
        return data;
    });
}

async function getRecommendationsForSong(id) {
    if (!id || id === 'Unknown Artist') return null;
    return await getOrSetCache(`suggestions:${id}`, 21600, async () => {
        // User requested exactly: /api/songs/{id}/suggestions
        const { data } = await saavnRequest(`/api/songs/${id}/suggestions`);
        return data;
    });
}

async function getAlbumDetails(id) {
    if (!id || id === 'Unknown Artist') return null;
    return await getOrSetCache(`album:${id}`, 86400, async () => {
        // We were using /api/albums?id=. The Python script shows no id endpoint, but usually it's /api/albums?id=
        // Let's stick with /api/albums?id= for now since it works when not rate limited.
        const { data } = await saavnRequest(`/api/albums?id=${id}`);
        return data;
    });
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

async function getSongsBulk(ids) {
    if (!ids || ids.length === 0) return [];
    try {
        const idStr = ids.join(',');
        const response = await saavnRequest(`/api/songs?ids=${idStr}`);
        const dataArray = response.data?.data || response.data || [];
        return Array.isArray(dataArray) ? dataArray : [dataArray];
    } catch (e) {
        if (e.message.includes("disabled") || e.message.includes("429")) return [];
        throw e;
    }
}

module.exports = {
    getSearch,
    getSearchSongs,
    getSongDetails,
    getSongsBulk,
    getArtistDetails,
    getRecommendationsForSong,
    getAlbumDetails,
    mapSong,
    mapAlbum,
};
