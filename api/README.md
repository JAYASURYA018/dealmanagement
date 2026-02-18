# Vercel Serverless Function Setup

## 1. Create Google Service Account

1.  Go to [Google Cloud Console](https://console.cloud.google.com)
2.  Create a new project (or use existing)
3.  Go to **IAM & Admin** → **Service Accounts**
4.  Click **Create Service Account**
5.  Name: `vercel-sheets-logger`
6.  Click **Create and Continue**
7.  Skip role assignment (click **Continue**)
8.  Click **Done**
9.  Click on the created service account
10. Go to **Keys** tab → **Add Key** → **Create New Key** → **JSON**
11. Download the JSON file

## 2. Share Google Sheet

1.  Open your Google Sheet
2.  Click **Share**
3.  Add the service account email (from the JSON file: `client_email`)
4.  Give it **Editor** permission

## 3. Set Vercel Environment Variables

1.  Go to your Vercel project dashboard
2.  Go to **Settings** → **Environment Variables**
3.  Add these variables (from the downloaded JSON file):

| Variable Name | Value (from JSON) |
|--------------|-------------------|
| `GOOGLE_PROJECT_ID` | `project_id` |
| `GOOGLE_PRIVATE_KEY_ID` | `private_key_id` |
| `GOOGLE_PRIVATE_KEY` | `private_key` (entire value including `-----BEGIN PRIVATE KEY-----`) |
| `GOOGLE_CLIENT_EMAIL` | `client_email` |
| `GOOGLE_CLIENT_ID` | `client_id` |
| `GOOGLE_CERT_URL` | `client_x509_cert_url` |

## 4. Update Angular App

Update `src/app/services/logging.service.ts`:

```typescript
private readonly LOG_ENDPOINT = 'https://YOUR_VERCEL_DOMAIN.vercel.app/api/log-metrics';
```

Replace `YOUR_VERCEL_DOMAIN` with your actual Vercel deployment URL.

## 5. Deploy

```bash
npm install
vercel --prod
```

Or push to GitHub if you have automatic deployments enabled.

## 6. Test

After deployment, your API endpoint will be:
```
https://your-app.vercel.app/api/log-metrics
```

The Angular app will automatically send logs to this endpoint.
