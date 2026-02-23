public class RCAApiService {
    
    /**
     * Call the RCA Place Order API to create a quote with line items
     * @param requestBody The request payload as a Map
     * @return Map containing the API response
     */
    @AuraEnabled
    public static Map<String, Object> placeOrder(Map<String, Object> requestBody) {
        // Use Named Credential (GoogleQuoteAppNC) instead of dynamic URL + SessionId
        // This solves the 'INVALID_SESSION_ID' error permanently
        String endpoint = 'callout:GoogleQuoteAppNC/services/data/v65.0/connect/rev/sales-transaction/actions/place';
        String body = JSON.serialize(requestBody);
        
        System.debug('===== RCA API: Request Started (Named Credential) =====');
        System.debug('[RCA API] Endpoint: ' + endpoint);
        System.debug('[RCA API] Request Payload: ' + body);

        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            // req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId()); // REMOVED: NC handles this
            req.setTimeout(120000); // 2 minutes timeout
            req.setBody(body);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            System.debug('===== RCA API: Response Received =====');
            System.debug('[RCA API] Status Code: ' + res.getStatusCode());
            System.debug('[RCA API] Status Message: ' + res.getStatus());
            System.debug('[RCA API] Response Body: ' + res.getBody());
            System.debug('======================================');
            
            if (res.getStatusCode() == 200 || res.getStatusCode() == 201) {
                return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            } else {
                throw new CalloutException('RCA API Error (' + res.getStatusCode() + '): ' + res.getStatus() + ' - ' + res.getBody());
            }
        } catch (Exception e) {
            System.debug('===== RCA API: EXCEPTION =====');
            System.debug('[RCA API] Message: ' + e.getMessage());
            System.debug('[RCA API] Stack Trace: ' + e.getStackTraceString());
            System.debug('==============================');
            throw e;
        }
    }
    
    /**
     * Get products from RCA API via Apex proxy
     * @return Map containing products and families
     */
    @AuraEnabled
    public static Map<String, Object> getProducts() {
        String endpoint = 'callout:GoogleQuoteAppNC/services/data/v65.0/connect/pcm/products';
        
        Map<String, Object> requestBody = new Map<String, Object>{
            'language' => 'en_US',
            'filter' => new Map<String, Object>{
                'criteria' => new List<Map<String, Object>>{
                    new Map<String, Object>{
                        'property' => 'Type',
                        'operator' => 'eq',
                        'value' => 'Bundle'
                    }
                }
            },
            'offset' => 0,
            'pageSize' => 100,
            'additionalFields' => new Map<String, Object>{
                'Product2' => new Map<String, Object>{
                    'fields' => new List<String>{'Family', 'Name'}
                }
            }
        };
        
        String body = JSON.serialize(requestBody);
        
        System.debug('===== RCA Products API: Request Started =====');
        System.debug('[RCA Products] Endpoint: ' + endpoint);
        System.debug('[RCA Products] Request Payload: ' + body);

        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(120000);
            req.setBody(body);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            System.debug('===== RCA Products API: Response Received =====');
            System.debug('[RCA Products] Status Code: ' + res.getStatusCode());
            System.debug('[RCA Products] Response Body: ' + res.getBody());
            
            if (res.getStatusCode() == 200 || res.getStatusCode() == 201) {
                Map<String, Object> response = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                
                // Extract products and families
                List<Object> products = (List<Object>) response.get('products');
                Set<String> familiesSet = new Set<String>();
                
                if (products != null) {
                    for (Object productObj : products) {
                        Map<String, Object> product = (Map<String, Object>) productObj;
                        Map<String, Object> additionalFields = (Map<String, Object>) product.get('additionalFields');
                        if (additionalFields != null && additionalFields.containsKey('Family')) {
                            String family = (String) additionalFields.get('Family');
                            if (String.isNotBlank(family)) {
                                familiesSet.add(family);
                            }
                        }
                    }
                }
                
                return new Map<String, Object>{
                    'products' => products,
                    'families' => new List<String>(familiesSet),
                    'success' => true
                };
            } else {
                throw new CalloutException('RCA Products API Error (' + res.getStatusCode() + '): ' + res.getStatus() + ' - ' + res.getBody());
            }
        } catch (Exception e) {
            System.debug('===== RCA Products API: EXCEPTION =====');
            System.debug('[RCA Products] Message: ' + e.getMessage());
            System.debug('[RCA Products] Stack Trace: ' + e.getStackTraceString());
            
            return new Map<String, Object>{
                'success' => false,
                'error' => e.getMessage()
            };
        }
    }
}
