const { google } = require('googleapis');
const stream = require('stream');
require('dotenv').config();

// Folder ID from environment
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// OAuth 2.0 Credentials
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const REDIRECT_URI = 'http://localhost:3000';

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('❌ Missing OAuth Credentials (CLIENT_ID, CLIENT_SECRET, or REFRESH_TOKEN) in .env');
}

// Initialize OAuth2 Client
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

/**
 * Appends logs to a minute-wise CSV file in Google Drive.
 * @param {string} filename - The name of the file
 * @param {string} newRows - The CSV rows to append (without header)
 * @param {string} headerLine - The CSV header line (used if file needs creation)
 */
async function appendLog(filename, newRows, headerLine) {
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

// Helper to convert stream to string
function streamToString(inputStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        inputStream.on('data', chuck => chunks.push(chuck));
        inputStream.on('error', reject);
        inputStream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

const fs = require('fs');

/**
 * Uploads a complete file to Google Drive (used for rotated logs).
 * @param {string} filePath - Local path to the file
 * @param {string} filename - Name of the file in Drive
 */
async function uploadFile(filePath, filename) {
    try {
        // 1. Check if file exists in the specific folder
        const res = await drive.files.list({
            q: `name = '${filename}' and '${DRIVE_FOLDER_ID}' in parents and trashed = false`,
            fields: 'files(id, name)',
        });

        const file = res.data.files[0];

        if (file) {
            console.log(`⚠️ File ${filename} already exists in Drive. Overwriting...`);
            // Update existing file
            await drive.files.update({
                fileId: file.id,
                media: {
                    mimeType: 'text/csv',
                    body: fs.createReadStream(filePath)
                }
            });
             console.log(`✅ Successfully updated ${filename} in Drive`);
        } else {
            console.log(`✨ Uploading new file: ${filename}`);
            // Create new file
            await drive.files.create({
                requestBody: {
                    name: filename,
                    parents: [DRIVE_FOLDER_ID]
                },
                media: {
                    mimeType: 'text/csv',
                    body: fs.createReadStream(filePath)
                }
            });
            console.log(`✅ Successfully uploaded ${filename} to Drive`);
        }
        return true;
    } catch (error) {
        console.error(`❌ Google Drive Upload Error for ${filename}:`, error.message);
        throw error;
    }
}

module.exports = { appendLog, uploadFile };
