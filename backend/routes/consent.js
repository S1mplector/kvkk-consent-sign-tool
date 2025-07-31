/**
 * Consent Routes
 * Handles consent form submission and processing
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const emailService = require('../services/emailService');

const router = express.Router();

// Validation middleware for consent form
const validateConsentForm = [
    body('formData').isJSON().withMessage('Form data must be valid JSON'),
    
    // Custom validation for parsed form data
    body('formData').custom((value) => {
        try {
            const data = JSON.parse(value);
            
            // Required fields
            if (!data.patientName || typeof data.patientName !== 'string' || data.patientName.trim().length < 2) {
                throw new Error('Patient name is required and must be at least 2 characters');
            }
            
            if (!data.email || typeof data.email !== 'string') {
                throw new Error('Email is required');
            }
            
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data.email)) {
                throw new Error('Invalid email format');
            }
            
            // Role validation
            if (!data.role || !['patient', 'guardian'].includes(data.role)) {
                throw new Error('Role must be either "patient" or "guardian"');
            }
            
            // Guardian-specific validation
            if (data.role === 'guardian') {
                if (!data.guardianName || typeof data.guardianName !== 'string' || data.guardianName.trim().length < 2) {
                    throw new Error('Guardian name is required for guardian role');
                }
                
                if (!data.relationshipDegree || typeof data.relationshipDegree !== 'string') {
                    throw new Error('Relationship degree is required for guardian role');
                }
                
                const validRelationships = ['Anne', 'Baba', 'Eş', 'Çocuk', 'Kardeş', 'Vasi', 'Diğer'];
                if (!validRelationships.includes(data.relationshipDegree)) {
                    throw new Error('Invalid relationship degree');
                }
            }
            
            // Timestamp validation
            if (!data.timestamp || isNaN(new Date(data.timestamp).getTime())) {
                throw new Error('Valid timestamp is required');
            }
            
            return true;
        } catch (error) {
            throw new Error(`Form data validation failed: ${error.message}`);
        }
    })
];

// Submit consent form
router.post('/submit', validateConsentForm, async (req, res) => {
    try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
                code: 'VALIDATION_ERROR'
            });
        }

        // Check if PDF file is uploaded
        if (!req.file) {
            return res.status(400).json({
                error: 'PDF file is required',
                code: 'MISSING_PDF'
            });
        }

        // Parse form data
        const formData = JSON.parse(req.body.formData);
        const pdfBuffer = req.file.buffer;

        // Log submission
        console.log(`📝 New consent form submission from ${formData.email} (${formData.role})`);

        // Send email to patient/guardian
        const emailResult = await emailService.sendConsentForm(formData, pdfBuffer);

        // Send notification to admin (optional, won't fail if not configured)
        try {
            await emailService.sendNotificationToAdmin(formData, pdfBuffer);
        } catch (adminError) {
            console.warn('⚠️  Admin notification failed:', adminError.message);
        }

        // Log successful submission
        console.log(`✅ Consent form processed successfully for ${formData.email}`);

        // Return success response
        res.json({
            success: true,
            message: 'Consent form submitted successfully',
            data: {
                messageId: emailResult.messageId,
                recipient: emailResult.recipient,
                timestamp: emailResult.timestamp,
                patientName: formData.patientName,
                role: formData.role
            }
        });

    } catch (error) {
        console.error('❌ Consent submission error:', error);

        // Handle specific error types
        if (error.message.includes('Email gönderimi başarısız')) {
            return res.status(500).json({
                error: 'Email delivery failed',
                message: error.message,
                code: 'EMAIL_DELIVERY_FAILED'
            });
        }

        if (error.message.includes('Email service is not configured')) {
            return res.status(503).json({
                error: 'Email service unavailable',
                message: 'Email service is not properly configured',
                code: 'EMAIL_SERVICE_UNAVAILABLE'
            });
        }

        // Generic error response
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' 
                ? 'An error occurred while processing your request' 
                : error.message,
            code: 'INTERNAL_ERROR'
        });
    }
});

// Get submission status (for tracking)
router.get('/status/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;

        if (!messageId) {
            return res.status(400).json({
                error: 'Message ID is required',
                code: 'MISSING_MESSAGE_ID'
            });
        }

        // In a real implementation, you might check email delivery status
        // For now, we'll return a simple response
        res.json({
            messageId: messageId,
            status: 'delivered', // This would be dynamic in a real implementation
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Status check error:', error);
        res.status(500).json({
            error: 'Failed to check status',
            code: 'STATUS_CHECK_FAILED'
        });
    }
});

// Validate form data (for client-side validation)
router.post('/validate', [
    body('formData').isJSON().withMessage('Form data must be valid JSON')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                valid: false,
                errors: errors.array()
            });
        }

        const formData = JSON.parse(req.body.formData);
        
        // Perform the same validation as in submit route
        const validationErrors = [];

        // Patient name validation
        if (!formData.patientName || formData.patientName.trim().length < 2) {
            validationErrors.push({
                field: 'patientName',
                message: 'Patient name must be at least 2 characters'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!formData.email || !emailRegex.test(formData.email)) {
            validationErrors.push({
                field: 'email',
                message: 'Valid email address is required'
            });
        }

        // Role validation
        if (!['patient', 'guardian'].includes(formData.role)) {
            validationErrors.push({
                field: 'role',
                message: 'Role must be either patient or guardian'
            });
        }

        // Guardian-specific validation
        if (formData.role === 'guardian') {
            if (!formData.guardianName || formData.guardianName.trim().length < 2) {
                validationErrors.push({
                    field: 'guardianName',
                    message: 'Guardian name must be at least 2 characters'
                });
            }

            const validRelationships = ['Anne', 'Baba', 'Eş', 'Çocuk', 'Kardeş', 'Vasi', 'Diğer'];
            if (!formData.relationshipDegree || !validRelationships.includes(formData.relationshipDegree)) {
                validationErrors.push({
                    field: 'relationshipDegree',
                    message: 'Valid relationship degree is required'
                });
            }
        }

        res.json({
            valid: validationErrors.length === 0,
            errors: validationErrors
        });

    } catch (error) {
        console.error('❌ Validation error:', error);
        res.status(500).json({
            valid: false,
            error: 'Validation failed',
            message: error.message
        });
    }
});

// Get consent form statistics (admin endpoint)
router.get('/stats', async (req, res) => {
    try {
        // In a real implementation, you would fetch from a database
        // For now, return mock statistics
        const stats = {
            totalSubmissions: 0, // Would be fetched from database
            todaySubmissions: 0,
            patientSubmissions: 0,
            guardianSubmissions: 0,
            emailDeliveryRate: emailService.isConfigured() ? 100 : 0,
            lastSubmission: null
        };

        res.json(stats);

    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({
            error: 'Failed to fetch statistics',
            code: 'STATS_FETCH_FAILED'
        });
    }
});

module.exports = router;