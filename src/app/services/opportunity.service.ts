import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SelectedOpportunity } from '../models/mock-data';

@Injectable({
  providedIn: 'root'
})
export class OpportunityService {

  private opportunitySource = new BehaviorSubject<SelectedOpportunity | null>(null);
  opportunity$ = this.opportunitySource.asObservable();

  setOpportunity(id: string, name: string) {
    this.opportunitySource.next({ id, name });
  }

  getOpportunity() {
    return this.opportunitySource.getValue();
  }

  clear() {
    this.opportunitySource.next(null);
  }
}