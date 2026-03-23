export const RV_CONFIG = {
    USE_BACKEND: true, 
    BACKEND_URL: "https://rv-premium-ish.onrender.com/api", 
    WORKER_URL: "" 
};

// Also attach it to 'window' for older scripts that might need it
window.RV_CONFIG = RV_CONFIG;