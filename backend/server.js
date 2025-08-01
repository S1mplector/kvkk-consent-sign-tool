/**
 * KVKK Consent Backend Server
 * Express server for handling consent form submissions and email delivery
 * Enhanced with comprehensive security measures
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
require('dotenv').config();

// Import security configuration and middleware
const securityConfig = require('./config/security');
const securityMiddleware = require('./middleware/security');

// Import routes
const consentRoutes = require('./routes/consent');
const emailRoutes = require('./routes/email');
const downloadRoutes = require('./routes/download');

// Import services
const emailService = require('./services/emailService');
const encryptionService = require('./services/encryptionService');
const storageService = require('./services/storageService');
const tokenService = require('./services/tokenService');
const cleanupService = require('./services/cleanupService');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize security middleware
const security = securityMiddleware.getAllMiddleware();

// Apply security middleware in correct order
app.use(security.trustProxy);
app.use(security.httpsRedirect);
app.use(security.helmet);
app.use(security.securityHeaders);

// Session management
app.use(security.session);

// CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL || 'https://your-domain.com'
        : ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:8001', 'http://127.0.0.1:8001', 'http://localhost:8080'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting and brute force protection
app.use('/api/', security.generalRateLimit);
app.use('/api/', security.slowDown);
app.use('/api/', security.bruteForce);

// Input/Output protection
app.use(security.inputValidation.sanitizeInputs);
app.use(security.xssProtection);

// Request logging
app.use(security.requestLogger);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for file uploads with enhanced security
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: securityConfig.getValidationConfig().maxFileSize,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = securityConfig.getValidationConfig().allowedMimeTypes;
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// File upload security middleware
app.use(security.fileUploadSecurity);

// Health check endpoint with enhanced security status
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '2.0.0',
        services: {
            email: emailService.isConfigured() ? 'Ready' : 'Not configured',
            encryption: 'Ready',
            storage: 'Ready',
            tokens: 'Ready',
            cleanup: cleanupService.isRunning ? 'Running' : 'Stopped'
        },
        security: {
            https: securityConfig.isProduction,
            csrf: 'Enabled',
            rateLimit: 'Enabled',
            encryption: 'AES-256-GCM',
            headers: 'Enhanced'
        },
        cors: corsOptions.origin
    });
});

// Test CORS endpoint
app.options('/api/test-cors', cors(corsOptions));
app.post('/api/test-cors', cors(corsOptions), (req, res) => {
    console.log('🔍 CORS test request received from:', req.headers.origin);
    res.json({
        success: true,
        origin: req.headers.origin,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// Configuration endpoint
app.get('/api/config', (req, res) => {
    res.json({
        maxFileSize: '10MB',
        allowedFileTypes: ['application/pdf'],
        rateLimit: {
            general: '100 requests per 15 minutes',
            submissions: '5 submissions per hour'
        },
        features: {
            emailDelivery: true,
            pdfProcessing: true,
            digitalSignatures: true
        }
    });
});

// CSRF protection for form routes
app.use('/api/consent', security.csrf);
app.use('/api/consent', security.csrfToken);

// API Routes with enhanced security
app.use('/api/consent', security.submissionRateLimit, upload.single('pdf'), security.inputValidation.validateFormStructure, security.inputValidation.checkValidationResults, consentRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/download', downloadRoutes);

// Security testing endpoints (development only)
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/security/test', async (req, res) => {
        try {
            const encryptionTest = await encryptionService.testEncryption();
            const tokenStats = tokenService.getTokenStats();
            const storageStats = await storageService.getStorageStats();
            const cleanupStats = cleanupService.getStats();

            res.json({
                encryption: encryptionTest,
                tokens: tokenStats,
                storage: storageStats,
                cleanup: cleanupStats
            });
        } catch (error) {
            res.status(500).json({
                error: 'Security test failed',
                message: error.message
            });
        }
    });
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Error occurred:', error);

    // Multer errors
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large. Maximum size is 10MB.',
                code: 'FILE_TOO_LARGE'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Too many files. Only one file is allowed.',
                code: 'TOO_MANY_FILES'
            });
        }
    }

    // File type errors
    if (error.message === 'Only PDF files are allowed') {
        return res.status(400).json({
            error: 'Invalid file type. Only PDF files are allowed.',
            code: 'INVALID_FILE_TYPE'
        });
    }

    // Validation errors
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation failed',
            details: error.details || error.message,
            code: 'VALIDATION_ERROR'
        });
    }

    // Default error response
    const statusCode = error.statusCode || error.status || 500;
    const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message;

    res.status(statusCode).json({
        error: message,
        code: error.code || 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.originalUrl
    });
});

// Graceful shutdown with security service cleanup
async function gracefulShutdown(signal) {
    console.log(`${signal} received, shutting down gracefully...`);
    
    try {
        // Stop security services
        console.log('🛑 Stopping security services...');
        
        cleanupService.stop();
        tokenService.stopCleanupScheduler();
        
        console.log('✅ Security services stopped');
        
        // Close server
        const serverInstance = await server;
        if (serverInstance && serverInstance.close) {
            serverInstance.close(() => {
                console.log('🛑 Server closed');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
        
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Initialize security services
async function initializeServices() {
    try {
        console.log('🔧 Initializing security services...');
        
        // Test encryption service
        const encryptionTest = await encryptionService.testEncryption();
        if (!encryptionTest.success) {
            throw new Error('Encryption service test failed');
        }
        console.log('✅ Encryption service initialized');
        
        // Initialize storage service (creates directories)
        console.log('✅ Storage service initialized');
        
        // Start token cleanup scheduler
        tokenService.startCleanupScheduler();
        console.log('✅ Token service initialized');
        
        // Start cleanup service
        cleanupService.start();
        console.log('✅ Cleanup service initialized');
        
        console.log('🔒 All security services initialized successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize security services:', error);
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
}

// Create HTTPS server for production
function createServer() {
    if (securityConfig.isProduction && process.env.SSL_CERT && process.env.SSL_KEY) {
        try {
            const httpsOptions = {
                key: require('fs').readFileSync(process.env.SSL_KEY),
                cert: require('fs').readFileSync(process.env.SSL_CERT)
            };
            
            return https.createServer(httpsOptions, app);
        } catch (error) {
            console.error('❌ Failed to create HTTPS server:', error);
            console.log('⚠️  Falling back to HTTP server');
        }
    }
    
    return app;
}

// Start server
async function startServer() {
    try {
        // Initialize services first
        await initializeServices();
        
        // Create server (HTTPS in production, HTTP in development)
        const server = createServer();
        
        // Start listening
        server.listen(PORT, () => {
            console.log(`🚀 KVKK Consent Backend Server running on port ${PORT}`);
            console.log(`🔒 Protocol: ${securityConfig.isProduction && process.env.SSL_CERT ? 'HTTPS' : 'HTTP'}`);
            console.log(`📧 Email service: ${emailService.isConfigured() ? 'Configured' : 'Not configured'}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔒 CORS enabled for: ${JSON.stringify(corsOptions.origin)}`);
            console.log(`🛡️  Security features: Enhanced (Helmet, CSRF, Rate Limiting, Encryption)`);
            console.log(`📊 Data retention: ${securityConfig.getRetentionConfig().defaultRetentionDays} days`);
        });
        
        return server;
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
const server = startServer();

module.exports = app;