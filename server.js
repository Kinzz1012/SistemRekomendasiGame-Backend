require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

const RAWG_API_KEY = process.env.RAWG_API_KEY;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json());

const serverCache = new Map();

app.get('/', (req, res) => {
    res.json({ message: "Halo! Backend GameMatch berhasil berjalan!" });
});

app.post('/api/recommend', async (req, res) => {
    try {
        const { prompt, platform, genre, year } = req.body;

        if (!prompt || prompt.trim() === "") {
            return res.status(400).json({ 
                success: false, 
                message: "Prompt kriteria game tidak boleh kosong." 
            });
        }

        if (prompt.length > 300) {
            return res.status(400).json({ 
                success: false, 
                message: "Prompt melebihi batas maksimal 300 karakter." 
            });
        }

        const cacheKey = `${prompt}_${platform || 'all'}_${genre || 'all'}_${year || 'all'}`;

        if (serverCache.has(cacheKey)) {
            return res.json({
                success: true,
                source: "cache",
                data: serverCache.get(cacheKey)
            });
        }

        const aiPrompt = `Berikan rekomendasi 3 sampai 5 judul game PC yang sangat sesuai dengan kriteria berikut:
        - Deskripsi/Prompt User: "${prompt}"
        - Platform: ${platform || 'Bebas / PC'}
        - Genre: ${genre || 'Bebas'}
        - Tahun Rilis: ${year || 'Bebas'}
        
        Keluarkan hasilnya HANYA DALAM BENTUK ARRAY JSON berisikan nama-nama judul game saja tanpa teks tambahan, contoh format: ["Game A", "Game B", "Game C"]`;

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: aiPrompt,
        });

        let gameTitles = [];
        try {
            let cleanText = aiResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
            gameTitles = JSON.parse(cleanText);
        } catch (parseError) {
            return res.status(500).json({ success: false, message: "Gagal memproses daftar game dari AI." });
        }

        const gameDetailsPromises = gameTitles.map(async (title) => {
            try {
                const rawgRes = await axios.get(`https://api.rawg.io/api/games`, {
                    params: {
                        key: RAWG_API_KEY,
                        search: title,
                        page_size: 1
                    }
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

        serverCache.set(cacheKey, validGames);

        res.json({
            success: true,
            source: "api",
            data: validGames
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: "Terjadi kesalahan pada server saat memproses rekomendasi." 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});