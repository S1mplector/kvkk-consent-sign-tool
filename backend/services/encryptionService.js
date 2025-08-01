/**
 * Encryption Service
 * Handles PII encryption/decryption using AES-256-GCM
 */

const crypto = require('crypto');
const securityConfig = require('../config/security');

class EncryptionService {
    constructor() {
        this.config = securityConfig.getEncryptionConfig();
        this.masterKey = this.config.getKey();
    }

    /**
     * Encrypt sensitive data
     * @param {string} plaintext - Data to encrypt
     * @param {string} context - Context for key derivation (optional)
     * @returns {Object} Encrypted data with metadata
     */
    encrypt(plaintext, context = '') {
        try {
            if (!plaintext || typeof plaintext !== 'string') {
                throw new Error('Invalid plaintext data');
            }

            // Generate random salt and IV
            const salt = crypto.randomBytes(this.config.saltLength);
            const iv = crypto.randomBytes(this.config.ivLength);

            // Derive key using PBKDF2
            const key = this.deriveKey(this.masterKey, salt, context);

            // Create cipher with IV
            const cipher = crypto.createCipheriv(this.config.algorithm, key, iv);
            cipher.setAAD(Buffer.from(context, 'utf8'));

            // Encrypt data
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);

            // Get authentication tag
            const tag = cipher.getAuthTag();

            // Return encrypted data with metadata
            return {
                encrypted: encrypted.toString('base64'),
                salt: salt.toString('base64'),
                iv: iv.toString('base64'),
                tag: tag.toString('base64'),
                algorithm: this.config.algorithm,
                context: context,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Encryption failed:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * Decrypt sensitive data
     * @param {Object} encryptedData - Encrypted data object
     * @returns {string} Decrypted plaintext
     */
    decrypt(encryptedData) {
        try {
            if (!encryptedData || typeof encryptedData !== 'object') {
                throw new Error('Invalid encrypted data');
            }

            const { encrypted, salt, iv, tag, algorithm, context = '' } = encryptedData;

            if (!encrypted || !salt || !iv || !tag) {
                throw new Error('Missing encryption metadata');
            }

            // Convert from base64
            const encryptedBuffer = Buffer.from(encrypted, 'base64');
            const saltBuffer = Buffer.from(salt, 'base64');
            const ivBuffer = Buffer.from(iv, 'base64');
            const tagBuffer = Buffer.from(tag, 'base64');

            // Derive key using same parameters
            const key = this.deriveKey(this.masterKey, saltBuffer, context);

            // Create decipher with IV
            const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);
            decipher.setAAD(Buffer.from(context, 'utf8'));
            decipher.setAuthTag(tagBuffer);

            // Decrypt data
            let decrypted = decipher.update(encryptedBuffer);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            return decrypted.toString('utf8');

        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('Failed to decrypt data');
        }
    }

    /**
     * Encrypt form data with field-level encryption
     * @param {Object} formData - Form data to encrypt
     * @returns {Object} Encrypted form data
     */
    encryptFormData(formData) {
        try {
            const encryptedData = {
                metadata: {
                    encrypted: true,
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                },
                data: {}
            };

            // Define which fields should be encrypted
            const sensitiveFields = [
                'patientName',
                'email',
                'guardianName'
            ];

            // Encrypt sensitive fields
            for (const [key, value] of Object.entries(formData)) {
                if (sensitiveFields.includes(key) && value) {
                    encryptedData.data[key] = this.encrypt(value, key);
                } else {
                    // Store non-sensitive data as-is
                    encryptedData.data[key] = value;
                }
            }

            return encryptedData;

        } catch (error) {
            console.error('Form data encryption failed:', error);
            throw new Error('Failed to encrypt form data');
        }
    }

    /**
     * Decrypt form data
     * @param {Object} encryptedFormData - Encrypted form data
     * @returns {Object} Decrypted form data
     */
    decryptFormData(encryptedFormData) {
        try {
            if (!encryptedFormData.metadata?.encrypted) {
                // Data is not encrypted, return as-is
                return encryptedFormData;
            }

            const decryptedData = {};

            for (const [key, value] of Object.entries(encryptedFormData.data)) {
                if (value && typeof value === 'object' && value.encrypted) {
                    // This field is encrypted
                    decryptedData[key] = this.decrypt(value);
                } else {
                    // This field is not encrypted
                    decryptedData[key] = value;
                }
            }

            return decryptedData;

        } catch (error) {
            console.error('Form data decryption failed:', error);
            throw new Error('Failed to decrypt form data');
        }
    }

    /**
     * Hash sensitive data for indexing/searching
     * @param {string} data - Data to hash
     * @param {string} salt - Salt for hashing (optional)
     * @returns {string} Hashed data
     */
    hashForIndex(data, salt = '') {
        try {
            const hash = crypto.createHash('sha256');
            hash.update(data + salt);
            return hash.digest('hex');
        } catch (error) {
            console.error('Hashing failed:', error);
            throw new Error('Failed to hash data');
        }
    }

    /**
     * Generate secure random token
     * @param {number} length - Token length in bytes
     * @returns {string} Random token
     */
    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Derive key using PBKDF2
     * @param {Buffer} masterKey - Master key
     * @param {Buffer} salt - Salt
     * @param {string} context - Context for key derivation
     * @returns {Buffer} Derived key
     */
    deriveKey(masterKey, salt, context = '') {
        const info = Buffer.from(context, 'utf8');
        const combinedSalt = Buffer.concat([salt, info]);
        
        return crypto.pbkdf2Sync(
            masterKey,
            combinedSalt,
            this.config.iterations,
            this.config.keyLength,
            'sha256'
        );
    }

    /**
     * Securely compare two strings (timing-safe)
     * @param {string} a - First string
     * @param {string} b - Second string
     * @returns {boolean} True if strings match
     */
    secureCompare(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }

        if (a.length !== b.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            Buffer.from(a, 'utf8'),
            Buffer.from(b, 'utf8')
        );
    }

    /**
     * Generate encryption key for new installations
     * @returns {string} New encryption key (hex)
     */
    static generateEncryptionKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Validate encryption key format
     * @param {string} key - Key to validate
     * @returns {boolean} True if key is valid
     */
    static validateEncryptionKey(key) {
        if (typeof key !== 'string') {
            return false;
        }

        // Check if it's a valid hex string of correct length
        const hexRegex = /^[0-9a-fA-F]{64}$/;
        return hexRegex.test(key);
    }

    /**
     * Test encryption/decryption functionality
     * @returns {Object} Test results
     */
    async testEncryption() {
        try {
            const testData = 'Test encryption data';
            const context = 'test';

            // Test basic encryption/decryption
            const encrypted = this.encrypt(testData, context);
            const decrypted = this.decrypt(encrypted);

            if (decrypted !== testData) {
                throw new Error('Encryption test failed: data mismatch');
            }

            // Test form data encryption
            const testFormData = {
                patientName: 'Test Patient',
                email: 'test@example.com',
                role: 'patient',
                timestamp: new Date().toISOString()
            };

            const encryptedForm = this.encryptFormData(testFormData);
            const decryptedForm = this.decryptFormData(encryptedForm);

            if (decryptedForm.patientName !== testFormData.patientName) {
                throw new Error('Form encryption test failed');
            }

            return {
                success: true,
                message: 'Encryption service is working correctly',
                tests: {
                    basicEncryption: true,
                    formEncryption: true,
                    keyDerivation: true
                }
            };

        } catch (error) {
            return {
                success: false,
                message: 'Encryption test failed',
                error: error.message
            };
        }
    }
}

// Export singleton instance
module.exports = new EncryptionService();