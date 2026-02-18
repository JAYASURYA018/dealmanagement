const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load Credentials from .env
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Use localhost with specific port. 
// Note: Google 'Desktop' clients allow http://localhost (any port).
// We'll use 3000. If your console only allows "http://localhost", we try to match that by having no path.
const REDIRECT_URI = 'http://localhost:3002';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

// Scopes for Google Drive
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function getRefreshToken() {
    const server = http.createServer(async (req, res) => {
        try {
            // Handle root path / because redirect_uri is http://localhost:3000
            if (req.url.startsWith('/')) {
                const qs = new url.URL(req.url, 'http://localhost:3002').searchParams;
                const code = qs.get('code');

                if (code) {
                    res.end('Authentication successful! You can close this tab and return to the console.');
                    server.close();

                    console.log('✅ Authorization Code received.');

                    // Exchange code for tokens
                    const { tokens } = await oauth2Client.getToken(code);
                    
                    console.log('\n🎉 REFRESH TOKEN ACQUIRED:\n');
                    console.log(tokens.refresh_token);
                    console.log('\nProcessing .env update...');
                    
                    if (tokens.refresh_token) {
                        updateEnvFile(tokens.refresh_token);
                    } else {
                        console.log('❌ No refresh token returned. Did you already authorize this app? You may need to revoke access to get a new refresh token.');
                    }
                }
            }
        } catch (e) {
            console.error('Callback error:', e);
            res.end('Error during authentication');
        }
    });

    server.listen(3002, () => {
        // Generate Auth URL
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Critical for getting refresh token
            scope: SCOPES,
            prompt: 'consent', // Force consent screen
            redirect_uri: REDIRECT_URI // Ensure matching redirect uri is sent
        });

        console.log('🚀 Server listening on http://localhost:3002');
        console.log('👉 Please visit the following URL to authorize the app:');
        console.log('\n' + authUrl + '\n');
    });
}

function updateEnvFile(refreshToken) {
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    // Check if variable exists
    if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
        envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
    } else {
        // Append to slightly clean up
        if (!envContent.endsWith('\n') && envContent.length > 0) envContent += '\n';
        envContent += `GOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
    }

    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file automatically updated with GOOGLE_REFRESH_TOKEN');
}

getRefreshToken();
