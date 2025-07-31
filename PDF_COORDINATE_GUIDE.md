# PDF Coordinate Adjustment Guide

## Current Issue
The PDF form fields and signatures are not being placed in the correct positions on the KVKK.pdf form. The text appears at the bottom of the page instead of in the designated form fields.

## Solution Steps

### 1. Use the PDF Coordinate Finder Tool
Open `http://localhost:8000/pdf-coordinate-finder.html` in your browser to:
- Navigate to page 7 (last page) of the KVKK.pdf
- Click on each form field location to record the exact coordinates
- Copy the coordinates for updating the PDF processor

### 2. Current Coordinate Settings
The PDF processor currently uses these coordinates (which need adjustment):

```javascript
// Patient section
consentTextX: 50,
consentTextY: 180,
nameX: 120,
nameY: 140,
signatureX: 120,
signatureY: 100,

// Guardian section
nameX: 120,
nameY: 60,
relationshipX: 180,
relationshipY: 45,
dateX: 120,
dateY: 30,
signatureX: 120,
signatureY: 5,
```

### 3. Expected Form Field Locations
Based on your description, the form should have these fields:

**Patient Section:**
- Handwritten consent text area (for "Okudum anladım kabul ediyorum")
- AD/SOYAD: _________________ (patient name)
- İMZA: _________________ (patient signature)

**Guardian Section (if applicable):**
- Ad-Soyad: _________________ (guardian name)
- Yakınlık derecesi: _________________ (relationship)
- Tarih: _________________ (date)
- İmza: _________________ (guardian signature)

### 4. How to Update Coordinates

1. Use the coordinate finder tool to click on each field
2. Note the X,Y coordinates displayed
3. Update the coordinates in `src/js/components/pdfProcessor.js`:
   - Lines 94-101 for patient section coordinates
   - Lines 144-154 for guardian section coordinates

### 5. Testing the Updates

After updating coordinates:
1. Clear browser cache (Ctrl+Shift+R)
2. Complete a test form submission
3. Check the generated PDF in your email
4. Verify that:
   - Text appears in the correct fields
   - Signatures are visible and properly sized
   - No text overlaps or appears outside form boundaries

### 6. Fine-tuning Tips

- **Y-coordinates**: PDF coordinates start from bottom-left (0,0), so higher Y values move text up
- **X-coordinates**: Increase to move text right, decrease to move left
- **Font size**: Adjust if text doesn't fit in fields (currently 11-12pt)
- **Signature dimensions**: Adjust width/height if signatures are too large/small

### 7. Common Coordinate Ranges

For A4 PDF (595x842 points):
- Left margin typically starts at X: 50-70
- Right margin typically ends at X: 500-545
- Bottom margin typically starts at Y: 50-70
- Top margin typically ends at Y: 750-792

### 8. Debug Mode

To see exact placement during development, temporarily add colored rectangles:

```javascript
// Add this before drawing text to visualize field boundaries
page.drawRectangle({
    x: patientSection.nameX,
    y: patientSection.nameY,
    width: 200,
    height: 20,
    borderColor: PDFLib.rgb(1, 0, 0),
    borderWidth: 1,
    opacity: 0.3
});
```

## Quick Reference

| Field | Description | Typical X Range | Typical Y Range |
|-------|-------------|-----------------|-----------------|
| Consent Text | Handwritten area | 50-300 | 150-250 |
| Patient Name | After "AD/SOYAD:" | 120-200 | 100-200 |
| Patient Signature | Signature area | 120-300 | 50-150 |
| Guardian Name | Below patient section | 120-200 | 30-80 |
| Guardian Signature | Bottom signature | 120-300 | 5-50 |

## Troubleshooting

1. **Text not visible**: Check Y coordinate isn't too low (< 0) or too high (> page height)
2. **Signature not showing**: Verify signature data URL is valid and not empty
3. **Text overlapping**: Reduce font size or adjust spacing between fields
4. **Wrong page**: Ensure you're modifying the last page of the PDF

Remember to test with both patient-only and guardian scenarios to ensure both sections work correctly.