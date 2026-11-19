require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

class CacheManager {
    constructor() {
        this.cache = new Map();
    }

    get(key) {
        return this.cache.get(key);
    }

    set(key, value) {
        this.cache.set(key, value);
    }

    has(key) {
        return this.cache.has(key);
    }
}

class GameService {
    constructor(rawgApiKey, geminiApiKey) {
        this.rawgApiKey = rawgApiKey;
        this.ai = new GoogleGenAI({ apiKey: geminiApiKey });
        this.cacheManager = new CacheManager();
    }

    normalizeArray(input) {
        if (!input) return [];
        if (Array.isArray(input)) {
            return input.map(item => String(item).trim()).filter(Boolean);
        }
        return String(input)
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    }

    async fetchGameDescription(gameId, fallbackSummary) {
        try {
            const detailRes = await axios.get(`https://api.rawg.io/api/games/${gameId}`, {
                params: { key: this.rawgApiKey }
            });
            const rawDesc = detailRes.data.description_raw || detailRes.data.description || "";
            const cleanedDesc = rawDesc.replace(/<[^>]*>/g, '').trim();
            return cleanedDesc || fallbackSummary || "Deskripsi game tidak tersedia.";
        } catch (err) {
            return fallbackSummary || "Deskripsi game tidak tersedia.";
        }
    }

    async getRecommendations({ description, genres, platforms, releasedDate }) {
        if (!description || typeof description !== 'string' || description.trim() === "") {
            throw new Error("Description kriteria game tidak boleh kosong.");
        }
        if (description.length > 300) {
            throw new Error("Description melebihi batas maksimal 300 karakter.");
        }

        const cleanDescription = description.trim();
        const normalizedGenres = this.normalizeArray(genres);
        const normalizedPlatforms = this.normalizeArray(platforms);
        const cleanReleasedDate = releasedDate ? String(releasedDate).trim() : "";

        const cacheKey = JSON.stringify({
            description: cleanDescription.toLowerCase(),
            genres: normalizedGenres.map(g => g.toLowerCase()).sort(),
            platforms: normalizedPlatforms.map(p => p.toLowerCase()).sort(),
            releasedDate: cleanReleasedDate.toLowerCase()
        });

        if (this.cacheManager.has(cacheKey)) {
            return { source: "cache", data: this.cacheManager.get(cacheKey) };
        }

        const aiPrompt = `Berikan rekomendasi 3 sampai 5 judul game yang paling sesuai dengan kriteria berikut:
        - Deskripsi: "${cleanDescription}"
        - Genres: ${normalizedGenres.length > 0 ? normalizedGenres.join(', ') : 'Bebas'}
        - Platforms: ${normalizedPlatforms.length > 0 ? normalizedPlatforms.join(', ') : 'Bebas'}
        - Released Date / Tahun: ${cleanReleasedDate || 'Bebas'}

        Keluarkan hasilnya HANYA DALAM BENTUK ARRAY JSON berisikan nama-nama judul game saja tanpa teks tambahan, contoh format: ["Game A", "Game B", "Game C"]`;

        const aiResponse = await this.ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: aiPrompt,
        });

        let gameTitles = [];
        try {
            const cleanText = aiResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
            gameTitles = JSON.parse(cleanText);
        } catch (parseError) {
            throw new Error("Gagal memproses daftar game dari AI.");
        }

        if (!Array.isArray(gameTitles) || gameTitles.length === 0) {
            return { source: "api", data: [] };
        }

        const gameDetailsPromises = gameTitles.map(async (title) => {
            try {
                const rawgRes = await axios.get('https://api.rawg.io/api/games', {
                    params: {
                        key: this.rawgApiKey,
                        search: title,
                        page_size: 1
                    }
                });

                if (rawgRes.data.results && rawgRes.data.results.length > 0) {
                    const game = rawgRes.data.results[0];
                    const gameGenres = game.genres ? game.genres.map(g => g.name) : [];
                    const gamePlatforms = game.platforms ? game.platforms.map(p => p.platform.name) : [];
                    const gameDescription = await this.fetchGameDescription(
                        game.id,
                        `${game.name} adalah game dengan genre ${gameGenres.join(', ') || 'umum'}.`
                    );

                    return {
                        id: game.id,
                        name: game.name,
                        rating: typeof game.rating === 'number' ? game.rating : 0,
                        releasedDate: game.released || "",
                        backgroundImage: game.background_image || "",
                        platforms: gamePlatforms,
                        genre: gameGenres,
                        description: gameDescription
                    };
                }
                return null;
            } catch (err) {
                return null;
            }
        });

        const gameDetailsResults = await Promise.all(gameDetailsPromises);
        const validGames = gameDetailsResults.filter(item => item !== null);

        this.cacheManager.set(cacheKey, validGames);

        return { source: "api", data: validGames };
    }
}

class ServerApp {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.gameService = new GameService(
            process.env.RAWG_API_KEY,
            process.env.GEMINI_API_KEY
        );

        this.configureMiddleware();
        this.configureRoutes();
    }

    configureMiddleware() {
        this.app.use(express.json());
    }

    configureRoutes() {
        this.app.get('/', (req, res) => {
            res.json({ message: "Halo! Backend OOP GameMatch berhasil berjalan!" });
        });

        this.app.post('/api/recommend', async (req, res) => {
            try {
                const { description, genres, platforms, releasedDate } = req.body;
                const result = await this.gameService.getRecommendations({
                    description,
                    genres,
                    platforms,
                    releasedDate
                });

                res.json({
                    success: true,
                    source: result.source,
                    data: result.data
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    message: error.message
                });
            }
        });
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`Server OOP berjalan di http://localhost:${this.port}`);
        });
    }
}

const server = new ServerApp();
server.start();