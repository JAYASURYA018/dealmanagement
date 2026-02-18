const { google } = require('googleapis');
const stream = require('stream');

// --- Configuration ---
// These must be set in Vercel Project Settings > Environment Variables
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const REDIRECT_URI = 'http://localhost:3000'; // Redirect URI is mainly for initial auth flow, less critical here but good to match

// --- Helper Functions (from logger-server.js) ---

// Helper to format as IST String
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

// Get current filename (Daily format to match local server)
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

// Analyze API URL to provide functionality description
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

// --- Google Drive Logic (from googleDriveService.js) ---

const streamToString = (inputStream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        inputStream.on('data', chuck => chunks.push(chuck));
        inputStream.on('error', reject);
        inputStream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
};

async function appendLogToDrive(filename, newRows, headerLine) {
    // Initialize OAuth2 Client inside request to ensure fresh instance
    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    try {
        // 1. Check if file exists in the specific folder
        const res = await drive.files.list({
            q: `name = '${filename}' and '${DRIVE_FOLDER_ID}' in parents and trashed = false`,
            fields: 'files(id, name)',
        });

        const file = res.data.files[0];

        if (file) {
            // --- File Exists: Append ---
            console.log(`🔄 File found (${file.id}): ${filename}. Appending...`);

            // a. Get existing content
            const fileContentRes = await drive.files.get({
                fileId: file.id,
                alt: 'media'
            }, { responseType: 'stream' });

            // Read stream to string
            let existingContent = await streamToString(fileContentRes.data);

            // b. Prepare new content
            const prefix = existingContent.endsWith('\n') ? '' : '\n';
            const finalContent = existingContent + prefix + newRows;

            // c. Update file (media upload)
            await drive.files.update({
                fileId: file.id,
                media: {
                    mimeType: 'text/csv',
                    body: finalContent
                }
            });

            console.log(`✅ Successfully updated ${filename} in Drive`);

        } else {
            // --- File Missing: Create ---
            console.log(`✨ Creating new file: ${filename}`);

            const content = headerLine + '\n' + newRows;

            await drive.files.create({
                requestBody: {
                    name: filename,
                    parents: [DRIVE_FOLDER_ID]
                },
                media: {
                    mimeType: 'text/csv',
                    body: content
                }
            });

            console.log(`✅ Successfully created ${filename} in Drive`);
        }
        return true;

    } catch (error) {
        console.error(`❌ Google Drive Error for ${filename}:`, error.message);
        throw error;
    }
}

// --- Main Handler (Vercel Function) ---

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Body parsing is built-in for Vercel functions if Content-Type is application/json
    const logs = req.body;

    if (!logs || !Array.isArray(logs) || logs.length === 0) {
        return res.status(400).json({ error: 'Invalid log format or empty logs' });
    }

    // Check credentials
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !DRIVE_FOLDER_ID) {
        console.error('❌ Missing Environment Variables on Server');
        return res.status(500).json({ error: 'Server configuration error (Missing Env Vars)' });
    }

    try {
        const filename = getTodayFilename();

        // CSV Header
        const headers = ['Start Time', 'End Time', 'API URL', 'Method', 'Status', 'Duration (ms)', 'Functionality & Context', 'Error', 'User', 'Client Source'];
        const headerLine = headers.join(',');

        // Convert logs to CSV rows
        const rows = [];
            
        logs.forEach(log => {
            const start = new Date(log.startTime);
            const end = new Date(start.getTime() + log.durationMs);
            const description = getLogDescription(log.url, log.method);

            // Check for Visual Separator (Match Local Server Logic)
            if (description === "Fetch Recent Opportunities List (Dashboard)") {
                rows.push(headers.map(() => "").join(','));
            }

            const csvRow = [
                toIST(start),
                toIST(end),
                log.url,
                log.method,
                log.status,
                log.durationMs,
                description,
                log.error || '',
                log.user || 'system',
                log.clientSource || 'unknown'
            ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
            
            rows.push(csvRow);
        });

        const rowsString = rows.join('\n');

        // Send to Google Drive
        await appendLogToDrive(filename, rowsString, headerLine);

        return res.status(200).json({
            message: 'Logs saved successfully to Google Drive',
            count: rows.length,
            filename: filename
        });

    } catch (error) {
        console.error('❌ Error processing logs:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
