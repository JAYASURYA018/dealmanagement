const axios = require('axios');
const qs = require('qs');
require('dotenv').config();

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SCOPE = 'https://graph.microsoft.com/.default';

let accessToken = null;
let tokenExpiry = null;

/**
 * Retrieves a valid access token for Microsoft Graph API.
 * Checks for cached token validity effectively.
 * @returns {Promise<string>} The access token.
 */
async function getAccessToken() {
    // Return cached token if still valid (with 5-minute buffer)
    if (accessToken && tokenExpiry && new Date() < new Date(tokenExpiry.getTime() - 5 * 60 * 1000)) {
        return accessToken;
    }

    try {
        const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
        
        const data = qs.stringify({
            client_id: CLIENT_ID,
            scope: SCOPE,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials'
        });

        const response = await axios.post(tokenUrl, data, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        accessToken = response.data.access_token;
        // Calculate expiry time (expires_in is in seconds)
        tokenExpiry = new Date(new Date().getTime() + response.data.expires_in * 1000);

        console.log('✅ New Access Token acquired');
        return accessToken;
    } catch (error) {
        console.error('❌ Error acquiring access token:', error.response ? error.response.data : error.message);
        throw new Error('Failed to authenticate with Microsoft Graph');
    }
}

module.exports = { getAccessToken };
