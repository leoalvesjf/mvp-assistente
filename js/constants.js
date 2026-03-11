const APP_VERSION = '1.3.15';
const VERSION_URL = 'https://mvp-assistente.vercel.app/version.json';
const UPDATE_URL = 'https://mvp-assistente.vercel.app/index.html';

const SUPABASE_URL = 'https://cxhjypywqxxxhvgdvfdo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aGp5cHl3cXh4eGh2Z2R2ZmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTgyNjYsImV4cCI6MjA4ODMzNDI2Nn0.IWYSMURW3PGax5TiW7Zl2PdwJQsY0nKkUkqmxumAejQ';

const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
