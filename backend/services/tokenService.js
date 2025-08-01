/**
 * Token Service
 * Handles secure tokenized download links with JWT
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const securityConfig = require('../config/security');

class TokenService {
    constructor() {
        this.config = securityConfig.getJWTConfig();
        this.activeTokens = new Map(); // In-memory token tracking
    }

    /**
     * Generate secure download token
     * @param {string} submissionId - Submission ID
     * @param {Object} options - Token options
     * @returns {Object} Token data
     */
    generateDownloadToken(submissionId, options = {}) {
        try {
            const tokenId = crypto.randomUUID();
            const now = Math.floor(Date.now() / 1000);
            
            const payload = {
                jti: tokenId, // JWT ID
                sub: submissionId, // Subject (submission ID)
                iat: now, // Issued at
                exp: now + this.parseExpiresIn(options.expiresIn || this.config.expiresIn),
                iss: this.config.issuer,
                aud: this.config.audience,
                purpose: 'download',
                metadata: {
                    ip: options.ip || null,
                    userAgent: options.userAgent || null,
                    maxDownloads: options.maxDownloads || 1,
                    downloadCount: 0
                }
            };

            const token = jwt.sign(payload, this.config.secret, {
                algorithm: this.config.algorithm
            });

            // Store token metadata for tracking
            this.activeTokens.set(tokenId, {
                submissionId,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(payload.exp * 1000).toISOString(),
                downloadCount: 0,
                maxDownloads: payload.metadata.maxDownloads,
                ip: payload.metadata.ip,
                userAgent: payload.metadata.userAgent
            });

            return {
                success: true,
                token,
                tokenId,
                expiresAt: new Date(payload.exp * 1000).toISOString(),
                maxDownloads: payload.metadata.maxDownloads
            };

        } catch (error) {
            console.error('❌ Failed to generate download token:', error);
            throw new Error('Failed to generate secure download token');
        }
    }

    /**
     * Verify and validate download token
     * @param {string} token - JWT token
     * @param {Object} context - Request context
     * @returns {Object} Validation result
     */
    verifyDownloadToken(token, context = {}) {
        try {
            // Verify JWT signature and expiration
            const payload = jwt.verify(token, this.config.secret, {
                algorithms: [this.config.algorithm],
                issuer: this.config.issuer,
                audience: this.config.audience
            });

            const tokenId = payload.jti;
            const submissionId = payload.sub;

            // Check if token exists in our tracking
            const tokenData = this.activeTokens.get(tokenId);
            if (!tokenData) {
                throw new Error('Token not found or has been revoked');
            }

            // Check download limits
            if (tokenData.downloadCount >= tokenData.maxDownloads) {
                throw new Error('Download limit exceeded');
            }

            // Optional IP validation
            if (tokenData.ip && context.ip && tokenData.ip !== context.ip) {
                console.warn(`⚠️  IP mismatch for token ${tokenId}: expected ${tokenData.ip}, got ${context.ip}`);
                // Don't throw error, just log for security monitoring
            }

            return {
                success: true,
                submissionId,
                tokenId,
                payload,
                remainingDownloads: tokenData.maxDownloads - tokenData.downloadCount
            };

        } catch (error) {
            console.error('❌ Token verification failed:', error.message);
            
            if (error.name === 'TokenExpiredError') {
                throw new Error('Download link has expired');
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid download token');
            } else {
                throw new Error('Token validation failed');
            }
        }
    }

    /**
     * Record download attempt and update token usage
     * @param {string} tokenId - Token ID
     * @param {Object} context - Download context
     * @returns {Object} Update result
     */
    recordDownload(tokenId, context = {}) {
        try {
            const tokenData = this.activeTokens.get(tokenId);
            if (!tokenData) {
                throw new Error('Token not found');
            }

            // Increment download count
            tokenData.downloadCount++;
            tokenData.lastDownloadAt = new Date().toISOString();
            tokenData.lastDownloadIp = context.ip;

            // Update token data
            this.activeTokens.set(tokenId, tokenData);

            // If max downloads reached, mark for cleanup
            if (tokenData.downloadCount >= tokenData.maxDownloads) {
                setTimeout(() => {
                    this.revokeToken(tokenId);
                }, 60000); // Clean up after 1 minute
            }

            return {
                success: true,
                downloadCount: tokenData.downloadCount,
                remainingDownloads: tokenData.maxDownloads - tokenData.downloadCount
            };

        } catch (error) {
            console.error('❌ Failed to record download:', error);
            throw new Error('Failed to record download');
        }
    }

    /**
     * Revoke a specific token
     * @param {string} tokenId - Token ID to revoke
     * @returns {boolean} True if token was revoked
     */
    revokeToken(tokenId) {
        try {
            const existed = this.activeTokens.has(tokenId);
            this.activeTokens.delete(tokenId);
            
            if (existed) {
                console.log(`🔒 Token revoked: ${tokenId}`);
            }
            
            return existed;
        } catch (error) {
            console.error('❌ Failed to revoke token:', error);
            return false;
        }
    }

    /**
     * Revoke all tokens for a submission
     * @param {string} submissionId - Submission ID
     * @returns {number} Number of tokens revoked
     */
    revokeSubmissionTokens(submissionId) {
        try {
            let revokedCount = 0;
            
            for (const [tokenId, tokenData] of this.activeTokens.entries()) {
                if (tokenData.submissionId === submissionId) {
                    this.activeTokens.delete(tokenId);
                    revokedCount++;
                }
            }
            
            if (revokedCount > 0) {
                console.log(`🔒 Revoked ${revokedCount} tokens for submission: ${submissionId}`);
            }
            
            return revokedCount;
        } catch (error) {
            console.error('❌ Failed to revoke submission tokens:', error);
            return 0;
        }
    }

    /**
     * Clean up expired tokens
     * @returns {number} Number of tokens cleaned up
     */
    cleanupExpiredTokens() {
        try {
            let cleanedCount = 0;
            const now = new Date();
            
            for (const [tokenId, tokenData] of this.activeTokens.entries()) {
                const expiresAt = new Date(tokenData.expiresAt);
                
                if (now > expiresAt) {
                    this.activeTokens.delete(tokenId);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`🧹 Cleaned up ${cleanedCount} expired tokens`);
            }
            
            return cleanedCount;
        } catch (error) {
            console.error('❌ Failed to cleanup expired tokens:', error);
            return 0;
        }
    }

    /**
     * Generate secure access token for API authentication
     * @param {Object} payload - Token payload
     * @param {Object} options - Token options
     * @returns {string} JWT token
     */
    generateAccessToken(payload, options = {}) {
        try {
            const now = Math.floor(Date.now() / 1000);
            
            const tokenPayload = {
                ...payload,
                iat: now,
                exp: now + this.parseExpiresIn(options.expiresIn || '15m'),
                iss: this.config.issuer,
                aud: this.config.audience
            };

            return jwt.sign(tokenPayload, this.config.secret, {
                algorithm: this.config.algorithm
            });

        } catch (error) {
            console.error('❌ Failed to generate access token:', error);
            throw new Error('Failed to generate access token');
        }
    }

    /**
     * Verify access token
     * @param {string} token - JWT token
     * @returns {Object} Decoded payload
     */
    verifyAccessToken(token) {
        try {
            return jwt.verify(token, this.config.secret, {
                algorithms: [this.config.algorithm],
                issuer: this.config.issuer,
                audience: this.config.audience
            });
        } catch (error) {
            console.error('❌ Access token verification failed:', error);
            throw new Error('Invalid access token');
        }
    }

    /**
     * Generate CSRF token
     * @param {string} sessionId - Session ID
     * @returns {string} CSRF token
     */
    generateCSRFToken(sessionId) {
        try {
            const payload = {
                sessionId,
                purpose: 'csrf',
                timestamp: Date.now()
            };

            return jwt.sign(payload, this.config.secret, {
                algorithm: this.config.algorithm,
                expiresIn: '1h'
            });

        } catch (error) {
            console.error('❌ Failed to generate CSRF token:', error);
            throw new Error('Failed to generate CSRF token');
        }
    }

    /**
     * Verify CSRF token
     * @param {string} token - CSRF token
     * @param {string} sessionId - Session ID
     * @returns {boolean} True if valid
     */
    verifyCSRFToken(token, sessionId) {
        try {
            const payload = jwt.verify(token, this.config.secret, {
                algorithms: [this.config.algorithm]
            });

            return payload.sessionId === sessionId && payload.purpose === 'csrf';

        } catch (error) {
            console.error('❌ CSRF token verification failed:', error);
            return false;
        }
    }

    /**
     * Get token statistics
     * @returns {Object} Token statistics
     */
    getTokenStats() {
        try {
            const now = new Date();
            let activeCount = 0;
            let expiredCount = 0;
            let totalDownloads = 0;

            for (const [tokenId, tokenData] of this.activeTokens.entries()) {
                const expiresAt = new Date(tokenData.expiresAt);
                
                if (now > expiresAt) {
                    expiredCount++;
                } else {
                    activeCount++;
                }
                
                totalDownloads += tokenData.downloadCount;
            }

            return {
                totalTokens: this.activeTokens.size,
                activeTokens: activeCount,
                expiredTokens: expiredCount,
                totalDownloads
            };

        } catch (error) {
            console.error('❌ Failed to get token stats:', error);
            return {
                totalTokens: 0,
                activeTokens: 0,
                expiredTokens: 0,
                totalDownloads: 0
            };
        }
    }

    /**
     * Parse expires in string to seconds
     * @param {string|number} expiresIn - Expiration time
     * @returns {number} Seconds
     */
    parseExpiresIn(expiresIn) {
        if (typeof expiresIn === 'number') {
            return expiresIn;
        }

        const units = {
            's': 1,
            'm': 60,
            'h': 3600,
            'd': 86400
        };

        const match = expiresIn.match(/^(\d+)([smhd])$/);
        if (match) {
            const [, value, unit] = match;
            return parseInt(value) * units[unit];
        }

        // Default to 1 hour if parsing fails
        return 3600;
    }

    /**
     * Start automatic cleanup of expired tokens
     */
    startCleanupScheduler() {
        // Clean up expired tokens every 5 minutes
        setInterval(() => {
            this.cleanupExpiredTokens();
        }, 5 * 60 * 1000);

        console.log('🕐 Token cleanup scheduler started');
    }

    /**
     * Stop automatic cleanup
     */
    stopCleanupScheduler() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('🛑 Token cleanup scheduler stopped');
        }
    }
}

// Export singleton instance
module.exports = new TokenService();