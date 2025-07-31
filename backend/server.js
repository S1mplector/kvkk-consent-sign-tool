/**
 * KVKK Consent Backend Server
 * Express server for handling consent form submissions and email delivery
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Import routes
const consentRoutes = require('./routes/consent');
const emailRoutes = require('./routes/email');

// Import services
const emailService = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
}));

// CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL || 'https://your-domain.com'
        : ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:8001', 'http://127.0.0.1:8001'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// Stricter rate limiting for form submissions
const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each IP to 5 submissions per hour
    message: {
        error: 'Too many form submissions, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0',
        emailService: emailService.isConfigured() ? 'Ready' : 'Not configured',
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

// API Routes
app.use('/api/consent', submitLimiter, upload.single('pdf'), consentRoutes);
app.use('/api/email', emailRoutes);

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

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 KVKK Consent Backend Server running on port ${PORT}`);
    console.log(`📧 Email service: ${emailService.isConfigured() ? 'Configured' : 'Not configured'}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 CORS enabled for: ${JSON.stringify(corsOptions.origin)}`);
});

module.exports = app;