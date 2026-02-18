# Quick Start Guide

## ✅ Setup Complete! Here's what's left:

### 1. Share Google Sheet with Service Account
Go to your Google Sheet:
https://docs.google.com/spreadsheets/d/122l0iCHJePymN16UeTlrwYqKFNSj_VFcx2XGRzMK79k/edit

Click **Share** and add this email with **Editor** permission:
```
vercel-sheets-logger@potent-result-402506.iam.gserviceaccount.com
```

### 2. Add Environment Variables to Vercel

Go to your Vercel project dashboard → **Settings** → **Environment Variables**

Add these 6 variables:

| Variable | Value |
|----------|-------|
| `GOOGLE_PROJECT_ID` | `potent-result-402506` |
| `GOOGLE_PRIVATE_KEY_ID` | `5187b4eeb7001430b78a6ed840fda55482974f61` |
| `GOOGLE_PRIVATE_KEY` | Copy the entire private key from the JSON (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`) |
| `GOOGLE_CLIENT_EMAIL` | `vercel-sheets-logger@potent-result-402506.iam.gserviceaccount.com` |
| `GOOGLE_CLIENT_ID` | `109256571399148912156` |
| `GOOGLE_CERT_URL` | `https://www.googleapis.com/robot/v1/metadata/x509/vercel-sheets-logger%40potent-result-402506.iam.gserviceaccount.com` |

### 3. Deploy to Vercel

```bash
# Install Vercel CLI if you don't have it
npm install -g vercel

# Deploy
vercel --prod
```

### 4. Update Angular Logging Service

After deployment, Vercel will give you a URL like:
```
https://your-app.vercel.app
```

Update `src/app/services/logging.service.ts`:
```typescript
private readonly LOG_ENDPOINT = 'https://your-app.vercel.app/api/log-metrics';
```

### 5. Test

Run your Angular app and make some API calls. Check your Google Sheet - you should see new rows appearing!

## Your Team's CSV URL

Share this with your team:
```
https://docs.google.com/spreadsheets/d/122l0iCHJePymN16UeTlrwYqKFNSj_VFcx2XGRzMK79k/edit
```

They can download as CSV anytime: **File → Download → CSV**
