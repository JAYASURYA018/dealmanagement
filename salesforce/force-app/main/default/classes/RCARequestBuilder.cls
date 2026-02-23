public class RCARequestBuilder {
    
    /**
     * Build a complete Place Order request for creating a quote with line items
     * @param opportunityId The Opportunity ID
     * @param quoteName The name for the new quote
     * @param productFamily The product family to use for line items
     * @return Map containing the complete request structure
     */
    public static Map<String, Object> buildPlaceOrderRequest(
        String opportunityId,
        String quoteName,
        String productFamily
    ) {
        Map<String, Object> request = new Map<String, Object>();
        
        // Set preferences
        request.put('pricingPref', 'System');
        request.put('catalogRatesPref', 'Skip');
        request.put('configurationPref', buildConfigurationPref());
        request.put('taxPref', 'Skip');
        request.put('contextDetails', new Map<String, Object>());
        
        // Build graph with quote and line items
        request.put('graph', buildGraph(opportunityId, quoteName, productFamily));
        
        return request;
    }
    
    /**
     * Build configuration preferences
     */
    private static Map<String, Object> buildConfigurationPref() {
        Map<String, Object> configPref = new Map<String, Object>();
        configPref.put('configurationMethod', 'Skip');
        
        Map<String, Object> options = new Map<String, Object>();
        options.put('validateProductCatalog', true);
        options.put('validateAmendRenewCancel', true);
        options.put('executeConfigurationRules', true);
        options.put('addDefaultConfiguration', true);
        
        configPref.put('configurationOptions', options);
        return configPref;
    }
    
    /**
     * Build the graph structure with quote and line items
     */
    private static Map<String, Object> buildGraph(
        String opportunityId,
        String quoteName,
        String productFamily
    ) {
        Map<String, Object> graph = new Map<String, Object>();
        graph.put('graphId', 'createQuoteWithLines');
        
        List<Map<String, Object>> records = new List<Map<String, Object>>();
        
        // Add Quote record
        records.add(buildQuoteRecord(opportunityId, quoteName, productFamily));
        
        // Add Line Items based on product family
        List<Map<String, Object>> lineItems = getLineItemsForProductFamily(productFamily);
        for (Integer i = 0; i < lineItems.size(); i++) {
            records.add(buildLineItemRecord(i, lineItems[i]));
        }
        
        graph.put('records', records);
        return graph;
    }
    
    /**
     * Build the Quote record structure
     */
    private static Map<String, Object> buildQuoteRecord(
        String opportunityId,
        String quoteName,
        String productFamily
    ) {
        Map<String, Object> quoteRecord = new Map<String, Object>();
        quoteRecord.put('referenceId', 'refQuote');
        
        Map<String, Object> record = new Map<String, Object>();
        Map<String, Object> attributes = new Map<String, Object>();
        attributes.put('method', 'POST');
        attributes.put('type', 'Quote');
        
        record.put('attributes', attributes);
        record.put('Name', quoteName);
        record.put('OpportunityId', opportunityId);
        
        // Get Pricebook2Id
        String pricebookId = getPricebookId(productFamily);
        if (pricebookId != null) {
            record.put('Pricebook2Id', pricebookId);
        }
        
        quoteRecord.put('record', record);
        return quoteRecord;
    }
    
    /**
     * Build a Quote Line Item record structure
     */
    private static Map<String, Object> buildLineItemRecord(
        Integer index,
        Map<String, Object> lineItemData
    ) {
        Map<String, Object> lineRecord = new Map<String, Object>();
        lineRecord.put('referenceId', 'refQuoteLine' + index);
        
        Map<String, Object> record = new Map<String, Object>();
        Map<String, Object> attributes = new Map<String, Object>();
        attributes.put('type', 'QuoteLineItem');
        attributes.put('method', 'POST');
        
        record.put('attributes', attributes);
        record.put('QuoteId', '@{refQuote.id}');
        record.put('Product2Id', lineItemData.get('productId'));
        record.put('PricebookEntryId', lineItemData.get('pricebookEntryId'));
        record.put('Quantity', lineItemData.get('quantity'));
        record.put('UnitPrice', lineItemData.get('unitPrice'));
        record.put('StartDate', lineItemData.get('startDate'));
        record.put('SubscriptionTerm', lineItemData.get('subscriptionTerm'));
        record.put('SubscriptionTermUnit', lineItemData.get('subscriptionTermUnit'));
        record.put('PeriodBoundary', lineItemData.get('periodBoundary'));
        record.put('BillingFrequency', lineItemData.get('billingFrequency'));
        
        lineRecord.put('record', record);
        return lineRecord;
    }
    
    /**
     * Get Pricebook ID based on product family
     * Returns standard pricebook or custom pricebook based on family
     */
    private static String getPricebookId(String productFamily) {
        try {
            // First try to find a custom pricebook for the product family
            List<Pricebook2> customPricebooks = [
                SELECT Id 
                FROM Pricebook2 
                WHERE Name LIKE :('%' + productFamily + '%')
                AND IsActive = true
                LIMIT 1
            ];
            
            if (!customPricebooks.isEmpty()) {
                return customPricebooks[0].Id;
            }
            
            // Fall back to standard pricebook
            List<Pricebook2> standardPricebooks = [
                SELECT Id 
                FROM Pricebook2 
                WHERE IsStandard = true 
                LIMIT 1
            ];
            
            return standardPricebooks.isEmpty() ? null : standardPricebooks[0].Id;
        } catch (Exception e) {
            System.debug('Error getting pricebook: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Get line items for a specific product family
     * Returns a list of line item data maps
     */
    private static List<Map<String, Object>> getLineItemsForProductFamily(String productFamily) {
        List<Map<String, Object>> lineItems = new List<Map<String, Object>>();
        
        try {
            // 1. Try to find products in the requested family
            List<Product2> products = [
                SELECT Id, Name, (SELECT Id, Pricebook2Id, UnitPrice FROM PricebookEntries WHERE IsActive = true ORDER BY Pricebook2.IsStandard DESC LIMIT 1)
                FROM Product2 
                WHERE Family = :productFamily 
                AND IsActive = true
                LIMIT 1
            ];
            
            // 2. Fallback: If no products in family, try ANY active product
            if (products.isEmpty()) {
                System.debug('[RCARequestBuilder] No products found for family ' + productFamily + '. Trying any active product fallback.');
                products = [
                    SELECT Id, Name, (SELECT Id, Pricebook2Id, UnitPrice FROM PricebookEntries WHERE IsActive = true ORDER BY Pricebook2.IsStandard DESC LIMIT 1)
                    FROM Product2 
                    WHERE IsActive = true 
                    AND Family != null
                    LIMIT 1
                ];
            }
            
            // 3. Last Resort Fallback: Any active product even without family
            if (products.isEmpty()) {
                System.debug('[RCARequestBuilder] Still no products. Trying absolute fallback.');
                products = [
                    SELECT Id, Name, (SELECT Id, Pricebook2Id, UnitPrice FROM PricebookEntries WHERE IsActive = true LIMIT 1)
                    FROM Product2 
                    WHERE IsActive = true 
                    LIMIT 1
                ];
            }
            
            if (products.isEmpty()) {
                System.debug('[RCARequestBuilder] No products found at all in the system. Creating quote WITHOUT line items.');
                return lineItems; // Return empty list, buildGraph will handle it
            }
            
            Product2 product = products[0];
            
            if (product.PricebookEntries.isEmpty()) {
                System.debug('[RCARequestBuilder] Product found but no active pricebook entries. Skipping line items.');
                return lineItems;
            }
            
            PricebookEntry pbe = product.PricebookEntries[0];
            
            // Create line item data
            Map<String, Object> lineItem = new Map<String, Object>();
            lineItem.put('productId', product.Id);
            lineItem.put('pricebookEntryId', pbe.Id);
            lineItem.put('quantity', 1);
            lineItem.put('unitPrice', pbe.UnitPrice != null ? pbe.UnitPrice : 0);
            lineItem.put('startDate', String.valueOf(Date.today())); 
            lineItem.put('subscriptionTerm', 1);
            lineItem.put('subscriptionTermUnit', 'Year');
            lineItem.put('periodBoundary', 'Anniversary');
            lineItem.put('billingFrequency', 'Annual');
            
            lineItems.add(lineItem);
            
        } catch (Exception e) {
            System.debug('[RCARequestBuilder] Exception during line item build: ' + e.getMessage());
            // Don't throw, just return empty list to allow quote creation to proceed
        }
        
        return lineItems;
    }
}
