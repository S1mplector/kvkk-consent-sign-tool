/**
 * Email Routes
 * Handles email-related operations and testing
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const emailService = require('../services/emailService');

const router = express.Router();

// Test email configuration
router.get('/test', async (req, res) => {
    try {
        if (!emailService.isConfigured()) {
            return res.status(503).json({
                success: false,
                error: 'Email service is not configured',
                message: 'Please configure SMTP settings in environment variables',
                code: 'EMAIL_NOT_CONFIGURED'
            });
        }

        const testResult = await emailService.testConnection();
        
        res.json({
            success: true,
            message: 'Email service is working correctly',
            data: testResult,
            configuration: emailService.getConfiguration()
        });

    } catch (error) {
        console.error('❌ Email test failed:', error);
        res.status(500).json({
            success: false,
            error: 'Email test failed',
            message: error.message,
            code: 'EMAIL_TEST_FAILED'
        });
    }
});

// Get email service configuration (without sensitive data)
router.get('/config', (req, res) => {
    try {
        const config = emailService.getConfiguration();
        
        res.json({
            configured: config.configured,
            host: config.host,
            port: config.port,
            secure: config.secure,
            from: config.from,
            features: {
                consentFormDelivery: true,
                adminNotifications: !!process.env.ADMIN_EMAIL,
                templateSupport: true
            }
        });

    } catch (error) {
        console.error('❌ Email config error:', error);
        res.status(500).json({
            error: 'Failed to get email configuration',
            code: 'CONFIG_FETCH_FAILED'
        });
    }
});

// Send test email (for admin testing)
router.post('/send-test', [
    body('to').isEmail().withMessage('Valid email address is required'),
    body('subject').optional().isString().withMessage('Subject must be a string'),
    body('message').optional().isString().withMessage('Message must be a string')
], async (req, res) => {
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

        if (!emailService.isConfigured()) {
            return res.status(503).json({
                error: 'Email service is not configured',
                code: 'EMAIL_NOT_CONFIGURED'
            });
        }

        const { to, subject = 'Test Email', message = 'This is a test email from KVKK Consent System.' } = req.body;

        // Create test email content
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h2 style="color: #2c3e50; margin: 0;">Test Email</h2>
                    <p style="color: #6c757d; margin: 5px 0 0 0;">KVKK Consent System</p>
                </div>
                
                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;">
                    <p>${message}</p>
                    
                    <div style="background: #d4edda; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0; color: #155724;"><strong>✓ Email service is working correctly!</strong></p>
                    </div>
                    
                    <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
                        Sent at: ${new Date().toLocaleString('tr-TR')}<br>
                        From: KVKK Consent System
                    </p>
                </div>
            </div>
        `;

        // Send test email using the transporter directly
        const mailOptions = {
            from: `${emailService.config?.from?.name || 'KVKK Test'} <${emailService.config?.from?.address}>`,
            to: to,
            subject: subject,
            html: htmlContent
        };

        const result = await emailService.transporter.sendMail(mailOptions);

        console.log(`📧 Test email sent to ${to}:`, result.messageId);

        res.json({
            success: true,
            message: 'Test email sent successfully',
            data: {
                messageId: result.messageId,
                recipient: to,
                subject: subject,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Test email failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send test email',
            message: error.message,
            code: 'TEST_EMAIL_FAILED'
        });
    }
});

// Resend consent form email (in case of delivery issues)
router.post('/resend', [
    body('email').isEmail().withMessage('Valid email address is required'),
    body('formData').isJSON().withMessage('Form data must be valid JSON')
], async (req, res) => {
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

        if (!emailService.isConfigured()) {
            return res.status(503).json({
                error: 'Email service is not configured',
                code: 'EMAIL_NOT_CONFIGURED'
            });
        }

        const { email, formData: formDataString } = req.body;
        const formData = JSON.parse(formDataString);

        // Validate that the email matches the form data
        if (formData.email !== email) {
            return res.status(400).json({
                error: 'Email address does not match form data',
                code: 'EMAIL_MISMATCH'
            });
        }

        // Note: In a real implementation, you would retrieve the PDF from storage
        // For now, we'll return an error indicating this feature needs PDF storage
        return res.status(501).json({
            error: 'Resend feature requires PDF storage implementation',
            message: 'This feature is not yet implemented. PDFs need to be stored for resending.',
            code: 'FEATURE_NOT_IMPLEMENTED'
        });

    } catch (error) {
        console.error('❌ Email resend failed:', error);
        res.status(500).json({
            error: 'Failed to resend email',
            message: error.message,
            code: 'RESEND_FAILED'
        });
    }
});

// Get email delivery statistics
router.get('/stats', async (req, res) => {
    try {
        // In a real implementation, you would fetch from a database
        // For now, return mock statistics
        const stats = {
            totalEmailsSent: 0, // Would be fetched from database
            todayEmailsSent: 0,
            deliveryRate: emailService.isConfigured() ? 100 : 0,
            failedDeliveries: 0,
            lastEmailSent: null,
            emailServiceStatus: emailService.isConfigured() ? 'active' : 'inactive',
            configuration: {
                host: emailService.getConfiguration().host,
                port: emailService.getConfiguration().port,
                secure: emailService.getConfiguration().secure
            }
        };

        res.json(stats);

    } catch (error) {
        console.error('❌ Email stats error:', error);
        res.status(500).json({
            error: 'Failed to fetch email statistics',
            code: 'EMAIL_STATS_FAILED'
        });
    }
});

// Webhook endpoint for email delivery status (if using a service that supports webhooks)
router.post('/webhook/delivery', express.raw({ type: 'application/json' }), (req, res) => {
    try {
        // This would handle delivery status webhooks from email services like SendGrid, Mailgun, etc.
        // For now, just log the webhook data
        console.log('📧 Email delivery webhook received:', req.body);
        
        res.status(200).json({
            success: true,
            message: 'Webhook received'
        });

    } catch (error) {
        console.error('❌ Webhook processing failed:', error);
        res.status(500).json({
            error: 'Webhook processing failed',
            code: 'WEBHOOK_FAILED'
        });
    }
});

// Health check for email service
router.get('/health', async (req, res) => {
    try {
        const isConfigured = emailService.isConfigured();
        let connectionStatus = 'unknown';

        if (isConfigured) {
            try {
                await emailService.testConnection();
                connectionStatus = 'connected';
            } catch (error) {
                connectionStatus = 'connection_failed';
            }
        } else {
            connectionStatus = 'not_configured';
        }

        res.json({
            status: connectionStatus,
            configured: isConfigured,
            timestamp: new Date().toISOString(),
            details: {
                host: emailService.getConfiguration().host,
                port: emailService.getConfiguration().port,
                secure: emailService.getConfiguration().secure
            }
        });

    } catch (error) {
        console.error('❌ Email health check failed:', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;