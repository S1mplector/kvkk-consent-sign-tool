class KVKKConsentApp {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.canvas = document.getElementById('pdfCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.scale = 1.5;
        
        // Touch handling for swipe navigation
        this.touchStartX = 0;
        this.touchEndX = 0;
        this.isSwipeEnabled = true;
        
        // Elements
        this.elements = {
            prevBtn: document.getElementById('prevPage'),
            nextBtn: document.getElementById('nextPage'),
            currentPageSpan: document.getElementById('currentPage'),
            totalPagesSpan: document.getElementById('totalPages'),
            consentCheck: document.getElementById('consentCheck'),
            submitBtn: document.getElementById('submitBtn'),
            pdfViewer: document.getElementById('pdfViewer')
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Configure PDF.js
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            
            // Load PDF
            await this.loadPDF('./src/resources/assets/example.pdf');
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Render first page
            await this.renderPage(1);
            
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showError('PDF yüklenirken bir hata oluştu.');
        }
    }
    
    async loadPDF(url) {
        try {
            this.showLoading();
            const loadingTask = pdfjsLib.getDocument(url);
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;
            this.elements.totalPagesSpan.textContent = this.totalPages;
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            throw error;
        }
    }
    
    async renderPage(pageNum) {
        try {
            if (!this.pdfDoc) return;
            
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
            
        } catch (error) {
            console.error('Error rendering page:', error);
            this.showError('Sayfa görüntülenirken bir hata oluştu.');
        }
    }
    
    updateNavigationButtons() {
        this.elements.prevBtn.disabled = this.currentPage <= 1;
        this.elements.nextBtn.disabled = this.currentPage >= this.totalPages;
    }
    
    setupEventListeners() {
        // Navigation buttons
        this.elements.prevBtn.addEventListener('click', () => this.goToPreviousPage());
        this.elements.nextBtn.addEventListener('click', () => this.goToNextPage());
        
        // Consent checkbox
        this.elements.consentCheck.addEventListener('change', (e) => {
            this.elements.submitBtn.disabled = !e.target.checked;
        });
        
        // Submit button
        this.elements.submitBtn.addEventListener('click', () => this.handleSubmit());
        
        // Touch events for swipe navigation
        this.elements.pdfViewer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.elements.pdfViewer.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Resize handler
        window.addEventListener('resize', () => this.handleResize());
    }
    
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
                // Swipe left - next page
                this.goToNextPage();
            } else {
                // Swipe right - previous page
                this.goToPreviousPage();
            }
        }
    }
    
    handleKeydown(e) {
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
    
    handleResize() {
        // Debounce resize events
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            this.renderPage(this.currentPage);
        }, 250);
    }
    
    async handleSubmit() {
        if (!this.elements.consentCheck.checked) {
            this.showError('Lütfen onay kutusunu işaretleyin.');
            return;
        }
        
        try {
            this.elements.submitBtn.disabled = true;
            this.elements.submitBtn.textContent = 'Gönderiliyor...';
            
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Here you would implement the actual submission logic
            // For now, we'll just show a success message
            await this.processConsent();
            
            this.showSuccess('Onayınız başarıyla kaydedildi!');
            
        } catch (error) {
            console.error('Error submitting consent:', error);
            this.showError('Gönderim sırasında bir hata oluştu. Lütfen tekrar deneyin.');
            this.elements.submitBtn.disabled = false;
            this.elements.submitBtn.textContent = 'Onayla ve Gönder';
        }
    }
    
    async processConsent() {
        // This is where you would implement the actual consent processing
        // For example:
        // - Generate a signed document
        // - Send to email
        // - Save to database
        // - etc.
        
        const consentData = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            pdfPages: this.totalPages,
            consentGiven: true
        };
        
        console.log('Consent data:', consentData);
        
        // Placeholder for future implementation
        // await this.sendConsentEmail(consentData);
        // await this.saveConsentToDatabase(consentData);
    }
    
    showLoading() {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'pdf-loading-overlay';
        loadingOverlay.innerHTML = '<div class="loading-spinner"></div>';
        loadingOverlay.id = 'loadingOverlay';
        this.elements.pdfViewer.appendChild(loadingOverlay);
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
        
        const consentSection = document.querySelector('.consent-section');
        consentSection.appendChild(messageDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new KVKKConsentApp();
});

// Service Worker can be added later for offline support
// Currently disabled to avoid CORS issues during development
