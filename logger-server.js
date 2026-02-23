const http = require('http');
const { appendLog } = require('./googleDriveService');
require('dotenv').config();

const PORT = 3001;

// --- Helper Functions ---

const toIST = (date) => {
    return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

const getTodayFilename = () => {
    const now = new Date();
    const dateStr = now.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/[/]/g, '-').split(',')[0].trim().split('-').reverse().join('-');
    
    return `api-log-${dateStr}.csv`;
};

const getLogDescription = (url, method) => {
    const decodedUrl = decodeURIComponent(url);

    if (decodedUrl.includes('SELECT Id, Name, StageName, Amount')) return "Fetch Recent Opportunities List (Dashboard)";
    if (decodedUrl.includes('SELECT Id, Name, Amount') && decodedUrl.includes('WHERE Id IN')) return "Fetch Details for Selected Opportunities";
    if (decodedUrl.includes('connect/pcm/products') && method === 'POST') return "Product Discovery/Pricing (Frequent calls imply multi-item config or bundle expansion)";
    if (decodedUrl.includes('PricebookEntry') && decodedUrl.includes('WHERE Product2Id IN')) return "Fetch Pricebook/Pricing for specific Products";
    if (decodedUrl.includes('sales-transaction/actions/place')) return "Place Sales Transaction (Create Quote)";
    if (decodedUrl.includes('/sobjects/Quote/') && method === 'GET') return "Fetch Quote Header Details";
    if (decodedUrl.includes('auth/session')) return "Refresh Session Token (Auth)";
    if (decodedUrl.includes('SELECT Name, QuoteNumber') && decodedUrl.includes('FROM Quote')) return "Fetch Quote & Line Items Overview";
    if (decodedUrl.includes('QuoteLineItem') && decodedUrl.includes('WHERE QuoteId')) return "Fetch Quote Line Items (Cart Grid)";
    if (decodedUrl.includes('composite/tree/Commitment_Details__c')) return "Create/Update Commitment Records";
    
    return "General API Call";
};

// --- Serialized Upload Queue ---
// Ensures uploads happen one at a time to prevent Drive file versions conflicts
let uploadQueue = Promise.resolve();

const scheduleUpload = (filename, rowsString, headerLine) => {
    // Chain the new upload to the end of the existing queue
    uploadQueue = uploadQueue.then(async () => {
        console.log(`📤 Uploading log to ${filename} (Queue Size: Active)...`);
        try {
            await appendLog(filename, rowsString, headerLine);
        } catch (error) {
            console.error('❌ Upload Failed:', error.message);
        }
    }).catch(err => {
        console.error('⚠️ Queue Error (Recovered):', err);
    });
};

// --- HTTP Server ---

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const logs = JSON.parse(body);
            if (!Array.isArray(logs) || logs.length === 0) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid format' }));
                return;
            }

            // Prepare CSV Data
            const filename = getTodayFilename();
            const headers = ['Start Time', 'End Time', 'API URL', 'Method', 'Status', 'Duration (ms)', 'Functionality & Context', 'Error', 'User', 'Client Source'];
            const headerLine = headers.join(',');

            const rows = [];
            
            logs.forEach(log => {
                const start = new Date(log.startTime);
                const end = new Date(start.getTime() + log.durationMs);
                
                // Combine Name and Description for the single "Functionality & Context" column
                let combinedDescription = log.apiName || getLogDescription(log.url, log.method);
                if (log.description && log.description !== combinedDescription) {
                    combinedDescription = `${combinedDescription}: ${log.description}`;
                }

                // Check for Visual Separator
                if (combinedDescription.includes("Fetch Recent Opportunities List (Dashboard)") || combinedDescription.includes("Get Recent Opportunities")) {
                    rows.push(headers.map(() => "").join(','));
                }

                const csvRow = [
                    toIST(start),
                    toIST(end),
                    log.url,
                    log.method,
                    log.status,
                    log.durationMs,
                    combinedDescription,
                    log.error || '',
                    log.user || 'system',
                    log.clientSource || 'unknown'
                ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
                
                rows.push(csvRow);
            });

            const rowsString = rows.join('\n');

            // Add to Upload Queue (Non-blocking response)
            scheduleUpload(filename, rowsString, headerLine);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Log queued for upload', status: 'queued' }));

        } catch (error) {
            console.error('❌ Error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Server Error' }));
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 API Logger Server running on http://localhost:${PORT}`);
    console.log(`⚡ Mode: Real-time Serialized Uploads`);
    console.log(`📂 Log File: Daily (${getTodayFilename()})`);
});
