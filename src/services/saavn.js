const { request } = require('undici');
const { getOrSetCache } = require('./cache');
require('dotenv').config();

const SAAVN_BASE_URL = process.env.SAAVN_API_URL || 'https://saavn.sumit.co';

// Helper for delaying retries
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const Bottleneck = require('bottleneck');

// API Limiter to prevent flooding Saavn API
const limiter = new Bottleneck({
    minTime: 1200, // 1.2s between requests (as suggested by user for safety)
    maxConcurrent: 1
});

// Circuit Breaker state
let saavnBlockedUntil = 0;

// Simple retry wrapper for undici with global serialization via bottleneck
async function saavnRequest(urlPath, retries = 2) {
    if (Date.now() < saavnBlockedUntil) {
        throw new Error(`[Circuit Breaker] Saavn temporarly disabled (Cloudflare limited). Try again in ${Math.ceil((saavnBlockedUntil - Date.now()) / 1000)}s`);
    }

    const executeRequest = async () => {
        for (let i = 0; i < retries; i++) {
            try {
                const fullUrl = `${SAAVN_BASE_URL}${urlPath}`;
                const response = await request(fullUrl, {
                    method: 'GET',
                    headersTimeout: 10000,
                    bodyTimeout: 10000
                });

                if (response.statusCode >= 400) {
                    const error = new Error(`Request failed with status code ${response.statusCode}`);
                    error.response = { status: response.statusCode };
                    throw error;
                }

                // Consume the response body stream to json
                const data = await response.body.json();

                // Return wrapped to mimic axios response structure so the rest of the code works
                return { data };
            } catch (error) {
                const is429 = error.response && error.response.status === 429;

                // If cloudflare blocked the UNOFFICIAL wrapper API globally
                if (is429) {
                    saavnBlockedUntil = Date.now() + 180000; // block for 3 mins
                    console.error(`[Circuit Breaker] Cloudflare 429 Limit Hit! Blocking all Saavn API calls for 3m.`);
                    throw new Error("Saavn temporarily disabled (429 Rate Limit)");
                }

                if (i < retries - 1) {
                    const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                    console.warn(`Saavn API Error: Retrying ${urlPath} in ${Math.round(delay)}ms (Attempt ${i + 1}/${retries})`);
                    await sleep(delay);
                    continue;
                }
                throw error;
            }
        }
    };

    return limiter.schedule(() => executeRequest());
}

const Fuse = require('fuse.js');

// Normalize query to prevent messy inputs from breaking matches
function normalizeQuery(q) {
    if (!q) return '';
    return q
        .toLowerCase()
        .replace(/[^\w\s]/g, "") // Remove punctuation
        .replace(/\s+/g, " ")    // Consolidate spaces
        .trim();
}

// deduplicate results based on name and artist
function uniqueSongs(list) {
    const seen = new Set();
    return list.filter(song => {
        const key = `${(song.name || song.title || '').toLowerCase()}|${(song.artist || '').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Helper for unescaping HTML entities from Saavn
const unescapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
};

// Helper to rank results accurately using Fuse.js
function rankResults(query, items, isAlbum = false) {
    if (!items || !items.length) return [];

    const q = normalizeQuery(query);

    // Pre-clean Saavn items for better Fuse performance
    const cleanItems = items.map(item => {
        let artistsStr = '';
        if (Array.isArray(item.primaryArtists)) {
            artistsStr = item.primaryArtists.map(a => a.name).join(' ');
        } else if (typeof item.primaryArtists === 'string') {
            artistsStr = item.primaryArtists;
        } else if (item.artist) {
            artistsStr = item.artist;
        }

        const name = unescapeHtml(item.name || item.title || '');
        const artist = unescapeHtml(artistsStr);
        const albumName = !isAlbum && item.album ? unescapeHtml(item.album.name || item.album.title || (typeof item.album === 'string' ? item.album : '')).trim() : '';

        return {
            ...item,
            _cleanName: normalizeQuery(name),
            _cleanArtist: normalizeQuery(artist),
            _cleanAlbum: normalizeQuery(albumName)
        };
    });

    const fuse = new Fuse(cleanItems, {
        keys: [
            { name: '_cleanName', weight: 2.0 },   // Name is highest priority
            { name: '_cleanArtist', weight: 1.2 }, // Artist is strong priority
            { name: '_cleanAlbum', weight: 0.8 }   // Album is lower priority
        ],
        threshold: 0.35, // Balanced fuzzy tolerance
        includeScore: true,
        shouldSort: true,
        minMatchCharLength: 2
    });

    // Run the fuzzy search
    const fuseResults = fuse.search(q);

    // Map back to original items
    let sortedItems = fuseResults.map(res => {
        const original = { ...res.item };
        // Clean up temp properties
        delete original._cleanName;
        delete original._cleanArtist;
        delete original._cleanAlbum;
        return original;
    });

    // If no fuzzy matches, fall back to simple substring match on original array to prevent "Missing Results"
    if (sortedItems.length === 0 && items.length > 0) {
        sortedItems = items.filter(item => {
            const name = (item.name || item.title || '').toLowerCase();
            return name.includes(q) || q.includes(name);
        });
    }

    return isAlbum ? sortedItems : uniqueSongs(sortedItems);
}

async function getSearch(query, page = 1, limit = 20) {
    try {
        return await getOrSetCache(`search:${query}:${page}:${limit}`, 600, async () => {
            const { data } = await saavnRequest(`/api/search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
            return data;
        }, true);
    } catch (e) {
        if (e.message.includes("available") || e.message.includes("429") || e.message.includes("disabled")) {
            return { results: [], _isFallback: true };
        }
        throw e;
    }
}

