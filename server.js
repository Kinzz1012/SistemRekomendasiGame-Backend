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

    async getRecommendations(prompt, platform, genre, year) {
        if (!prompt || prompt.trim() === "") {
            throw new Error("Prompt kriteria game tidak boleh kosong.");
        }
        if (prompt.length > 300) {
            throw new Error("Prompt melebihi batas maksimal 300 karakter.");
        }

        const cacheKey = `${prompt}_${platform || 'all'}_${genre || 'all'}_${year || 'all'}`;

        if (this.cacheManager.has(cacheKey)) {
            return { source: "cache", data: this.cacheManager.get(cacheKey) };
        }

        const aiPrompt = `Berikan rekomendasi 3 sampai 5 judul game PC yang sangat sesuai dengan kriteria berikut:
        - Deskripsi/Prompt User: "${prompt}"
        - Platform: ${platform || 'Bebas / PC'}
        - Genre: ${genre || 'Bebas'}
        - Tahun Rilis: ${year || 'Bebas'}
        
        Keluarkan hasilnya HANYA DALAM BENTUK ARRAY JSON berisikan nama-nama judul game saja tanpa teks tambahan, contoh format: ["Game A", "Game B", "Game C"]`;

        const aiResponse = await this.ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: aiPrompt,
        });

        let gameTitles = [];
        try {
            let cleanText = aiResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
            gameTitles = JSON.parse(cleanText);
        } catch (parseError) {
            throw new Error("Gagal memproses daftar game dari AI.");
        }

        const gameDetailsPromises = gameTitles.map(async (title) => {
            try {
                const rawgRes = await axios.get(`https://api.rawg.io/api/games`, {
                    params: { key: this.rawgApiKey, search: title, page_size: 1 }
                });

                if (rawgRes.data.results && rawgRes.data.results.length > 0) {
                    const game = rawgRes.data.results[0];
                    return {
                        id: game.id,
                        name: game.name,
                        rating: game.rating,
                        releasedDate: game.released,
                        backgroundImage: game.background_image,
                        platforms: game.platforms ? game.platforms.map(p => p.platform.name) : []
                    };
                }
                return null;
            } catch (err) {
                return null;
            }
        });

        const gameDetailsResults = await Promise.all(gameDetailsPromises);
        const validGames = gameDetailsResults.filter(g => g !== null);

        this.cacheManager.set(cacheKey, validGames);

        return { source: "api", data: validGames };
    }
}

class ServerApp {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.gameService = new GameService(process.env.RAWG_API_KEY, process.env.GEMINI_API_KEY);
        
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
                const { prompt, platform, genre, year } = req.body;
                const result = await this.gameService.getRecommendations(prompt, platform, genre, year);
                res.json({ success: true, source: result.source, data: result.data });
            } catch (error) {
                res.status(400).json({ success: false, message: error.message });
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