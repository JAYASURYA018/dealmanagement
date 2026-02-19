const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000'; // Must match your Cloud Console settings

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Crucial for Refresh Token
    scope: SCOPES,
    prompt: 'consent' // Forces consent screen to ensure Refresh Token is returned
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('Enter the code from that page here: ', async (code) => {
    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('\n✅ Authorization successful!');
        console.log('\n--- TOKENS ---');
        console.log('Access Token:', tokens.access_token);
        
        if (tokens.refresh_token) {
            console.log('Refresh Token:', tokens.refresh_token);
            console.log('\n📢 PLEASE UPDATE YOUR .env FILE WITH THIS REFRESH TOKEN!');
        } else {
            console.log('⚠️ No Refresh Token returned. You might have already authorized the app. Try revoking access first or use prompt: "consent" (already added).');
        }
    } catch (err) {
        console.error('❌ Error retrieving access token:', err.message);
    }
    rl.close();
});
