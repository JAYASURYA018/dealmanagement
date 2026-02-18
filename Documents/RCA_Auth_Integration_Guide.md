# Seamless API Integration Guide: Service Account Pattern

This guide explains how to provide a **seamless experience** where *every* user can call the RCA Headless API without ever seeing a login screen or manually handling OAuth tokens.

## 1. The Strategy: "Named Principal" Service Account

Instead of each individual user authenticating, we use a single **Service Account** (an Integration User) that "owns" the connection.

### How it works dynamically:
1. **Salesforce Platform** securely manages the Access Token for the Service Account.
2. **Apex** calls the API using a **Named Credential**.
3. **The Platform** automatically injects the Service Account's token into the callout.
4. **Any User** (SalesRep, Manager, etc.) who triggers the Apex code gets the benefit of the service account's connection.


## 2. Step-by-Step Implementation

Follow these 5 steps to set up a permanent, seamless connection.

### Step 1: Create a Connected App (The OAuth Client)
This defines your application's identity in Salesforce.
1. Go to **Setup > App Manager > New Connected App**.
2. Name: `GoogleQuoteApp_OAuth`.
3. Enable **OAuth Settings**:
   - Callback URL: `https://[YourMyDomain].my.salesforce.com/services/authcallback/RCA_AuthProvider` (You will confirm this in Step 2).
   - Scopes: `Manage user data via APIs (api)`, `Perform requests at any time (refresh_token, offline_access)`.
4. Save and copy the **Consumer Key** and **Consumer Secret**.

### Step 2: Create an Auth. Provider (The Token Manager)
This tells Salesforce "how to log in to itself" and manage refresh tokens.
1. Go to **Setup > Auth. Providers > New**.
2. Provider Type: **Salesforce**.
3. Name: `RCA_AuthProvider`.
4. Consumer Key/Secret: (From Step 1).
5. Authorize Endpoint: `https://login.salesforce.com/services/oauth2/authorize` (Use `test` for Sandboxes).
6. Token Endpoint: `https://login.salesforce.com/services/oauth2/token`.
7. Save. Copy the **Callback URL** and update your Connected App (Step 1) if they don't match.

### Step 3: Create a Named Credential (The Connection Store)
This is what your code will reference.
1. Go to **Setup > Named Credentials > New Legacy**.
2. Label/Name: `GoogleQuoteAppNC`.
3. URL: `https://agivant64-dev-ed.develop.my.salesforce.com`.
4. Identity Type: **Named Principal** (This makes it seamless for all users).
5. Authentication Protocol: **OAuth 2.0**.
6. Authentication Provider: `RCA_AuthProvider`.
7. **Start Authentication Flow on Save**: Check this box!
8. **Save**: Salesforce will redirect you to log in. Log in with your **Service Account** (or your admin account). 
9. **Status**: It should now say "Authenticated as [User]".

### Step 4: Create the Apex Proxy (The Shield)
Your Angular app should *never* handle tokens. It calls this Apex method instead.

```java
public class RCAApiService {
    @AuraEnabled
    public static Map<String, Object> callRcaApi(String apiPath, String method, Map<String, Object> body) {
        // 'callout:GoogleQuoteAppNC' automatically injects the stored Service Account token
        String endpoint = 'callout:GoogleQuoteAppNC' + apiPath;
        
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod(method);
        req.setHeader('Content-Type', 'application/json');
        if (body != null) req.setBody(JSON.serialize(body));
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }
}
```

### Step 5: Angular Consumer (The User Interface)
The frontend just calls Apex. It doesn't care about OAuth.

```typescript
// Example: Calling the PCM Products API
const payload = { language: "en_US", filter: { ... } };

Visualforce.remoting.Manager.invokeAction(
  'RCAApiService.callRcaApi',
  '/services/data/v65.0/connect/pcm/products',
  'POST',
  payload,
  (result, event) => { /* Handle response */ }
);
```

---

## 4. Troubleshooting: `redirect_uri_mismatch`

If you see this error when saving the Named Credential:

> [!WARNING]
> This occurs when the **Auth Provider** sends a redirect URL that doesn't exactly match the one in your **Connected App**.

### How to Fix:
1. **Find the Callback URL**:
   - On the **Auth. Provider** page you just shared, **scroll down** to the section titled **Salesforce Configuration**.
   - You will see a field named **Callback URL**. It will look exactly like:
     `https://agivant64-dev-ed.develop.my.salesforce.com/services/authcallback/RCA_AuthProvider`
   - **Copy this URL.**

2. **Update the Connected App**:
   - Go to **Setup > App Manager**.
   - Find your **GoogleQuoteApp_OAuth** app.
   - Click the arrow on the right and select **Edit**.
   - Paste that URL into the **Callback URL** field. 
   - **Save** and wait 10 minutes.

3. **Try Again**:
   - Go back to your **Named Credential** and click **Save**.
To call *any* other Salesforce API (Tooling API, Metadata API, or custom REST), simply use the same **Named Credential**:

- **Metadata API**: `callout:GoogleQuoteAppNC/services/data/v65.0/metadata`
- **Standard Tooling**: `callout:GoogleQuoteAppNC/services/data/v65.0/tooling`
- **Custom Apex REST**: `callout:GoogleQuoteAppNC/services/apexrest/MyService`

### Summary Recommendation:
> [!IMPORTANT]
> **Always use Named Principal + Apex Proxy.**
> This is the only way to ensure "Zero-Login" for your end users while maintaining enterprise-grade security and full auditability.
