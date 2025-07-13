// Simple process polyfill for browser environment
const process = {
    env: {},
    version: 'v16.0.0',
    platform: 'browser',
    browser: true,
    nextTick: function (callback) {
        setTimeout(callback, 0);
    }
};

// Make it available globally
if (typeof window !== 'undefined') {
    window.process = process;
}

module.exports = process; 