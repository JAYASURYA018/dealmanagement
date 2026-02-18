public with sharing class QuoteController {
    
    // Required for Visualforce Extension
    public QuoteController(ApexPages.StandardController stdController) {}

    @AuraEnabled(cacheable=true)
    @RemoteAction
    public static Map<String, Object> getAppConfig(Id oppId, String clientSessionId) {
        System.debug('getAppConfig called with Id: ' + oppId + ' and SessionId: ' + (String.isNotBlank(clientSessionId) ? 'Provided' : 'Null'));
        
        // 1. Query Opportunity and Lines safely
        List<Opportunity> opps = [SELECT Name, AccountId, Account.Name, Account.Id, Account.Website, Account.Type, StageName, Type, 
                                 SyncedQuote.QuoteNumber,
                                 (SELECT Product2.Family FROM OpportunityLineItems) 
                                 FROM Opportunity WHERE Id = :oppId];
        
        if (opps.isEmpty()) {
            return new Map<String, Object>{
                'error' => 'Opportunity not found with ID: ' + oppId
            };
        }
        
        Opportunity opp = opps[0];
        
        // 2. Logic to determine if it is GCP
        Boolean isGcp = false;
        if (opp.OpportunityLineItems != null) {
            for(OpportunityLineItem child : opp.OpportunityLineItems) {
                if(child.Product2.Family == 'GCP') isGcp = true;
            }
        }

        String website = opp.Account.Website;
        if (String.isBlank(website)) website = 'salesforce.com';

        String salesChannel = opp.Type;
        if (String.isBlank(salesChannel)) salesChannel = opp.Account.Type;
        if (String.isBlank(salesChannel)) salesChannel = opp.StageName;
        if (String.isBlank(salesChannel)) salesChannel = 'Direct Sales';

        String quoteId = opp.SyncedQuote != null ? opp.SyncedQuote.QuoteNumber : ('Q-' + String.valueOf(opp.Id).substring(11, 15));

        // Use provided session ID if available, otherwise fallback to UserInfo (which might be weak)
        String finalSessionId = String.isNotBlank(clientSessionId) ? clientSessionId : UserInfo.getSessionId();

        // 3. Return Map
        return new Map<String, Object>{
            'sessionId' => finalSessionId,
            'opportunityId' => opp.Id,
            'opportunityName' => opp.Name,
            'accountId' => opp.AccountId,
            'accountName' => opp.Account.Name,
            'website' => website,
            'salesChannel' => salesChannel, 
            'quoteId' => quoteId,
            'primaryContactName' => 'Sarah Connor', 
            'isGCP' => isGcp
        };
    }
    @RemoteAction
    public static Map<String, Object> placeOrder(Map<String, Object> data) {
        System.debug('QuoteController.placeOrder called');
        try {
            return RCAApiService.placeOrder(data);
        } catch (Exception e) {
            System.debug('Error in QuoteController.placeOrder: ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }
}
