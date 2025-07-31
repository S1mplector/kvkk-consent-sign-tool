/**
 * Enhanced KVKK Consent Application
 * Integrates role selection, form filling, PDF viewing, digital signatures, and email submission
 */
class KVKKConsentApp {
    constructor() {
        // Core properties
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.canvas = document.getElementById('pdfCanvas');
        this.ctx = this.canvas?.getContext('2d');
        this.scale = 1.5;
        
        // Application state
        this.currentStep = 'role'; // role -> form -> pdf -> signature -> consent
        this.userRole = null;
        this.formData = {};
        this.signatures = {
            patient: null,
            guardian: null
        };
        
        // Touch handling for swipe navigation
        this.touchStartX = 0;
        this.touchEndX = 0;
        this.isSwipeEnabled = true;
        
        // Components
        this.roleSelector = null;
        this.patientForm = null;
        this.patientSignaturePad = null;
        this.guardianSignaturePad = null;
        this.pdfProcessor = null;
        this.apiClient = null;
        
        // Elements
        this.elements = {
            // Sections
            roleSection: document.getElementById('roleSection'),
            formSection: document.getElementById('formSection'),
            pdfSection: document.getElementById('pdfSection'),
            signatureSection: document.getElementById('signatureSection'),
            consentSection: document.getElementById('consentSection'),
            
            // PDF controls
            prevBtn: document.getElementById('prevPage'),
            nextBtn: document.getElementById('nextPage'),
            currentPageSpan: document.getElementById('currentPage'),
            totalPagesSpan: document.getElementById('totalPages'),
            pdfViewer: document.getElementById('pdfViewer'),
            
            // Consent controls
            consentCheck: document.getElementById('consentCheck'),
            submitBtn: document.getElementById('submitBtn'),
            
            // Signature containers
            patientSignatureContainer: document.getElementById('patientSignatureContainer'),
            guardianSignatureContainer: document.getElementById('guardianSignatureContainer')
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Check if PDF.js is available, if not use fallback
            if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            
            // Initialize components
            this.initializeComponents();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Start with role selection
            this.showStep('role');
            
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showError('Uygulama başlatılırken bir hata oluştu.');
        }
    }
    
    initializeComponents() {
        // Initialize API client
        this.apiClient = new APIClient();
        
        // Initialize PDF processor
        this.pdfProcessor = new PDFProcessor();
        
        // Initialize role selector
        this.roleSelector = new RoleSelector(
            this.elements.roleSection,
            (role) => this.handleRoleSelection(role)
        );
        
        // Initialize signature pads
        this.patientSignaturePad = new SignaturePadComponent(
            this.elements.patientSignatureContainer,
            { penColor: 'rgb(0, 0, 0)' }
        );
        
        this.guardianSignaturePad = new SignaturePadComponent(
            this.elements.guardianSignatureContainer,
            { penColor: 'rgb(0, 0, 0)' }
        );
    }
    
    setupEventListeners() {
        // PDF navigation
        this.elements.prevBtn?.addEventListener('click', () => this.goToPreviousPage());
        this.elements.nextBtn?.addEventListener('click', () => this.goToNextPage());
        
        // Consent checkbox
        this.elements.consentCheck?.addEventListener('change', (e) => {
            this.elements.submitBtn.disabled = !e.target.checked;
        });
        
        // Submit button
        this.elements.submitBtn?.addEventListener('click', () => this.handleFinalSubmit());
        
        // Touch events for PDF swipe navigation
        if (this.elements.pdfViewer) {
            this.elements.pdfViewer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
            this.elements.pdfViewer.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
        }
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Resize handler
        window.addEventListener('resize', () => this.handleResize());
    }
    
    handleRoleSelection(role) {
        this.userRole = role;
        
        // Initialize patient form with selected role
        this.patientForm = new PatientForm(this.elements.formSection, role);
        this.patientForm.setCallbacks({
            onNext: (formData) => this.handleFormSubmission(formData),
            onBack: () => this.showStep('role')
        });
        
        this.showStep('form');
    }
    
    async handleFormSubmission(formData) {
        try {
            // Validate form data
            const validation = ValidationUtils.validateFormData(formData);
            if (!validation.isValid) {
                this.showError('Form verilerinde hata var: ' + validation.errors.map(e => e.message).join(', '));
                return;
            }
            
            // Store form data
            this.formData = ValidationUtils.sanitizeFormData(formData);
            
            // Load and show PDF
            await this.loadAndShowPDF();
            
        } catch (error) {
            console.error('Form submission error:', error);
            this.showError('Form gönderilirken bir hata oluştu.');
        }
    }
    
