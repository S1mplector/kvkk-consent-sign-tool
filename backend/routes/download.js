/**
 * Secure Download Routes
 * Handles tokenized file downloads with security controls
 */

const express = require('express');
const storageService = require('../services/storageService');
const tokenService = require('../services/tokenService');
const securityMiddleware = require('../middleware/security');

const router = express.Router();

/**
 * Generate secure download token
 */
router.post('/token', async (req, res) => {
    try {
        const { submissionId, options = {} } = req.body;

        if (!submissionId) {
            return res.status(400).json({
                error: 'Submission ID is required',
                code: 'MISSING_SUBMISSION_ID'
            });
        }

        // Verify submission exists
        const metadata = await storageService.getSubmissionMetadata(submissionId);
        if (!metadata) {
            return res.status(404).json({
                error: 'Submission not found',
                code: 'SUBMISSION_NOT_FOUND'
            });
        }

        // Check if submission is expired
        if (storageService.isExpired(metadata.retention.expiresAt)) {
            return res.status(410).json({
                error: 'Submission has expired',
                code: 'SUBMISSION_EXPIRED'
            });
        }

        // Generate download token
        const tokenData = tokenService.generateDownloadToken(submissionId, {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            maxDownloads: options.maxDownloads || 1,
            expiresIn: options.expiresIn || '1h'
        });

        res.json({
            success: true,
            token: tokenData.token,
            expiresAt: tokenData.expiresAt,
            maxDownloads: tokenData.maxDownloads,
            downloadUrl: `/api/download/file?token=${tokenData.token}`
        });

    } catch (error) {
        console.error('❌ Token generation failed:', error);
        res.status(500).json({
            error: 'Failed to generate download token',
            code: 'TOKEN_GENERATION_FAILED'
        });
    }
});

/**
 * Download file with token validation
 */
router.get('/file', 
    securityMiddleware.getAllMiddleware().tokenValidation,
    async (req, res) => {
        try {
            const { submissionId, tokenId } = req.tokenData;

            // Retrieve submission data
            const submission = await storageService.retrieveSubmission(submissionId);
            if (!submission.success) {
                return res.status(404).json({
                    error: 'File not found',
                    code: 'FILE_NOT_FOUND'
                });
            }

            // Record download attempt
            const downloadRecord = tokenService.recordDownload(tokenId, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });

            // Generate secure filename
            const filename = `KVKK_Onay_${submission.formData.patientName.replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ\s]/g, '').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

            // Set security headers for file download
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': submission.pdfBuffer.length,
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });

            // Send file
            res.send(submission.pdfBuffer);

            console.log(`📥 File downloaded: ${submissionId} by ${req.ip} (${downloadRecord.remainingDownloads} downloads remaining)`);

        } catch (error) {
            console.error('❌ File download failed:', error);
            res.status(500).json({
                error: 'Download failed',
                code: 'DOWNLOAD_FAILED'
            });
        }
    }
);

/**
 * Get download status
 */
router.get('/status/:tokenId', async (req, res) => {
    try {
        const { tokenId } = req.params;

        // This would typically check token status in a real implementation
        // For now, return basic status
        res.json({
            tokenId,
            status: 'active',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Status check failed:', error);
        res.status(500).json({
            error: 'Failed to check download status',
            code: 'STATUS_CHECK_FAILED'
        });
    }
});

/**
 * Revoke download token
 */
router.delete('/token/:tokenId', async (req, res) => {
    try {
        const { tokenId } = req.params;

        const revoked = tokenService.revokeToken(tokenId);
        
        if (revoked) {
            res.json({
                success: true,
                message: 'Token revoked successfully'
            });
        } else {
            res.status(404).json({
                error: 'Token not found',
                code: 'TOKEN_NOT_FOUND'
            });
        }

    } catch (error) {
        console.error('❌ Token revocation failed:', error);
        res.status(500).json({
            error: 'Failed to revoke token',
            code: 'TOKEN_REVOCATION_FAILED'
        });
    }
});

module.exports = router;