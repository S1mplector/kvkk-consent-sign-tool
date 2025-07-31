/**
 * Patient Form Component
 * Handles patient information input and validation
 */
class PatientForm {
    constructor(container, role = 'patient') {
        this.container = container;
        this.role = role; // 'patient' or 'guardian'
        this.formData = {};
        this.validators = {};
        this.init();
    }

    init() {
        this.setupValidators();
        this.render();
        this.setupEventListeners();
    }

    setupValidators() {
        this.validators = {
            patientName: {
                required: true,
                minLength: 2,
                pattern: /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/,
                message: 'Lütfen geçerli bir ad soyad giriniz (en az 2 karakter, sadece harfler)'
            },
            guardianName: {
                required: true,
                minLength: 2,
                pattern: /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/,
                message: 'Lütfen geçerli bir ad soyad giriniz (en az 2 karakter, sadece harfler)'
            },
            relationshipDegree: {
                required: true,
                minLength: 2,
                message: 'Lütfen yakınlık derecesini belirtiniz'
            },
            email: {
                required: true,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Lütfen geçerli bir e-posta adresi giriniz'
            }
        };
    }

    render() {
        const isGuardian = this.role === 'guardian';
        
        this.container.innerHTML = `
            <div class="patient-form-container">
                <div class="form-header">
                    <h2 class="form-title">
                        <span class="form-icon" aria-hidden="true">📝</span>
                        ${isGuardian ? 'Hasta ve Yakın Bilgileri' : 'Hasta Bilgileri'}
                    </h2>
                    <p class="form-description">
                        ${isGuardian 
                            ? 'Lütfen hasta bilgilerini ve kendi bilgilerinizi doldurun' 
                            : 'Lütfen kişisel bilgilerinizi doldurun'
                        }
                    </p>
                </div>

                <form class="patient-form" id="patientForm" novalidate>
                    <!-- Patient Information Section -->
                    <fieldset class="form-section">
                        <legend class="section-title">
                            <span class="section-icon" aria-hidden="true">🏥</span>
                            Hasta Bilgileri
                        </legend>
                        
                        <div class="form-group">
                            <label for="patientName" class="form-label">
                                Hasta Ad/Soyad *
                            </label>
                            <input 
                                type="text" 
                                id="patientName" 
                                name="patientName"
                                class="form-input"
                                placeholder="Örn: Ahmet Yılmaz"
                                aria-describedby="patientName-error"
                                aria-required="true"
                                autocomplete="name"
                            >
                            <div id="patientName-error" class="error-message" role="alert"></div>
                        </div>

                        <div class="form-group">
                            <label for="patientEmail" class="form-label">
                                E-posta Adresi *
                            </label>
                            <input 
                                type="email" 
                                id="patientEmail" 
                                name="email"
                                class="form-input"
                                placeholder="ornek@email.com"
                                aria-describedby="patientEmail-error patientEmail-help"
                                aria-required="true"
                                autocomplete="email"
                            >
                            <div id="patientEmail-help" class="form-help">
                                Onaylanmış form bu e-posta adresine gönderilecektir
                            </div>
                            <div id="patientEmail-error" class="error-message" role="alert"></div>
                        </div>
                    </fieldset>

                    ${isGuardian ? this.renderGuardianSection() : ''}

                    <!-- Form Actions -->
                    <div class="form-actions">
                        <button 
                            type="button" 
                            id="backBtn" 
                            class="back-btn"
                            aria-describedby="back-description"
                        >
                            <span class="btn-icon" aria-hidden="true">⬅️</span>
                            Geri
                        </button>
                        <div id="back-description" class="visually-hidden">
                            Rol seçim ekranına geri dön
                        </div>

                        <button 
                            type="submit" 
                            id="nextBtn" 
                            class="next-btn"
                            aria-describedby="next-description"
                        >
                            <span class="btn-icon" aria-hidden="true">➡️</span>
                            PDF'i Görüntüle
                        </button>
                        <div id="next-description" class="visually-hidden">
                            Formu doğrula ve PDF görüntüleme ekranına geç
                        </div>
                    </div>
                </form>
            </div>
        `;
    }

