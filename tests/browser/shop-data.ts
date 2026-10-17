// Minimal synthetic data: protocol variants belong to unit and pipeline tests.
export const uid = '900719925474099312345';
export const orders = [
  {
    order_sn: '261017-synthetic-001',
    offset: 'synthetic-cursor-1',
    order_amount: 199,
    synthetic_number: JSON.rawJSON('9007199254740993'),
  },
];
export const detail = { orderSn: orders[0]!.order_sn, orderDescList: [] };
export type Scenario = 'complete' | 'cancel';
export interface ShopSnapshot {
  requests: { path: string; method: string; body: unknown }[];
  downloads: number;
  errors: string[];
}
export interface DownloadedFile {
  name: string;
  bytes: number[];
  text: string;
}
