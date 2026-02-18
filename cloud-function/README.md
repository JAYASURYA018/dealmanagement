# Google Sheets Logging Setup

## 1. Create Google Sheet

1.  Go to [Google Sheets](https://sheets.google.com)
2.  Create a new spreadsheet
3.  Rename it to **"API Logs"** (or your preference)
4.  In the first sheet tab, rename it to **"API Logs"**
5.  Add header row (Row 1):
    ```
    Start Time (IST) | End Time (IST) | URL | Method | Status | Duration (ms) | Error | User
    ```

## 2. Share the Sheet

1.  Click **Share** button (top right)
2.  Under "General access", select **"Anyone with the link"**
3.  Set permission to **"Viewer"** (so team can view but not edit)
4.  Click **Copy link**
5.  Save this URL - this is what you'll share with your team!

## 3. Get Sheet ID

From the URL you copied, extract the Sheet ID:
```
https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j/edit
                                      ^^^^^^^^^^^^^^^^^^^^
                                      This is your SHEET_ID
```

## 4. Grant Cloud Function Access

1.  After deploying the function (step 6), you'll get a service account email like:
    ```
    sixth-loader-477412-n2@appspot.gserviceaccount.com
    ```
2.  Go back to your Google Sheet
3.  Click **Share** → Add this email
4.  Give it **Editor** permission
5.  Click **Send**

## 5. Update Cloud Function Code

1.  Open `index.js`
2.  Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your actual Sheet ID
3.  Verify `SHEET_NAME` matches your tab name (default: "API Logs")

## 6. Deploy Function

Run in Cloud Shell (after creating the files):

```bash
gcloud functions deploy logApiMetrics \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region us-central1
```

## 7. Update Angular App

1.  Copy the function URL from deployment output
2.  Update `src/app/services/logging.service.ts`:
    ```typescript
    private readonly LOG_ENDPOINT = 'YOUR_FUNCTION_URL_HERE';
    ```

## 8. Share with Team

Give your team the Google Sheets URL. They can:
- **View live** in browser
- **Download CSV**: File → Download → CSV
- **Filter/Sort** directly in Sheets
