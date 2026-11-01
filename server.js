const express = require('express');
const axios = require('axios'); // Mengimpor axios untuk request API
const app = express();
const PORT = 3000;

// Ganti 'MASUKKAN_API_KEY_RAWG_DISINI' dengan API Key asli yang kamu dapatkan dari RAWG
const RAWG_API_KEY = 'MASUKKAN_API_KEY_RAWG_DISINI';

app.use(express.json());

// Route utama pengujian
app.get('/', (req, res) => {
    res.json({ message: "Halo! Backend GameMatch berhasil berjalan!" });
});

// Route baru untuk mengambil data game PC dari RAWG API
app.get('/api/games', async (req, res) => {
    try {
        // Meminta data game khusus platform PC (ID platform PC di RAWG biasanya adalah 4)
        const response = await axios.get(`https://api.rawg.io/api/games`, {
            params: {
                key: 'c364bad8b91a4169a3af1bc6c3532e9d',
                platforms: '4', // Platform 4 adalah PC
                page_size: 10   // Mengambil 10 data game saja untuk uji coba
            }
        });

        // Mengirimkan hasil daftar game kembali ke client/frontend
        res.json({
            success: true,
            count: response.data.results.length,
            games: response.data.results
        });

    } catch (error) {
        console.error("Gagal mengambil data dari RAWG:", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Terjadi kesalahan saat mengambil data game." 
        });
    }
});

// Menjalankan server
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});