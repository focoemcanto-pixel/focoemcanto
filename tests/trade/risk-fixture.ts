/** Saves a PAPER risk-management version through the production SQL (the backend authority). */
export const defaultRisk = {
  capitalBRL: 10000,
  riskModel: 'FIXED_BRL',
  riskValue: 100,
  dailyLossUnit: 'R',
  dailyLossValue: 5,
  maxContracts: 1,
  maxTradesPerDay: 20,
};
export async function seedRisk(db: { query: (sql: string, args?: any[]) => Promise<any> }, over: Partial<typeof defaultRisk> = {}) {
  const r = await db.query('select public.trade_risk_settings_save($1,$2) s', ['focoos-admin', { ...defaultRisk, ...over }]);
  return r.rows[0].s;
}
