/**
 * Security Middleware Collection
 * Comprehensive security middleware for KVKK consent application
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const session = require('express-session');
const csrf = require('csurf');
const { body, validationResult } = require('express-validator');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const securityConfig = require('../config/security');
const tokenService = require('../services/tokenService');

// Initialize DOMPurify for server-side sanitization
const window = new JSDOM('').window;
const purify = DOMPurify(window);

class SecurityMiddleware {
    constructor() {
        this.config = securityConfig;
        this.rateLimitConfig = this.config.getRateLimitConfig();
        this.helmetConfig = this.config.getHelmetConfig();
        this.sessionConfig = this.config.getSessionConfig();
        this.csrfConfig = this.config.getCSRFConfig();
    }

    /**
     * Enhanced Helmet configuration for Mozilla Observatory A+ grade
     */
    getHelmetMiddleware() {
        return helmet({
            ...this.helmetConfig,
            // Override xssFilter to ensure it's set to "1; mode=block"
            xssFilter: false // Disable Helmet's xssFilter so we can set it manually
        });
    }

    /**
     * HTTPS redirect middleware
     */
    getHTTPSRedirect() {
        return (req, res, next) => {
            if (this.config.isProduction && !req.secure && req.get('x-forwarded-proto') !== 'https') {
                return res.redirect(301, `https://${req.get('host')}${req.url}`);
            }
            next();
        };
    }

    /**
     * Trust proxy configuration
     */
    getTrustProxy() {
        return (req, res, next) => {
            if (this.config.isProduction) {
                req.app.set('trust proxy', this.config.getTLSConfig().trustProxy);
            }
            next();
        };
    }

    /**
     * Session middleware with secure configuration
     */
    getSessionMiddleware() {
        return session(this.sessionConfig);
    }

    /**
     * CSRF protection middleware
     */
    getCSRFMiddleware() {
        const csrfProtection = csrf(this.csrfConfig);
        
        return (req, res, next) => {
            // Skip CSRF for certain endpoints
            const skipPaths = ['/api/health', '/api/config'];
            if (skipPaths.includes(req.path)) {
                return next();
            }

            csrfProtection(req, res, (err) => {
                if (err) {
                    console.error('❌ CSRF validation failed:', err.message);
                    return res.status(403).json({
                        error: 'CSRF token validation failed',
                        code: 'CSRF_INVALID'
                    });
                }
                next();
            });
        };
    }

    /**
     * CSRF token provider middleware
     */
    getCSRFTokenProvider() {
        return (req, res, next) => {
            if (req.csrfToken) {
                res.locals.csrfToken = req.csrfToken();
            }
            next();
        };
    }

    /**
     * General rate limiting middleware
     */
    getGeneralRateLimit() {
        return rateLimit(this.rateLimitConfig.general);
    }

    /**
     * Form submission rate limiting
     */
    getSubmissionRateLimit() {
        return rateLimit(this.rateLimitConfig.submission);
    }

    /**
     * Progressive delay middleware
     */
    getSlowDownMiddleware() {
        return slowDown(this.rateLimitConfig.slowDown);
    }

    /**
     * Brute force protection middleware
     */
    getBruteForceProtection() {
        const attempts = new Map(); // In production, use Redis
        
        return (req, res, next) => {
            const key = req.ip;
            const now = Date.now();
            const windowMs = this.rateLimitConfig.bruteForce.failureWindow;
            
            // Clean old attempts
            const userAttempts = attempts.get(key) || [];
            const recentAttempts = userAttempts.filter(time => now - time < windowMs);
            
            if (recentAttempts.length >= this.rateLimitConfig.bruteForce.maxConsecutiveFails) {
                const oldestAttempt = Math.min(...recentAttempts);
                const waitTime = windowMs - (now - oldestAttempt);
                
                return res.status(429).json({
                    error: 'Too many failed attempts. Please try again later.',
                    code: 'BRUTE_FORCE_DETECTED',
                    retryAfter: Math.ceil(waitTime / 1000)
                });
            }
            
            // Store attempt tracking in request for later use
            req.bruteForceTracking = {
                key,
                attempts: recentAttempts,
                recordFailure: () => {
                    recentAttempts.push(now);
                    attempts.set(key, recentAttempts);
                },
                recordSuccess: () => {
                    attempts.delete(key);
                }
            };
            
            next();
        };
    }

    /**
     * Enhanced input validation middleware
     */
    getInputValidation() {
        return {
            // Sanitize all string inputs
            sanitizeInputs: (req, res, next) => {
                try {
                    this.sanitizeObject(req.body);
                    this.sanitizeObject(req.query);
                    this.sanitizeObject(req.params);
                    next();
                } catch (error) {
                    console.error('❌ Input sanitization failed:', error);
                    res.status(400).json({
                        error: 'Invalid input data',
                        code: 'INPUT_SANITIZATION_FAILED'
                    });
                }
            },

            // Validate form data structure
            validateFormStructure: [
                body('formData').isJSON().withMessage('Form data must be valid JSON'),
                body('formData').custom((value) => {
                    try {
                        const data = JSON.parse(value);
                        return this.validateFormDataStructure(data);
                    } catch (error) {
                        throw new Error(`Form validation failed: ${error.message}`);
                    }
                })
            ],

            // Check validation results
            checkValidationResults: (req, res, next) => {
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    // Record validation failure for brute force protection
                    if (req.bruteForceTracking) {
                        req.bruteForceTracking.recordFailure();
                    }
                    
                    return res.status(400).json({
                        error: 'Validation failed',
                        details: errors.array(),
                        code: 'VALIDATION_ERROR'
                    });
                }
                next();
            }
        };
    }

    /**
     * XSS protection middleware
     */
    getXSSProtection() {
        return (req, res, next) => {
            // Override res.json to sanitize output
            const originalJson = res.json;
            res.json = function(data) {
                if (data && typeof data === 'object') {
                    data = JSON.parse(JSON.stringify(data, (key, value) => {
                        if (typeof value === 'string') {
                            return purify.sanitize(value);
                        }
                        return value;
                    }));
                }
                return originalJson.call(this, data);
            };
            
            next();
        };
    }

    /**
     * File upload security middleware
     */
    getFileUploadSecurity() {
        return (req, res, next) => {
            if (req.file) {
                const file = req.file;
                
                // Validate file type
                const allowedTypes = this.config.getValidationConfig().allowedMimeTypes;
                if (!allowedTypes.includes(file.mimetype)) {
                    return res.status(400).json({
                        error: 'Invalid file type',
                        code: 'INVALID_FILE_TYPE'
                    });
                }
                
                // Validate file size
                const maxSize = this.config.getValidationConfig().maxFileSize;
                if (file.size > maxSize) {
                    return res.status(400).json({
                        error: 'File too large',
                        code: 'FILE_TOO_LARGE'
                    });
                }
                
                // Add security headers for file handling
                res.set({
                    'X-Content-Type-Options': 'nosniff',
                    'Content-Disposition': 'attachment'
                });
            }
            
            next();
        };
    }

    /**
     * Request logging middleware
     */
    getRequestLogger() {
        return (req, res, next) => {
            const start = Date.now();
            const timestamp = new Date().toISOString();
            
            // Log request
            console.log(`📥 ${timestamp} - ${req.method} ${req.path} - IP: ${req.ip} - UA: ${req.get('User-Agent')?.substring(0, 100)}`);
            
            // Log response
            res.on('finish', () => {
                const duration = Date.now() - start;
                const level = res.statusCode >= 400 ? '❌' : '✅';
                console.log(`📤 ${level} ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
            });
            
            next();
        };
    }

    /**
     * Security headers middleware
     */
    getSecurityHeaders() {
        return (req, res, next) => {
            // Additional security headers not covered by Helmet
            res.set({
                'X-Request-ID': req.id || 'unknown',
                'X-Response-Time': Date.now(),
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Surrogate-Control': 'no-store',
                // Manually set X-XSS-Protection header
                'X-XSS-Protection': '1; mode=block'
            });
            
            next();
        };
    }

    /**
     * Token validation middleware for download endpoints
     */
    getTokenValidation() {
        return (req, res, next) => {
            try {
                const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
                
                if (!token) {
                    return res.status(401).json({
                        error: 'Download token required',
                        code: 'TOKEN_REQUIRED'
                    });
                }
                
                const validation = tokenService.verifyDownloadToken(token, {
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
                
                if (!validation.success) {
                    return res.status(401).json({
                        error: 'Invalid download token',
                        code: 'TOKEN_INVALID'
                    });
                }
                
                req.tokenData = validation;
                next();
                
            } catch (error) {
                console.error('❌ Token validation failed:', error);
                res.status(401).json({
                    error: error.message,
                    code: 'TOKEN_VALIDATION_FAILED'
                });
            }
        };
    }

    /**
     * Sanitize object recursively
     * @param {Object} obj - Object to sanitize
     */
    sanitizeObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                obj[key] = purify.sanitize(obj[key]);
            } else if (typeof obj[key] === 'object') {
                this.sanitizeObject(obj[key]);
            }
        }
    }

    /**
     * Validate form data structure
     * @param {Object} formData - Form data to validate
     * @returns {boolean} True if valid
     */
    validateFormDataStructure(formData) {
        const requiredFields = ['patientName', 'email', 'role', 'timestamp'];
        const validationConfig = this.config.getValidationConfig();
        
        for (const field of requiredFields) {
            if (!formData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        // Validate field lengths
        if (formData.patientName.length > validationConfig.maxNameLength) {
            throw new Error('Patient name too long');
        }
        
        if (formData.email.length > validationConfig.maxEmailLength) {
            throw new Error('Email too long');
        }
        
        // Validate role
        if (!['patient', 'guardian'].includes(formData.role)) {
            throw new Error('Invalid role');
        }
        
        // Guardian-specific validation
        if (formData.role === 'guardian') {
            if (!formData.guardianName || !formData.relationshipDegree) {
                throw new Error('Guardian information required');
            }
        }
        
        return true;
    }

    /**
     * Get all security middleware in correct order
     */
    getAllMiddleware() {
        return {
            // Core security
            trustProxy: this.getTrustProxy(),
            httpsRedirect: this.getHTTPSRedirect(),
            helmet: this.getHelmetMiddleware(),
            securityHeaders: this.getSecurityHeaders(),
            
            // Session and CSRF
            session: this.getSessionMiddleware(),
            csrf: this.getCSRFMiddleware(),
            csrfToken: this.getCSRFTokenProvider(),
            
            // Rate limiting
            generalRateLimit: this.getGeneralRateLimit(),
            slowDown: this.getSlowDownMiddleware(),
            bruteForce: this.getBruteForceProtection(),
            submissionRateLimit: this.getSubmissionRateLimit(),
            
            // Input/Output protection
            inputValidation: this.getInputValidation(),
            xssProtection: this.getXSSProtection(),
            fileUploadSecurity: this.getFileUploadSecurity(),
            
            // Utilities
            requestLogger: this.getRequestLogger(),
            tokenValidation: this.getTokenValidation()
        };
    }
}

// Export singleton instance
module.exports = new SecurityMiddleware();