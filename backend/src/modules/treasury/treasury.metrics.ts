import { createCounter, createGauge } from '../../common/observability/prometheus.js';

export const treasuryActualBalanceStroops = createGauge({ name: 'treasury_actual_balance_stroops', help: 'Observed native XLM treasury balance in stroops' });
export const treasuryExpectedBalanceStroops = createGauge({ name: 'treasury_expected_balance_stroops', help: 'Expected treasury balance from opening balance plus indexed fee events' });
export const treasuryDiscrepancyStroops = createGauge({ name: 'treasury_discrepancy_stroops', help: 'Actual treasury balance minus expected balance in stroops' });
export const treasuryUnexpectedOutflowsTotal = createCounter({ name: 'treasury_unexpected_outflows_total', help: 'Treasury observations where the actual balance decreased' });
