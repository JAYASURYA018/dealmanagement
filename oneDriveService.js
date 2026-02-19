const axios = require('axios');
const { getAccessToken } = require('./graphAuth');
require('dotenv').config();

const TARGET_USER_EMAIL = process.env.TARGET_USER_EMAIL;
const ONEDRIVE_FOLDER_PATH = process.env.ONEDRIVE_FOLDER_PATH; // e.g., '/API_Logs'

// Helper to get headers
async function getHeaders() {
    const token = await getAccessToken();
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

/**
 * Appends logs to a minute-wise CSV file in OneDrive.
 * @param {string} filename - The name of the file (e.g., API-Logs-DD-MM-YYYY-HH-MM.csv)
 * @param {string} newRows - The CSV rows to append (without header)
 * @param {string} headers - The CSV header line (used if file needs creation)
 */
async function appendLog(filename, newRows, headerLine) {
    if (!TARGET_USER_EMAIL || !ONEDRIVE_FOLDER_PATH) {
        throw new Error('Missing TARGET_USER_EMAIL or ONEDRIVE_FOLDER_PATH env variables');
    }

    // Clean path (ensure no trailing slash, ensure leading slash)
    const folderPath = ONEDRIVE_FOLDER_PATH.replace(/\/$/, '').replace(/^[^\/]/, '/$&');
    const filePath = `${folderPath}/${filename}`;
    
    // API Endpoint for the specific user's drive
    const driveRoot = `https://graph.microsoft.com/v1.0/users/${TARGET_USER_EMAIL}/drive/root:${filePath}`;

    try {
        // 1. Try to get existing file content
        let existingContent = '';
        try {
            const response = await axios.get(`${driveRoot}:/content`, {
                headers: await getHeaders()
            });
            existingContent = typeof response.data === 'string' 
                ? response.data 
                : JSON.stringify(response.data); // Fallback if axios auto-parses JSON (unlikely for CSV)
            
            // If axios parsed it as an object (rare for CSV mime type but possible), ensure string
            if (typeof existingContent !== 'string') {
                 // In case of weird behavior, re-request as arraybuffer or stream could be safer, 
                 // but for text/csv default behavior is usually text.
                 // We'll assume text for now.
                 existingContent = response.data.toString();
            }
            
        } catch (error) {
            if (error.response && error.response.status === 404) {
                // File doesn't exist, that's fine
                console.log(`📄 File ${filename} does not exist, creating new.`);
            } else {
                throw error;
            }
        }

        // 2. Prepare content
        let finalContent;
        if (existingContent) {
            // Append
            // Ensure we start on a new line if existing content doesn't end with one
            const prefix = existingContent.endsWith('\n') ? '' : '\n';
            finalContent = existingContent + prefix + newRows;
            console.log(`🔄 Appending to existing file: ${filename}`);
        } else {
            // Create new
            finalContent = headerLine + '\n' + newRows;
            console.log(`✨ Creating new file: ${filename}`);
        }

        // 3. Upload (PUT to /content overwrites)
        await axios.put(`${driveRoot}:/content`, finalContent, {
            headers: {
                ...(await getHeaders()),
                'Content-Type': 'text/plain' // CSV is plain text
            }
        });

        console.log(`✅ Successfully uploaded/updated ${filename} in OneDrive`);
        return true;

    } catch (error) {
        console.error(`❌ OneDrive Error for ${filename}:`, error.response ? error.response.data : error.message);
        // Simple retry logic could go here, for now just throw
        throw error;
    }
}

module.exports = { appendLog };
