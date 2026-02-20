const { db } = require('../config/firebase');
const { getRecommendationsForSong, getSearchSongs, getArtistDetails } = require('./saavn');

async function generateRecommendationsForUser(userId) {
    if (!db) {
        console.warn('generateRecommendationsForUser: database unavailable');
        return;
    }
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (!userData) return;

    const { activity = {}, taste = {} } = userData;
    const { recentlyPlayed = {}, currentPlaying = {} } = activity;
    const { artists = {}, languages = {} } = taste;

    const recommendations = {
        homeFeed: [],
        continueListening: [],
        becauseYouListenedTo: {}
    };

    // 1. Continue Listening (from recently played)
    const recentItems = Object.values(recentlyPlayed).sort((a, b) => b.timestamp - a.timestamp);
    recommendations.continueListening = recentItems.slice(0, 10).map(r => r.songId);

    // 2. Because You Listened To (Top Artist)
    const topArtists = Object.entries(artists)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([artist]) => artist);

    for (const artistId of topArtists) {
        try {
            // Using getArtistDetails (ID based) is more accurate than searching for the ID string
            const resp = await getArtistDetails(artistId);
            const artistData = resp.data || resp;

            if (artistData && artistData.topSongs) {
                const artistName = artistData.name || artistId;
                recommendations.becauseYouListenedTo[artistName] = artistData.topSongs.slice(0, 10).map(s => s.id);
            } else if (artistData && artistData.results) {
                // Handle different potential structures
                const artistName = artistData.name || artistId;
                recommendations.becauseYouListenedTo[artistName] = artistData.results.slice(0, 10).map(s => s.id);
            }
        } catch (e) {
            console.error(`Error fetching for artist ${artistId}:`, e.message);
        }
    }

    // 3. Similar to last played or currently playing song
    let targetSongId = null;
    let targetArtist = null;
    let targetLanguage = null;

    if (currentPlaying && currentPlaying.songId) {
        targetSongId = currentPlaying.songId;
        targetArtist = currentPlaying.artist;
        targetLanguage = currentPlaying.language;
    } else if (recentItems.length > 0) {
        targetSongId = recentItems[0].songId;
        targetArtist = recentItems[0].artist;
        targetLanguage = recentItems[0].language;
    }

    if (targetSongId) {
        try {
            const similar = await getRecommendationsForSong(targetSongId);
            if (similar && similar.data) {
                // Simple sorting mechanism: boost songs that match the same explicit language or artist
                const rankedSuggestions = similar.data.sort((a, b) => {
                    let aScore = 0; let bScore = 0;
                    if (targetLanguage && a.language === targetLanguage) aScore += 5;
                    if (targetLanguage && b.language === targetLanguage) bScore += 5;

                    if (targetArtist && (a.primaryArtists?.includes(targetArtist) || a.artists?.includes(targetArtist))) aScore += 5;
                    if (targetArtist && (b.primaryArtists?.includes(targetArtist) || b.artists?.includes(targetArtist))) bScore += 5;

                    return bScore - aScore;
                });

                recommendations.homeFeed = rankedSuggestions.slice(0, 15).map(s => s.id);
            }
        } catch (e) {
            console.error(`Error fetching similar for ${targetSongId}:`, e.message);
        }
    }

    // 4. Final Fallback: If Home Feed is still empty (brand new user), fetch trending songs
    if (recommendations.homeFeed.length === 0) {
        try {
            const preferredLangs = Object.keys(languages);
            const queryLang = preferredLangs.length > 0 ? preferredLangs[0] : 'Hindi';
            console.log(`Cold start: Fetching global top ${queryLang} songs for homeFeed`);

            const trending = await getSearchSongs(`top ${queryLang} songs`);
            if (trending && trending.data && trending.data.results) {
                recommendations.homeFeed = trending.data.results.slice(0, 15).map(s => s.id);
            } else if (trending && trending.results) {
                recommendations.homeFeed = trending.results.slice(0, 15).map(s => s.id);
            }
        } catch (e) {
            console.error('Error fetching trending fallback:', e.message);
        }
    }

    // Save back to DB
    await userRef.child('recommendations').set(recommendations);
    console.log(`Updated recommendations for ${userId}`);
}

module.exports = {
    generateRecommendationsForUser
};
