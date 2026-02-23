// Development environment configuration
// IMPORTANT: Do NOT put real secrets here. This file is committed to source control.
// Populate real values via .env.local or CI/CD environment variables at build time.
export const environment = {
    production: false,
    loggingEndpoint: 'http://localhost:3001',

    // Salesforce OAuth (Username-Password flow) — dev defaults are empty.
    // Override via .env.local or CI/CD secrets (see README for instructions).
    salesforce: {
        clientId: '',         // Set via CI/CD or .env.local
        clientSecret: '',     // Set via CI/CD or .env.local — NEVER commit real value
        username: '',         // Set via CI/CD or .env.local
        loginUrl: 'https://test.salesforce.com'
    },

    // Salesforce PKCE / Connected App (tw-auth flow)
    salesforcePkce: {
        clientId: '',         // Set via CI/CD or .env.local
        loginUrl: 'https://test.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://test.salesforce.com/services/oauth2/token'
    }
};
