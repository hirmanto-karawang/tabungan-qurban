/**
 * GOOGLE APPS SCRIPT - TABUNGAN QURBAN BACKEND API
 * Deploy sebagai Web App dengan akses execute sebagai User yang membuat script
 * 
 * Deployment:
 * 1. Buka Google Sheet
 * 2. Buka Apps Script (Tools > Script Editor)
 * 3. Copy-paste semua kode ini
 * 4. Deploy > New Deployment > Web App
 * 5. Execute as: Your Account
 * 6. Who has access: Anyone
 * 7. Copy URL deployment ke config
 */

// ===== CONFIG =====
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE'; // Ganti dengan Sheet ID mu
const SHEET_NAME_MEMBERS = 'Members';
const SHEET_NAME_SAVINGS = 'Savings';
const SHEET_NAME_PENDAFTARAN = 'Pendaftaran';
const SHEET_NAME_MESSAGES = 'Messages';

// ===== CORS & UTILS =====
function doGet(e) {
    return ContentService
        .createTextOutput(JSON.stringify({ status: 'API is running', timestamp: new Date() }))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const action = data.action;
        
        let result = {};
        
        switch(action) {
            case 'read':
                result = readSheet(data.sheet, data.range);
                break;
            case 'write':
                result = writeSheet(data.sheet, data.data);
                break;
            case 'update':
                result = updateSheet(data.sheet, data.matchField, data.matchValue, data.updateData);
                break;
            case 'append':
                result = appendSheet(data.sheet, data.data);
                break;
            case 'delete':
                result = deleteRow(data.sheet, data.matchField, data.matchValue);
                break;
            case 'login':
                result = validateLogin(data.id, data.password);
                break;
            case 'sync':
                result = syncAllData();
                break;
            default:
                result = { error: 'Unknown action' };
        }
        
        return ContentService
            .createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);
            
    } catch(error) {
        return ContentService
            .createTextOutput(JSON.stringify({ error: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// ===== READ OPERATIONS =====
function readSheet(sheetName, range = null) {
    try {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        const sheet = ss.getSheetByName(sheetName);
        
        if (!sheet) {
            return { error: `Sheet ${sheetName} not found` };
        }
        
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const rows = [];
        
        for (let i = 1; i < data.length; i++) {
            const row = {};
            for (let j = 0; j < headers.length; j++) {
                row[headers[j]] = data[i][j];
            }
            rows.push(row);
        }
        
        return {
            success: true,
            sheet: sheetName,
            data: rows,
            count: rows.length,
            timestamp: new Date().toISOString()
        };
        
    } catch(error) {
        return { error: error.toString() };
    }
}

function syncAllData() {
    try {
        const members = readSheet(SHEET_NAME_MEMBERS);
        const savings = readSheet(SHEET_NAME_SAVINGS);
        const pendaftaran = readSheet(SHEET_NAME_PENDAFTARAN);
        const messages = readSheet(SHEET_NAME_MESSAGES);
        
        return {
            success: true,
            members: members.data || [],
            savings: savings.data || [],
            pendaftaran: pendaftaran.data || [],
            messages: messages.data || [],
            timestamp: new Date().toISOString()
        };
        
    } catch(error) {
        return { error: error.toString() };
    }
}

// ===== WRITE OPERATIONS =====
function appendSheet(sheetName, rowData) {
    try {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        const sheet = ss.getSheetByName(sheetName);
        
        if (!sheet) {
            return { error: `Sheet ${sheetName} not found` };
        }
        
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const values = headers.map(h => rowData[h] || '');
        
        sheet.appendRow(values);
        
        return {
            success: true,
            sheet: sheetName,
            message: 'Row appended successfully',
            timestamp: new Date().toISOString()
        };
        
    } catch(error) {
        return { error: error.toString() };
    }
}

function updateSheet(sheetName, matchField, matchValue, updateData) {
    try {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        const sheet = ss.getSheetByName(sheetName);
        
        if (!sheet) {
            return { error: `Sheet ${sheetName} not found` };
        }
        
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const matchColIndex = headers.indexOf(matchField);
        
        if (matchColIndex === -1) {
            return { error: `Field ${matchField} not found` };
        }
        
        let updated = false;
        
        for (let i = 1; i < data.length; i++) {
            if (data[i][matchColIndex] == matchValue) {
                for (const [key, value] of Object.entries(updateData)) {
                    const colIndex = headers.indexOf(key);
                    if (colIndex !== -1) {
                        sheet.getRange(i + 1, colIndex + 1).setValue(value);
                        updated = true;
                    }
                }
            }
        }
        
        return {
            success: updated,
            sheet: sheetName,
            message: updated ? 'Row updated successfully' : 'No matching row found',
            timestamp: new Date().toISOString()
        };
        
    } catch(error) {
        return { error: error.toString() };
    }
}

function deleteRow(sheetName, matchField, matchValue) {
    try {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        const sheet = ss.getSheetByName(sheetName);
        
        if (!sheet) {
            return { error: `Sheet ${sheetName} not found` };
        }
        
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const matchColIndex = headers.indexOf(matchField);
        
        if (matchColIndex === -1) {
            return { error: `Field ${matchField} not found` };
        }
        
        let deleted = false;
        
        for (let i = data.length - 1; i >= 1; i--) {
            if (data[i][matchColIndex] == matchValue) {
                sheet.deleteRow(i + 1);
                deleted = true;
            }
        }
        
        return {
            success: deleted,
            sheet: sheetName,
            message: deleted ? 'Row deleted successfully' : 'No matching row found',
            timestamp: new Date().toISOString()
        };
        
    } catch(error) {
        return { error: error.toString() };
    }
}

// ===== AUTH =====
function validateLogin(id, password) {
    try {
        const result = readSheet(SHEET_NAME_MEMBERS);
        const members = result.data;
        
        const member = members.find(m => m.id == id && m.password == password);
        
        if (member) {
            return {
                success: true,
                user: {
                    id: member.id,
                    name: member.name,
                    phone: member.phone,
                    sapi: member.sapi,
                    urutan: member.urutan,
                    role: member.role || 'member'
                },
                timestamp: new Date().toISOString()
            };
        } else {
            return {
                success: false,
                error: 'ID atau password salah',
                timestamp: new Date().toISOString()
            };
        }
        
    } catch(error) {
        return { error: error.toString() };
    }
}

// ===== HELPER: Test Deployment =====
function testDeployment() {
    Logger.log('Testing Apps Script Deployment...');
    Logger.log('Sheet ID: ' + SHEET_ID);
    Logger.log('Sheets available:');
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheets = ss.getSheets();
    
    sheets.forEach(sheet => {
        Logger.log('- ' + sheet.getName());
    });
    
    Logger.log('✅ Deployment successful!');
}
