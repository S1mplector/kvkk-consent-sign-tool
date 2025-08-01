/**
 * Data Cleanup Service
 * Handles automated data retention and KVKK compliance cleanup
 */

const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const storageService = require('./storageService');
const tokenService = require('./tokenService');
const securityConfig = require('../config/security');

class CleanupService {
    constructor() {
        this.config = securityConfig.getRetentionConfig();
        this.isRunning = false;
        this.scheduledTasks = new Map();
        this.cleanupStats = {
            lastRun: null,
            totalRuns: 0,
            totalFilesDeleted: 0,
            totalTokensRevoked: 0,
            errors: []
        };
    }

    /**
     * Start automated cleanup scheduler
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️  Cleanup service is already running');
            return;
        }

        try {
            // Schedule main cleanup task
            const mainTask = cron.schedule(this.config.cleanupSchedule, async () => {
                await this.runFullCleanup();
            }, {
                scheduled: false,
                timezone: 'Europe/Istanbul'
            });

            // Schedule token cleanup (more frequent)
            const tokenTask = cron.schedule('*/5 * * * *', async () => {
                await this.cleanupExpiredTokens();
            }, {
                scheduled: false,
                timezone: 'Europe/Istanbul'
            });

            // Schedule temp file cleanup (hourly)
            const tempTask = cron.schedule('0 * * * *', async () => {
                await this.cleanupTempFiles();
            }, {
                scheduled: false,
                timezone: 'Europe/Istanbul'
            });

            // Schedule log rotation (daily)
            const logTask = cron.schedule('0 1 * * *', async () => {
                await this.rotateLogs();
            }, {
                scheduled: false,
                timezone: 'Europe/Istanbul'
            });

            // Store tasks for management
            this.scheduledTasks.set('main', mainTask);
            this.scheduledTasks.set('tokens', tokenTask);
            this.scheduledTasks.set('temp', tempTask);
            this.scheduledTasks.set('logs', logTask);

            // Start all tasks
            mainTask.start();
            tokenTask.start();
            tempTask.start();
            logTask.start();

            this.isRunning = true;
            console.log('🕐 Cleanup service started with schedule:', this.config.cleanupSchedule);
            console.log('📋 Scheduled tasks:');
            console.log('  - Main cleanup:', this.config.cleanupSchedule);
            console.log('  - Token cleanup: Every 5 minutes');
            console.log('  - Temp cleanup: Every hour');
            console.log('  - Log rotation: Daily at 1 AM');

        } catch (error) {
            console.error('❌ Failed to start cleanup service:', error);
            throw error;
        }
    }

    /**
     * Stop cleanup scheduler
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️  Cleanup service is not running');
            return;
        }

        try {
            // Stop all scheduled tasks
            for (const [name, task] of this.scheduledTasks.entries()) {
                task.stop();
                console.log(`🛑 Stopped ${name} cleanup task`);
            }

            this.scheduledTasks.clear();
            this.isRunning = false;
            console.log('🛑 Cleanup service stopped');

        } catch (error) {
            console.error('❌ Failed to stop cleanup service:', error);
        }
    }

    /**
     * Run full cleanup process
     */
    async runFullCleanup() {
        const startTime = Date.now();
        console.log('🧹 Starting full cleanup process...');

        try {
            const results = {
                submissions: await this.cleanupExpiredSubmissions(),
                tokens: await this.cleanupExpiredTokens(),
                tempFiles: await this.cleanupTempFiles(),
                logs: await this.rotateLogs()
            };

            // Update statistics
            this.cleanupStats.lastRun = new Date().toISOString();
            this.cleanupStats.totalRuns++;
            this.cleanupStats.totalFilesDeleted += results.submissions.deletedCount + results.tempFiles.deletedCount;
            this.cleanupStats.totalTokensRevoked += results.tokens.cleanedCount;

            const duration = Date.now() - startTime;
            console.log(`✅ Full cleanup completed in ${duration}ms`);
            console.log('📊 Cleanup results:', {
                submissions: `${results.submissions.deletedCount}/${results.submissions.totalExpired} expired submissions deleted`,
                tokens: `${results.tokens.cleanedCount} expired tokens cleaned`,
                tempFiles: `${results.tempFiles.deletedCount} temp files deleted`,
                logs: `${results.logs.rotatedCount} log files rotated`
            });

            // Log cleanup operation
            await this.logCleanupOperation('FULL_CLEANUP', results, duration);

            return results;

        } catch (error) {
            console.error('❌ Full cleanup failed:', error);
            this.cleanupStats.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message,
                type: 'FULL_CLEANUP'
            });
            throw error;
        }
    }

    /**
     * Clean up expired submissions
     */
    async cleanupExpiredSubmissions() {
        try {
            console.log('🗂️  Cleaning up expired submissions...');
            const result = await storageService.cleanupExpiredSubmissions();
            
            if (result.deletedCount > 0) {
                console.log(`🗑️  Deleted ${result.deletedCount} expired submissions`);
            }

            return result;

        } catch (error) {
            console.error('❌ Failed to cleanup expired submissions:', error);
            return {
                success: false,
                totalExpired: 0,
                deletedCount: 0,
                errors: [error.message]
            };
        }
    }

    /**
     * Clean up expired tokens
     */
    async cleanupExpiredTokens() {
        try {
            console.log('🎫 Cleaning up expired tokens...');
            const cleanedCount = tokenService.cleanupExpiredTokens();
            
            return {
                success: true,
                cleanedCount
            };

        } catch (error) {
            console.error('❌ Failed to cleanup expired tokens:', error);
            return {
                success: false,
                cleanedCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Clean up temporary files
     */
    async cleanupTempFiles() {
        try {
            console.log('📁 Cleaning up temporary files...');
            
            const tempDir = this.config.tempPath;
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            const now = Date.now();
            
            let deletedCount = 0;
            const errors = [];

            try {
                const files = await fs.readdir(tempDir);
                
                for (const file of files) {
                    try {
                        const filePath = path.join(tempDir, file);
                        const stats = await fs.stat(filePath);
                        
                        if (now - stats.mtime.getTime() > maxAge) {
                            await fs.unlink(filePath);
                            deletedCount++;
                        }
                    } catch (error) {
                        errors.push({
                            file,
                            error: error.message
                        });
                    }
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }

            if (deletedCount > 0) {
                console.log(`🗑️  Deleted ${deletedCount} temporary files`);
            }

            return {
                success: true,
                deletedCount,
                errors
            };

        } catch (error) {
            console.error('❌ Failed to cleanup temp files:', error);
            return {
                success: false,
                deletedCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Rotate log files
     */
    async rotateLogs() {
        try {
            console.log('📋 Rotating log files...');
            
            const logDir = this.config.logPath;
            const maxLogAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            const now = Date.now();
            
            let rotatedCount = 0;
            const errors = [];

            try {
                const files = await fs.readdir(logDir);
                
                for (const file of files) {
                    try {
                        if (!file.endsWith('.log')) continue;
                        
                        const filePath = path.join(logDir, file);
                        const stats = await fs.stat(filePath);
                        
                        if (now - stats.mtime.getTime() > maxLogAge) {
                            // Compress and archive old logs
                            const archivePath = filePath + '.old';
                            await fs.rename(filePath, archivePath);
                            rotatedCount++;
                        }
                    } catch (error) {
                        errors.push({
                            file,
                            error: error.message
                        });
                    }
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }

            if (rotatedCount > 0) {
                console.log(`📦 Rotated ${rotatedCount} log files`);
            }

            return {
                success: true,
                rotatedCount,
                errors
            };

        } catch (error) {
            console.error('❌ Failed to rotate logs:', error);
            return {
                success: false,
                rotatedCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Manual cleanup trigger
     * @param {string} type - Cleanup type ('all', 'submissions', 'tokens', 'temp', 'logs')
     */
    async manualCleanup(type = 'all') {
        try {
            console.log(`🧹 Manual cleanup triggered: ${type}`);
            
            let results = {};

            switch (type) {
                case 'all':
                    results = await this.runFullCleanup();
                    break;
                case 'submissions':
                    results.submissions = await this.cleanupExpiredSubmissions();
                    break;
                case 'tokens':
                    results.tokens = await this.cleanupExpiredTokens();
                    break;
                case 'temp':
                    results.tempFiles = await this.cleanupTempFiles();
                    break;
                case 'logs':
                    results.logs = await this.rotateLogs();
                    break;
                default:
                    throw new Error(`Invalid cleanup type: ${type}`);
            }

            return {
                success: true,
                type,
                results,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Manual cleanup failed:', error);
            return {
                success: false,
                type,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get cleanup statistics
     */
    getStats() {
        return {
            ...this.cleanupStats,
            isRunning: this.isRunning,
            scheduledTasks: Array.from(this.scheduledTasks.keys()),
            nextRun: this.getNextRunTime(),
            config: {
                schedule: this.config.cleanupSchedule,
                retentionDays: this.config.defaultRetentionDays,
                secureDelete: this.config.secureDelete
            }
        };
    }

    /**
     * Get next scheduled run time
     */
    getNextRunTime() {
        try {
            const mainTask = this.scheduledTasks.get('main');
            if (mainTask) {
                // This is a simplified calculation - in production you'd use a proper cron parser
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(2, 0, 0, 0); // Assuming 2 AM daily schedule
                return tomorrow.toISOString();
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Log cleanup operation
     */
    async logCleanupOperation(operation, results, duration) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                operation,
                results,
                duration,
                stats: this.cleanupStats
            };

            const logFile = path.join(
                this.config.logPath,
                `cleanup-${new Date().toISOString().split('T')[0]}.log`
            );

            await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
        } catch (error) {
            console.error('❌ Failed to log cleanup operation:', error);
        }
    }

    /**
     * Validate cleanup configuration
     */
    validateConfig() {
        const errors = [];

        if (!this.config.cleanupSchedule) {
            errors.push('Cleanup schedule not configured');
        }

        if (!this.config.defaultRetentionDays || this.config.defaultRetentionDays < 1) {
            errors.push('Invalid retention days configuration');
        }

        if (!this.config.dataPath) {
            errors.push('Data path not configured');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Emergency cleanup - force delete all expired data
     */
    async emergencyCleanup() {
        console.log('🚨 Emergency cleanup initiated...');
        
        try {
            const results = await this.runFullCleanup();
            
            // Additional emergency measures
            await this.cleanupTempFiles();
            tokenService.cleanupExpiredTokens();
            
            console.log('🚨 Emergency cleanup completed');
            return results;
            
        } catch (error) {
            console.error('❌ Emergency cleanup failed:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new CleanupService();