    async loadAndShowPDF() {
        try {
            this.showLoading();
            
            // Try PDF.js first, fallback to iframe if not available
            if (typeof pdfjsLib !== 'undefined') {
                try {
                    const loadingTask = pdfjsLib.getDocument('./src/resources/assets/KVKK.pdf');
                    this.pdfDoc = await loadingTask.promise;
                    this.totalPages = this.pdfDoc.numPages;
                    this.elements.totalPagesSpan.textContent = this.totalPages;
                    
                    // Render first page
                    await this.renderPage(1);
                } catch (pdfJsError) {
                    console.warn('PDF.js failed, using fallback:', pdfJsError);
                    this.usePDFFallback();
                }
            } else {
                console.warn('PDF.js not available, using fallback');
                this.usePDFFallback();
            }
            
            // Load PDF with PDF-lib for processing
            await this.pdfProcessor.loadPDF('./src/resources/assets/KVKK.pdf');
            
            this.hideLoading();
            this.showStep('pdf');
            
        } catch (error) {
            this.hideLoading();
            console.error('PDF loading error:', error);
            this.showError('PDF yüklenirken bir hata oluştu.');
        }
    }
    
    usePDFFallback() {
        // Hide canvas and show iframe fallback
        if (this.canvas) {
            this.canvas.style.display = 'none';
        }
        
        // Create iframe for PDF display
        const pdfViewer = this.elements.pdfViewer;
        let iframe = pdfViewer.querySelector('iframe');
        
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.src = './src/resources/assets/KVKK.pdf';
            iframe.style.cssText = `
                width: 100%;
                height: 600px;
                border: none;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            `;
            pdfViewer.appendChild(iframe);
        }
        
        // Hide navigation controls since iframe handles its own navigation
        const controls = document.querySelector('.pdf-controls');
        if (controls) {
            controls.style.display = 'none';
        }
        
