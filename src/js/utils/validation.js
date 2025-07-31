/**
 * Form Validation Utilities
 * Centralized validation functions for the KVKK consent form
 */
class ValidationUtils {
    
    /**
     * Validate Turkish name (allows Turkish characters)
     */
    static validateName(name) {
        if (!name || typeof name !== 'string') {
            return { isValid: false, message: 'Ad soyad gereklidir' };
        }

        const trimmedName = name.trim();
        
        if (trimmedName.length < 2) {
            return { isValid: false, message: 'Ad soyad en az 2 karakter olmalıdır' };
        }

        if (trimmedName.length > 100) {
            return { isValid: false, message: 'Ad soyad 100 karakterden uzun olamaz' };
        }

        // Turkish characters pattern
        const namePattern = /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/;
        if (!namePattern.test(trimmedName)) {
            return { isValid: false, message: 'Ad soyad sadece harflerden oluşmalıdır' };
        }

        // Check for at least one space (name and surname)
        if (!trimmedName.includes(' ')) {
            return { isValid: false, message: 'Lütfen ad ve soyadınızı giriniz' };
        }

        return { isValid: true, message: '' };
    }

    /**
     * Validate email address
     */
    static validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return { isValid: false, message: 'E-posta adresi gereklidir' };
        }

        const trimmedEmail = email.trim().toLowerCase();
        
        if (trimmedEmail.length === 0) {
            return { isValid: false, message: 'E-posta adresi gereklidir' };
        }

        // RFC 5322 compliant email regex (simplified)
        const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        
        if (!emailPattern.test(trimmedEmail)) {
            return { isValid: false, message: 'Geçerli bir e-posta adresi giriniz' };
        }

        if (trimmedEmail.length > 254) {
            return { isValid: false, message: 'E-posta adresi çok uzun' };
        }

        return { isValid: true, message: '' };
    }

    /**
     * Validate relationship degree
     */
    static validateRelationshipDegree(relationship) {
        if (!relationship || typeof relationship !== 'string') {
            return { isValid: false, message: 'Yakınlık derecesi seçiniz' };
        }

        const validRelationships = [
            'Anne', 'Baba', 'Eş', 'Çocuk', 'Kardeş', 'Vasi', 'Diğer'
        ];

        if (!validRelationships.includes(relationship)) {
            return { isValid: false, message: 'Geçerli bir yakınlık derecesi seçiniz' };
        }

        return { isValid: true, message: '' };
    }

    /**
     * Validate signature data
     */
    static validateSignature(signatureData) {
        if (!signatureData) {
            return { isValid: false, message: 'İmza gereklidir' };
        }

        if (signatureData.isEmpty === true) {
            return { isValid: false, message: 'Lütfen imzanızı atın' };
        }

        if (!signatureData.dataURL) {
            return { isValid: false, message: 'İmza verisi geçersiz' };
        }

        // Check if signature data URL is valid
        if (!signatureData.dataURL.startsWith('data:image/')) {
            return { isValid: false, message: 'İmza formatı geçersiz' };
        }

        return { isValid: true, message: '' };
    }

    /**
     * Validate complete form data
     */
    static validateFormData(formData) {
        const errors = [];

        // Validate patient name
        const nameValidation = this.validateName(formData.patientName);
        if (!nameValidation.isValid) {
            errors.push({ field: 'patientName', message: nameValidation.message });
        }

        // Validate email
        const emailValidation = this.validateEmail(formData.email);
        if (!emailValidation.isValid) {
            errors.push({ field: 'email', message: emailValidation.message });
        }

        // Validate role
        if (!formData.role || !['patient', 'guardian'].includes(formData.role)) {
            errors.push({ field: 'role', message: 'Geçerli bir rol seçiniz' });
        }

        // Guardian-specific validations
        if (formData.role === 'guardian') {
            const guardianNameValidation = this.validateName(formData.guardianName);
            if (!guardianNameValidation.isValid) {
                errors.push({ field: 'guardianName', message: guardianNameValidation.message });
            }

            const relationshipValidation = this.validateRelationshipDegree(formData.relationshipDegree);
            if (!relationshipValidation.isValid) {
                errors.push({ field: 'relationshipDegree', message: relationshipValidation.message });
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate signatures
     */
    static validateSignatures(signatures, role) {
        const errors = [];

        // Validate patient signature
        const patientSignatureValidation = this.validateSignature(signatures.patient);
        if (!patientSignatureValidation.isValid) {
            errors.push({ field: 'patientSignature', message: patientSignatureValidation.message });
        }

        // Validate guardian signature if role is guardian
        if (role === 'guardian') {
            const guardianSignatureValidation = this.validateSignature(signatures.guardian);
            if (!guardianSignatureValidation.isValid) {
                errors.push({ field: 'guardianSignature', message: guardianSignatureValidation.message });
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Sanitize input string
     */
    static sanitizeInput(input) {
        if (typeof input !== 'string') {
            return '';
        }

        return input
            .trim()
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/\s+/g, ' '); // Normalize whitespace
    }

    /**
     * Sanitize form data
     */
    static sanitizeFormData(formData) {
        const sanitized = {};

        // Sanitize string fields
        const stringFields = ['patientName', 'email', 'guardianName', 'relationshipDegree'];
        stringFields.forEach(field => {
            if (formData[field]) {
                sanitized[field] = this.sanitizeInput(formData[field]);
            }
        });

        // Copy non-string fields as-is
        const otherFields = ['role', 'timestamp', 'date'];
        otherFields.forEach(field => {
            if (formData[field] !== undefined) {
                sanitized[field] = formData[field];
            }
        });

        return sanitized;
    }

    /**
     * Check if field is required based on role
     */
    static isFieldRequired(fieldName, role) {
        const requiredFields = {
            patient: ['patientName', 'email'],
            guardian: ['patientName', 'email', 'guardianName', 'relationshipDegree']
        };

        return requiredFields[role]?.includes(fieldName) || false;
    }

    /**
     * Get field validation rules
     */
    static getFieldRules(fieldName) {
        const rules = {
            patientName: {
                required: true,
                minLength: 2,
                maxLength: 100,
                pattern: /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/,
                validator: this.validateName
            },
            guardianName: {
                required: true,
                minLength: 2,
                maxLength: 100,
                pattern: /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/,
                validator: this.validateName
            },
            email: {
                required: true,
                maxLength: 254,
                pattern: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
                validator: this.validateEmail
            },
            relationshipDegree: {
                required: true,
                validator: this.validateRelationshipDegree
            }
        };

        return rules[fieldName] || {};
    }

    /**
     * Real-time field validation
     */
    static validateField(fieldName, value, role = 'patient') {
        const rules = this.getFieldRules(fieldName);
        
        if (!rules.validator) {
            return { isValid: true, message: '' };
        }

        // Check if field is required for this role
        if (!this.isFieldRequired(fieldName, role) && (!value || value.trim() === '')) {
            return { isValid: true, message: '' };
        }

        return rules.validator(value);
    }

    /**
     * Format validation errors for display
     */
    static formatErrors(errors) {
        return errors.map(error => ({
            field: error.field,
            message: error.message,
            type: 'validation'
        }));
    }

    /**
     * Check if all required fields are filled
     */
    static areRequiredFieldsFilled(formData, role) {
        const requiredFields = this.isFieldRequired('', role) ? 
            ['patientName', 'email', 'guardianName', 'relationshipDegree'] :
            ['patientName', 'email'];

        return requiredFields.every(field => {
            const value = formData[field];
            return value && typeof value === 'string' && value.trim().length > 0;
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationUtils;
}