# Google Quote Application - Deployment Guide

This guide provides step-by-step instructions for deploying the Google Quote Application to a Salesforce environment. This includes building the Angular frontend, deploying Salesforce metadata, and configuring the user interface.

## Prerequisites

Ensure the following tools are installed on your machine:
- **Node.js** (v14 or higher)
- **Salesforce CLI** (`sf` or `sfdx`)
- **VS Code** with Salesforce Extension Pack
- Access to the target Salesforce Org

---

## Part 1: Building the Frontend Application

The application uses an Angular frontend that must be built and packaged as a Static Resource.

1.  **Navigate to the project root directory** in your terminal.
    ```bash
    cd "C:\Google Quote Creation\google-quote-creation"
    ```

2.  **Install Dependencies** (if not already done):
    ```bash
    npm install
    ```

3.  **Build the Application**:
    Run the build command to generate the production-ready artifacts.
    ```bash
    npm run build
    ```
    *This will create a `dist/` folder containing the compiled application.*

4.  **Package as Static Resource**:
    -   Navigate to the `dist/google-quote-creation` folder (or just inside `dist` depending on your build config).
    -   Select **all files** inside this folder (index.html, styles.css, JS files, assets).
    -   Compress them into a **ZIP file** named `GoogleQuoteAppV2.zip`.
    -   **Important**: Do not zip the parent folder; zip the *contents* so `index.html` is at the root of the zip.

5.  **Place in Salesforce Project**:
    -   Move `GoogleQuoteAppV2.zip` to:
        `salesforce/force-app/main/default/staticresources/`
    -   Ensure there is a corresponding metadata file named `GoogleQuoteAppV2.resource-meta.xml`.

---

## Part 2: Deploying to Salesforce

You can deploy the entire package using the Salesforce CLI.

### 1. Authorize the Org
If you haven't authorized the target org yet:
```bash
sf org login web --alias target-org --instance-url https://login.salesforce.com
```
*(Replace `https://login.salesforce.com` with `https://test.salesforce.com` for sandboxes)*

### 2. Deploy Source
Run the following command to deploy all components (Apex, VF, LWC, Quick Actions, Static Resources):

```bash
sf project deploy start --source-dir salesforce/force-app/main/default --target-org target-org
```

**What gets deployed:**
-   **Static Resources**: `GoogleQuoteAppV2` (The App), `GoogleQuoteApp` (Legacy)
-   **Apex Classes**:
    -   `QuoteController` (Main Logic)
    -   `QuoteCreationController` (Initialization)
    -   `RCAApiService` & `RCARequestBuilder` (Integration)
-   **Visualforce Page**: `GoogleQuoteAppVF` (App Container)
-   **Lightning Web Component**: `quoteNewWindowAction` (Navigation Handler)
-   **Quick Action**: `Opportunity.New_Quote_Direct`

---

## Part 3: Configuration & Setup

After deployment, you need to add the button to the Opportunity page layout.

### 1. Verify "New Quote" Button Functionality
The application uses a specialized logic to provide a clean user experience:
-   **Auto-Open**: Opens the app in a new, clean browser tab.
-   **Auto-Close**: Automatically closes the temporary Salesforce Console tab AND the Opportunity tab to keep the workspace tidy.

### 2. Add Button to Page Layout
1.  Go to **Setup** > **Object Manager** > **Opportunity**.
2.  Select **Page Layouts** and choose the active layout (e.g., "Opportunity Layout").
3.  Scroll to the **Mobile & Lightning Actions** section.
4.  Find the **New Quote** (Quick Action) button.
    *Note: There might be multiple "New Quote" buttons. Look for the one API named `New_Quote_Direct` if hovering, or simply test them.*
5.  Drag the **New Quote** action into the **Salesforce Mobile and Lightning Experience Actions** section of the layout.
6.  **Save** the layout.

### 3. Permissions (If applicable)
Ensure users have permission to:
-   Access the `QuoteController` and `QuoteCreationController` Apex classes.
-   Access the `GoogleQuoteAppVF` Visualforce page.
-   Execute the `New_Quote_Direct` Quick Action.

---

## Part 4: Troubleshooting

**Issue: App opens in a sub-tab instead of a new window.**
-   **Cause**: Salesforce Console interception.
-   **Fix**: The `quoteNewWindowAction` LWC handles this. Ensure the LWC is deployed and the Quick Action is using this LWC.

**Issue: "Redirecting..." page stays visible.**
-   **Cause**: The Visualforce page auto-redirect hasn't triggered.
-   **Fix**: Ensure `GoogleQuoteAppVF.page` has the latest code with `window.top !== window.self` checks.

**Issue: Static Resource not loading (404).**
-   **Cause**: Incorrect zip structure.
-   **Fix**: Unzip `GoogleQuoteAppV2.zip` and verify that `index.html` is at the root, not inside a subfolder. Re-zip and re-deploy if needed.
