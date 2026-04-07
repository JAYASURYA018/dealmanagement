# Project Flow and Architectural Overview

Welcome to the project! This document explains how the application works, its core data flow, and how it translates to your React background.

---

## 🚀 Entry Point: How the App Starts

In Angular, the application is bootstrapped from `main.ts`, which sets up the global environment and loads the root component.

1.  **`src/main.ts`**: The engine starts here. It provides global configuration (like the Router).
2.  **`src/app/app.component.ts`**: This is the root component (like `App.js` in React). Its template contains `<router-outlet>`, which acts as a placeholder for the component matched by the URL.
3.  **`src/app/app.routes.ts`**: This is your routing map (similar to `react-router-dom`). It maps paths to components:
    *   `/` -> `OpportunitiesComponent`
    *   `/products` -> `ProductDiscoveryComponent`
    *   `/configure-quote` -> `QuoteDetailsComponent`

---

## 🗺️ The Application "Journey" (User Flow)

### 1. The Starting Point: Opportunities
A user starts on the **Opportunities** page.
-   **Logic**: `OpportunitiesComponent` fetches a list of Salesforce opportunities using `SalesforceApiService`.
-   **Navigation**: When a user clicks "Create Quote":
    *   We fetch detailed Opportunity info (AccountID, Contact, Pricebook).
    *   We store this "context" in `QuoteDataService` (our global state).
    *   We navigate to `/products`.

### 2. Product Discovery
The user picks the "base" product for the deal (e.g., "Google Cloud Platform RCA").
-   **Logic**: `ProductDiscoveryComponent` lists products. Once selected, it updates the `QuoteDataService` with the `productId` and navigates to `/configure-quote`.

### 3. Configure Quote (The Heart of the App)
The `QuoteDetailsComponent` is the main workspace. It is divided into two sections:
-   **Commitment Details**: Managed directly in `QuoteDetailsComponent`. This handles dates, months, and the total contract value.
-   **Discounts & Incentives**: Managed by the **`DiscountsIncentivesComponent`** (embedded as a child).

### 4. Selecting Products (Modal/Side-Panel)
When you click "Select Products" inside the Discounts/Incentives section:
-   It opens a modal (within `DiscountsIncentivesComponent`).
-   It uses the **Connect CPQ API** to search for products and bundles.
-   **State Sharing**: To keep the selection synced between the modal and the main page without refreshing, we use **`DiscountIncentiveStateService`**.

---

## 🧠 State Management: Angular vs. React

If you're coming from React, thinking about state changes is a bit different:

| Feature | React | Angular (This Project) |
| :--- | :--- | :--- |
| **Local State** | `useState`, `useReducer` | Component Class Properties (e.g., `this.isLoading = true`) |
| **Global State** | `useContext`, Redux, Zustand | **Services** (e.g., `QuoteDataService`, `DiscountIncentiveStateService`) |
| **Props** | Passed via attributes | `@Input()` |
| **Events** | Callbacks passed as props | `@Output()` and `EventEmitter` |
| **Async Data** | `useEffect` + `fetch`/`axios` | **RxJS Observables** + `HttpClient` |

### 💉 Dependency Injection (DI)
In React, you import components and hooks. In Angular, you **inject** services.
Instead of `const api = useApi()`, you'll see:
```typescript
private sfApi = inject(SalesforceApiService); // Modern way
// OR
constructor(private sfApi: SalesforceApiService) {} // Traditional way
```
This tells Angular to give this component the shared instance of that service.

### 🌊 RxJS Observables (The "Streams")
In this project, you'll see a lot of `.subscribe()` and `pipe()`. 
-   **Observables** are like Promises that can emit multiple values over time.
-   **BehaviorSubject**: Used in `DiscountIncentiveStateService`. It's like a React state that components can "subscribe" to. When the state changes, every subscriber gets the new value automatically.

---

## 🛠️ Key Services and Their Roles

-   **`SalesforceApiService`**: The primary gateway to Salesforce. It handles authentication and all CRUD operations for Opportunities, Quotes, and Line Items.
-   **`RcaApiService`**: Specifically handles the "Rate Card Application" (RCA) logic—fetching product classifications, bundle siblings, and custom pricing logic.
-   **`DiscountIncentiveStateService`**: Acts as the "Redux Store" for the product selector modal. Since the modal is a complex child component, this service ensures that if you select a product in the modal, the parent page knows about it instantly.

---

## 📂 Folder Structure Quick-Peek

-   `src/app/pages/`: Full-page components (The "Screens").
-   `src/app/components/`: Reusable UI pieces (Modals, Headers, Pickers).
-   `src/app/services/`: The "Brain" of the app. Look here for API calls and state management.
-   `src/app/guards/`: Middleware (like Express middleware) that prevents navigating to a page if the user isn't logged in.
-   `src/app/interceptors/`: Code that runs on every HTTP request (e.g., to add the Salesforce Auth Token to the header).
