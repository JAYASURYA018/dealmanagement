import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface DiscountPeriod {
  id: string;
  name: string;
  timePeriod: string;
  startDate: string;
  endDate: string;
  activeDiscounts: any[];
}

export interface IncentivePeriod {
  id: string;
  name: string;
  timePeriod: string;
  startDate: string;
  endDate: string;
  activeIncentives: any[];
}

export interface DiscountIncentiveState {
  // Form data
  discountForm: {
    granularity: string;
    type: string;
    priceReference: string;
    value: string;
    selectedItemsCount: number;
  };
  incentiveForm: {
    type: string;
    amount: string;
    currency: string;
    selectedItemsCount: number;
  };

  // Periods
  discountPeriods: DiscountPeriod[];
  incentivePeriods: IncentivePeriod[];
  activeDiscountPeriodId: string;
  activeIncentivePeriodId: string;

  // Active tab
  activeTab: 'discounts' | 'incentives';

  // Selection state
  persistentSelectedGroups: Map<string, any>;
  persistentSelectedIndividuals: Map<string, any>;
  persistentIncentiveGroups: Map<string, any>;
  bulkUploadedProductIds: Set<string>;

  // Product data
  productGroups: any[];
  individualProducts: any[];
  dropdownOptions: any[];
  selectedDropdownOption: any;
  quoteId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DiscountIncentiveStateService {
  private stateSubject = new BehaviorSubject<DiscountIncentiveState | null>(null);
  public state$ = this.stateSubject.asObservable();

  // In-memory storage - gets cleared on page refresh
  private inMemoryState: DiscountIncentiveState | null = null;

  private getDefaultState(): DiscountIncentiveState {
    return {
      discountForm: {
        granularity: 'Select',
        type: 'Flat rate (%)',
        priceReference: 'Select',
        value: '',
        selectedItemsCount: 0
      },
      incentiveForm: {
        type: 'Select',
        amount: '',
        currency: 'USD',
        selectedItemsCount: 0
      },
      discountPeriods: [
        {
          id: '1',
          name: 'Discount Period 1',
          timePeriod: 'Date range',
          startDate: '',
          endDate: '',
          activeDiscounts: []
        }
      ],
      incentivePeriods: [
        {
          id: '1',
          name: 'Incentives',
          timePeriod: 'Date range',
          startDate: '',
          endDate: '',
          activeIncentives: []
        }
      ],
      activeDiscountPeriodId: '1',
      activeIncentivePeriodId: '1',
      activeTab: 'discounts',
      persistentSelectedGroups: new Map(),
      persistentSelectedIndividuals: new Map(),
      persistentIncentiveGroups: new Map(),
      bulkUploadedProductIds: new Set(),
      productGroups: [],
      individualProducts: [],
      dropdownOptions: [],
      selectedDropdownOption: null
    };
  }

  saveState(state: Partial<DiscountIncentiveState>, quoteId?: string) {
    const currentState = this.inMemoryState || this.getDefaultState();
    
    // If quoteId changes, clear state first
    if (quoteId && currentState.quoteId && currentState.quoteId !== quoteId) {
       this.clearState();
       const freshState = this.getDefaultState();
       const newState = { ...freshState, ...state, quoteId };
       this.inMemoryState = newState;
       this.stateSubject.next(newState);
       return;
    }

    const newState = { ...currentState, ...state };
    if (quoteId) newState.quoteId = quoteId;
    
    // Store in memory only - will be lost on page refresh
    this.inMemoryState = newState;
    this.stateSubject.next(newState);
  }

  loadState(quoteId?: string): DiscountIncentiveState {
    // If quoteId changes, clear state
    if (quoteId && this.inMemoryState && this.inMemoryState.quoteId && this.inMemoryState.quoteId !== quoteId) {
      this.clearState();
    }

    // Return in-memory state if available, otherwise return default
    if (this.inMemoryState) {
      if (quoteId && !this.inMemoryState.quoteId) this.inMemoryState.quoteId = quoteId;
      this.stateSubject.next(this.inMemoryState);
      return this.inMemoryState;
    }

    const defaultState = this.getDefaultState();
    if (quoteId) defaultState.quoteId = quoteId;
    this.stateSubject.next(defaultState);
    this.inMemoryState = defaultState;
    return defaultState;
  }

  clearState() {
    // Clear in-memory state
    this.inMemoryState = null;
    const defaultState = this.getDefaultState();
    this.stateSubject.next(defaultState);
  }

  getCurrentState(): DiscountIncentiveState {
    return this.inMemoryState || this.loadState();
  }
}