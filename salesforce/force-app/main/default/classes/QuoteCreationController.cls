public class QuoteCreationController {
    
    // Required constructor for Visualforce standard controller extension
    public QuoteCreationController(ApexPages.StandardController stdController) { }
    
    /**
     * Create a quote using the RCA Place Order API
     * @param opportunityId The Opportunity ID
     * @param quoteName The name for the new quote (default: "Quote 1")
     * @param productFamily The product family (default: "Google Cloud Platform")
     * @return Map containing success status, salesTransactionId, and any errors
     */
    @RemoteAction
    @AuraEnabled
    public static Map<String, Object> createQuoteWithRCA(
        String opportunityId,
        String quoteName,
        String productFamily
    ) {
        try {
            // Validate inputs
            if (String.isBlank(opportunityId)) {
                throw new AuraHandledException('Opportunity ID is required');
            }
            
            // Set defaults
            if (String.isBlank(quoteName)) {
                quoteName = 'Quote 1';
            }
            
            if (String.isBlank(productFamily)) {
                productFamily = 'Google Cloud Platform';
            }
            
            System.debug('Creating quote for Opportunity: ' + opportunityId);
            System.debug('Quote Name: ' + quoteName);
            System.debug('Product Family: ' + productFamily);
            
            // Build request
            Map<String, Object> request = RCARequestBuilder.buildPlaceOrderRequest(
                opportunityId,
                quoteName,
                productFamily
            );
            
            System.debug('Request built successfully');
            System.debug('Request: ' + JSON.serializePretty(request));
            
            // Call RCA API
            Map<String, Object> response = RCAApiService.placeOrder(request);
            
            if (response == null) {
                return new Map<String, Object>{
                    'success' => false,
                    'error' => 'Null response received from RCA API'
                };
            }
            
            System.debug('Response received');
            System.debug('Response Content: ' + JSON.serializePretty(response));
            
            // Parse response safely
            Boolean isSuccess = false;
            if (response.containsKey('isSuccess') && response.get('isSuccess') != null) {
                isSuccess = (Boolean) response.get('isSuccess');
            }
            
            if (isSuccess) {
                String salesTransactionId = (String) response.get('salesTransactionId');
                
                return new Map<String, Object>{
                    'success' => true,
                    'salesTransactionId' => salesTransactionId,
                    'quoteId' => salesTransactionId, // For backwards compatibility
                    'quoteName' => quoteName,
                    'message' => 'Quote created successfully'
                };
            } else {
                List<Object> errorResponse = (List<Object>) response.get('errorResponse');
                String errorMessage = 'Quote creation failed (API error)';
                
                if (errorResponse != null && !errorResponse.isEmpty()) {
                    List<String> errorMessages = new List<String>();
                    for (Object error : errorResponse) {
                        try {
                            Map<String, Object> errorMap = (Map<String, Object>) error;
                            String message = (String) errorMap.get('message');
                            if (message != null) {
                                errorMessages.add(message);
                            }
                        } catch (Exception e) {
                            errorMessages.add(String.valueOf(error));
                        }
                    }
                    if (!errorMessages.isEmpty()) {
                        errorMessage = String.join(errorMessages, '; ');
                    }
                }
                
                return new Map<String, Object>{
                    'success' => false,
                    'error' => errorMessage,
                    'errorDetails' => errorResponse
                };
            }
        } catch (Exception e) {
            String errorMsg = e.getMessage();
            String errorType = e.getTypeName();
            String stackTrace = e.getStackTraceString();
            String cause = (e.getCause() != null) ? (e.getCause().getTypeName() + ': ' + e.getCause().getMessage()) : 'None';
            
            System.debug('===== QUOTE CREATION EXCEPTION =====');
            System.debug('[Controller] Message: ' + errorMsg);
            System.debug('[Controller] Type: ' + errorType);
            System.debug('[Controller] Cause: ' + cause);
            System.debug('[Controller] Stack Trace: ' + stackTrace);
            System.debug('===================================');
            
            // If it's a generic "Script-thrown exception", try to give more context
            if (errorMsg == 'Script-thrown exception' && cause != 'None') {
                errorMsg = 'Internal Error: ' + cause;
            }
            
            return new Map<String, Object>{
                'success' => false,
                'error' => '[' + errorType + '] ' + errorMsg,
                'cause' => cause,
                'stackTrace' => stackTrace
            };
        }
    }
    
    /**
     * Get quote details by sales transaction ID
     * @param salesTransactionId The sales transaction ID
     * @return Map containing quote details
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getQuoteDetails(String salesTransactionId) {
        try {
            // Query the quote using the sales transaction ID
            List<Quote> quotes = [
                SELECT Id, Name, QuoteNumber, OpportunityId, Opportunity.Name,
                       Opportunity.AccountId, Opportunity.Account.Name,
                       TotalPrice, Status, CreatedDate
                FROM Quote
                WHERE Id = :salesTransactionId
                LIMIT 1
            ];
            
            if (quotes.isEmpty()) {
                throw new CalloutException('Quote not found for transaction ID: ' + salesTransactionId);
            }
            
            Quote quote = quotes[0];
            
            return new Map<String, Object>{
                'success' => true,
                'quoteId' => quote.Id,
                'quoteName' => quote.Name,
                'quoteNumber' => quote.QuoteNumber,
                'opportunityId' => quote.OpportunityId,
                'opportunityName' => quote.Opportunity.Name,
                'accountName' => quote.Opportunity.Account.Name,
                'totalPrice' => quote.TotalPrice,
                'status' => quote.Status
            };
        } catch (Exception e) {
            return new Map<String, Object>{
                'success' => false,
                'error' => e.getMessage()
            };
        }
    }
}
