import { expect, it } from 'vitest';
import { writeCsv } from '../src/export/csv';
import { exportFile, toCsv, toJson } from '../src/export/serialize';
import { result } from './fixtures';

it('quotes commas, quotes and CR/LF according to CSV rules', () => {
  const value = result();
  value.entries[0]!.order.mall = { mall_name: 'synthetic,"quoted"\r\nnext' };
  expect(toCsv(value)).toContain('"synthetic,""quoted""\r\nnext"');
});

it.each([
  '=1+1',
  '+SUM(A1)',
  '-1+1',
  '@SUM(A1)',
  '  =1+1',
  '\tvalue',
  '\rvalue',
])('neutralizes dangerous spreadsheet cells %j', (value) => {
  const data = result();
  data.entries[0]!.order.mall = { mall_name: value };
  expect(toCsv(data)).toContain(`"'${value}"`);
});

it('exports stable columns even for an empty selection and preserves long IDs as text', () => {
  const value = result();
  value.entries[0]!.order.order_sn = '261017-1234567890123456789';
  value.entries[0]!.order.order_amount = 0;
  const csv = toCsv(value);
  expect(csv.startsWith('\ufeff"订单编号"')).toBe(true);
  expect(csv).toContain('"\'261017-1234567890123456789"');
  expect(csv).toContain('"0.00"');
  value.entries = [];
  expect(toCsv(value)).toContain('订单金额（元）');
});

it('leaves unsafe amounts blank in CSV and keeps their original value in JSON', () => {
  const value = result();
  value.entries[0]!.order.order_amount = '9007199254740993';
  value.entries[0]!.detail = {
    orderDescList: [{ key: '快递单号', value: '9007199254740993' }],
  };
  expect(toCsv(value)).not.toContain('90071992547409.93');
  expect(toCsv(value)).toContain('"\'9007199254740993"');
  expect(JSON.parse(toJson(value)).entries[0].order.order_amount).toBe(
    '9007199254740993',
  );
  value.entries[0]!.order.order_amount = '1.99e2';
  expect(toCsv(value)).toContain('"1.99"');
});

it('writes a complete fixed string table with BOM, CRLF and escaped cells', () => {
  expect(
    writeCsv([
      ['A', 'B', 'C', 'D'],
      ['', 'a,b', 'say "hello"', 'line1\r\nline2'],
    ]),
  ).toBe(
    '\ufeff"A","B","C","D"\r\n"","a,b","say ""hello""","line1\r\nline2"\r\n',
  );
});

it('retains raw fields and task completeness in JSON and marks partial filenames', () => {
  const value = result();
  value.complete = false;
  value.reason = 'limit';
  value.entries[0]!.order.unknown = { nested: ['synthetic', 1] };
  expect(JSON.parse(toJson(value))).toEqual(value);
  expect(toCsv(value)).toContain('不完整');
  expect(exportFile(value, 'json').name).toContain('_不完整.json');
  expect(exportFile(value, 'csv').blob.type).toBe('text/csv;charset=utf-8');
});

it('exports the full ordered schema without mutating raw values or losing first detail fields', () => {
  const value = result();
  value.entries = [
    {
      order: {
        order_sn: '261017-synthetic',
        mall: { mall_name: '合成店铺' },
        order_goods: [
          null,
          {
            goods_name: '合成商品',
            spec: '规格',
            goods_number: 2,
            goods_price: 199,
          },
        ],
        order_status_prompt: '已完成',
        order_amount: 398,
      },
      detail: {
        orderDescList: [
          { key: ' 支付方式： ', value: '合成支付' },
          { key: '支付方式', value: '重复字段' },
          { key: '下单时间:', value: '2026-10-17 12:00:00' },
          { key: '物流公司', value: '合成物流' },
          { key: '快递单号：', value: '001234567890123456789' },
        ],
      },
      detailStatus: 'ok',
    },
  ];
  const before = structuredClone(value);
  expect(toCsv(value)).toBe(
    '\ufeff"订单编号","估算日期（订单号）","店铺","商品","订单状态","订单金额（元）","支付方式","下单时间","物流公司","快递单号","详情状态","结果完整性"\r\n' +
      '"\'261017-synthetic","2026-10-17","合成店铺","合成商品 / 规格 ×2 ￥1.99","已完成","3.98","合成支付","2026-10-17 12:00:00","合成物流","\'001234567890123456789","已获取","列表遍历结束"\r\n',
  );
  expect(value).toEqual(before);
  expect(JSON.parse(toJson(value))).toEqual(before);
});