async function getSearchSongs(query, page = 1, limit = 20) {
    try {
        return await getOrSetCache(`searchSongs:${query}:${page}:${limit}`, 600, async () => {
            const { data } = await saavnRequest(`/api/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
            if (data && data.data && Array.isArray(data.data.results)) {
                data.data.results = rankResults(query, data.data.results, false);
            }
            return data;
        }, true);
    } catch (e) {
        if (e.message.includes("disabled") || e.message.includes("429")) {
            return { results: [], _isFallback: true };
        }
        throw e;
    }
}

async function getSearchAlbums(query, page = 1, limit = 20) {
    try {
        return await getOrSetCache(`searchAlbums:${query}:${page}:${limit}`, 600, async () => {
            const { data } = await saavnRequest(`/api/search/albums?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
            if (data && data.data && Array.isArray(data.data.results)) {
                data.data.results = rankResults(query, data.data.results, true);
            }
            return data;
        }, true);
    } catch (e) {
        if (e.message.includes("disabled") || e.message.includes("429")) {
            return { results: [], _isFallback: true };
        }
        throw e;
    }
}

async function getSearchArtists(query, page = 1, limit = 10) {
    try {
        return await getOrSetCache(`searchArtists:${query}:${page}:${limit}`, 600, async () => {
            const { data } = await saavnRequest(`/api/search/artists?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
            return data;
        }, true);
    } catch (e) {
        if (e.message.includes("disabled") || e.message.includes("429")) {
            return { results: [], _isFallback: true };
        }
        throw e;
    }
}

async function getSearchPlaylists(query, page = 1, limit = 10) {
    try {
        return await getOrSetCache(`searchPlaylists:${query}:${page}:${limit}`, 600, async () => {
            const { data } = await saavnRequest(`/api/search/playlists?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
            return data;
        }, true);
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

async function getArtistSongs(id, page = 1, limit = 10) {
    if (!id || id === 'Unknown Artist') return null;
    return await getOrSetCache(`artistSongs:${id}:${page}:${limit}`, 21600, async () => {
        const { data } = await saavnRequest(`/api/artists/${id}/songs?page=${page}&limit=${limit}`);
        return data;
    });
}

async function getArtistAlbums(id, page = 1, limit = 10) {
    if (!id || id === 'Unknown Artist') return null;
    return await getOrSetCache(`artistAlbums:${id}:${page}:${limit}`, 21600, async () => {
        const { data } = await saavnRequest(`/api/artists/${id}/albums?page=${page}&limit=${limit}`);
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

async function getPlaylistDetails(id) {
    if (!id) return null;
    return await getOrSetCache(`playlist:${id}`, 86400, async () => {
        const { data } = await saavnRequest(`/api/playlists?id=${id}`);
        return data;
    });
}

const getArtistName = (data) => {
    if (!data) return 'Unknown Artist';
    if (typeof data === 'string') return data;

    // Handle Saavn search result structure: { primary: [...], all: [...] }
    if (typeof data === 'object' && !Array.isArray(data)) {
        if (Array.isArray(data.primary) && data.primary.length > 0) {
            return data.primary.map(a => a.name).join(', ');
        }
        if (Array.isArray(data.all) && data.all.length > 0) {
            return data.all.map(a => a.name).join(', ');
        }
        return data.name || data.title || 'Unknown Artist';
    }

    if (Array.isArray(data)) {
        return data.map(a => (typeof a === 'object' ? a.name : a)).filter(Boolean).join(', ');
    }

    return String(data);
};

const getAlbumName = (data) => {
    if (!data) return 'Unknown Album';
    if (typeof data === 'string') return data;
    if (typeof data === 'object') return data.name || data.title || 'Unknown Album';
    return String(data);
};

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
        artist: getArtistName(album.artist || album.artists || album.primaryArtists),
        image: imageUrl,
        year: album.year,
        language: album.language,
        songCount: album.songCount,
        songs: album.songs ? album.songs.map(mapSong) : []
    };
};

const mapSong = (song) => {
    if (!song) return null;

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
    getSearchAlbums,
    getSearchArtists,
    getSearchPlaylists,
    getSongDetails,
    getSongsBulk,
    getArtistDetails,
    getArtistSongs,
    getArtistAlbums,
    getRecommendationsForSong,
    getAlbumDetails,
    getPlaylistDetails,
    mapSong,
    mapAlbum,
};
