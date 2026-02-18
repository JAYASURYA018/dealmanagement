const { google } = require('googleapis');

// Google Sheet ID from: https://docs.google.com/spreadsheets/d/122l0iCHJePymN16UeTlrwYqKFNSj_VFcx2XGRzMK79k/edit
const SHEET_ID = '122l0iCHJePymN16UeTlrwYqKFNSj_VFcx2XGRzMK79k';
const SHEET_NAME = 'API Logs';

// Service Account Credentials (from Google Cloud Console)
// IMPORTANT: Add these to Vercel Environment Variables, not hardcoded here
const GOOGLE_CREDENTIALS = {
  type: 'service_account',
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.GOOGLE_CERT_URL
};

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
    }).replace(',', '');
  };

  // Convert logs to rows for Google Sheets
  const rows = logs.map(log => {
    const start = new Date(log.startTime);
    const end = new Date(start.getTime() + log.durationMs);

    return [
      toIST(start),           // Start Time (IST)
      toIST(end),             // End Time (IST)
      log.url,                // API URL
      log.method,             // HTTP Method
      log.status,             // Status Code
      log.durationMs,         // Duration (ms)
      log.error || '',        // Error Message
      log.user || ''          // User
    ];
  });

  try {
    // Authenticate using service account credentials
    const auth = new google.auth.GoogleAuth({
      credentials: GOOGLE_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Append rows to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:H`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: rows,
      },
    });

    console.log(`Appended ${rows.length} rows to Google Sheet`);
    return res.status(200).json({ message: 'Logged to Google Sheets', count: rows.length });
  } catch (err) {
    console.error('Error writing to Google Sheets:', err);
    return res.status(500).json({ error: 'Error writing to Google Sheets', details: err.message });
  }
}
