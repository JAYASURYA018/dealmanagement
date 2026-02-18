# Recipient Deployment Guide (No Tools Required)

This guide explains how to deploy the Google Quote Application to your Salesforce environment using **Workbench**. This method requires **no installation** of VS Code, Node.js, or Salesforce CLI. All you need is a web browser and the deployment ZIP file provided to you.

---

## Prerequisites

1.  **Deployment ZIP File**: Ensure you have received the `GoogleQuoteDeployment.zip` file.`
2.  **Salesforce Credentials**: A username and password for the target Salesforce environment (Production or Sandbox).
3.  **Workbench Access**: Ability to log in to [https://workbench.developerforce.com](https://workbench.developerforce.com).

---

## Step 1: Deploy Using Workbench

Workbench is a web-based tool that interacts with your Salesforce org. We will use it to upload the application components (Code, Visualforce Page, Lightning Components, etc.) all at once.

1.  **Open Workbench**:
    *   Navigate to [https://workbench.developerforce.com](https://workbench.developerforce.com).
    *   **Environment**: Select `Production` (for Developer Edition or Prod) or `Sandbox`.
    *   **API Version**: Select the highest available (e.g., 60.0).
    *   Check "I agree to the terms of service".
    *   Click **Login with Salesforce**.

2.  **Log In**:
    *   Enter your Salesforce username and password.
    *   Allow access if prompted.hi

3.  **Navigate to Deploy**:
    *   In the top menu, hover over **Migration**.
    *   Click **Deploy**.

4.  **Upload the Package**:
    *   **Choose File**: Select the `GoogleQuoteDeployment.zip` file you received.
    *   **Check Only**: Leave this **UNCHECKED** (we want to actually save the changes).
    *   **Rollback On Error**: Check this (recommended to keep the org clean if something fails).
    *   **Test Level**: Select `NoTestRun` (for quickest deployment) or `RunLocalTests` if required by your policy.
    *   Click **Next**.

5.  **Confirm and Deploy**:
    *   You will see a summary of components to be deployed (ApexClasses, Pages, LightningComponentBundles, etc.).
    *   Click **Deploy**.

6.  **Wait for Completion**:
    *   The status will change from `Queued` to `InProgress` to `Succeeded`.
    *   If `Succeeded`, congratulations! The code is now in your org.

---

## Step 2: Configure the "New Quote" Button

Once the code is deployed, you need to add the button to your Opportunity page. This is done manually in Salesforce Setup.

1.  **Open Salesforce Setup**:
    *   Click the Gear icon ⚙️ in the top right > **Setup**.

2.  **Go to Object Manager**:
    *   Click the **Object Manager** tab.
    *   Search for and click on **Opportunity**.

3.  **Edit Page Layout**:
    *   Click **Page Layouts** in the left sidebar.
    *   Select the layout you use (e.g., **Opportunity Layout**).

4.  **Add the Button**:
    *   In the palette at the top, select **Mobile & Lightning Actions**.
    *   Find the **New Quote** button.
        *   *Tip: Hover over the buttons. Use the one where the Name is `New_Quote_Direct`. There might be standard buttons with the same name.*
    *   Drag this button into the **"Salesforce Mobile and Lightning Experience Actions"** section.
        *   *(If you don't see this section, click the "override the predefined actions" link).*
    *   Click **Save**.

---

## Step 3: Verify Permissions (If needed)

If you are not a System Administrator, or if users report "Insufficient Privileges":

1.  Go to **Setup** > **Permission Sets**.
2.  Create a new Permission Set named "Google Quote Access".
3.  Add access to:
    *   **Apex Classes**: `QuoteController`, `QuoteCreationController`, `RCAApiService`, `RCARequestBuilder`.
    *   **Visualforce Pages**: `GoogleQuoteAppVF`.
4.  Assign this Permission Set to your users.

---

## Step 4: Testing

1.  Go to an **Opportunity** record.
2.  Click the **New Quote** button you just added.
3.  **Verify**:
    *   The app opens in a **new browser tab**.
    *   The original Salesforce tab cleans itself up automatically.
    *   The app loads correctly.

---

**You are done!** No code or command line needed.
