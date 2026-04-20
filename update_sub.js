const fs = require('fs');

const subConfigPath = 'c:\\Salesforce\\dealmanagement\\src\\app\\components\\subscription-configuration\\subscription-configuration.component.ts';
let subCode = fs.readFileSync(subConfigPath, 'utf-8');

const onSaveLogicStr = `onSave(onSuccess?: () => void, skipFeedback: boolean = false) {
    if (this.isSaving) return;
    this.syncAllPeriodUserProducts();
    if (!this.validateLookerDates()) return;

    this.isSaving = true;
    this.loadingService.show();

    const targetQuoteId = this.quoteId || this.contextService.currentContext?.quoteId;
    if (!targetQuoteId) {
        this.toastService.show('Quote ID not found.', 'error');
        this.isSaving = false;
        this.loadingService.hide();
        return;
    }

    const relType$ = this.productRelationshipTypeId
        ? of({ recentItems: [{ Id: this.productRelationshipTypeId, Name: 'Bundle to Bundle Component Relationship' }] })
        : this.sfApi.getProductRelationshipType();

    forkJoin({
        lineItemRes: this.sfApi.getQuoteLineItems(targetQuoteId),
        relTypeRes: relType$
    }).subscribe({
        next: (data) => {
            const lineItems = data.lineItemRes.records || [];
            this.extractRelationshipId(data.relTypeRes);
            const relationshipTypeId = this.productRelationshipTypeId || '0yoKf0000010wFiIAI';

            const bundleProductId = this.productId;
            const bundleLine = lineItems.find((item: any) => item.Product2Id === bundleProductId);
            const bundlePBEId = bundleLine ? bundleLine.PricebookEntryId : this.bundlePricebookEntryId;
            const mainLineId = bundleLine?.Id || (lineItems.length > 0 ? lineItems[0].Id : null);

            const records: any[] = [];

            // 1. Quote Update
            const startToUse = (this.isLookerSubscription && this.termStartInput) ? this.termStartInput : (this.startDate || this.toIsoDateString(new Date()));
            const quoteRec: any = {
                "attributes": { "type": "Quote", "method": "PATCH", "id": targetQuoteId },
                "StartDate": startToUse
            };
            if (this.expirationDate) quoteRec["ExpirationDate"] = this.expirationDate;

            records.push({
                "referenceId": "refQuote",
                "record": quoteRec
            });

            if (this.subscriptionPeriods.length === 0) {
                this.isSaving = false;
                this.loadingService.hide();
                this.toastService.show('Error: No subscription periods found to sync.', 'error');
                return;
            }

            // --- Year 1 Implementation ---
            const firstPeriod = this.subscriptionPeriods[0];
            const isRamped = this.subscriptionPeriods.length > 1;
            const year1GroupRef = "refGroup1";

            if (isRamped) {
                records.push({
                    "referenceId": year1GroupRef,
                    "record": {
                        "attributes": { "type": "QuoteLineGroup", "method": "POST" },
                        "SortOrder": 1,
                        "Name": "Year 1",
                        "QuoteId": targetQuoteId,
                        "IsRamped": true,
                        "SegmentType": "Yearly",
                        "StartDate": firstPeriod.startDate,
                        "EndDate": firstPeriod.endDate
                    }
                });
            }

            lineItems.forEach((item: any, index: number) => {
                const startToUse = (this.isLookerSubscription && this.termStartInput) ? this.termStartInput : this.startDate;
                const subTerm = this.calculateSubscriptionTerm(startToUse, firstPeriod.endDate);

                const lineUpdate: any = {
                    "attributes": { "type": "QuoteLineItem", "method": "PATCH", "id": item.Id },
                    "SortOrder": 1,
                    "Term_Starts_On__c": this.termStartsOn,
                    "Operation_Type__c": this.operationType,
                    "Billing_Frequency__c": this.billingFrequency,
                    "SubscriptionTerm": subTerm,
                    "SubscriptionTermUnit": "Months",
                    "PeriodBoundary": "Anniversary"
                };

                if (isRamped) {
                    lineUpdate["QuoteLineGroupId"] = \`@{\${year1GroupRef}.id}\`;
                }

                if (this.isLookerSubscription && this.termStartInput) {
                    lineUpdate["StartDate"] = this.termStartInput;
                } else if (this.startDate) {
                    lineUpdate["StartDate"] = this.startDate;
                }

                if (firstPeriod.endDate) {
                    lineUpdate["EndDate"] = firstPeriod.endDate;
                }

                records.push({
                    "referenceId": \`refLineUpdate_\${index}\`,
                    "record": lineUpdate
                });
            });

            if (mainLineId) {
                let childIdx = 1;
                const selectedPlatform = this.productOptions.find((p: any) => p.name === firstPeriod.productName);
                const groupId = isRamped ? \`@{\${year1GroupRef}.id}\` : null;

                if (selectedPlatform && selectedPlatform.productId) {
                    this.addGraphRecords(records, childIdx++, selectedPlatform, firstPeriod, mainLineId, 1, targetQuoteId, 'NotIncludedInBundlePrice', firstPeriod.discount || 0, '_P1', groupId, relationshipTypeId);
                }
                firstPeriod.userRows.forEach(row => {
                    if (row.type !== 'Non-prod' && (row.quantity || 0) > 0 && row.productId) {
                        this.addGraphRecords(records, childIdx++, row, firstPeriod, mainLineId, row.quantity || 0, targetQuoteId, 'NotIncludedInBundlePrice', row.discount || 0, '_P1', groupId, relationshipTypeId);
                    }
                });
                const nonProdRow = firstPeriod.userRows.find(r => r.type === 'Non-prod');
                if (nonProdRow && (nonProdRow.quantity || 0) > 0 && selectedPlatform?.nonProdProductId) {
                    const matchingItem = {
                        ...nonProdRow,
                        productId: selectedPlatform.nonProdProductId,
                        pricebookEntryId: (selectedPlatform as any).nonProdPricebookEntryId
                    };
                    this.addGraphRecords(records, childIdx++, matchingItem, firstPeriod, mainLineId, nonProdRow.quantity || 0, targetQuoteId, 'NotIncludedInBundlePrice', nonProdRow.discount || 0, '_P1', groupId, relationshipTypeId);
                }
            }

            // --- Ramp Periods (Years 2+) ---
            if (this.subscriptionPeriods.length > 1) {
                this.subscriptionPeriods.slice(1).forEach((period, idx) => {
                    const periodNum = idx + 2;
                    const groupRef = \`refRampGroup_P\${periodNum}\`;
                    const bundleParentRef = \`refBundleParent_P\${periodNum}\`;

                    records.push({
                        "referenceId": groupRef,
                        "record": {
                            "attributes": { "type": "QuoteLineGroup", "method": "POST" },
                            "SortOrder": periodNum,
                            "QuoteId": targetQuoteId,
                            "Name": period.name.replace('Period', 'Year'),
                            "IsRamped": true,
                            "SegmentType": "Yearly",
                            "StartDate": period.startDate,
                            "EndDate": period.endDate
                        }
                    });

                    const subTerm = this.calculateSubscriptionTerm(period.startDate, period.endDate);
                    const standardFreq = this.billingFrequency ? this.billingFrequency.split(' ')[0] : 'Monthly';
                    records.push({
                        "referenceId": bundleParentRef,
                        "record": {
                            "attributes": { "type": "QuoteLineItem", "method": "POST" },
                            "SortOrder": 1,
                            "QuoteId": targetQuoteId,
                            "Product2Id": bundleProductId,
                            "PricebookEntryId": bundlePBEId,
                            "Quantity": 1,
                            "BillingFrequency": standardFreq,
                            "Billing_Frequency__c": this.billingFrequency,
                            "Operation_Type__c": this.operationType,
                            "Term_Starts_On__c": this.termStartsOn,
                            "SubscriptionTerm": subTerm,
                            "SubscriptionTermUnit": "Months",
                            "PeriodBoundary": "Anniversary",
                            "StartDate": period.startDate,
                            "EndDate": period.endDate,
                            "QuoteLineGroupId": \`@{\${groupRef}.id}\`
                        }
                    });

                    let childIdx = 1;
                    const selectedPlatform = this.productOptions.find((p: any) => p.name === period.productName);
                    if (selectedPlatform && selectedPlatform.productId) {
                        this.addGraphRecords(records, childIdx++, selectedPlatform, period, \`@{\${bundleParentRef}.id}\`, 1, targetQuoteId, "NotIncludedInBundlePrice", period.discount || 0, \`_P\${periodNum}\`, \`@{\${groupRef}.id}\`, relationshipTypeId);
                    }
                    period.userRows.forEach(row => {
                        if (row.type !== 'Non-prod' && (row.quantity || 0) > 0 && row.productId) {
                            this.addGraphRecords(records, childIdx++, row, period, \`@{\${bundleParentRef}.id}\`, row.quantity || 0, targetQuoteId, "NotIncludedInBundlePrice", row.discount || 0, \`_P\${periodNum}\`, \`@{\${groupRef}.id}\`, relationshipTypeId);
                        }
                    });

                    const nonProdRow = period.userRows.find(r => r.type === 'Non-prod');
                    if (nonProdRow && (nonProdRow.quantity || 0) > 0 && selectedPlatform?.nonProdProductId) {
                        const matchingItem = {
                            ...nonProdRow,
                            productId: selectedPlatform.nonProdProductId,
                            pricebookEntryId: (selectedPlatform as any).nonProdPricebookEntryId
                        };
                        this.addGraphRecords(records, childIdx++, matchingItem, period, \`@{\${bundleParentRef}.id}\`, nonProdRow.quantity || 0, targetQuoteId, "NotIncludedInBundlePrice", nonProdRow.discount || 0, \`_P\${periodNum}\`, \`@{\${groupRef}.id}\`, relationshipTypeId);
                    }
                });
            }

            const finalPayload = {
                "pricingPref": "System",
                "catalogRatesPref": "Skip",
                "configurationPref": {
                    "configurationMethod": "Skip",
                    "configurationOptions": {
                        "validateProductCatalog": true,
                        "validateAmendRenewCancel": true,
                        "executeConfigurationRules": true,
                        "addDefaultConfiguration": false
                    }
                },
                "taxPref": "Skip",
                "contextDetails": {},
                "graph": {
                    "graphId": "updateQuote",
                    "records": records
                }
            };

            console.log('📦 Consolidated Graph Payload:', JSON.stringify(finalPayload, null, 2));

            this.sfApi.placeGraphRequest(finalPayload).subscribe({
                next: (res) => {
                    this.isSaving = false;
                    this.loadingService.hide();

                    this.lastSavedLookerState = JSON.stringify({
                        periods: this.subscriptionPeriods,
                        startDate: this.startDate,
                        expirationDate: this.expirationDate,
                        termStartInput: this.termStartInput,
                        termEndDate: this.termEndDate
                    });

                    if (!skipFeedback) {
                        this.toastService.show('Quote Data Saved Successfully!', 'success');
                        this.showSuccessPopup = true;
                    }
                    if (onSuccess) onSuccess();
                },

                error: (err) => {
                    console.error('❌ Consolidated Sync error:', err);
                    this.isSaving = false;
                    this.loadingService.hide();
                    this.toastService.show('Failed to save quote data.', 'error');
                }
            });
        },
        error: (err) => {
            console.error('❌ Error fetching requirements:', err);
            this.isSaving = false;
            this.loadingService.hide();
            this.toastService.show('Failed to fetch quote details.', 'error');
        }
    });
}

addGraphRecords(records: any[], index: number, item: any, period: SubscriptionPeriod, parentId: string, quantity: number, quoteId: string, pricing: string, discount: number = 0, suffix: string = '', groupId: string | null = null, productRelationshipTypeId: string | null = null) {
    const refIdStr = index === 1 ? '' : \`-\${index}\`;
    const refId = \`refChildQuoteLineItem\${suffix}\${refIdStr}\`;

    const standardFreq = this.billingFrequency ? this.billingFrequency.split(' ')[0] : 'Monthly';

    const subTerm = this.calculateSubscriptionTerm(period.startDate as string, period.endDate as string);
    const record: any = {
        "referenceId": refId,
        "record": {
            "attributes": { "type": "QuoteLineItem", "method": "POST" },
            "SortOrder": index + 1,
            "QuoteId": quoteId,
            "Product2Id": item.productId,
            "PricebookEntryId": item.pricebookEntryId || this.bundlePricebookEntryId,
            "Quantity": quantity,
            "SubscriptionTerm": subTerm,
            "SubscriptionTermUnit": "Months",
            "PeriodBoundary": "Anniversary",
            "BillingFrequency": standardFreq,
            "Billing_Frequency__c": this.billingFrequency,
            "Operation_Type__c": this.operationType,
            "Term_Starts_On__c": this.termStartsOn,
            "StartDate": period.startDate,
            "EndDate": period.endDate
        }
    };

    if (groupId) {
        record.record["QuoteLineGroupId"] = groupId;
    }

    if (parentId && productRelationshipTypeId) {
        record.record["ProductRelatedLineItemId"] = parentId;
        record.record["ProductRelationshipTypeId"] = productRelationshipTypeId;
    }

    if (discount && discount > 0) {
        record.record["AdjustmentAmount"] = discount;
        record.record["AdjustmentType"] = "Discount %";
    }

    records.push(record);
}

calculateSubscriptionTerm(startDate: string, endDate: string): number {
    if (!startDate || !endDate) return 1;
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;

    const endAdjusted = new Date(end);
    endAdjusted.setDate(endAdjusted.getDate() + 1);

    let months = (endAdjusted.getFullYear() - start.getFullYear()) * 12 + (endAdjusted.getMonth() - start.getMonth());
    const temp = new Date(start);
    temp.setMonth(temp.getMonth() + months);

    if (temp > endAdjusted) {
        months--;
        temp.setTime(start.getTime());
        temp.setMonth(temp.getMonth() + months);
    }

    const diffTime = endAdjusted.getTime() - temp.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return months;

    const daysInMonth = new Date(temp.getFullYear(), temp.getMonth() + 1, 0).getDate();
    return (months + (diffDays / daysInMonth));
}

private extractRelationshipId(response: any) {
    if (!response) return;
    const relTypes = response.records || response.recentItems || [];
    const bundleRelType = relTypes.find((r: any) => r.Name === 'Bundle to Bundle Component Relationship');

    if (bundleRelType) {
        this.productRelationshipTypeId = bundleRelType.Id;
    } else if (relTypes.length > 0) {
        this.productRelationshipTypeId = relTypes[0].Id;
    }
}
`;

const stubOnSaveRegex = /onSave\s*\([^)]*\)\s*\{[\s\S]*?graphId:\s*["']updateLookerQuote["'][\s\S]*?\}\);?\s*}/;

if (stubOnSaveRegex.test(subCode)) {
  subCode = subCode.replace(stubOnSaveRegex, onSaveLogicStr);
} else {
  console.log('Regex fail onSave');
}

// Ensure the class has productRelationshipTypeId
if (!subCode.includes('productRelationshipTypeId')) {
    subCode = subCode.replace('categoryId: string | null = null;', 'categoryId: string | null = null;\n  productRelationshipTypeId: string | null = null;');
}

fs.writeFileSync(subConfigPath, subCode);
console.log('Replaced successfully');
