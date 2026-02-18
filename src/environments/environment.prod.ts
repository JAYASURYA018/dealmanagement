// Production environment configuration
// IMPORTANT: Do NOT put real secrets here. This file is committed to source control.
// All secret values MUST be injected at build time via CI/CD environment variables.
// See README for the Angular file-replacement + build-time injection pattern.
export const environment = {
    production: true,
    loggingEndpoint: '/api/log-drive',

    // Salesforce OAuth (Username-Password flow)
    // Values are replaced at build time by CI/CD (e.g. GitHub Actions secrets).
    salesforce: {
        clientId: '',         // Injected at build time — never hard-code
        clientSecret: '',     // Injected at build time — never hard-code
        username: '',         // Injected at build time — never hard-code
        loginUrl: 'https://vector--rcaagivant.sandbox.my.salesforce.com'
    },

    // Salesforce PKCE / Connected App (tw-auth flow)
    salesforcePkce: {
        clientId: '',         // Injected at build time — never hard-code
        loginUrl: 'https://vector--rcaagivant.sandbox.my.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://vector--rcaagivant.sandbox.my.salesforce.com/services/oauth2/token'
    }
};
