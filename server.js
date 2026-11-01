const express = require('express');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = 3000;

const RAWG_API_KEY = 'c364bad8b91a4169a3af1bc6c3532e9d';
const ai = new GoogleGenAI({ apiKey: 'AQ.Ab8RN6KlRheW3huRp1AWz-P4JR2tQnCYxfotA78Z33fCXQEveQ' });

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: "Halo! Backend GameMatch berhasil berjalan!" });
});

app.get('/api/games', async (req, res) => {
    try {
        const response = await axios.get(`https://api.rawg.io/api/games`, {
            params: {
                key: RAWG_API_KEY,
                platforms: '4',
                page_size: 10
            }
        });
        res.json({
            success: true,
            count: response.data.results.length,
            games: response.data.results
        });
    } catch (error) {
        console.error("Gagal mengambil data dari RAWG:", error.message);
        res.status(500).json({ success: false, message: "Terjadi kesalahan saat mengambil data game." });
    }
});

app.get('/api/recommendation', async (req, res) => {
    try {
        const rawgResponse = await axios.get(`https://api.rawg.io/api/games`, {
            params: {
                key: RAWG_API_KEY,
                platforms: '4',
                page_size: 5 
            }
        });

        const gamesList = rawgResponse.data.results.map(g => g.name).join(', ');
        const prompt = `Berikut adalah daftar game PC populer saat ini: ${gamesList}. Berikan rekomendasi singkat dan menarik dari daftar tersebut untuk seseorang yang menyukai game bergenre aksi dan petualangan, lengkap dengan alasan pemilihannya dalam Bahasa Indonesia.`;

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
        });

        res.json({
            success: true,
            recommendation: aiResponse.text
        });

    } catch (error) {
        console.error("Gagal memproses rekomendasi Gemini:", error);
        res.status(500).json({ 
            success: false, 
            message: "Terjadi kesalahan pada server saat memproses rekomendasi." 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});