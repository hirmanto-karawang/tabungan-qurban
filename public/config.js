/**
 * APP CONFIGURATION - TABUNGAN QURBAN
 * Sudah diupdate dengan credentials Anda!
 */

const CONFIG = {
    // ✅ CREDENTIALS SUDAH DIUPDATE
    GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxUNyWQhrY-Vk63YljHghntQpBCZEY11lZV-T8eJhrGJY1AIPoqMkTGGkbSQiblKnue/exec',
    FONTRE_API_KEY: 'ke8k4Py9BD3wyKhxFqRd',
    
    // App Settings
    APP_NAME: 'Tabungan Qurban',
    APP_VERSION: '1.0.0',
    
    // Database
    DB_NAME: 'TabunganQurban',
    DB_VERSION: 1,
    
    // Cache Settings
    CACHE_NAME: 'tabungan-qurban-v1',
    CACHE_EXPIRES: 24 * 60 * 60 * 1000, // 24 hours
    
    // API Timeouts
    API_TIMEOUT: 10000, // 10 seconds
    
    // Validation Rules
    MEMBERS_PER_SAPI: 7,
    MIN_TRANSFER_AMOUNT: 50000,
    MAX_TRANSFER_AMOUNT: 50000000,
    
    // Feature Flags
    FEATURES: {
        OFFLINE_MODE: true,
        BACKGROUND_SYNC: true,
        PUSH_NOTIFICATIONS: true,
        ANALYTICS: false,
        DEBUG_MODE: false
    },
    
    // UI Settings
    UI: {
        THEME: 'light',
        LANGUAGE: 'id-ID',
        ANIMATIONS_ENABLED: true,
        REDUCED_MOTION: false
    }
};

// ===== ENVIRONMENT DETECTION =====
const ENV = {
    isDevelopment: window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1',
    isProduction: window.location.hostname.includes('vercel.app'),
    isStaging: window.location.hostname.includes('staging'),
    
    get currentEnv() {
        if (this.isProduction) return 'production';
        if (this.isStaging) return 'staging';
        return 'development';
    }
};

// ===== API HELPER =====
class APIClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.timeout = CONFIG.API_TIMEOUT;
    }
    
    async request(action, data = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ action, ...data }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('[API]', error);
            throw error;
        }
    }
    
    async read(sheet, range = null) {
        return this.request('read', { sheet, range });
    }
    
    async append(sheet, data) {
        return this.request('append', { sheet, data });
    }
    
    async update(sheet, matchField, matchValue, updateData) {
        return this.request('update', { sheet, matchField, matchValue, updateData });
    }
    
    async delete(sheet, matchField, matchValue) {
        return this.request('delete', { sheet, matchField, matchValue });
    }
    
    async login(id, password) {
        return this.request('login', { id, password });
    }
    
    async syncAllData() {
        return this.request('sync');
    }
}

// ===== STORAGE HELPER =====
class LocalStorage {
    constructor(prefix = 'tq_') {
        this.prefix = prefix;
    }
    
    key(name) {
        return this.prefix + name;
    }
    
    set(name, value) {
        try {
            localStorage.setItem(this.key(name), JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('[Storage]', error);
            return false;
        }
    }
    
    get(name, defaultValue = null) {
        try {
            const value = localStorage.getItem(this.key(name));
            return value ? JSON.parse(value) : defaultValue;
        } catch (error) {
            console.error('[Storage]', error);
            return defaultValue;
        }
    }
    
    remove(name) {
        try {
            localStorage.removeItem(this.key(name));
            return true;
        } catch (error) {
            console.error('[Storage]', error);
            return false;
        }
    }
    
    clear() {
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            console.error('[Storage]', error);
            return false;
        }
    }
}

// ===== INITIALIZE =====
const api = new APIClient(CONFIG.GOOGLE_APPS_SCRIPT_URL);
const storage = new LocalStorage();

console.log(`[Config] Environment: ${ENV.currentEnv}`);
console.log(`[Config] App: ${CONFIG.APP_NAME} v${CONFIG.APP_VERSION}`);
console.log(`[Config] API URL: ${CONFIG.GOOGLE_APPS_SCRIPT_URL.substring(0, 50)}...`);
console.log(`[Config] Offline Mode: ${CONFIG.FEATURES.OFFLINE_MODE ? 'Enabled' : 'Disabled'}`);
