const axios = require('axios');
require('dotenv').config();

const SAAVN_BASE_URL = process.env.SAAVN_API_URL || 'https://saavn.sumit.co';

const saavnClient = axios.create({
    baseURL: SAAVN_BASE_URL,
    timeout: 10000,
});

async function getSearch(query) {
    const { data } = await saavnClient.get(`/api/search?query=${encodeURIComponent(query)}`);
    return data;
}

async function getSearchSongs(query) {
    const { data } = await saavnClient.get(`/api/search/songs?query=${encodeURIComponent(query)}`);
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

module.exports = {
    getSearch,
    getSearchSongs,
    getSongDetails,
    getArtistDetails,
    getRecommendationsForSong,
};
