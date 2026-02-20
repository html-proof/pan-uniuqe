const axios = require('axios');
require('dotenv').config();

const SAAVN_BASE_URL = process.env.SAAVN_API_URL || 'https://saavn.sumit.co';

const saavnClient = axios.create({
    baseURL: SAAVN_BASE_URL,
    timeout: 10000,
});

async function getSearch(query, page = 1, limit = 10) {
    const { data } = await saavnClient.get(`/api/search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
    return data;
}

async function getSearchSongs(query, page = 1, limit = 10) {
    const { data } = await saavnClient.get(`/api/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
    return data;
}

async function getSongDetails(id) {
    const { data } = await saavnClient.get(`/api/songs/${id}`);
    return data;
}

async function getArtistDetails(id) {
    const { data } = await saavnClient.get(`/api/artists/${id}`);
    return data;
}

async function getRecommendationsForSong(id) {
    const { data } = await saavnClient.get(`/api/songs/${id}/suggestions`);
    return data;
}

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
        artist: song.primaryArtists || song.artists,
        album: song.album?.name || song.album,
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
    mapSong,
};
