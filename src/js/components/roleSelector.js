/**
 * Role Selector Component
 * Allows users to choose between patient or guardian/representative roles
 */
class RoleSelector {
    constructor(container, onRoleChange) {
        this.container = container;
        this.onRoleChange = onRoleChange;
        this.selectedRole = null;
        this.init();
    }

    init() {
        this.render();
        this.setupEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="role-selector-container">
                <h2 class="role-selector-title">
                    <span class="role-icon" aria-hidden="true">👤</span>
                    Kim adına imzalıyorsunuz?
                </h2>
                <p class="role-selector-description">
                    Lütfen aşağıdaki seçeneklerden birini seçin:
                </p>
                
                <div class="role-options">
                    <label class="role-option" for="role-patient">
                        <input 
                            type="radio" 
                            id="role-patient" 
                            name="userRole" 
                            value="patient"
                            class="role-radio"
                            aria-describedby="patient-description"
                        >
                        <div class="role-option-content">
                            <div class="role-option-icon">🏥</div>
                            <div class="role-option-text">
                                <h3>Ben hastayım</h3>
                                <p id="patient-description">Kendi adıma KVKK onayı veriyorum</p>
                            </div>
                        </div>
                    </label>

                    <label class="role-option" for="role-guardian">
                        <input 
                            type="radio" 
                            id="role-guardian" 
                            name="userRole" 
                            value="guardian"
                            class="role-radio"
                            aria-describedby="guardian-description"
                        >
                        <div class="role-option-content">
                            <div class="role-option-icon">👨‍👩‍👧‍👦</div>
                            <div class="role-option-text">
                                <h3>Hasta yakınıyım</h3>
                                <p id="guardian-description">Hasta adına KVKK onayı veriyorum</p>
                            </div>
                        </div>
                    </label>
                </div>

                <button 
                    id="continueBtn" 
                    class="continue-btn" 
                    disabled
                    aria-describedby="continue-description"
                >
                    <span class="continue-icon" aria-hidden="true">➡️</span>
                    Devam Et
                </button>
                <div id="continue-description" class="visually-hidden">
                    Devam etmek için önce bir rol seçmeniz gerekiyor
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const radioButtons = this.container.querySelectorAll('.role-radio');
        const continueBtn = this.container.querySelector('#continueBtn');

        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.selectedRole = e.target.value;
                continueBtn.disabled = false;
                
                // Update visual feedback
                this.updateRoleSelection();
                
                // Announce to screen readers
                this.announceRoleSelection(e.target.value);
            });
        });

        continueBtn.addEventListener('click', () => {
            if (this.selectedRole && this.onRoleChange) {
                this.onRoleChange(this.selectedRole);
            }
        });

        // Keyboard navigation support
        this.container.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('role-radio')) {
                e.target.click();
            }
        });
    }

    updateRoleSelection() {
        const options = this.container.querySelectorAll('.role-option');
        options.forEach(option => {
            const radio = option.querySelector('.role-radio');
            if (radio.checked) {
                option.classList.add('selected');
                option.setAttribute('aria-selected', 'true');
            } else {
                option.classList.remove('selected');
                option.setAttribute('aria-selected', 'false');
            }
        });
    }

    announceRoleSelection(role) {
        const announcement = role === 'patient' 
            ? 'Hasta rolü seçildi' 
            : 'Hasta yakını rolü seçildi';
        
        // Create temporary announcement for screen readers
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'visually-hidden';
        announcer.textContent = announcement;
        
        document.body.appendChild(announcer);
        setTimeout(() => {
            document.body.removeChild(announcer);
        }, 1000);
    }

    getSelectedRole() {
        return this.selectedRole;
    }

    hide() {
        this.container.style.display = 'none';
    }

    show() {
        this.container.style.display = 'block';
    }

    reset() {
        this.selectedRole = null;
        const radioButtons = this.container.querySelectorAll('.role-radio');
        const continueBtn = this.container.querySelector('#continueBtn');
        
        radioButtons.forEach(radio => {
            radio.checked = false;
        });
        
        continueBtn.disabled = true;
        this.updateRoleSelection();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RoleSelector;
}