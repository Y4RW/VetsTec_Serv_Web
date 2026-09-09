require('dotenv').config();
console.log("Prueba Localizacion base:", process.env.DATABASE_URL); // temporary
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CORS cnfg
app.use(cors({
    origin: '*', // origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // methods
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'] // headers
}));

app.use(express.json());

// DB cntn
// transaction pooler (spbse)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // for spbse
    }
});

// test conctn strt
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    console.log('Database connected successfully to VetsTec DB');
    release();
});

// test route map schema
app.get('/api/configuracion', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM configuracion_negocio LIMIT 1');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Database query failed' });
    }
});

app.listen(PORT, () => {
    console.log(`VetsTec API running on http://localhost:${PORT}`);
});