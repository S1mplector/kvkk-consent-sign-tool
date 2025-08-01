/**
 * Security Configuration
 * Centralized security settings for the KVKK consent application
 */

const crypto = require('crypto');

class SecurityConfig {
    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.isDevelopment = this.environment === 'development';
        this.isProduction = this.environment === 'production';
    }

    /**
     * Get HTTPS/TLS configuration
     */
    getTLSConfig() {
        return {
            // HSTS Configuration
            hsts: {
                maxAge: this.isProduction ? 31536000 : 86400, // 1 year in prod, 1 day in dev
                includeSubDomains: true,
                preload: this.isProduction
            },
            
            // Force HTTPS in production
            forceHTTPS: this.isProduction,
            
            // Trust proxy settings
            trustProxy: this.isProduction ? 1 : false
        };
    }

    /**
     * Get session configuration
     */
    getSessionConfig() {
        return {
            secret: process.env.SESSION_SECRET || this.generateSessionSecret(),
            name: 'kvkk.sid',
            resave: false,
            saveUninitialized: false,
            rolling: true,
            cookie: {
                secure: this.isProduction, // HTTPS only in production
                httpOnly: true,
                maxAge: 30 * 60 * 1000, // 30 minutes
                sameSite: 'strict'
            },
            // Use Redis in production, memory in development
            store: this.getSessionStore()
        };
    }

    /**
     * Get session store configuration
     */
    getSessionStore() {
        if (this.isProduction && process.env.REDIS_URL) {
            const redis = require('redis');
            const RedisStore = require('connect-redis').default;
            
            const redisClient = redis.createClient({
                url: process.env.REDIS_URL
            });
            
            redisClient.connect().catch(console.error);
            
            return new RedisStore({
                client: redisClient,
                prefix: 'kvkk:sess:',
                ttl: 1800 // 30 minutes
            });
        }
        
        // Use memory store for development
        return null;
    }

    /**
     * Get CSRF configuration
     */
    getCSRFConfig() {
        return {
            cookie: {
                httpOnly: true,
                secure: this.isProduction,
                sameSite: 'strict',
                maxAge: 3600000 // 1 hour
            },
            ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
            value: (req) => {
                return req.body._csrf || 
                       req.query._csrf || 
                       req.headers['csrf-token'] ||
                       req.headers['x-csrf-token'] ||
                       req.headers['x-xsrf-token'];
            }
        };
    }

    /**
     * Get enhanced Helmet configuration for Mozilla Observatory A+ grade
     */
    getHelmetConfig() {
        return {
            // Content Security Policy
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: [
                        "'self'", 
                        "'unsafe-inline'", // Required for inline styles
                        "https://fonts.googleapis.com",
                        "https://cdnjs.cloudflare.com"
                    ],
                    scriptSrc: [
                        "'self'",
                        "'unsafe-inline'", // Required for inline scripts
                        "https://cdnjs.cloudflare.com",
                        "https://unpkg.com",
                        "https://cdn.jsdelivr.net"
                    ],
                    imgSrc: [
                        "'self'", 
                        "data:", 
                        "blob:",
                        "https:"
                    ],
                    connectSrc: ["'self'"],
                    fontSrc: [
                        "'self'",
                        "https://fonts.gstatic.com",
                        "https://cdnjs.cloudflare.com"
                    ],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                    childSrc: ["'none'"],
                    workerSrc: ["'none'"],
                    manifestSrc: ["'self'"],
                    baseUri: ["'self'"],
                    formAction: ["'self'"],
                    frameAncestors: ["'none'"],
                    upgradeInsecureRequests: this.isProduction ? [] : null
                },
                reportOnly: false
            },

            // HTTP Strict Transport Security
            hsts: this.getTLSConfig().hsts,

            // X-Frame-Options
            frameguard: {
                action: 'deny'
            },

            // X-Content-Type-Options
            noSniff: true,

            // X-XSS-Protection
            xssFilter: true,

            // Referrer Policy
            referrerPolicy: {
                policy: ['no-referrer', 'strict-origin-when-cross-origin']
            },

            // X-Permitted-Cross-Domain-Policies
            permittedCrossDomainPolicies: false,

            // X-DNS-Prefetch-Control
            dnsPrefetchControl: {
                allow: false
            },

            // Expect-CT
            expectCt: this.isProduction ? {
                maxAge: 86400,
                enforce: true
            } : false,

            // Feature Policy / Permissions Policy
            permissionsPolicy: {
                camera: [],
                microphone: [],
                geolocation: [],
                payment: [],
                usb: [],
                magnetometer: [],
                gyroscope: [],
                accelerometer: [],
                ambient_light_sensor: [],
                autoplay: [],
                encrypted_media: [],
                fullscreen: ['self'],
                picture_in_picture: []
            }
        };
    }

    /**
     * Get rate limiting configuration
     */
    getRateLimitConfig() {
        return {
            // General API rate limiting
            general: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: this.isProduction ? 100 : 1000, // More lenient in development
                message: {
                    error: 'Too many requests from this IP, please try again later.',
                    code: 'RATE_LIMIT_EXCEEDED'
                },
                standardHeaders: true,
                legacyHeaders: false,
                skip: (req) => {
                    // Skip rate limiting for health checks
                    return req.path === '/api/health';
                }
            },

            // Form submission rate limiting
            submission: {
                windowMs: 60 * 60 * 1000, // 1 hour
                max: this.isProduction ? 5 : 50, // More lenient in development
                message: {
                    error: 'Too many form submissions, please try again later.',
                    code: 'SUBMISSION_LIMIT_EXCEEDED'
                },
                standardHeaders: true,
                legacyHeaders: false,
                skipSuccessfulRequests: true
            },

            // Progressive delay for repeated requests
            slowDown: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                delayAfter: 5, // Allow 5 requests per windowMs without delay
                delayMs: 500, // Add 500ms delay per request after delayAfter
                maxDelayMs: 20000, // Maximum delay of 20 seconds
                skipSuccessfulRequests: true
            },

            // Brute force protection
            bruteForce: {
                freeRetries: 3,
                minWait: 5 * 60 * 1000, // 5 minutes
                maxWait: 60 * 60 * 1000, // 1 hour
                failureWindow: 15 * 60 * 1000, // 15 minutes
                maxConsecutiveFails: 10
            }
        };
    }

    /**
     * Get encryption configuration
     */
    getEncryptionConfig() {
        return {
            algorithm: 'aes-256-gcm',
            keyLength: 32,
            ivLength: 16,
            tagLength: 16,
            saltLength: 32,
            iterations: 100000,
            
            // Get or generate encryption key
            getKey: () => {
                const key = process.env.ENCRYPTION_KEY;
                if (key) {
                    return Buffer.from(key, 'hex');
                }
                
                // Generate a new key for development
                if (this.isDevelopment) {
                    const newKey = crypto.randomBytes(32);
                    console.warn('⚠️  Generated new encryption key for development. Set ENCRYPTION_KEY in production!');
                    console.warn('Generated key:', newKey.toString('hex'));
                    return newKey;
                }
                
                throw new Error('ENCRYPTION_KEY environment variable is required in production');
            }
        };
    }

    /**
     * Get JWT configuration for tokenized downloads
     */
    getJWTConfig() {
        return {
            secret: process.env.JWT_SECRET || this.generateJWTSecret(),
            expiresIn: '1h',
            issuer: 'kvkk-consent-system',
            audience: 'kvkk-download-service',
            algorithm: 'HS256'
        };
    }

    /**
     * Get data retention configuration
     */
    getRetentionConfig() {
        return {
            // Default retention period (KVKK compliance)
            defaultRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS) || 30,
            
            // Cleanup schedule (cron format)
            cleanupSchedule: process.env.CLEANUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
            
            // File paths
            dataPath: process.env.DATA_PATH || './storage/encrypted',
            tempPath: process.env.TEMP_PATH || './storage/temp',
            logPath: process.env.LOG_PATH || './storage/logs',
            
            // Secure deletion
            secureDelete: true,
            overwritePasses: 3
        };
    }

    /**
     * Get validation configuration
     */
    getValidationConfig() {
        return {
            // Input length limits
            maxNameLength: 100,
            maxEmailLength: 254,
            maxFileSize: 10 * 1024 * 1024, // 10MB
            
            // Allowed file types
            allowedMimeTypes: ['application/pdf'],
            allowedExtensions: ['.pdf'],
            
            // Input sanitization
            sanitizeOptions: {
                allowedTags: [],
                allowedAttributes: {},
                disallowedTagsMode: 'discard'
            }
        };
    }

    /**
     * Generate session secret if not provided
     */
    generateSessionSecret() {
        const secret = crypto.randomBytes(64).toString('hex');
        if (this.isDevelopment) {
            console.warn('⚠️  Generated session secret for development. Set SESSION_SECRET in production!');
        }
        return secret;
    }

    /**
     * Generate JWT secret if not provided
     */
    generateJWTSecret() {
        const secret = crypto.randomBytes(64).toString('hex');
        if (this.isDevelopment) {
            console.warn('⚠️  Generated JWT secret for development. Set JWT_SECRET in production!');
        }
        return secret;
    }

    /**
     * Get all security configurations
     */
    getAllConfigs() {
        return {
            environment: this.environment,
            tls: this.getTLSConfig(),
            session: this.getSessionConfig(),
            csrf: this.getCSRFConfig(),
            helmet: this.getHelmetConfig(),
            rateLimit: this.getRateLimitConfig(),
            encryption: this.getEncryptionConfig(),
            jwt: this.getJWTConfig(),
            retention: this.getRetentionConfig(),
            validation: this.getValidationConfig()
        };
    }
}

// Export singleton instance
module.exports = new SecurityConfig();