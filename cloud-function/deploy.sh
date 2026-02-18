#!/bin/bash
# Run this entire script in Google Cloud Shell

# 1. Create directory
mkdir -p log-api-function
cd log-api-function

# 2. Create package.json
cat > package.json <<'EOF'
{
  "name": "log-api-metrics",
  "version": "1.0.0",
  "description": "Cloud Function to log API metrics to Google Sheets",
  "main": "index.js",
  "dependencies": {
    "googleapis": "^134.0.0"
  }
}
EOF

# 3. Create index.js
cat > index.js <<'EOF'
const { google } = require('googleapis');

// Google Sheet ID from: https://docs.google.com/spreadsheets/d/122l0iCHJePymN16UeTlrwYqKFNSj_VFcx2XGRzMK79k/edit
const SHEET_ID = '122l0iCHJePymN16UeTlrwYqKFNSj_VFcx2XGRzMK79k';
const SHEET_NAME = 'API Logs';

exports.logApiMetrics = async (req, res) => {
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
      log.user || ''
    ];
  });

  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:H`,
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
EOF

echo "Files created successfully!"
echo ""
echo "NEXT STEPS:"
echo "1. Edit index.js and replace YOUR_GOOGLE_SHEET_ID_HERE with your actual Sheet ID"
echo "2. Run: nano index.js (or use Cloud Shell Editor)"
echo "3. Deploy with:"
echo ""
echo "gcloud functions deploy logApiMetrics \\"
echo "  --runtime nodejs20 \\"
echo "  --trigger-http \\"
echo "  --allow-unauthenticated \\"
echo "  --region us-central1"
