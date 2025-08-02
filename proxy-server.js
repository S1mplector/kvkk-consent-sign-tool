/**
 * Reverse Proxy Server for KVKK Consent Application
 * Serves frontend files and proxies /api requests to backend server
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');

const app = express();

// IMPORTANT: Do not use body parsing middleware for multipart/form-data
// Let the proxy handle the raw request body
const PORT = process.env.PROXY_PORT || 8080;
const BACKEND_PORT = process.env.BACKEND_PORT || 3000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

// Start backend server automatically
let backendProcess;

function startBackendServer() {
    console.log('🚀 Starting backend server...');
    backendProcess = spawn('node', ['server.js'], {
        stdio: 'pipe',
        cwd: path.join(__dirname, 'backend'), // Set working directory to backend folder
        env: { ...process.env, PORT: BACKEND_PORT }
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`[Backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`[Backend Error] ${data.toString().trim()}`);
    });

    backendProcess.on('close', (code) => {
        console.log(`[Backend] Process exited with code ${code}`);
    });

    backendProcess.on('error', (error) => {
        console.error(`[Backend] Failed to start: ${error.message}`);
    });
}

// Proxy configuration for API requests
const apiProxy = createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    timeout: 30000,
    proxyTimeout: 30000,
    // Important: Let the proxy handle the request/response streaming
    selfHandleResponse: false,
    // CRITICAL: Enable cookie forwarding for session-based CSRF
    cookieDomainRewrite: {
        "*": "" // Remove domain from cookies
    },
    // Ensure headers are properly forwarded
    onProxyReq: (proxyReq, req, res) => {
        console.log(`📤 [Proxy Request] ${req.method} ${req.url} -> ${BACKEND_URL}${req.url}`);
        
        // Log important headers for debugging
        console.log('   Cookie header:', req.headers.cookie || 'No cookies');
        console.log('   CSRF header:', req.headers['x-csrf-token'] || 'No CSRF header');
        
        if (req.method === 'POST') {
            console.log('   Headers:', req.headers['content-type']);
            
            // For multipart/form-data, ensure proper handling
            if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
                console.log('   Multipart form data detected');
                // Don't modify content-length for multipart data
                // The proxy will handle it automatically
            }
        }
        
        // Forward the host header to maintain proper origin
        proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
        proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`📥 [Proxy Response] ${req.method} ${req.url} <- Status: ${proxyRes.statusCode}`);
        
        // Log Set-Cookie headers for debugging
        const setCookieHeaders = proxyRes.headers['set-cookie'];
        if (setCookieHeaders) {
            console.log('   Set-Cookie headers:', setCookieHeaders.length, 'cookie(s)');
        }
    },
    onError: (err, req, res) => {
        console.error('❌ [Proxy Error]:', err.message);
        console.error('   Request:', req.method, req.url);
        console.error('   Target:', BACKEND_URL);
        console.error('   Error code:', err.code);
        
        // Check if backend is not responding
        if (err.code === 'ECONNREFUSED') {
            console.error('   ⚠️  Backend server is not running or not accessible');
        }
        
        res.status(500).json({
            error: 'Backend service unavailable',
            message: 'Please ensure the backend server is running',
            details: err.message
        });
    }
});

// Middleware for logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Proxy API requests to backend
app.use('/api', (req, res, next) => {
    console.log(`🔀 [Proxy] Intercepted API request: ${req.method} ${req.path}`);
    apiProxy(req, res, next);
});

// Serve static frontend files
app.use(express.static('.', {
    index: 'index.html',
    setHeaders: (res, path) => {
        // Set appropriate MIME types
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.pdf')) {
            res.setHeader('Content-Type', 'application/pdf');
        } else if (path.endsWith('.png')) {
            res.setHeader('Content-Type', 'image/png');
        } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
            res.setHeader('Content-Type', 'image/jpeg');
        }
        
        // Security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
    }
}));

// Health check endpoint for the proxy
app.get('/proxy-health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        proxy: {
            port: PORT,
            backendTarget: BACKEND_URL
        },
        uptime: process.uptime()
    });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    // Don't serve index.html for API requests or static assets
    if (req.path.startsWith('/api') || 
        req.path.includes('.') && !req.path.endsWith('.html')) {
        return res.status(404).json({
            error: 'Not found',
            path: req.path
        });
    }
    
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Proxy server error:', error);
    res.status(500).json({
        error: 'Internal proxy server error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message
    });
});

// Graceful shutdown
function gracefulShutdown() {
    console.log('\n🛑 Shutting down proxy server...');
    
    if (backendProcess) {
        console.log('🛑 Stopping backend server...');
        backendProcess.kill('SIGTERM');
        
        setTimeout(() => {
            if (!backendProcess.killed) {
                console.log('🔥 Force killing backend server...');
                backendProcess.kill('SIGKILL');
            }
        }, 5000);
    }
    
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the servers
async function startServers() {
    try {
        // Start backend server first
        startBackendServer();
        
        // Wait a moment for backend to start
        console.log('⏳ Waiting for backend server to start...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if backend is ready
        const checkBackend = async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/api/health`);
                if (response.ok) {
                    console.log('✅ Backend server is ready!');
                    return true;
                }
            } catch (error) {
                console.log('⏳ Backend not ready yet...');
            }
            return false;
        };
        
        // Wait for backend to be ready (max 10 seconds)
        let backendReady = false;
        for (let i = 0; i < 10; i++) {
            if (await checkBackend()) {
                backendReady = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (!backendReady) {
            console.error('❌ Backend server failed to start properly');
        }
        
        // Start proxy server
        const server = app.listen(PORT, () => {
            console.log(`\n🌐 KVKK Consent Application running on:`);
            console.log(`   Local:    http://localhost:${PORT}`);
            console.log(`   Network:  http://0.0.0.0:${PORT}`);
            console.log(`\n📡 Proxying /api requests to: ${BACKEND_URL}`);
            console.log(`📁 Serving frontend files from: ${__dirname}`);
            console.log(`\n🚀 Ready for ngrok tunnel on port ${PORT}`);
            console.log(`   Example: ngrok http ${PORT}`);
        });

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use. Please choose a different port.`);
                process.exit(1);
            } else {
                console.error('❌ Server error:', error);
            }
        });

    } catch (error) {
        console.error('❌ Failed to start servers:', error);
        process.exit(1);
    }
}

// Start everything
startServers();

module.exports = app;