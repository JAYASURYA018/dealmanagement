const { appendLog } = require('./googleDriveService');
require('dotenv').config();

// Simple test function
async function testDriveUpload() {
    try {
        console.log('🧪 Starting Google Drive Upload Test...');
        console.log(`📂 Folder ID: ${process.env.DRIVE_FOLDER_ID}`);
        console.log(`🔑 Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'Loaded from .env' : 'Missing'}`);
        console.log(`🔄 Refresh Token: ${process.env.GOOGLE_REFRESH_TOKEN ? 'Loaded from .env' : 'Missing'}`);

        const now = new Date();
        const dateStr = now.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).replace(/[/,:\s]/g, '-').substring(0, 16);

        const filename = `TEST-LOG-${dateStr}.csv`;
        const header = "Start Time,Message,User";
        const row = `${now.toISOString()},Test Log Entry,TestUser`;

        await appendLog(filename, row, header);
        
        console.log('✅ Test Passed! Check your Google Drive folder.');
    } catch (error) {
        console.error('❌ Test Failed:');
        console.error('Message:', error.message);
        if (error.code) console.error('Code:', error.code);
        if (error.errors) console.error('Errors:', JSON.stringify(error.errors, null, 2));
    }
}

testDriveUpload();
