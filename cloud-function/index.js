const { google } = require('googleapis');

// Google Sheet ID from: https://docs.google.com/spreadsheets/d/122l0iCHJePymN16UeTlrwYqKFNSj_VFcx2XGRzMK79k/edit
const SHEET_ID = '122l0iCHJePymN16UeTlrwYqKFNSj_VFcx2XGRzMK79k';
const SHEET_NAME = 'API Logs'; // The tab name in your sheet

exports.logApiMetrics = async (req, res) => {
  // CORS Headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const logs = req.body;
  
  if (!logs || !Array.isArray(logs)) {
    console.error('Invalid log format received');
    res.status(400).send('Invalid Format: Expected JSON array');
    return;
  }

  if (logs.length === 0) {
    res.status(200).send('No logs to process');
    return;
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
    // Authenticate using default credentials (Cloud Function has access automatically)
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Append rows to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:H`, // Columns A through H
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: rows,
      },
    });

    console.log(`Appended ${rows.length} rows to Google Sheet`);
    res.status(200).send('Logged to Google Sheets');
  } catch (err) {
    console.error('Error writing to Google Sheets:', err);
    res.status(500).send('Error writing to Google Sheets');
  }
};
