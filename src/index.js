import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import axios from 'axios';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Log environment variables
console.log('🔍 Environment variables:');
console.log('KAGGLE_URL:', process.env.KAGGLE_URL);
console.log('PORT:', process.env.PORT);

const app = express();
const startPort = parseInt(process.env.PORT) || 3001;

// Middleware
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for development
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' })); // Increase JSON limit
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Increase URL-encoded limit

// Set timeout to 60 seconds
app.use((req, res, next) => {
    res.setTimeout(60000); // 60 seconds
    next();
});

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Get the Kaggle URL from environment variable
const KAGGLE_URL = process.env.KAGGLE_URL;
if (!KAGGLE_URL) {
    console.error('KAGGLE_URL environment variable is not set');
    process.exit(1);
}

console.log(`🔗 Using KAGGLE URL: ${KAGGLE_URL}`);

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        console.log(`🔄 Testing connection to: ${KAGGLE_URL}/health`);
        const response = await axios.get(`${KAGGLE_URL}/health`, {
            timeout: 5000 // 5 second timeout for health check
        });
        console.log('✅ Health check successful:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        res.status(500).json({
            error: 'Failed to connect to KAGGLE API',
            details: error.message,
            url: KAGGLE_URL
        });
    }
});

// Test endpoint to check what parameters the Kaggle API supports
app.post('/api/test-params', async (req, res) => {
    try {
        console.log('🧪 Testing parameters with Kaggle API...');
        console.log('Test request body:', JSON.stringify(req.body, null, 2));
        
        const response = await axios.post(`${KAGGLE_URL}/generate`, req.body, {
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Test successful:', response.data);
        res.json({
            success: true,
            message: 'Parameters accepted by Kaggle API',
            response: response.data
        });
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Test failed',
            details: error.response?.data || error.message
        });
    }
});

// Configure proxy middleware for Kaggle API
app.use('/api', createProxyMiddleware({
    target: KAGGLE_URL,
    changeOrigin: true,
    secure: false,
    pathRewrite: {
        '^/api': ''
    },
    onProxyReq: (proxyReq, req, res) => {
        // Log the request being proxied
        console.log(`Proxying request to: ${KAGGLE_URL}${req.url}`);
        console.log('Request method:', req.method);
        console.log('Request headers:', req.headers);
        if (req.body) {
            console.log('Request body:', JSON.stringify(req.body, null, 2));
            console.log('Quality parameters being sent:');
            console.log('- guidance_scale:', req.body.guidance_scale);
            console.log('- num_inference_steps:', req.body.num_inference_steps);
            console.log('- height:', req.body.height);
            console.log('- width:', req.body.width);
            console.log('- num_frames:', req.body.num_frames);
            console.log('- fps:', req.body.fps);
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`Response status: ${proxyRes.statusCode}`);
        console.log('Response headers:', proxyRes.headers);
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
        console.error('Error details:', {
            message: err.message,
            code: err.code,
            url: KAGGLE_URL,
            path: req.url
        });
        res.status(500).json({ 
            error: 'Failed to connect to Kaggle server',
            details: err.message
        });
    }
}));

// Function to find an available port
const findAvailablePort = async (startPort) => {
    const net = await import('net');
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(findAvailablePort(startPort + 1));
            } else {
                reject(err);
            }
        });
        server.listen(startPort, () => {
            server.close(() => {
                resolve(startPort);
            });
        });
    });
};

// Start server with error handling and port finding
const startServer = async () => {
    try {
        const port = await findAvailablePort(startPort);
        const server = app.listen(port, () => {
            console.log(`🚀 Server is running on port ${port}`);
            console.log(`🔗 Proxying to KAGGLE API at: ${KAGGLE_URL}`);
            console.log('📝 Available endpoints:');
            console.log(`   - Health check: http://localhost:${port}/api/health`);
            console.log(`   - Generate: http://localhost:${port}/api/generate`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
};

startServer(); 
