// Lecture des clients (CRM), stats calculées à la volée. Implémentation dans `lib/customers/`.

export type {
  CustomerStats,
  CustomerListSummary,
  CustomerSortKey,
  SortDir,
  CustomerDetailStats,
} from './customers/types';
export { listCustomers } from './customers/list';
export type { CustomerQuery } from './customers/filter';
export { getCustomer, getCustomerByPhone } from './customers/detail';
export { getCustomerListSummary } from './customers/summary';
export {
  CUSTOMER_VIEWS,
  CUSTOMER_VIEW_LABELS,
  CUSTOMER_PERIODS,
  CUSTOMER_PERIOD_LABELS,
  periodStart,
  viewDefaultSort,
} from './customers/views';
export type { CustomerView, CustomerPeriod } from './customers/views';
