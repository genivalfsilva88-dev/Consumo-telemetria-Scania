import { CONFIG, state } from './config.js';

/**
 * Cache manager with LocalStorage and IndexedDB support
 */
export class CacheManager {
  constructor() {
    this.useIndexedDB = window.indexedDB !== undefined;
    this.dbName = 'ZiranDashboardDB';
    this.storeName = 'sheetData';
    this.dbVersion = 1;
    this.db = null;
  }

  /**
   * Initialize IndexedDB
   */
  async initDB() {
    if (!this.useIndexedDB) return;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Save data to cache
   */
  async save(data) {
    const cacheEntry = {
      data,
      timestamp: Date.now(),
      version: '2.0'
    };

    try {
      // Try IndexedDB first
      if (this.useIndexedDB && !this.db) {
        await this.initDB();
      }

      if (this.useIndexedDB && this.db) {
        await this._saveToIndexedDB(cacheEntry);
      } else {
        // Fallback to LocalStorage
        this._saveToLocalStorage(cacheEntry);
      }
      
      state.cache = { data, timestamp: Date.now() };
    } catch (error) {
      console.warn('Cache save failed:', error);
    }
  }

  /**
   * Load data from cache
   */
  async load() {
    try {
      let cacheEntry;

      if (this.useIndexedDB && this.db) {
        cacheEntry = await this._loadFromIndexedDB();
      }

      if (!cacheEntry) {
        cacheEntry = this._loadFromLocalStorage();
      }

      if (!cacheEntry || !this._isValid(cacheEntry)) {
        return null;
      }

      state.cache = { data: cacheEntry.data, timestamp: cacheEntry.timestamp };
      return cacheEntry.data;
    } catch (error) {
      console.warn('Cache load failed:', error);
      return null;
    }
  }

  /**
   * Clear all cached data
   */
  async clear() {
    try {
      if (this.useIndexedDB && this.db) {
        await this._clearIndexedDB();
      }
      localStorage.removeItem(CONFIG.cache.key);
      state.cache = { data: null, timestamp: null };
    } catch (error) {
      console.warn('Cache clear failed:', error);
    }
  }

  /**
   * Check if cache is valid
   */
  isFresh() {
    if (!state.cache.timestamp) return false;
    const ageMinutes = (Date.now() - state.cache.timestamp) / (1000 * 60);
    return ageMinutes < CONFIG.cache.ttlMinutes;
  }

  /**
   * Get cache age in minutes
   */
  getAgeMinutes() {
    if (!state.cache.timestamp) return Infinity;
    return (Date.now() - state.cache.timestamp) / (1000 * 60);
  }

  /**
   * Get human-readable cache age
   */
  getAgeText() {
    const minutes = this.getAgeMinutes();
    if (minutes < 1) return 'Atualizado agora';
    if (minutes < 60) return `Atualizado há ${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    return `Atualizado há ${hours}h ${Math.round(minutes % 60)}min`;
  }

  // Private methods

  _isValid(entry) {
    if (!entry || !entry.timestamp) return false;
    const ageMinutes = (Date.now() - entry.timestamp) / (1000 * 60);
    return ageMinutes < CONFIG.cache.ttlMinutes;
  }

  async _saveToIndexedDB(cacheEntry) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put({ key: 'dashboard', ...cacheEntry });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async _loadFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get('dashboard');
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async _clearIndexedDB() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  _saveToLocalStorage(cacheEntry) {
    localStorage.setItem(CONFIG.cache.key, JSON.stringify(cacheEntry));
  }

  _loadFromLocalStorage() {
    const raw = localStorage.getItem(CONFIG.cache.key);
    return raw ? JSON.parse(raw) : null;
  }
}

// Singleton instance
export const cacheManager = new CacheManager();
