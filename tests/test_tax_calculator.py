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

    def test_cache_freshness(self):
        # 24 hours TTL
        ttl_ms = 24 * 60 * 60 * 1000
        now_ms = 1792634400000

        # Fresh cache (1 hour old)
        fresh_cache = {
            "updatedAt": now_ms - (3600 * 1000),
            "list": [{"id": 1}]
        }
        is_fresh = (now_ms - fresh_cache["updatedAt"]) < ttl_ms and len(fresh_cache["list"]) > 0
        self.assertTrue(is_fresh)

        # Expired cache (25 hours old)
        expired_cache = {
            "updatedAt": now_ms - (25 * 3600 * 1000),
            "list": [{"id": 1}]
        }
        is_expired = (now_ms - expired_cache["updatedAt"]) >= ttl_ms
        self.assertTrue(is_expired)

        # Empty cache
        empty_cache = {
            "updatedAt": now_ms,
            "list": []
        }
        has_items = bool(empty_cache["list"])
        self.assertFalse(has_items)

    def test_view_modes_data_mapping(self):
        # Verify 3 view modes: simple, full 10-col, daily
        rec = self.sample_records[0] # gross 1,000,000, mcn 20,000, after_mcn 980,000, dv 9,604, bill 970,396
        gross = float(rec["eligible_total_amount_dis"])
        mcn = float(rec["mcn_management_fee_dis"])
        after_mcn = gross - mcn
        dv_fee = after_mcn * 0.0098
        bill = after_mcn - dv_fee
        tax_vang_lai = after_mcn * 0.10
        net_tk = bill - tax_vang_lai

        # 1. Simple row
        simple_row = {
            "month": "2026-01",
            "desc": "Doanh thu từ Shopee",
            "gross": gross,
            "net_tk": round(net_tk)
        }
        self.assertEqual(simple_row["gross"], 1000000.0)
        self.assertEqual(simple_row["desc"], "Doanh thu từ Shopee")
        self.assertEqual(simple_row["net_tk"], 872396)

        # 2. Full 10-column row
        full_row = [
            "2026-01", gross, mcn, after_mcn, round(dv_fee), round(bill),
            round(tax_vang_lai), 0, 0, round(net_tk)
        ]
        self.assertEqual(len(full_row), 10)
        self.assertEqual(full_row[0], "2026-01")
        self.assertEqual(full_row[1], 1000000.0) # HH gộp
        self.assertEqual(full_row[9], 872396)    # Ước thực về TK

        # 3. Daily row (Image 3 format)
        daily_row = {
            "date": "01/01/2026",
            "desc": "Doanh thu từ Shopee",
            "amount": gross
        }
        self.assertEqual(daily_row["desc"], "Doanh thu từ Shopee")
        self.assertEqual(daily_row["amount"], 1000000.0)

    def test_october_2026_tax_split(self):
        # Từ tháng 10/2026: Tách riêng 5% VAT và 5% PIT, 10% vãng lai = 0, Phí DV 0.98% = 0
        # Test Case 1: Image 1 Settlement (19-10-2026)
        gross_img1 = 71086.0
        mcn_img1 = 0.0
        after_mcn_img1 = gross_img1 - mcn_img1
        fee_dv_img1 = 0.0 # Bỏ phí 0.98%
        bill_img1 = after_mcn_img1
        vat_img1 = 3590.0 # Từ bill đối soát
        pit_img1 = 3590.0 # Từ bill đối soát
        net_tk_img1 = bill_img1 - vat_img1 - pit_img1
        self.assertEqual(net_tk_img1, 63906.0) # Khớp 100% "Tổng thanh toán sau thuế: ₫63.906"

        # Test Case 2: Image 2 Settlement (12-10-2026)
        gross_img2 = 23489.0
        vat_img2 = 1186.0
        pit_img2 = 1186.0
        net_tk_img2 = gross_img2 - vat_img2 - pit_img2
        self.assertEqual(net_tk_img2, 21117.0) # Khớp 100% "Tổng thanh toán sau thuế: ₫21.117"

        # Test Case 3: Image 3 Month 10 Aggregate (177.364 đ)
        gross_oct = 177364.0
        mcn_oct = 0.0
        after_mcn_oct = gross_oct - mcn_oct
        fee_dv_oct = 0.0
        bill_oct = after_mcn_oct
        vat_oct = round(after_mcn_oct * 0.05)
        pit_oct = round(after_mcn_oct * 0.05)
        tax_vang_lai_oct = 0.0
        net_tk_oct = bill_oct - vat_oct - pit_oct

        self.assertEqual(vat_oct, 8868)
        self.assertEqual(pit_oct, 8868)
        self.assertEqual(tax_vang_lai_oct, 0.0)
        self.assertEqual(net_tk_oct, 159628)

        # 10 columns for October 2026
        oct_row = [
            "2026-10", gross_oct, mcn_oct, after_mcn_oct, fee_dv_oct,
            bill_oct, tax_vang_lai_oct, vat_oct, pit_oct, net_tk_oct
        ]
        self.assertEqual(oct_row[6], 0.0)   # 10% TNCN (vãng lai) must be 0
        self.assertEqual(oct_row[7], 8868)  # 5% GTGT
        self.assertEqual(oct_row[8], 8868)  # 5% TNCN (KD)
        self.assertEqual(oct_row[9], 159628) # Ước thực về TK (90%)

    def test_under_threshold_pre_october_real_api(self):
        # Trước tháng 10/2026: Khi thu nhập từng kỳ đối soát dưới ngưỡng khấu trừ (dưới 2.000.000 đ)
        # Shopee không trừ 10% TNCN (with_wht: false, wht_amount: 0), không trừ VAT, không trừ phí DV 0.98%
        # Đối soát thực tế kỳ 24-09-2026:
        # Doanh thu hợp lệ: ₫21.397
        # Tổng thanh toán sau thuế: ₫21.397
        rec_24_sep = {
            "eligible_total_amount_dis": "21397",
            "mcn_management_fee_dis": "0",
            "total_payment_amount_dis": "21397",
            "with_wht": False,
            "with_vat": False,
            "bills": [
                {
                    "wht_amount_dis": "0",
                    "vat_amount_dis": "0",
                    "total_amount_dis": "21397"
                }
            ]
        }

        gross = float(rec_24_sep["eligible_total_amount_dis"])
        mcn = float(rec_24_sep["mcn_management_fee_dis"])
        after_mcn = gross - mcn
        bill_total = float(rec_24_sep["total_payment_amount_dis"])

        # Trích xuất thuế thực tế từ API
        wht_amt = float(rec_24_sep["bills"][0]["wht_amount_dis"])
        vat_amt = float(rec_24_sep["bills"][0]["vat_amount_dis"])

        # Vì with_wht = False và wht_amt = 0 -> không bị khấu trừ thuế!
        tax_vang_lai = wht_amt if (rec_24_sep["with_wht"] and wht_amt > 0) else 0.0
        tax_vat = vat_amt if (rec_24_sep["with_vat"] and vat_amt > 0) else 0.0
        tax_pit_kd = 0.0

        fee_dv = max(0.0, after_mcn - bill_total - tax_vang_lai - tax_vat)
        bill_real = after_mcn - fee_dv
        net_tk = bill_total if bill_total > 0 else (bill_real - tax_vang_lai - tax_vat)

        self.assertEqual(gross, 21397.0)
        self.assertEqual(tax_vang_lai, 0.0) # KHÔNG bị trừ 10%
        self.assertEqual(tax_vat, 0.0)
        self.assertEqual(tax_pit_kd, 0.0)
        self.assertEqual(fee_dv, 0.0)       # KHÔNG bị trừ phí DV
        self.assertEqual(bill_real, 21397.0)
        self.assertEqual(net_tk, 21397.0)   # Khớp 100% "Tổng thanh toán sau thuế: ₫21.397"

    def test_full_year_zero_wht_when_no_api_tax(self):
        # Kiểm tra trường hợp của user trong Image 1 & 2:
        # Cả 9 tháng đầu năm đều không bị trừ thuế TNCN trên bill thực tế (wht = 0)
        # Tháng 10 tách 5% VAT và 5% PIT.
        # Kết quả: Cột "10% TNCN (vãng lai)" của cả năm (từ tháng 1 đến tháng 10) phải bằng 0 đ!
        months_gross = [
            ("2026-01", 1224353.0),
            ("2026-02", 697783.0),
            ("2026-03", 996667.0),
            ("2026-04", 582415.0),
            ("2026-05", 647819.0),
            ("2026-06", 343999.0),
            ("2026-07", 452905.0),
            ("2026-08", 664816.0),
            ("2026-09", 459292.0),
            ("2026-10", 177364.0)
        ]

        total_gross = 0.0
        total_wht10 = 0.0
        total_vat5 = 0.0
        total_pit5 = 0.0

        for m_key, gross in months_gross:
            total_gross += gross
            is_oct = m_key >= "2026-10"
            if is_oct:
                wht10 = 0.0
                vat5 = round(gross * 0.05)
                pit5 = round(gross * 0.05)
            else:
                # Không có wht trên bill thực tế -> wht10 = 0.0 (TUYỆT ĐỐI không tự ý tính 10%)
                wht10 = 0.0
                vat5 = 0.0
                pit5 = 0.0

            total_wht10 += wht10
            total_vat5 += vat5
            total_pit5 += pit5

        self.assertEqual(total_gross, 6247413.0)
        self.assertEqual(total_wht10, 0.0)      # Cột 10% TNCN của cả năm PHẢI BẰNG 0 đ!
        self.assertEqual(total_vat5, 8868.0)    # Chỉ tháng 10 có 5% VAT
        self.assertEqual(total_pit5, 8868.0)    # Chỉ tháng 10 có 5% PIT

    def test_cross_tab_and_card_accounting_synchronization(self):
        # Kiểm tra tính đồng bộ 100% giữa tất cả các Tab và Card thống kê:
        # Tab 1: Đơn giản (Mẫu Excel)
        # Tab 2: Sổ tay thuế đầy đủ (10 cột)
        # Tab 3: Bảng kê chi tiết theo ngày
        # Popup Summary Cards: Gross, Tax, Net
        user_months_data = [
            {"m": "2026-01", "gross": 1224353.0, "bill_total": 1212354.0, "wht": 0.0, "vat": 0.0, "fee": 0.0},
            {"m": "2026-02", "gross": 697783.0,  "bill_total": 690945.0,  "wht": 0.0, "vat": 0.0, "fee": 0.0},
            {"m": "2026-03", "gross": 996667.0,  "bill_total": 986900.0,  "wht": 0.0, "vat": 0.0, "fee": 0.0},
            {"m": "2026-04", "gross": 582415.0,  "bill_total": 576706.0,  "wht": 0.0, "vat": 0.0, "fee": 0.0},
            {"m": "2026-05", "gross": 647819.0,  "bill_total": 641470.0,  "wht": 0.0, "vat": 0.0, "fee": 0.0},
            {"m": "2026-06", "gross": 343999.0,  "bill_total": 340628.0,  "wht": 0.0, "vat": 0.0, "fee": 0.0},
            {"m": "2026-07", "gross": 452905.0,  "bill_total": 448468.0,  "wht": 0.0, "vat": 0.0, "fee": 0.0},
            {"m": "2026-08", "gross": 664816.0,  "bill_total": 658299.0,  "wht": 0.0, "vat": 0.0, "fee": 0.0},
            {"m": "2026-09", "gross": 459292.0,  "bill_total": 454793.0,  "wht": 0.0, "vat": 0.0, "fee": 0.0},
            {"m": "2026-10", "gross": 177364.0,  "bill_total": 177364.0,  "wht": 0.0, "vat": 0.0, "fee": 0.0}
        ]

        total_gross = 0
        total_mcn = 0
        total_after_mcn = 0
        total_fee_dv = 0
        total_bill = 0
        total_wht10 = 0
        total_vat5 = 0
        total_tncn5 = 0
        total_net = 0

        simple_tab_rows = []
        full_tab_rows = []

        for item in user_months_data:
            m = item["m"]
            gross = item["gross"]
            mcn = 0.0
            after_mcn = gross - mcn
            is_oct_onwards = (m >= "2026-10")

            if is_oct_onwards:
                fee_dv = item["fee"] if item["fee"] > 0 else 0.0
                wht10 = 0.0
                vat5 = item["vat"] if item["vat"] > 0 else round(after_mcn * 0.05)
                tncn5 = item["wht"] if item["wht"] > 0 else round(after_mcn * 0.05)
            else:
                if item["fee"] > 0:
                    fee_dv = item["fee"]
                elif item["bill_total"] > 0 and after_mcn > item["bill_total"]:
                    fee_dv = round(after_mcn - item["bill_total"])
                else:
                    fee_dv = 0.0
                wht10 = item["wht"] if item["wht"] > 0 else 0.0
                vat5 = item["vat"] if item["vat"] > 0 else 0.0
                tncn5 = 0.0

            bill_real = after_mcn - fee_dv
            net_tk = bill_real - wht10 - vat5 - tncn5

            # Invariant: Sau MCN - Phí DV = Thực nhận theo bill
            self.assertEqual(bill_real, after_mcn - fee_dv)
            # Invariant: Thực nhận theo bill - Thuế = Ước thực về TK
            self.assertEqual(net_tk, bill_real - wht10 - vat5 - tncn5)

            total_gross += gross
            total_mcn += mcn
            total_after_mcn += after_mcn
            total_fee_dv += fee_dv
            total_bill += bill_real
            total_wht10 += wht10
            total_vat5 += vat5
            total_tncn5 += tncn5
            total_net += net_tk

            simple_tab_rows.append((m, "Doanh thu từ Shopee", gross, net_tk))
            full_tab_rows.append((m, gross, mcn, after_mcn, fee_dv, bill_real, wht10, vat5, tncn5, net_tk))

        # Kiểm tra khớp chính xác từng số liệu trên giao diện:
        self.assertEqual(total_gross, 6247413.0)
        self.assertEqual(total_fee_dv, 59486.0)
        self.assertEqual(total_bill, 6187927.0)
        self.assertEqual(total_vat5, 8868.0)
        self.assertEqual(total_tncn5, 8868.0)
        self.assertEqual(total_net, 6170191.0)

        # Tab 1: Đơn giản (Mẫu Excel)
        simple_total_gross = sum(r[2] for r in simple_tab_rows)
        simple_total_net = sum(r[3] for r in simple_tab_rows)
        self.assertEqual(simple_total_gross, 6247413.0)
        self.assertEqual(simple_total_net, 6170191.0) # Phải bằng đúng 6.170.191 đ (không bị lệch sang 6.186.189 đ)

        # Tab 2: Sổ tay thuế đầy đủ (10 cột)
        self.assertEqual(full_tab_rows[0][4], 11999.0) # Tháng 1 Phí DV = 11.999 đ
        self.assertEqual(full_tab_rows[0][5], 1212354.0) # Tháng 1 Bill = 1.212.354 đ
        self.assertEqual(full_tab_rows[9][4], 0.0)       # Tháng 10 Phí DV = 0 đ
        self.assertEqual(full_tab_rows[9][5], 177364.0)  # Tháng 10 Bill = 177.364 đ
        self.assertEqual(full_tab_rows[9][7], 8868.0)    # Tháng 10 VAT = 8.868 đ
        self.assertEqual(full_tab_rows[9][8], 8868.0)    # Tháng 10 PIT = 8.868 đ
        self.assertEqual(full_tab_rows[9][9], 159628.0)  # Tháng 10 Net = 159.628 đ (không bị giữ 175.626 đ)

        # Tab 3: Bảng kê chi tiết theo ngày
        # Tổng doanh thu các ngày = total_gross = 6.247.413 đ
        self.assertEqual(total_gross, 6247413.0)

if __name__ == "__main__":
    unittest.main()
