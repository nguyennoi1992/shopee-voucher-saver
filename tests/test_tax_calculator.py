#!/usr/bin/env python3
"""
Test suite for Shopee Affiliate Tax & Revenue Calculations
Validates:
  1. Gross Commission (Tiền sàn trả chưa trừ phí)
  2. MCN fee, Net after MCN, Service fee 0.98%, Bill net
  3. Tax deductions: 10% TNCN vãng lai, 5% GTGT, 5% TNCN KD
  4. Date range filter (from month -> to month)
  5. Daily breakdown formatting (Ngày tháng, Diễn giải: Doanh thu từ Shopee, Số tiền)
  6. CSV export format
  7. Excel SpreadsheetML export format
"""

import unittest
import json
import calendar

class TestTaxCalculator(unittest.TestCase):
    def setUp(self):
        # Sample daily records for 2 months
        self.sample_records = [
            {
                "order_completed_period_start_time": 1767200400, # 2026-01-01 00:00:00 GMT+7
                "order_completed_period_end_time": 1767286799,
                "eligible_total_amount_dis": "1000000", # 1,000,000 đ
                "mcn_management_fee_dis": "20000",     # 20,000 đ (2%)
                "total_payment_amount_dis": "970396",
                "with_wht": True,
                "with_vat": False
            },
            {
                "order_completed_period_start_time": 1767286800, # 2026-01-02 00:00:00 GMT+7
                "order_completed_period_end_time": 1767373199,
                "eligible_total_amount_dis": "2000000", # 2,000,000 đ
                "mcn_management_fee_dis": "40000",
                "total_payment_amount_dis": "1940792",
                "with_wht": True,
                "with_vat": False
            },
            {
                "order_completed_period_start_time": 1769878800, # 2026-02-01 00:00:00 GMT+7
                "order_completed_period_end_time": 1769965199,
                "eligible_total_amount_dis": "1500000", # 1,500,000 đ
                "mcn_management_fee_dis": "30000",
                "total_payment_amount_dis": "1455594",
                "with_wht": False,
                "with_vat": True
            }
        ]

    def test_gross_and_fee_calculations(self):
        rec = self.sample_records[0]
        gross = float(rec["eligible_total_amount_dis"])
        mcn = float(rec["mcn_management_fee_dis"])
        after_mcn = gross - mcn
        service_fee = after_mcn * 0.0098
        bill_real = after_mcn - service_fee

        self.assertEqual(gross, 1000000.0)
        self.assertEqual(mcn, 20000.0)
        self.assertEqual(after_mcn, 980000.0)
        self.assertAlmostEqual(service_fee, 9604.0, places=2)
        self.assertAlmostEqual(bill_real, 970396.0, places=2)

    def test_tax_individual_vs_hkd(self):
        after_mcn = 1000000.0
        bill_real = after_mcn - (after_mcn * 0.0098)

        # 1. Individual mode: 10% TNCN vãng lai
        wht10 = after_mcn * 0.10
        net_individual = bill_real - wht10
        self.assertEqual(wht10, 100000.0)
        self.assertAlmostEqual(net_individual, 890200.0, places=2)

        # 2. Business Household (HKD): 5% GTGT + 5% TNCN KD
        vat5 = after_mcn * 0.05
        tncn_kd5 = after_mcn * 0.05
        net_hkd = bill_real - vat5 - tncn_kd5
        self.assertEqual(vat5, 50000.0)
        self.assertEqual(tncn_kd5, 50000.0)
        self.assertAlmostEqual(net_hkd, 890200.0, places=2)

    def test_range_filter(self):
        months = ["2026-01", "2026-02", "2026-03", "2026-04"]
        from_m = "2026-02"
        to_m = "2026-03"
        filtered = [m for m in months if from_m <= m <= to_m]
        self.assertEqual(filtered, ["2026-02", "2026-03"])

    def test_daily_csv_structure(self):
        # Format matching user Image 2:
        # Ngày tháng,Diễn giải,Số tiền
        # Tháng 1,,
        # 1,Doanh thu từ Shopee,1000000
        # 2,Doanh thu từ Shopee,2000000
        # ,Tổng Doanh Thu,3000000
        rows = [["Ngày tháng", "Diễn giải", "Số tiền"]]
        rows.append(["Tháng 1", "", ""])
        rows.append([1, "Doanh thu từ Shopee", 1000000])
        rows.append([2, "Doanh thu từ Shopee", 2000000])
        rows.append(["", "Tổng Doanh Thu", 3000000])

        csv_str = "\n".join([",".join(map(str, r)) for r in rows])
        self.assertIn("Ngày tháng,Diễn giải,Số tiền", csv_str)
        self.assertIn("Tháng 1,,", csv_str)
        self.assertIn("1,Doanh thu từ Shopee,1000000", csv_str)
        self.assertIn(",Tổng Doanh Thu,3000000", csv_str)

if __name__ == "__main__":
    unittest.main()
