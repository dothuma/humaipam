// node: 'merged_ui/src/static/js/api.js'
// Unified API — merged_ui port 5002
const API_URL = 'http://localhost:5002/api/';

export async function apiCall(func, args) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ func, args })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        return { status: 'fail', error: { reason: 'NETWORK_ERROR', message: error.message } };
    }
}
