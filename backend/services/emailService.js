/**
 * Email Service
 * Handles email configuration and sending using Nodemailer
 */

const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
    constructor() {
        this.transporter = null;
        this.isReady = false;
        this.config = {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true' || false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            from: {
                name: process.env.FROM_NAME || 'KVKK Onay Sistemi',
                address: process.env.FROM_EMAIL || process.env.SMTP_USER
            }
        };
        
        this.initialize();
    }

    async initialize() {
        try {
            if (!this.config.auth.user || !this.config.auth.pass) {
                console.warn('⚠️  Email service not configured. Set SMTP_USER and SMTP_PASS environment variables.');
                return;
            }

            // Create transporter
            this.transporter = nodemailer.createTransport({
                host: this.config.host,
                port: this.config.port,
                secure: this.config.secure,
                auth: this.config.auth,
                tls: {
                    rejectUnauthorized: false
                }
            });

            // Verify connection
            await this.transporter.verify();
            this.isReady = true;
            console.log('✅ Email service initialized successfully');

        } catch (error) {
            console.error('❌ Email service initialization failed:', error.message);
            this.isReady = false;
        }
    }

    async sendOTPEmail(recipient, code, { ttlMinutes = 10 } = {}) {
        if (!this.isConfigured()) {
            throw new Error('Email service is not configured');
        }

        try {
            const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2c3e50;">Güvenlik Doğrulama Kodu</h2>
                    <p>KVKK onay işleminizi tamamlamak için aşağıdaki tek kullanımlık doğrulama kodunu giriniz:</p>
                    <div style="font-size: 28px; letter-spacing: 4px; font-weight: bold; background: #f8f9fa; padding: 16px; text-align: center; border-radius: 8px;">${code}</div>
                    <p style="color: #6c757d;">Kod ${ttlMinutes} dakika içinde geçerliliğini yitirecektir.</p>
                </div>
            `;

            const mailOptions = {
                from: `${this.config.from.name} <${this.config.from.address}>`,
                to: recipient,
                subject: 'Doğrulama Kodu (OTP) - KVKK Onayı',
                html: htmlContent
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log(`📧 OTP email sent to ${recipient}:`, result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('❌ OTP email sending failed:', error);
            throw new Error(`OTP email gönderimi başarısız: ${error.message}`);
        }
    }

    isConfigured() {
        return this.isReady && this.transporter !== null;
    }

    async sendConsentForm(formData, pdfBuffer) {
        if (!this.isConfigured()) {
            // Development fallback: allow flow to proceed without SMTP configuration
            console.warn('📧 Email service not configured; skipping consent email send (dev noop).');
            return {
                success: true,
                messageId: 'dev-noop',
                recipient: formData.email,
                timestamp: new Date().toISOString(),
                devNoop: true
            };
        }

        try {
            // Load email template
            const htmlTemplate = await this.loadEmailTemplate();
            const htmlContent = this.populateTemplate(htmlTemplate, formData);

            // Generate filename
            const filename = this.generateFilename(formData);

            // Prepare email options
            const mailOptions = {
                from: `${this.config.from.name} <${this.config.from.address}>`,
                to: formData.email,
                subject: 'KVKK Kişisel Verilerin Korunması Onay Formu',
                html: htmlContent,
                attachments: [
                    {
                        filename: filename,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            };

            // Send email
            const result = await this.transporter.sendMail(mailOptions);
            
            console.log(`📧 Email sent successfully to ${formData.email}:`, result.messageId);
            
            return {
                success: true,
                messageId: result.messageId,
                recipient: formData.email,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Email sending failed:', error);
            throw new Error(`Email gönderimi başarısız: ${error.message}`);
        }
    }

    async sendNotificationToAdmin(formData, pdfBuffer) {
        if (!this.isConfigured()) {
            return; // Silently fail if not configured
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        if (!adminEmail) {
            return; // No admin email configured
        }

        try {
            const filename = this.generateFilename(formData);
            const subject = `Yeni KVKK Onay Formu - ${formData.patientName}`;
            
            const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2c3e50;">Yeni KVKK Onay Formu Alındı</h2>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Hasta Bilgileri</h3>
                        <p><strong>Ad Soyad:</strong> ${formData.patientName}</p>
                        <p><strong>E-posta:</strong> ${formData.email}</p>
                        <p><strong>Rol:</strong> ${formData.role === 'patient' ? 'Hasta' : 'Hasta Yakını'}</p>
                        
                        ${formData.role === 'guardian' ? `
                            <h3>Yakın Bilgileri</h3>
                            <p><strong>Yakın Ad Soyad:</strong> ${formData.guardianName}</p>
                            <p><strong>Yakınlık Derecesi:</strong> ${formData.relationshipDegree}</p>
                        ` : ''}
                        
                        <p><strong>Tarih:</strong> ${new Date(formData.timestamp).toLocaleString('tr-TR')}</p>
                    </div>
                    
                    <p>Onaylanmış form ekte bulunmaktadır.</p>
                </div>
            `;

            const mailOptions = {
                from: `${this.config.from.name} <${this.config.from.address}>`,
                to: adminEmail,
                subject: subject,
                html: htmlContent,
                attachments: [
                    {
                        filename: filename,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            };

            await this.transporter.sendMail(mailOptions);
            console.log(`📧 Admin notification sent to ${adminEmail}`);

        } catch (error) {
            console.error('❌ Admin notification failed:', error);
            // Don't throw error for admin notifications
        }
    }

    async loadEmailTemplate() {
        try {
            const templatePath = path.join(__dirname, '../templates/consentEmail.html');
            return await fs.readFile(templatePath, 'utf8');
        } catch (error) {
            console.warn('⚠️  Email template not found, using default template');
            return this.getDefaultTemplate();
        }
    }

    populateTemplate(template, formData) {
        const replacements = {
            '{{patientName}}': formData.patientName || '',
            '{{email}}': formData.email || '',
            '{{date}}': new Date(formData.timestamp).toLocaleDateString('tr-TR'),
            '{{time}}': new Date(formData.timestamp).toLocaleTimeString('tr-TR'),
            '{{role}}': formData.role === 'patient' ? 'Hasta' : 'Hasta Yakını',
            '{{guardianName}}': formData.guardianName || '',
            '{{relationshipDegree}}': formData.relationshipDegree || '',
            '{{year}}': new Date().getFullYear(),
            '{{clinicName}}': process.env.CLINIC_NAME || 'Uzm.Dr.HANDE ÇELİK MEHMETOĞLU',
            '{{clinicAddress}}': process.env.CLINIC_ADDRESS || 'Akpınar Mh.367.Sok. Efe Plaza No:2 Kat:3 D:55 Osmangazi / Bursa',
            '{{clinicPhone}}': process.env.CLINIC_PHONE || '0 552 643 36 10',
            '{{clinicEmail}}': process.env.CLINIC_EMAIL || 'mehmetoglu.hande@gmail.com'
        };

        let populatedTemplate = template;
        Object.entries(replacements).forEach(([placeholder, value]) => {
            populatedTemplate = populatedTemplate.replace(new RegExp(placeholder, 'g'), value);
        });

        return populatedTemplate;
    }

    getDefaultTemplate() {
        return `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KVKK Onay Formu</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
        <h1 style="color: #2c3e50; text-align: center; margin-bottom: 10px;">KVKK Onay Formu</h1>
        <p style="text-align: center; color: #6c757d; margin: 0;">Kişisel Verilerin Korunması Kanunu</p>
    </div>

    <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #2c3e50; border-bottom: 2px solid #007bff; padding-bottom: 10px;">Sayın {{patientName}},</h2>
        
        <p>KVKK (Kişisel Verilerin Korunması Kanunu) onay formunuz başarıyla alınmış ve işlenmiştir.</p>
        
        <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1976d2; margin-top: 0;">Form Detayları</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Hasta Adı:</td>
                    <td style="padding: 8px 0;">{{patientName}}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">E-posta:</td>
                    <td style="padding: 8px 0;">{{email}}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Rol:</td>
                    <td style="padding: 8px 0;">{{role}}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Tarih:</td>
                    <td style="padding: 8px 0;">{{date}} {{time}}</td>
                </tr>
            </table>
        </div>

        <p>Dijital imzanızla onayladığınız KVKK formu ekte bulunmaktadır. Bu belgeyi güvenli bir yerde saklayınız.</p>
        
        <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #155724;"><strong>✓ Onayınız başarıyla kaydedilmiştir</strong></p>
        </div>

        <p>Herhangi bir sorunuz olması durumunda bizimle iletişime geçebilirsiniz.</p>
    </div>

    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-top: 30px; text-align: center;">
        <h3 style="color: #2c3e50; margin-top: 0;">İletişim Bilgileri</h3>
        <p style="margin: 5px 0;"><strong>{{clinicName}}</strong></p>
        <p style="margin: 5px 0;">{{clinicAddress}}</p>
        <p style="margin: 5px 0;">Telefon: {{clinicPhone}}</p>
        <p style="margin: 5px 0;">E-posta: {{clinicEmail}}</p>
    </div>

    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
        <p style="color: #6c757d; font-size: 12px; margin: 0;">
            Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayınız.
        </p>
        <p style="color: #6c757d; font-size: 12px; margin: 5px 0 0 0;">
            © {{year}} {{clinicName}}. Tüm hakları saklıdır.
        </p>
    </div>
</body>
</html>
        `;
    }

    generateFilename(formData) {
        const date = new Date().toISOString().split('T')[0];
        const patientName = formData.patientName
            .replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ\s]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase();
        
        return `KVKK_Onay_${patientName}_${date}.pdf`;
    }

    async testConnection() {
        if (!this.isConfigured()) {
            throw new Error('Email service is not configured');
        }

        try {
            await this.transporter.verify();
            return { success: true, message: 'Email service is working correctly' };
        } catch (error) {
            throw new Error(`Email service test failed: ${error.message}`);
        }
    }

    getConfiguration() {
        return {
            configured: this.isConfigured(),
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure,
            from: this.config.from
        };
    }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;