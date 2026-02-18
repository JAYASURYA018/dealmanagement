const fs = require('fs');
const path = require('path');

// Target directory for API logs
const LOG_DIR = 'C:\\Users\\admin\\OneDrive - Agivant Technlogies India Pvt. Ltd\\Agivant Projects';

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

    const logs = req.body;

    if (!logs || !Array.isArray(logs)) {
        console.error('Invalid log format received');
        return res.status(400).json({ error: 'Invalid Format: Expected JSON array' });
    }

    if (logs.length === 0) {
        return res.status(200).json({ message: 'No logs to process' });
    }

    try {
        // Ensure directory exists
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }

        // Format current date and time for filename
        const now = new Date();
        const dateStr = now.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/[/,:\s]/g, '-');

        const filename = `API-Logs-${dateStr}.csv`;
        const filepath = path.join(LOG_DIR, filename);

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

        // CSV Header
        const headers = ['Start Time', 'End Time', 'API URL', 'Method', 'Status', 'Duration (ms)', 'Error', 'User'];

        // Convert logs to CSV rows
        const rows = logs.map(log => {
            const start = new Date(log.startTime);
            const end = new Date(start.getTime() + log.durationMs);

            return [
                toIST(start),
                toIST(end),
                log.url,
                log.method,
                log.status,
                log.durationMs,
                log.error || '',
                log.user || 'system'
            ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
        });

        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows
        ].join('\n');

        // Check if file exists - if so, append; otherwise create new
        if (fs.existsSync(filepath)) {
            // Append to existing file (without headers)
            fs.appendFileSync(filepath, '\n' + rows.join('\n'));
            console.log(`Appended ${rows.length} rows to ${filename}`);
        } else {
            // Create new file with headers
            fs.writeFileSync(filepath, csvContent);
            console.log(`Created new file ${filename} with ${rows.length} rows`);
        }

        return res.status(200).json({ 
            message: 'Logged to file system', 
            count: rows.length,
            filepath: filepath,
            filename: filename
        });
    } catch (err) {
        console.error('Error writing to file system:', err);
        return res.status(500).json({ error: 'Error writing to file system', details: err.message });
    }
}
