const { getSearchSongs, getSearch } = require('../services/saavn');
const { getOrSetCache } = require('../services/cache');

// 24 Hour Cache for Languages to keep it fast
const LANGUAGE_CACHE_TTL = 86400;
// 6 Hour Cache for Artists 
const ARTISTS_CACHE_TTL = 21600;

const DEFAULT_LANGUAGES = ['Hindi', 'English', 'Punjabi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Bengali', 'Marathi', 'Gujarati'].sort();

async function routes(fastify, options) {
    // 1. Fetch Dynamic Languages
    fastify.get('/languages', async (request, reply) => {
        try {
            // Use trending songs to extract active languages dynamically
            const languages = await getOrSetCache('onboarding:languages', LANGUAGE_CACHE_TTL, async () => {
                const searchResponse = await getSearch('top songs');

                // Handle different potential structures from the unofficial API
                const data = searchResponse.data || searchResponse;

                const extractedLanguages = new Set();


                // Crawl through generic search results (albums, songs, playlists) to find embedded languages
                if (data.results) {
                    if (data.results.songs && data.results.songs.data) {
                        data.results.songs.data.forEach(song => {
                            if (song.language) extractedLanguages.add(song.language.toLowerCase());
                        });
                    } else if (Array.isArray(data.results)) {
                        // Sometimes results is just a flat array of songs
                        data.results.forEach(song => {
                            if (song.language) extractedLanguages.add(song.language.toLowerCase());
                        });
                    }
                }

                const resultLangs = Array.from(extractedLanguages).map(l => l.charAt(0).toUpperCase() + l.slice(1));

                // Merge with fallbacks and deduplicate
                const finalLangs = Array.from(new Set([...resultLangs, ...DEFAULT_LANGUAGES])).sort();
                return finalLangs;
            });

            return reply.send(languages);
        } catch (error) {
            fastify.log.error(error);
            // Even on error, return defaults so the app works
            return reply.send(DEFAULT_LANGUAGES);
        }
    });

    // 2. Fetch Artists by Language
    fastify.post('/artists', async (request, reply) => {
        try {
            const { languages } = request.body; // Expecting: { "languages": ["Malayalam", "Tamil"] }

            if (!languages || !Array.isArray(languages) || languages.length === 0) {
                return reply.status(400).send({ error: 'Please provide an array of languages' });
            }

            // Cache key based on sorted languages to ensure hits (e.g., 'onboarding:artists:hindi,tamil')
            const cacheKey = `onboarding:artists:${languages.map(l => l.toLowerCase()).sort().join(',')}`;

            const artists = await getOrSetCache(cacheKey, ARTISTS_CACHE_TTL, async () => {
                const allArtists = new Map(); // using Map to deduplicate by Artist ID

                // Search for top songs in each requested language to extract popular artists natively
                for (const lang of languages) {
                    const data = await getSearchSongs(`top ${lang} songs`);

                    if (data && data.data && data.data.results) {
                        data.data.results.forEach(song => {
                            // Some saavn endpoints return string vs array. Standardize string to array mappings
                            if (song.primaryArtistsId && song.primaryArtists) {
                                const ids = song.primaryArtistsId.split(',').map(id => id.trim());
                                const names = song.primaryArtists.split(',').map(name => name.trim());

                                for (let i = 0; i < ids.length; i++) {
                                    if (ids[i] && names[i] && !allArtists.has(ids[i])) {
                                        allArtists.set(ids[i], {
                                            id: ids[i],
                                            name: names[i],
                                            // Fallback to song image if artist image is missing
                                            image: song.image ? song.image[song.image.length - 1].url : null
                                        });
                                    }
                                }
                            } else if (song.artists && song.artists.primary) {
                                song.artists.primary.forEach(artist => {
                                    if (artist.id && artist.name && !allArtists.has(artist.id)) {
                                        allArtists.set(artist.id, {
                                            id: artist.id,
                                            name: artist.name,
                                            image: artist.image && artist.image.length > 0 ? artist.image[artist.image.length - 1].url : null
                                        });
                                    }
                                });
                            }
                        });
                    }
                }

                // Return top 20 artists found matching those languages
                return Array.from(allArtists.values()).slice(0, 20);
            });

            return reply.send(artists);
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch artists' });
        }
    });

    // 3. Save Onboarding Preferences
    fastify.post('/save', async (request, reply) => {
        try {
            const uid = request.headers['x-user-id'];
            if (!uid) {
                return reply.code(400).send({ error: 'Missing x-user-id header' });
            }

            const { languages, artists } = request.body;

            if (!languages && !artists) {
                return reply.code(400).send({ error: 'Provide at least languages or artists' });
            }

            const { db } = require('../config/firebase');

            // Save structured preferences
            if (languages) {
                await db.ref(`users/${uid}/preferences/languages`).set(languages);
                // Heavy initial weight for recommendation engine
                for (const lang of languages) {
                    await db.ref(`users/${uid}/taste/languages/${lang}`).set(10);
                }
            }

            if (artists) {
                await db.ref(`users/${uid}/preferences/artists`).set(artists);
                // Heavy initial weight for recommendation engine
                for (const artist of artists) {
                    await db.ref(`users/${uid}/taste/artists/${artist}`).set(20);
                }
            }

            return reply.send({ success: true, message: 'Preferences saved' });
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({ error: 'Failed to save preferences' });
        }
    });
}

module.exports = routes;
