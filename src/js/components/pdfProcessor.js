/**
 * PDF Processor Component
 * Handles PDF form filling and signature embedding using PDF-lib
 */
class PDFProcessor {
    constructor() {
        this.pdfDoc = null;
        this.originalPdfBytes = null;
        this.isLoaded = false;
    }

    /**
     * Load the original KVKK PDF
     */
    async loadPDF(pdfUrl = './src/resources/assets/KVKK.pdf') {
        try {
            // Fetch the PDF file
            const response = await fetch(pdfUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch PDF: ${response.statusText}`);
            }

            this.originalPdfBytes = await response.arrayBuffer();
            
            // Load PDF with PDF-lib
            this.pdfDoc = await PDFLib.PDFDocument.load(this.originalPdfBytes);
            this.isLoaded = true;
            
            return true;
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw new Error('PDF yüklenirken bir hata oluştu: ' + error.message);
        }
    }

    /**
     * Process the PDF with form data and signatures
     */
    async processPDF(formData, signatures) {
        if (!this.isLoaded) {
            throw new Error('PDF henüz yüklenmedi');
        }

        try {
            // Create a copy of the original PDF
            const pdfDoc = await PDFLib.PDFDocument.load(this.originalPdfBytes);
            
            // Get the last page (where the signature section is)
            const pages = pdfDoc.getPages();
            const lastPage = pages[pages.length - 1];
            const { width, height } = lastPage.getSize();

            // Embed fonts for Turkish characters - use Unicode-compatible fonts
            let font, boldFont;
            try {
                // Try to use standard fonts first
                font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                boldFont = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
            } catch (error) {
                // Fallback to basic fonts if Unicode issues occur
                font = await pdfDoc.embedFont(PDFLib.StandardFonts.Courier);
                boldFont = await pdfDoc.embedFont(PDFLib.StandardFonts.CourierBold);
            }

            // Process patient signature section
            await this.addPatientSection(lastPage, formData, signatures.patient, font, boldFont);

            // Process guardian section if applicable
            if (formData.role === 'guardian' && signatures.guardian) {
                await this.addGuardianSection(lastPage, formData, signatures.guardian, font, boldFont);
            }

            // Add timestamp and metadata
            await this.addMetadata(pdfDoc, formData);

            // Generate the final PDF
            const pdfBytes = await pdfDoc.save();
            return pdfBytes;

        } catch (error) {
            console.error('Error processing PDF:', error);
            throw new Error('PDF işlenirken bir hata oluştu: ' + error.message);
        }
    }

    /**
     * Add patient information and signature to PDF
     */
    async addPatientSection(page, formData, patientSignature, font, boldFont) {
        const { width, height } = page.getSize();
        
        // Coordinates for patient section - exact positions from KVKK.pdf
        // PDF coordinates start from bottom-left corner
        const patientSection = {
            // "Okudum anladım kabul ediyorum" handwritten text position
            consentTextX: 218,
            consentTextY: 706,
            // Patient name position (AD/SOYAD field)
            nameX: 147,
            nameY: 631,
            // Signature position (İMZA field)
            signatureX: 128,
            signatureY: 590,  // Adjusted to be slightly lower to fit in the signature box
            signatureWidth: 200,  // Wider to fill the signature area
            signatureHeight: 30   // Appropriate height for signature field
        };

        // Add "Okudum anladım kabul ediyorum" handwritten text
        const consentText = this.sanitizeTextForPDF("Okudum anladim kabul ediyorum");
        page.drawText(consentText, {
            x: patientSection.consentTextX,
            y: patientSection.consentTextY,
            size: 12,  // Slightly larger for handwritten text
            font: font,
            color: PDFLib.rgb(0, 0, 0.8),
            rotate: PDFLib.degrees(-1) // Subtle rotation for handwritten effect
        });

        // Add patient name after "AD/SOYAD :"
        if (formData.patientName) {
            const sanitizedName = this.sanitizeTextForPDF(formData.patientName);
            page.drawText(sanitizedName, {
                x: patientSection.nameX,
                y: patientSection.nameY,
                size: 12,
                font: font,
                color: PDFLib.rgb(0, 0, 0)
            });
        }

        // Add patient signature
        if (patientSignature && !patientSignature.isEmpty) {
            await this.embedSignature(
                page,
                patientSignature.dataURL,
                patientSection.signatureX,
                patientSection.signatureY,
                patientSection.signatureWidth,
                patientSection.signatureHeight
            );
        }

        // Add date if not guardian role
        if (formData.role === 'patient') {
            const currentDate = new Date().toLocaleDateString('tr-TR');
            page.drawText(currentDate, {
                x: 400,
                y: patientSection.nameY,
                size: 11,
                font: font,
                color: PDFLib.rgb(0, 0, 0)
            });
        }
    }

    /**
     * Add guardian information and signature to PDF
     */
    async addGuardianSection(page, formData, guardianSignature, font, boldFont) {
        const { width, height } = page.getSize();
        
        // Coordinates for guardian section - exact positions from KVKK.pdf
        const guardianSection = {
            // Guardian name position (Ad-Soyad field)
            nameX: 157,
            nameY: 560,
            // Relationship degree position (Yakınlık derecesi field)
            relationshipX: 190,
            relationshipY: 536,
            // Date position (Tarih field)
            dateX: 142,
            dateY: 512,
            // Guardian signature position (İmza field)
            signatureX: 197,
            signatureY: 475,  // Adjusted to be slightly lower
            signatureWidth: 180,  // Wider for guardian signature
            signatureHeight: 25
        };

        // Add guardian name after "Ad-Soyad :"
        if (formData.guardianName) {
            const sanitizedName = this.sanitizeTextForPDF(formData.guardianName);
            page.drawText(sanitizedName, {
                x: guardianSection.nameX,
                y: guardianSection.nameY,
                size: 11,
                font: font,
                color: PDFLib.rgb(0, 0, 0)
            });
        }

        // Add relationship degree after "Yakınlık derecesi :"
        if (formData.relationshipDegree) {
            const sanitizedRelationship = this.sanitizeTextForPDF(formData.relationshipDegree);
            page.drawText(sanitizedRelationship, {
                x: guardianSection.relationshipX,
                y: guardianSection.relationshipY,
                size: 11,
                font: font,
                color: PDFLib.rgb(0, 0, 0)
            });
        }

        // Add current date after "Tarih :"
        const currentDate = new Date().toLocaleDateString('tr-TR');
        page.drawText(currentDate, {
            x: guardianSection.dateX,
            y: guardianSection.dateY,
            size: 11,
            font: font,
            color: PDFLib.rgb(0, 0, 0)
        });

        // Add guardian signature after "İmza :"
        if (guardianSignature && !guardianSignature.isEmpty) {
            await this.embedSignature(
                page,
                guardianSignature.dataURL,
                guardianSection.signatureX,
                guardianSection.signatureY,
                guardianSection.signatureWidth,
                guardianSection.signatureHeight
            );
        }
    }

    /**
     * Embed signature image into PDF
     */
    async embedSignature(page, signatureDataURL, x, y, width, height) {
        try {
            // Get the PDF document from the page
            const pdfDoc = page.doc;
            
            // Convert data URL to bytes
            const signatureBytes = this.dataURLToBytes(signatureDataURL);
            
            // Embed the signature image
            const signatureImage = await pdfDoc.embedPng(signatureBytes);
            
            // Calculate aspect ratio to maintain signature proportions
            const signatureDims = signatureImage.scale(1);
            const aspectRatio = signatureDims.width / signatureDims.height;
            
            let finalWidth = width;
            let finalHeight = height;
            
            if (aspectRatio > width / height) {
                finalHeight = width / aspectRatio;
            } else {
                finalWidth = height * aspectRatio;
            }

            // Draw the signature
            page.drawImage(signatureImage, {
                x: x,
                y: y,
                width: finalWidth,
                height: finalHeight,
                opacity: 1
            });

            console.log(`Signature embedded at: x=${x}, y=${y}, width=${finalWidth}, height=${finalHeight}`);

        } catch (error) {
            console.error('Error embedding signature:', error);
            // Continue without signature rather than failing completely
        }
    }

    /**
     * Add metadata to the PDF
     */
    async addMetadata(pdfDoc, formData) {
        const now = new Date();
        
        pdfDoc.setTitle('KVKK Onay Formu - ' + this.sanitizeTextForPDF(formData.patientName));
        pdfDoc.setSubject('Kişisel Verilerin Korunması Kanunu Onay Formu');
        pdfDoc.setKeywords(['KVKK', 'Onay', 'Dijital Imza']);
        pdfDoc.setProducer('KVKK Consent Tool');
        pdfDoc.setCreator('KVKK Consent Tool');
        pdfDoc.setCreationDate(now);
        pdfDoc.setModificationDate(now);

        // Add custom metadata
        const customMetadata = {
            patientName: formData.patientName,
            email: formData.email,
            role: formData.role,
            timestamp: formData.timestamp,
            version: '1.0'
        };

        if (formData.role === 'guardian') {
            customMetadata.guardianName = formData.guardianName;
            customMetadata.relationshipDegree = formData.relationshipDegree;
        }

        // Note: PDF-lib doesn't support custom metadata directly,
        // but we can add it as a comment or in the document info
        pdfDoc.setSubject(pdfDoc.getSubject() + ' - ' + JSON.stringify(customMetadata));
    }

    /**
     * Convert data URL to bytes
     */
    dataURLToBytes(dataURL) {
        const base64 = dataURL.split(',')[1];
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes;
    }

    /**
     * Sanitize text for PDF compatibility (handle Turkish characters)
     */
    sanitizeTextForPDF(text) {
        if (!text) return '';
        
        // Map Turkish characters to ASCII equivalents for PDF compatibility
        const turkishCharMap = {
            'ğ': 'g', 'Ğ': 'G',
            'ü': 'u', 'Ü': 'U',
            'ş': 's', 'Ş': 'S',
            'ı': 'i', 'İ': 'I',
            'ö': 'o', 'Ö': 'O',
            'ç': 'c', 'Ç': 'C'
        };
        
        return text.replace(/[ğĞüÜşŞıİöÖçÇ]/g, (match) => {
            return turkishCharMap[match] || match;
        });
    }

    /**
     * Generate a blob from PDF bytes
     */
    createPDFBlob(pdfBytes) {
        return new Blob([pdfBytes], { type: 'application/pdf' });
    }

    /**
     * Generate a download URL for the PDF
     */
    createDownloadURL(pdfBytes) {
        const blob = this.createPDFBlob(pdfBytes);
        return URL.createObjectURL(blob);
    }

    /**
     * Generate filename for the processed PDF
     */
    generateFilename(formData) {
        const date = new Date().toISOString().split('T')[0];
        const patientName = formData.patientName
            .replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ\s]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase();
        
        return `KVKK_Onay_${patientName}_${date}.pdf`;
    }

    /**
     * Validate form data before processing
     */
    validateFormData(formData, signatures) {
        const errors = [];

        if (!formData.patientName) {
            errors.push('Hasta adı gereklidir');
        }

        if (!formData.email) {
            errors.push('E-posta adresi gereklidir');
        }

        if (!signatures.patient || signatures.patient.isEmpty) {
            errors.push('Hasta imzası gereklidir');
        }

        if (formData.role === 'guardian') {
            if (!formData.guardianName) {
                errors.push('Yakın adı gereklidir');
            }
            
            if (!formData.relationshipDegree) {
                errors.push('Yakınlık derecesi gereklidir');
            }
            
            if (!signatures.guardian || signatures.guardian.isEmpty) {
                errors.push('Yakın imzası gereklidir');
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Get PDF information
     */
    getPDFInfo() {
        if (!this.isLoaded) {
            return null;
        }

        return {
            pageCount: this.pdfDoc.getPageCount(),
            title: this.pdfDoc.getTitle(),
            subject: this.pdfDoc.getSubject(),
            isLoaded: this.isLoaded
        };
    }

    /**
     * Reset the processor
     */
    reset() {
        this.pdfDoc = null;
        this.originalPdfBytes = null;
        this.isLoaded = false;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFProcessor;
}