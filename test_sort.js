const saavn = require('./src/services/saavn');

async function test() {
    console.log('Fetching raw Saavn results for "chottamumbai"...');
    // Bypass our cache wrappers to test the raw algorithm
    const { data } = await saavn.saavnRequest('/api/search/songs?query=chottamumbai&limit=20');

    // Import the scoreResult logic exactly as it is in saavn.js
    function scoreResult(query, item) {
        if (!item) return 0;
        const q = (query || '').toLowerCase().trim();
        if (!q) return 0;

        let score = 0;
        const title = (item.name || item.title || '').toLowerCase().trim();

        if (title === q) score += 100;
        else if (title.startsWith(`\${q} `) || title.startsWith(`\${q}-`)) score += 50;
        else if (title.includes(q)) score += 20;

        const qWords = q.split(/\s+/);
        const titleWords = title.split(/\s+/);
        let matchedWords = 0;
        for (const tw of titleWords) {
            if (qWords.includes(tw)) matchedWords++;
        }
        score += (matchedWords * 10);

        let artistsStr = '';
        if (Array.isArray(item.primaryArtists)) artistsStr = item.primaryArtists.map(a => a.name).join(' ');
        else if (typeof item.primaryArtists === 'string') artistsStr = item.primaryArtists;
        else if (item.artist) artistsStr = item.artist;

        artistsStr = artistsStr.toLowerCase();

        if (artistsStr === q) score += 90;
        else if (artistsStr.includes(q)) score += 30;

        return score;
    }

    if (data && data.results) {
        const sorted = data.results.map(r => ({ ...r, _score: scoreResult('chottamumbai', r) }));
        sorted.sort((a, b) => b._score - a._score);

        sorted.forEach(s => {
            console.log(`[\${s._score}] \${s.name || s.title}`);
        });
    }
}

test().catch(console.error);
