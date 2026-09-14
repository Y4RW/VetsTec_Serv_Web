require('dotenv').config();
console.log("Prueba Localizacion base:", process.env.DATABASE_URL); // temporary
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CORS cnfg
app.use(cors({
    origin: '*', // origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // methods
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'] // headers
}));

app.use(express.json());

// DB cnnect
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

// ruta dinamica para fetch de un producto con id
app.get('/api/productos/:id', async (req, res) => {
    // capturar ruta dinamica desde url
    const productoId = req.params.id;

    try {
        // ver la db usando una query parametrizada (avoid sql injections)
        const queryText = 'SELECT * FROM productos WHERE id = $1';
        const { rows } = await pool.query(queryText, [productoId]);

        // checar si existe
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Product with ID ${productoId} not found`
            });
        }

        // regresar el producto encontrado como Yeison
        res.json({
            success: true,
            data: rows[0]
        });

    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching product'
        });
    }
});

app.listen(PORT, () => {
    console.log(`VetsTec API running on http://localhost:${PORT}`);

    // consume una API Externa (Terceros) usando Axios
app.get('/api/razas-perros', async (req, res) => {
    try {
        // peticion física a la API externa de Dog CEO
        const response = await axios.get('https://dog.ceo/api/breeds/list/all');
        
        // Mandamos la data de la API externa como respuesta JSON
        res.json({
            success: true,
            origen: 'API Externa (Dog CEO)',
            data: response.data.message
        });
    } catch (error) {
        console.error('Error al consultar API externa:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Error comunicándose con la API externa' 
        });
    }
});
});