    renderGuardianSection() {
        return `
            <fieldset class="form-section">
                <legend class="section-title">
                    <span class="section-icon" aria-hidden="true">👨‍👩‍👧‍👦</span>
                    Yakın Bilgileri
                </legend>
                
                <div class="form-group">
                    <label for="guardianName" class="form-label">
                        Yakın Ad/Soyad *
                    </label>
                    <input 
                        type="text" 
                        id="guardianName" 
                        name="guardianName"
                        class="form-input"
                        placeholder="Örn: Ayşe Yılmaz"
                        aria-describedby="guardianName-error"
                        aria-required="true"
                        autocomplete="name"
                    >
                    <div id="guardianName-error" class="error-message" role="alert"></div>
                </div>

                <div class="form-group">
                    <label for="relationshipDegree" class="form-label">
                        Yakınlık Derecesi *
                    </label>
                    <select 
                        id="relationshipDegree" 
                        name="relationshipDegree"
                        class="form-select"
                        aria-describedby="relationshipDegree-error"
                        aria-required="true"
                    >
                        <option value="">Seçiniz...</option>
                        <option value="Anne">Anne</option>
                        <option value="Baba">Baba</option>
                        <option value="Eş">Eş</option>
                        <option value="Çocuk">Çocuk</option>
                        <option value="Kardeş">Kardeş</option>
                        <option value="Vasi">Vasi</option>
                        <option value="Diğer">Diğer</option>
                    </select>
                    <div id="relationshipDegree-error" class="error-message" role="alert"></div>
                </div>
            </fieldset>
        `;
    }

    setupEventListeners() {
        const form = this.container.querySelector('#patientForm');
        const backBtn = this.container.querySelector('#backBtn');
        const inputs = this.container.querySelectorAll('.form-input, .form-select');

        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Back button
        backBtn.addEventListener('click', () => {
            this.onBack && this.onBack();
        });

        // Real-time validation
        inputs.forEach(input => {
            input.addEventListener('blur', () => {
                this.validateField(input);
            });

            input.addEventListener('input', () => {
                this.clearFieldError(input);
            });
        });

        // Accessibility improvements
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                input.parentElement.classList.add('focused');
            });

            input.addEventListener('blur', () => {
                input.parentElement.classList.remove('focused');
            });
        });
    }

    validateField(field) {
        const name = field.name;
        const value = field.value.trim();
        const validator = this.validators[name];
        const errorElement = this.container.querySelector(`#${field.id}-error`);

        if (!validator) return true;

        // Clear previous error
        this.clearFieldError(field);

        // Required validation
        if (validator.required && !value) {
            this.showFieldError(field, 'Bu alan zorunludur');
            return false;
        }

        // Skip other validations if field is empty and not required
        if (!value && !validator.required) return true;

        // Length validation
        if (validator.minLength && value.length < validator.minLength) {
            this.showFieldError(field, `En az ${validator.minLength} karakter olmalıdır`);
            return false;
        }

        // Pattern validation
        if (validator.pattern && !validator.pattern.test(value)) {
            this.showFieldError(field, validator.message);
            return false;
        }

        return true;
    }

    showFieldError(field, message) {
        const errorElement = this.container.querySelector(`#${field.id}-error`);
        field.classList.add('error');
        field.setAttribute('aria-invalid', 'true');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }

    clearFieldError(field) {
        const errorElement = this.container.querySelector(`#${field.id}-error`);
        field.classList.remove('error');
        field.setAttribute('aria-invalid', 'false');
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }

    validateForm() {
        const inputs = this.container.querySelectorAll('.form-input, .form-select');
        let isValid = true;

        inputs.forEach(input => {
            if (!this.validateField(input)) {
                isValid = false;
            }
        });

        return isValid;
    }

    handleSubmit() {
        if (this.validateForm()) {
            this.collectFormData();
            this.onNext && this.onNext(this.formData);
        } else {
            // Focus on first error field
            const firstError = this.container.querySelector('.form-input.error, .form-select.error');
            if (firstError) {
                firstError.focus();
            }
        }
    }

    collectFormData() {
        const form = this.container.querySelector('#patientForm');
        const formData = new FormData(form);
        
        this.formData = {
            patientName: formData.get('patientName')?.trim(),
            email: formData.get('email')?.trim(),
            role: this.role,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('tr-TR')
        };

        if (this.role === 'guardian') {
            this.formData.guardianName = formData.get('guardianName')?.trim();
            this.formData.relationshipDegree = formData.get('relationshipDegree');
        }
    }

    getFormData() {
        return this.formData;
    }

    setCallbacks(callbacks) {
        this.onNext = callbacks.onNext;
        this.onBack = callbacks.onBack;
    }

    hide() {
        this.container.style.display = 'none';
    }

    show() {
        this.container.style.display = 'block';
    }

    reset() {
        const form = this.container.querySelector('#patientForm');
        if (form) {
            form.reset();
        }
        
        // Clear all errors
        const errorElements = this.container.querySelectorAll('.error-message');
        errorElements.forEach(error => {
            error.textContent = '';
            error.style.display = 'none';
        });

        // Clear error states
        const inputs = this.container.querySelectorAll('.form-input, .form-select');
        inputs.forEach(input => {
            input.classList.remove('error');
            input.setAttribute('aria-invalid', 'false');
        });

        this.formData = {};
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PatientForm;
}