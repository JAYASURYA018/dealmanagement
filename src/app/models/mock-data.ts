export interface Product {
    id: string;
    name: string;
    description?: string;
    family: 'GCP' | 'Workspace' | 'Chrome' | 'Maps' | 'PSO';
    tags: string[]; // e.g., 'Promotions', 'Commission multiplier'
    productId?: string; // Salesforce Product2Id
    pricebookEntryId?: string; // Pricebook Entry ID
}

export interface ProductFamily {
    id: string;
    name: string;
    count: number; // e.g. x,xxx
}

export interface SalesDriver {
    id: string;
    name: string;
    icon?: string; // e.g. '%', 'rocket'
    count: number;
}