        // Show signature prompt immediately
        setTimeout(() => {
            this.showSignaturePrompt();
        }, 2000);
    }
    
    async renderPage(pageNum) {
        try {
            if (!this.pdfDoc || !this.canvas) return;
            
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            
            // Set canvas dimensions
            this.canvas.height = viewport.height;
            this.canvas.width = viewport.width;
            
            // Render page
            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // Update UI
            this.currentPage = pageNum;
            this.elements.currentPageSpan.textContent = pageNum;
            this.updateNavigationButtons();
            
            // Show signature section when on last page
            if (pageNum === this.totalPages) {
                this.showSignaturePrompt();
            }
            
        } catch (error) {
            console.error('Error rendering page:', error);
            this.showError('Sayfa görüntülenirken bir hata oluştu.');
        }
    }
    
    showSignaturePrompt() {
        // Add a prompt to proceed to signature after viewing all pages
        const existingPrompt = document.querySelector('.signature-prompt');
        if (existingPrompt) return;
        
        const prompt = document.createElement('div');
        prompt.className = 'signature-prompt';
        prompt.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #e3f2fd; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 15px 0; font-weight: 500;">KVKK metnini okudunuz. Şimdi dijital imzanızı atabilirsiniz.</p>
                <button id="proceedToSignature" class="next-btn" style="padding: 12px 24px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <span>İmzaya Geç</span> ➡️
                </button>
            </div>
        `;
        
        this.elements.pdfSection.appendChild(prompt);
        
        document.getElementById('proceedToSignature').addEventListener('click', () => {
            this.showStep('signature');
        });
    }
    
    showStep(step) {
        // Hide all sections
        Object.values(this.elements).forEach(element => {
            if (element && element.classList && element.classList.contains('app-section')) {
                element.style.display = 'none';
            }
        });
        
        // Show current step
        this.currentStep = step;
        
        switch (step) {
            case 'role':
                this.elements.roleSection.style.display = 'block';
                this.roleSelector.show();
                break;
                
            case 'form':
                this.elements.formSection.style.display = 'block';
                this.patientForm.show();
                break;
                
            case 'pdf':
                this.elements.pdfSection.style.display = 'block';
                break;
                
            case 'signature':
                this.elements.signatureSection.style.display = 'block';
                this.setupSignatureSection();
                break;
                
            case 'consent':
                this.elements.consentSection.style.display = 'block';
                break;
        }
        
        // Update page title
        this.updatePageTitle(step);
    }
    
    setupSignatureSection() {
        // Show patient signature pad
        this.patientSignaturePad.show();
        
        // Show guardian signature pad if role is guardian
        if (this.userRole === 'guardian') {
            this.elements.guardianSignatureContainer.style.display = 'block';
            this.guardianSignaturePad.show();
        } else {
            this.elements.guardianSignatureContainer.style.display = 'none';
        }
        
        // Add navigation buttons
        this.addSignatureNavigation();
    }
    
    addSignatureNavigation() {
        const existingNav = document.querySelector('.signature-navigation');
        if (existingNav) return;
        
        const nav = document.createElement('div');
        nav.className = 'signature-navigation';
        nav.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-top: 1px solid #e9ecef; margin-top: 20px;">
                <button id="backToPdf" class="back-btn" style="padding: 12px 24px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    ⬅️ <span>PDF'e Dön</span>
                </button>
                <button id="proceedToConsent" class="next-btn" style="padding: 12px 24px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <span>Onaya Geç</span> ➡️
                </button>
            </div>
        `;
        
        this.elements.signatureSection.appendChild(nav);
        
        // Add event listeners
        document.getElementById('backToPdf').addEventListener('click', () => {
            this.showStep('pdf');
        });
        
        document.getElementById('proceedToConsent').addEventListener('click', () => {
            this.handleSignatureCompletion();
        });
    }
    
    handleSignatureCompletion() {
        // Validate signatures
        const patientSig = this.patientSignaturePad.getSignatureData();
        const guardianSig = this.userRole === 'guardian' ? this.guardianSignaturePad.getSignatureData() : null;
        
        const sigValidation = ValidationUtils.validateSignatures({
            patient: patientSig,
            guardian: guardianSig
        }, this.userRole);
        
        if (!sigValidation.isValid) {
            this.showError('İmza eksik: ' + sigValidation.errors.map(e => e.message).join(', '));
            return;
        }
        
        // Store signatures
        this.signatures.patient = patientSig;
        if (this.userRole === 'guardian') {
            this.signatures.guardian = guardianSig;
        }
        
        this.showStep('consent');
    }
    
    async handleFinalSubmit() {
        if (!this.elements.consentCheck.checked) {
            this.showError('Lütfen onay kutusunu işaretleyin.');
            return;
        }
        
        try {
            this.elements.submitBtn.disabled = true;
            this.elements.submitBtn.innerHTML = '<span>Gönderiliyor...</span> ⏳';
            
            // Process PDF with form data and signatures
            const processedPdfBytes = await this.pdfProcessor.processPDF(this.formData, this.signatures);
            
            // Create PDF blob
            const pdfBlob = this.pdfProcessor.createPDFBlob(processedPdfBytes);
            
            // Submit to backend
            const result = await this.apiClient.submitConsent(this.formData, pdfBlob);
            
            if (result.success) {
                this.showSuccess('Onayınız başarıyla gönderildi! E-posta adresinizi kontrol edin.');
                this.resetApplication();
            } else {
                throw new Error(result.error || 'Gönderim başarısız');
            }
            
        } catch (error) {
            console.error('Final submission error:', error);
            this.showError('Gönderim sırasında bir hata oluştu: ' + error.message);
            this.elements.submitBtn.disabled = false;
            this.elements.submitBtn.innerHTML = '<span class="submit-icon" aria-hidden="true">✉️</span> Onayla ve Gönder';
        }
    }
    
    // PDF Navigation Methods
    updateNavigationButtons() {
        if (this.elements.prevBtn) this.elements.prevBtn.disabled = this.currentPage <= 1;
        if (this.elements.nextBtn) this.elements.nextBtn.disabled = this.currentPage >= this.totalPages;
    }
    
    async goToPreviousPage() {
        if (this.currentPage > 1) {
            await this.renderPage(this.currentPage - 1);
        }
    }
    
    async goToNextPage() {
        if (this.currentPage < this.totalPages) {
            await this.renderPage(this.currentPage + 1);
        }
    }
    
    // Touch and Keyboard Handlers
    handleTouchStart(e) {
        if (!this.isSwipeEnabled) return;
        this.touchStartX = e.changedTouches[0].screenX;
    }
    
    handleTouchEnd(e) {
        if (!this.isSwipeEnabled) return;
        this.touchEndX = e.changedTouches[0].screenX;
        this.handleSwipe();
    }
    
    handleSwipe() {
        const swipeThreshold = 50;
        const swipeDistance = this.touchStartX - this.touchEndX;
        
        if (Math.abs(swipeDistance) > swipeThreshold) {
            if (swipeDistance > 0) {
                this.goToNextPage();
            } else {
                this.goToPreviousPage();
            }
        }
    }
    
    handleKeydown(e) {
        if (this.currentStep !== 'pdf') return;
        
        switch(e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.goToPreviousPage();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.goToNextPage();
                break;
        }
    }
    
    handleResize() {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            if (this.currentStep === 'pdf' && this.currentPage) {
                this.renderPage(this.currentPage);
            }
        }, 250);
    }
    
    // UI Helper Methods
    updatePageTitle(step) {
        const titles = {
            role: 'Rol Seçimi',
            form: 'Bilgi Formu',
            pdf: 'KVKK Metni',
            signature: 'Dijital İmza',
            consent: 'Onay'
        };
        
        document.title = `KVKK Onay Formu - ${titles[step] || 'Yükleniyor'}`;
    }
    
    showLoading() {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'pdf-loading-overlay';
        loadingOverlay.innerHTML = '<div class="loading-spinner"></div>';
        loadingOverlay.id = 'loadingOverlay';
        
        const targetElement = this.currentStep === 'pdf' ? this.elements.pdfViewer : document.body;
        targetElement.appendChild(loadingOverlay);
    }
    
    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }
    
    showError(message) {
        this.showMessage(message, 'error');
    }
    
    showSuccess(message) {
        this.showMessage(message, 'success');
    }
    
    showMessage(message, type) {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.success-message, .error-message');
        existingMessages.forEach(msg => msg.remove());
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `${type}-message`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            padding: 15px 25px;
            border-radius: 8px;
            font-weight: 500;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        `;
        
        if (type === 'error') {
            messageDiv.style.background = '#f8d7da';
            messageDiv.style.color = '#721c24';
            messageDiv.style.border = '1px solid #f5c6cb';
        } else {
            messageDiv.style.background = '#d4edda';
            messageDiv.style.color = '#155724';
            messageDiv.style.border = '1px solid #c3e6cb';
        }
        
        document.body.appendChild(messageDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    }
    
    resetApplication() {
        // Reset all state
        this.currentStep = 'role';
        this.userRole = null;
        this.formData = {};
        this.signatures = { patient: null, guardian: null };
        
        // Reset components
        if (this.roleSelector) this.roleSelector.reset();
        if (this.patientForm) this.patientForm.reset();
        if (this.patientSignaturePad) this.patientSignaturePad.clear();
        if (this.guardianSignaturePad) this.guardianSignaturePad.clear();
        if (this.pdfProcessor) this.pdfProcessor.reset();
        
        // Reset consent checkbox
        if (this.elements.consentCheck) this.elements.consentCheck.checked = false;
        if (this.elements.submitBtn) this.elements.submitBtn.disabled = true;
        
        // Remove dynamic elements
        document.querySelectorAll('.signature-prompt, .signature-navigation').forEach(el => el.remove());
        
        // Show role selection
        setTimeout(() => {
            this.showStep('role');
        }, 2000);
    }
}

// Splash Screen Handler (Enhanced)
class SplashScreenHandler {
    constructor() {
        this.splashScreen = document.getElementById('splashScreen');
        this.body = document.body;
        this.init();
    }
    
    init() {
        this.startSplashSequence();
    }
    
    startSplashSequence() {
        setTimeout(() => {
            this.transitionToMainApp();
        }, 3500);
    }
    
    transitionToMainApp() {
        this.splashScreen.classList.add('fade-out');
        this.body.classList.remove('splash-active');
        
        setTimeout(() => {
            if (this.splashScreen.parentNode) {
                this.splashScreen.remove();
            }
        }, 1000);
        
        setTimeout(() => {
            new KVKKConsentApp();
        }, 500);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (prefersReducedMotion) {
        document.body.classList.remove('splash-active');
        const splashScreen = document.getElementById('splashScreen');
        if (splashScreen) splashScreen.remove();
        new KVKKConsentApp();
    } else {
        new SplashScreenHandler();
    }
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});
