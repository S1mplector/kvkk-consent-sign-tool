/**
 * Secure Storage Service
 * Handles encrypted file storage and retrieval with KVKK compliance
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const encryptionService = require('./encryptionService');
const securityConfig = require('../config/security');

class StorageService {
    constructor() {
        this.config = securityConfig.getRetentionConfig();
        this.encryptionService = encryptionService;
        this.initializeStorage();
    }

    /**
     * Initialize storage directories
     */
    async initializeStorage() {
        try {
            const directories = [
                this.config.dataPath,
                this.config.tempPath,
                this.config.logPath,
                path.join(this.config.dataPath, 'submissions'),
                path.join(this.config.dataPath, 'pdfs'),
                path.join(this.config.dataPath, 'metadata')
            ];

            for (const dir of directories) {
                await fs.mkdir(dir, { recursive: true, mode: 0o700 });
            }

            console.log('✅ Storage directories initialized');
        } catch (error) {
            console.error('❌ Failed to initialize storage:', error);
            throw error;
        }
    }

    /**
     * Store encrypted form submission
     * @param {Object} formData - Form data to store
     * @param {Buffer} pdfBuffer - PDF file buffer
     * @returns {Object} Storage result with submission ID
     */
    async storeSubmission(formData, pdfBuffer) {
        try {
            const submissionId = uuidv4();
            const timestamp = new Date().toISOString();

            // Encrypt form data
            const encryptedFormData = this.encryptionService.encryptFormData(formData);

            // Create submission metadata
            const metadata = {
                id: submissionId,
                timestamp: timestamp,
                size: pdfBuffer.length,
                hash: this.calculateHash(pdfBuffer),
                retention: {
                    createdAt: timestamp,
                    expiresAt: this.calculateExpiryDate(timestamp),
                    retentionDays: this.config.defaultRetentionDays
                },
                encryption: {
                    version: '1.0',
                    algorithm: 'aes-256-gcm'
                }
            };

            // Store encrypted form data
            const formDataPath = path.join(
                this.config.dataPath, 
                'submissions', 
                `${submissionId}.json`
            );
            
            await this.writeSecureFile(formDataPath, {
                metadata,
                formData: encryptedFormData
            });

            // Store encrypted PDF
            const pdfPath = path.join(
                this.config.dataPath, 
                'pdfs', 
                `${submissionId}.pdf.enc`
            );
            
            const encryptedPdf = this.encryptionService.encrypt(
                pdfBuffer.toString('base64'), 
                `pdf:${submissionId}`
            );
            
            await this.writeSecureFile(pdfPath, encryptedPdf);

            // Store metadata separately for indexing
            const metadataPath = path.join(
                this.config.dataPath, 
                'metadata', 
                `${submissionId}.meta`
            );
            
            await this.writeSecureFile(metadataPath, metadata);

            // Log the storage operation
            await this.logOperation('STORE', submissionId, {
                formDataSize: JSON.stringify(encryptedFormData).length,
                pdfSize: pdfBuffer.length,
                timestamp
            });

            return {
                success: true,
                submissionId,
                metadata: {
                    id: submissionId,
                    timestamp,
                    expiresAt: metadata.retention.expiresAt
                }
            };

        } catch (error) {
            console.error('❌ Failed to store submission:', error);
            throw new Error('Failed to store submission securely');
        }
    }

    /**
     * Retrieve encrypted submission
     * @param {string} submissionId - Submission ID
     * @returns {Object} Decrypted submission data
     */
    async retrieveSubmission(submissionId) {
        try {
            if (!this.isValidUUID(submissionId)) {
                throw new Error('Invalid submission ID format');
            }

            // Check if submission exists and is not expired
            const metadata = await this.getSubmissionMetadata(submissionId);
            if (!metadata) {
                throw new Error('Submission not found');
            }

            if (this.isExpired(metadata.retention.expiresAt)) {
                throw new Error('Submission has expired');
            }

            // Retrieve encrypted form data
            const formDataPath = path.join(
                this.config.dataPath, 
                'submissions', 
                `${submissionId}.json`
            );
            
            const encryptedSubmission = await this.readSecureFile(formDataPath);
            const decryptedFormData = this.encryptionService.decryptFormData(
                encryptedSubmission.formData
            );

            // Retrieve encrypted PDF
            const pdfPath = path.join(
                this.config.dataPath, 
                'pdfs', 
                `${submissionId}.pdf.enc`
            );
            
            const encryptedPdf = await this.readSecureFile(pdfPath);
            const decryptedPdfBase64 = this.encryptionService.decrypt(encryptedPdf);
            const pdfBuffer = Buffer.from(decryptedPdfBase64, 'base64');

            // Log the retrieval operation
            await this.logOperation('RETRIEVE', submissionId, {
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                submissionId,
                formData: decryptedFormData,
                pdfBuffer,
                metadata: encryptedSubmission.metadata
            };

        } catch (error) {
            console.error('❌ Failed to retrieve submission:', error);
            throw new Error('Failed to retrieve submission');
        }
    }

    /**
     * Get submission metadata without decrypting data
     * @param {string} submissionId - Submission ID
     * @returns {Object} Submission metadata
     */
    async getSubmissionMetadata(submissionId) {
        try {
            const metadataPath = path.join(
                this.config.dataPath, 
                'metadata', 
                `${submissionId}.meta`
            );
            
            return await this.readSecureFile(metadataPath);
        } catch (error) {
            return null;
        }
    }

    /**
     * List all submissions with metadata
     * @param {Object} options - Query options
     * @returns {Array} List of submissions
     */
    async listSubmissions(options = {}) {
        try {
            const metadataDir = path.join(this.config.dataPath, 'metadata');
            const files = await fs.readdir(metadataDir);
            
            const submissions = [];
            
            for (const file of files) {
                if (file.endsWith('.meta')) {
                    const submissionId = file.replace('.meta', '');
                    const metadata = await this.getSubmissionMetadata(submissionId);
                    
                    if (metadata) {
                        submissions.push({
                            id: submissionId,
                            timestamp: metadata.timestamp,
                            expiresAt: metadata.retention.expiresAt,
                            expired: this.isExpired(metadata.retention.expiresAt),
                            size: metadata.size
                        });
                    }
                }
            }

            // Sort by timestamp (newest first)
            submissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Apply filters
            if (options.limit) {
                return submissions.slice(0, options.limit);
            }

            return submissions;

        } catch (error) {
            console.error('❌ Failed to list submissions:', error);
            throw new Error('Failed to list submissions');
        }
    }

    /**
     * Delete submission securely
     * @param {string} submissionId - Submission ID
     * @returns {Object} Deletion result
     */
    async deleteSubmission(submissionId) {
        try {
            if (!this.isValidUUID(submissionId)) {
                throw new Error('Invalid submission ID format');
            }

            const files = [
                path.join(this.config.dataPath, 'submissions', `${submissionId}.json`),
                path.join(this.config.dataPath, 'pdfs', `${submissionId}.pdf.enc`),
                path.join(this.config.dataPath, 'metadata', `${submissionId}.meta`)
            ];

            let deletedFiles = 0;

            for (const filePath of files) {
                try {
                    if (this.config.secureDelete) {
                        await this.secureDeleteFile(filePath);
                    } else {
                        await fs.unlink(filePath);
                    }
                    deletedFiles++;
                } catch (error) {
                    console.warn(`⚠️  Failed to delete file: ${filePath}`, error.message);
                }
            }

            // Log the deletion operation
            await this.logOperation('DELETE', submissionId, {
                deletedFiles,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                submissionId,
                deletedFiles
            };

        } catch (error) {
            console.error('❌ Failed to delete submission:', error);
            throw new Error('Failed to delete submission');
        }
    }

    /**
     * Clean up expired submissions
     * @returns {Object} Cleanup result
     */
    async cleanupExpiredSubmissions() {
        try {
            const submissions = await this.listSubmissions();
            const expiredSubmissions = submissions.filter(s => s.expired);
            
            let deletedCount = 0;
            const errors = [];

            for (const submission of expiredSubmissions) {
                try {
                    await this.deleteSubmission(submission.id);
                    deletedCount++;
                } catch (error) {
                    errors.push({
                        submissionId: submission.id,
                        error: error.message
                    });
                }
            }

            // Log cleanup operation
            await this.logOperation('CLEANUP', 'system', {
                totalExpired: expiredSubmissions.length,
                deletedCount,
                errors: errors.length,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                totalExpired: expiredSubmissions.length,
                deletedCount,
                errors
            };

        } catch (error) {
            console.error('❌ Cleanup failed:', error);
            throw new Error('Failed to cleanup expired submissions');
        }
    }

    /**
     * Write file securely with proper permissions
     * @param {string} filePath - File path
     * @param {Object} data - Data to write
     */
    async writeSecureFile(filePath, data) {
        const jsonData = JSON.stringify(data, null, 2);
        await fs.writeFile(filePath, jsonData, { mode: 0o600 });
    }

    /**
     * Read file securely
     * @param {string} filePath - File path
     * @returns {Object} Parsed file data
     */
    async readSecureFile(filePath) {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    }

    /**
     * Securely delete file with multiple overwrites
     * @param {string} filePath - File path to delete
     */
    async secureDeleteFile(filePath) {
        try {
            const stats = await fs.stat(filePath);
            const fileSize = stats.size;

            // Overwrite file multiple times
            for (let i = 0; i < this.config.overwritePasses; i++) {
                const randomData = crypto.randomBytes(fileSize);
                await fs.writeFile(filePath, randomData);
            }

            // Final deletion
            await fs.unlink(filePath);
        } catch (error) {
            // If secure deletion fails, try regular deletion
            await fs.unlink(filePath);
        }
    }

    /**
     * Calculate file hash
     * @param {Buffer} buffer - File buffer
     * @returns {string} SHA-256 hash
     */
    calculateHash(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Calculate expiry date based on retention policy
     * @param {string} createdAt - Creation timestamp
     * @returns {string} Expiry timestamp
     */
    calculateExpiryDate(createdAt) {
        const created = new Date(createdAt);
        const expiry = new Date(created);
        expiry.setDate(expiry.getDate() + this.config.defaultRetentionDays);
        return expiry.toISOString();
    }

    /**
     * Check if submission is expired
     * @param {string} expiresAt - Expiry timestamp
     * @returns {boolean} True if expired
     */
    isExpired(expiresAt) {
        return new Date() > new Date(expiresAt);
    }

    /**
     * Validate UUID format
     * @param {string} uuid - UUID to validate
     * @returns {boolean} True if valid UUID
     */
    isValidUUID(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    /**
     * Log storage operations for audit trail
     * @param {string} operation - Operation type
     * @param {string} submissionId - Submission ID
     * @param {Object} details - Operation details
     */
    async logOperation(operation, submissionId, details) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                operation,
                submissionId,
                details
            };

            const logFile = path.join(
                this.config.logPath, 
                `storage-${new Date().toISOString().split('T')[0]}.log`
            );

            await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
        } catch (error) {
            console.error('❌ Failed to log operation:', error);
        }
    }

    /**
     * Get storage statistics
     * @returns {Object} Storage statistics
     */
    async getStorageStats() {
        try {
            const submissions = await this.listSubmissions();
            const totalSize = submissions.reduce((sum, s) => sum + s.size, 0);
            const expiredCount = submissions.filter(s => s.expired).length;

            return {
                totalSubmissions: submissions.length,
                expiredSubmissions: expiredCount,
                activeSubmissions: submissions.length - expiredCount,
                totalSize,
                averageSize: submissions.length > 0 ? Math.round(totalSize / submissions.length) : 0,
                oldestSubmission: submissions.length > 0 ? submissions[submissions.length - 1].timestamp : null,
                newestSubmission: submissions.length > 0 ? submissions[0].timestamp : null
            };
        } catch (error) {
            console.error('❌ Failed to get storage stats:', error);
            throw new Error('Failed to get storage statistics');
        }
    }
}

// Export singleton instance
module.exports = new StorageService();