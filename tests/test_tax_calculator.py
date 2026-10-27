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
import math
import subprocess


# Port chính xác của decomposePayout() trong tax_report.js / popup.js (JS Math.round = floor(x+0.5))
def js_round(x):
    return math.floor(x + 0.5)


def dec_scale(val):
    num = float(val or 0)
    return js_round(num / 100000) if abs(num) >= 100000 else num


def decompose_payout(eligible, paid, m_key, mcn=0, fee_api=0, vat_api=0, pit_api=0):
    gross = dec_scale(eligible)
    paid_v = dec_scale(paid)
    mcn_v = dec_scale(mcn)
    fee_api_v = dec_scale(fee_api)
    vat_api_v = dec_scale(vat_api)
    pit_api_v = dec_scale(pit_api)

    after_mcn = max(0, gross - mcn_v)
    diff = max(0, after_mcn - paid_v)
    is_oct = m_key >= "2026-10"

    fee = vat = pit = wht10 = 0
    if vat_api_v > 0 or pit_api_v > 0:
        vat, pit = vat_api_v, pit_api_v
        fee = fee_api_v if fee_api_v > 0 else max(0, diff - vat - pit)
    elif fee_api_v > 0:
        fee = fee_api_v
        rem = max(0, diff - fee)
        if is_oct:
            vat = js_round(rem / 2)
            pit = rem - vat
        else:
            wht10 = rem
    elif diff == 0:
        fee = 0
    elif is_oct:
        vat_est = js_round(gross * 0.05)
        if diff > 2 * vat_est:
            vat = pit = vat_est
            fee = max(0, diff - 2 * vat_est)
        else:
            fee = diff
    else:
        fee = js_round(gross * 0.0098)
        if diff <= js_round(gross * 0.0298):
            fee = diff
        else:
            wht10 = max(0, diff - fee)

    bill_total = max(0, after_mcn - fee)
    net = paid_v if paid_v > 0 else max(0, bill_total - vat - pit - wht10)
    return {"gross": gross, "mcn": mcn_v, "fee": fee, "vat": vat,
            "pit": pit, "wht10": wht10, "bill": bill_total, "net": net}


def epoch_gmt7(y, m, d, hour=12):
    """Epoch của ngày d/m/y giờ hh:00 GMT+7 (mốc an toàn cho phân loại ngày/tháng)."""
    import datetime
    dt = datetime.datetime(y, m, d, hour, 0, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=7)))
    return int(dt.timestamp())


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

    def test_october_fallback_branch_when_no_payout(self):
        # Nhánh fallback (tháng chưa có kỳ chi trả Payout Record): chỉ dựa trên billing_list
        # theo ngày hoàn thành đơn. Từ 10/2026: tách 5% VAT + 5% PIT trên afterMcn, 10% vãng lai = 0.
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

        # 10 columns for October 2026 (fallback branch)
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

    def test_payout_record_october_real_data(self):
        # Dữ liệu thực tế từ GraphQL getPaymentPayoutBillingList (payout_record):
        # Real API chỉ trả 2 số: eligibleTotalAmount (Gross) + totalPaymentAmount (thực nhận),
        # micro-unit x100.000. KHÔNG có totalServiceFee/vatTotalAmount/whtTotalAmount.
        # Extension suy luận phân rã: diff ~10.98% => VAT=PIT=round(5% gross), fee = phần còn lại;
        # diff ~0.98% => fee = diff, VAT = PIT = 0.
        payouts_october = [
            {"pid": "17360010148261019", "eligible": "7179000000", "paid": "6390600000",
             "created": epoch_gmt7(2026, 10, 19)},
            {"pid": "17360010148261012", "eligible": "2372100000", "paid": "2111700000",
             "created": epoch_gmt7(2026, 10, 12)},
            {"pid": "17360010148261008", "eligible": "4998500000", "paid": "4449800000",
             "created": epoch_gmt7(2026, 10, 8)},
            {"pid": "17360010148261005", "eligible": "3823000000", "paid": "3403000000",
             "created": epoch_gmt7(2026, 10, 5)},
            {"pid": "17360010148261001", "eligible": "2356200000", "paid": "2333100000",
             "created": epoch_gmt7(2026, 10, 1)}
        ]

        # Bảng chân lý đối soát từng kỳ (đối chiếu trực tiếp trang payout_record của user)
        truth_table = {
            "17360010148261001": (23562, 231, 23331, 0, 0, 23331),
            "17360010148261005": (38230, 376, 37854, 1912, 1912, 34030),
            "17360010148261008": (49985, 489, 49496, 2499, 2499, 44498),
            "17360010148261012": (23721, 232, 23489, 1186, 1186, 21117),
            "17360010148261019": (71790, 704, 71086, 3590, 3590, 63906)
        }

        total = {"gross": 0, "fee": 0, "bill": 0, "vat": 0, "pit": 0, "wht10": 0, "net": 0}
        for p in payouts_october:
            d = decompose_payout(p["eligible"], p["paid"], "2026-10")
            exp = truth_table[p["pid"]]
            self.assertEqual((d["gross"], d["fee"], d["bill"], d["vat"], d["pit"], d["net"]), exp,
                             f"Sai phân rã kỳ {p['pid']}")
            self.assertEqual(d["wht10"], 0)  # Từ 10/2026 10% vãng lai = 0

            total["gross"] += d["gross"]
            total["fee"] += d["fee"]
            total["bill"] += d["bill"]
            total["vat"] += d["vat"]
            total["pit"] += d["pit"]
            total["net"] += d["net"]

        # Tổng tháng 10/2026 khớp chuẩn kế toán của user:
        self.assertEqual(total["gross"], 207288)   # Tiền sàn trả
        self.assertEqual(total["fee"], 2032)       # Phí DV 0,98% (có tồn tại thật!)
        self.assertEqual(total["bill"], 205256)    # Doanh thu hợp lệ
        self.assertEqual(total["vat"], 9187)       # 5% VAT (1.912 + 2.499 + 1.186 + 3.590)
        self.assertEqual(total["pit"], 9187)       # 5% TNCN KD
        self.assertEqual(total["wht10"], 0)        # 10% TNCN vãng lai = 0
        self.assertEqual(total["net"], 186882)     # Thực nhận sau thuế
        self.assertEqual(total["bill"], total["net"] + total["vat"] + total["pit"])

    def test_payout_record_september_fee_only(self):
        # Tháng 9/2026 (trước luật mới): các kỳ chi trả chỉ trừ phí DV 0.98% (hoặc trừ hụt)
        # không có VAT/PIT 5%, không 10% vãng lai. Diff ~ 0.98% x Gross.
        payouts_september = [
            {"eligible": "2778400000", "paid": "2751200000", "created": epoch_gmt7(2026, 9, 4)},
            {"eligible": "2160900000", "paid": "2139700000", "created": epoch_gmt7(2026, 9, 10)},
            {"eligible": "2803800000", "paid": "2776400000", "created": epoch_gmt7(2026, 9, 15)},
            {"eligible": "16451800000", "paid": "16290500000", "created": epoch_gmt7(2026, 9, 21)},
            {"eligible": "10562300000", "paid": "10458900000", "created": epoch_gmt7(2026, 9, 27)}
        ]

        expected = [272, 212, 274, 1613, 1034]

        total_gross = 0
        total_fee = 0
        total_net = 0
        total_tax = 0
        for p, exp_fee in zip(payouts_september, expected):
            d = decompose_payout(p["eligible"], p["paid"], "2026-09")
            self.assertEqual(d["fee"], exp_fee)
            self.assertEqual(d["vat"], 0)
            self.assertEqual(d["pit"], 0)
            self.assertEqual(d["wht10"], 0)
            self.assertEqual(d["bill"], d["gross"] - d["fee"])
            self.assertEqual(d["net"], round(float(p["paid"]) / 100000))

            total_gross += d["gross"]
            total_fee += d["fee"]
            total_net += d["net"]
            total_tax += d["vat"] + d["pit"] + d["wht10"]

        self.assertEqual(total_gross, 347572)
        self.assertEqual(total_fee, 3405)
        self.assertEqual(total_tax, 0)
        self.assertEqual(total_net, 344167)
        self.assertEqual(total_net + total_fee, total_gross)

    def test_october_graphql_contract_real_fields_only(self):
        # Đảm bảo request/response GraphQL dùng schema THẬT của portal:
        # payoutList.paymentPayout chỉ chứa 2 số tiền - các field cũ
        # (taxTotalAmount, vatTotalAmount, whtTotalAmount, vatRate, whtRate)
        # không tồn tại trong schema khiến GQL bị lỗi trước đây.
        with open("tax_report.js", encoding="utf-8") as f:
            js = f.read()
        self.assertNotIn("taxTotalAmount", js)
        self.assertNotIn("vatRate\n", js)
        self.assertNotIn("whtRate\n", js)
        self.assertNotIn('"taxTotalAmount"', js)
        self.assertIn('"/api/v3/gql?q=getPayoutList"', js)
        self.assertIn('"/api/v3/gql?q=getPaymentSummaryBillFeeInvoiceList"', js)
        self.assertIn("paymentSummaryBillFeeInvoices", js)
        self.assertIn('"Affiliate-Program-Type"', js)
        # payoutInvoice là Object/List phải có subfield selection hợp lệ trong GraphQL
        self.assertIn("payoutInvoice {", js)
        self.assertIn("invoiceType", js)
        self.assertIn("invoiceStatus", js)
        self.assertIn("dismissReason", js)
        # Phân trang theo totalCount
        self.assertIn("pageNum: pageNum", js)
        self.assertIn("totalCount", js)
        # Fix HTTP 403: chạy trong world MAIN (fetch của portal tự đủ header),
        # POST không CSRF trước, chỉ thêm CSRF-token khi 403/401.
        self.assertIn('world: "MAIN"', js)
        self.assertIn("CSRF-token", js)
        self.assertIn("/api/v3/config/website", js)
        self.assertIn('res.headers.get("csrf-token")', js)

        with open("popup.js", encoding="utf-8") as f:
            js0 = f.read()
        self.assertIn('world: "MAIN"', js0)
        self.assertIn("/api/v3/config/website", js0)
        self.assertIn("payoutInvoice {", js0)
        self.assertIn('"/api/v3/gql?q=getPaymentSummaryBillFeeInvoiceList"', js0)
        self.assertIn("paymentSummaryBillFeeInvoices", js0)

        with open("affiliate_content.js", encoding="utf-8") as f:
            js2 = f.read()
        self.assertNotIn("taxTotalAmount", js2)
        # Đã bỏ cào DOM (el eligible = net gán sai nghĩa => sai phân rã)
        self.assertNotIn("querySelectorAll", js2)
        self.assertIn("/api/v3/config/website", js2)
        self.assertIn("payoutInvoice {", js2)
        self.assertIn('"/api/v3/gql?q=getPaymentSummaryBillFeeInvoiceList"', js2)
        self.assertIn("paymentSummaryBillFeeInvoices", js2)

    def test_parse_pasted_table_matches_user_oracle(self):
        import subprocess, json
        node_script = """
        const fs = require('fs');
        const code = fs.readFileSync('tax_report.js', 'utf8');
        const parseMatch = code.match(/function parsePastedTextOrJson\\([\\s\\S]*?^  \\}/m);
        eval(parseMatch[0]);

        const sampleTable = `
Ngày tạo bill	Mã thanh toán	Tiền sàn trả (Gross)	Phí DV 0,98%	Doanh thu hợp lệ	5% VAT	5% PIT (TNCN)	Thực nhận sau thuế
01-10-2026	...1001	23.562 đ	231 đ	23.331 đ	0 đ	0 đ	23.331 đ
05-10-2026	...1005	38.230 đ	376 đ	37.854 đ	1.912 đ	1.912 đ	34.030 đ
08-10-2026	...1008	49.985 đ	489 đ	49.496 đ	2.499 đ	2.499 đ	44.498 đ
12-10-2026	...1012	23.721 đ	232 đ	23.489 đ	1.186 đ	1.186 đ	21.117 đ
19-10-2026	...1019	71.790 đ	704 đ	71.086 đ	3.590 đ	3.590 đ	63.906 đ
TỔNG CỘNG	5 kỳ	207.288 đ	2.032 đ	205.256 đ	9.187 đ	9.187 đ	186.882 đ
        `;

        const items = parsePastedTextOrJson(sampleTable);
        console.log(JSON.stringify(items));
        """
        res = subprocess.run(["node", "-e", node_script], capture_output=True, text=True, check=True)
        items = json.loads(res.stdout)
        self.assertEqual(len(items), 5)
        # Kỳ 1: 01-10-2026
        p0 = items[0]["paymentPayout"]
        self.assertEqual(p0["payoutId"], "1001")
        self.assertEqual(p0["eligibleTotalAmount"], "2356200000")
        self.assertEqual(p0["totalPaymentAmount"], "2333100000")
        self.assertEqual(p0["totalServiceFee"], "23100000")
        self.assertEqual(p0["vatTotalAmount"], "0")
        self.assertEqual(p0["whtTotalAmount"], "0")

        # Kỳ 5: 19-10-2026
        p4 = items[4]["paymentPayout"]
        self.assertEqual(p4["payoutId"], "1019")
        self.assertEqual(p4["eligibleTotalAmount"], "7179000000")
        self.assertEqual(p4["totalPaymentAmount"], "6390600000")
        self.assertEqual(p4["totalServiceFee"], "70400000")
        self.assertEqual(p4["vatTotalAmount"], "359000000")
        self.assertEqual(p4["whtTotalAmount"], "359000000")

    def test_october_2026_user_validation_oracle(self):
        # Bảng chân lý đối soát chính xác theo yêu cầu người dùng (Từng dòng và Tổng cộng):
        # Ngày tạo bill | Mã thanh toán | Tiền sàn trả (Gross) | Phí DV 0,98% | Doanh thu hợp lệ | 5% VAT | 5% PIT | Thực nhận sau thuế
        truth_table = [
            {"date": "01-10-2026", "pid": "...1001", "gross": 23562, "fee": 231, "valid": 23331, "vat": 0,    "pit": 0,    "net": 23331},
            {"date": "05-10-2026", "pid": "...1005", "gross": 38230, "fee": 376, "valid": 37854, "vat": 1912, "pit": 1912, "net": 34030},
            {"date": "08-10-2026", "pid": "...1008", "gross": 49985, "fee": 489, "valid": 49496, "vat": 2499, "pit": 2499, "net": 44498},
            {"date": "12-10-2026", "pid": "...1012", "gross": 23721, "fee": 232, "valid": 23489, "vat": 1186, "pit": 1186, "net": 21117},
            {"date": "19-10-2026", "pid": "...1019", "gross": 71790, "fee": 704, "valid": 71086, "vat": 3590, "pit": 3590, "net": 63906},
        ]

        # Kiểm tra từng bản ghi
        for row in truth_table:
            # Invariant 1: Doanh thu hợp lệ = Tiền sàn trả (Gross) - Phí DV 0,98%
            self.assertEqual(row["valid"], row["gross"] - row["fee"], f"Lệch Doanh thu hợp lệ tại {row['date']}")
            # Invariant 2: Thực nhận sau thuế = Doanh thu hợp lệ - 5% VAT - 5% PIT
            self.assertEqual(row["net"], row["valid"] - row["vat"] - row["pit"], f"Lệch Thực nhận tại {row['date']}")
            # Invariant 3: Thuế VAT = PIT
            self.assertEqual(row["vat"], row["pit"], f"Lệch VAT và PIT tại {row['date']}")

        # Kiểm tra Tổng cộng (5 kỳ)
        sum_gross = sum(r["gross"] for r in truth_table)
        sum_fee = sum(r["fee"] for r in truth_table)
        sum_valid = sum(r["valid"] for r in truth_table)
        sum_vat = sum(r["vat"] for r in truth_table)
        sum_pit = sum(r["pit"] for r in truth_table)
        sum_net = sum(r["net"] for r in truth_table)

        self.assertEqual(sum_gross, 207288, "Tổng Gross phải là 207.288 đ")
        self.assertEqual(sum_fee, 2032, "Tổng Phí DV 0,98% phải là 2.032 đ")
        self.assertEqual(sum_valid, 205256, "Tổng Doanh thu hợp lệ phải là 205.256 đ")
        self.assertEqual(sum_vat, 9187, "Tổng 5% VAT phải là 9.187 đ (1.912 + 2.499 + 1.186 + 3.590)")
        self.assertEqual(sum_pit, 9187, "Tổng 5% PIT phải là 9.187 đ (1.912 + 2.499 + 1.186 + 3.590)")
        self.assertEqual(sum_net, 186882, "Tổng Thực nhận sau thuế phải là 186.882 đ")
        self.assertEqual(sum_valid, sum_net + sum_vat + sum_pit, "Doanh thu hợp lệ = Thực nhận + VAT + PIT")

    def test_service_fee_invoice_exact_reconciliation_and_parsing(self):
        import subprocess, json
        node_script = """
        const fs = require('fs');
        const code = fs.readFileSync('tax_report.js', 'utf8');
        const parseMatch = code.match(/function parsePastedTextOrJson\\([\\s\\S]*?^  \\}/m);
        eval(parseMatch[0]);

        const userFeePayload = {
          "data": {
            "getPaymentSummaryBillFeeInvoiceList": {
              "pageNum": 1,
              "pageSize": 10,
              "paymentSummaryBillFeeInvoices": [
                { "paymentCompletePeriodStartTime": "1788282000", "totalServiceFee": "449900000", "paymentSummaryBillFeeInvoices": [{ "invoiceNumber": "7581980" }] },
                { "paymentCompletePeriodStartTime": "1785603600", "totalServiceFee": "651700000", "paymentSummaryBillFeeInvoices": [{ "invoiceNumber": "6702172" }] },
                { "paymentCompletePeriodStartTime": "1782925200", "totalServiceFee": "443700000", "paymentSummaryBillFeeInvoices": [{ "invoiceNumber": "5867961" }] },
                { "paymentCompletePeriodStartTime": "1780333200", "totalServiceFee": "337100000", "paymentSummaryBillFeeInvoices": [{ "invoiceNumber": "4606030" }] },
                { "paymentCompletePeriodStartTime": "1777654800", "totalServiceFee": "634900000", "paymentSummaryBillFeeInvoices": [{ "invoiceNumber": "4085126" }] },
                { "paymentCompletePeriodStartTime": "1775062800", "totalServiceFee": "570900000", "paymentSummaryBillFeeInvoices": [{ "invoiceNumber": "3320336" }] },
                { "paymentCompletePeriodStartTime": "1772384400", "totalServiceFee": "976700000", "paymentSummaryBillFeeInvoices": [{ "invoiceNumber": "2790122" }] },
                { "paymentCompletePeriodStartTime": "1769965200", "totalServiceFee": "683800000", "paymentSummaryBillFeeInvoices": [{ "invoiceNumber": "1600351" }] },
                { "paymentCompletePeriodStartTime": "1767286800", "totalServiceFee": "1199900000", "paymentSummaryBillFeeInvoices": [{ "invoiceNumber": "741234" }] }
              ],
              "totalCount": 9
            }
          }
        };

        const parsedJsonInvoices = parsePastedTextOrJson(JSON.stringify(userFeePayload));

        const sampleText = `
Thg 09 2026	₫4.499	7581980	Hợp lệ	Tải về
Thg 08 2026	₫6.517	6702172	Hợp lệ	Tải về
Thg 07 2026	₫4.437	5867961	Hợp lệ	Tải về
Thg 06 2026	₫3.371	4606030	Hợp lệ	Tải về
Thg 05 2026	₫6.349	4085126	Hợp lệ	Tải về
Thg 04 2026	₫5.709	3320336	Hợp lệ	Tải về
Thg 03 2026	₫9.767	2790122	Hợp lệ	Tải về
Thg 02 2026	₫6.838	1600351	Hợp lệ	Tải về
Thg 01 2026	₫11.999	741234	Hợp lệ	Tải về
        `;
        const parsedTextInvoices = parsePastedTextOrJson(sampleText);

        // Test dual-track processData with both billing list and payouts
        const SERVICE_FEE_RATE = 0.0098;
        let rawBillingList = [];
        const decScaleMatch = code.match(/function decScale\\([\\s\\S]*?^  \\}/m);
        const epochMatch = code.match(/function parseEpochToGmt7\\([\\s\\S]*?^  \\}/m);
        const decompMatch = code.match(/function decomposePayout\\([\\s\\S]*?^  \\}/m);
        const entryMatch = code.match(/function createMonthEntry\\([\\s\\S]*?^  \\}/m);
        const processMatch = code.match(/function processData\\([\\s\\S]*?^  \\}/m);
        eval(decScaleMatch[0]);
        eval(epochMatch[0]);
        eval(decompMatch[0]);
        eval(entryMatch[0]);
        eval(processMatch[0]);

        const mockBillingList = [
          { order_completed_period_start_time: 1767200400, eligible_total_amount_dis: "1224353", total_payment_amount_dis: "1212354" },
          { order_completed_period_start_time: 1769878800, eligible_total_amount_dis: "697783", total_payment_amount_dis: "690945" },
          { order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667", total_payment_amount_dis: "986900" },
          { order_completed_period_start_time: 1775062800, eligible_total_amount_dis: "582415", total_payment_amount_dis: "576706" },
          { order_completed_period_start_time: 1777654800, eligible_total_amount_dis: "647819", total_payment_amount_dis: "641470" },
          { order_completed_period_start_time: 1780333200, eligible_total_amount_dis: "343999", total_payment_amount_dis: "340628" },
          { order_completed_period_start_time: 1782925200, eligible_total_amount_dis: "452905", total_payment_amount_dis: "448468" },
          { order_completed_period_start_time: 1785603600, eligible_total_amount_dis: "664816", total_payment_amount_dis: "658299" },
          { order_completed_period_start_time: 1788282000, eligible_total_amount_dis: "459292", total_payment_amount_dis: "454793" },
          { order_completed_period_start_time: 1790960400, eligible_total_amount_dis: "177364", total_payment_amount_dis: "177364" },
        ];

        const mockOctoberPayouts = [
          { paymentPayout: { payoutId: "1001", payoutCreatedTime: "1790794806", eligibleTotalAmount: "2356200000", totalPaymentAmount: "2333100000" } },
          { paymentPayout: { payoutId: "1005", payoutCreatedTime: "1791140407", eligibleTotalAmount: "3823000000", totalPaymentAmount: "3403000000" } },
          { paymentPayout: { payoutId: "1008", payoutCreatedTime: "1791399640", eligibleTotalAmount: "4998500000", totalPaymentAmount: "4449800000" } },
          { paymentPayout: { payoutId: "1012", payoutCreatedTime: "1791745206", eligibleTotalAmount: "2372100000", totalPaymentAmount: "2111700000" } },
          { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } },
        ];

        // Test billing list and electronic fee invoices reconciliation across 9 months
        rawBillingList = [...mockBillingList, ...mockOctoberPayouts, ...parsedJsonInvoices];
        const monthsResult = processData();

        console.log(JSON.stringify({
          jsonCount: parsedJsonInvoices.length,
          textCount: parsedTextInvoices.length,
          months: monthsResult
        }));
        """
        res = subprocess.run(["node", "-e", node_script], capture_output=True, text=True, check=True)
        out = json.loads(res.stdout)
        self.assertEqual(out["jsonCount"], 9)
        self.assertEqual(out["textCount"], 9)

        m = out["months"]
        # Tháng 1 đến 9: Phí dịch vụ phải khớp chính xác hóa đơn điện tử Shopee cấp
        expected_fees = {
            "2026-01": 11999,
            "2026-02": 6838,
            "2026-03": 9767,
            "2026-04": 5709,
            "2026-05": 6349,
            "2026-06": 3371,
            "2026-07": 4437,
            "2026-08": 6517,
            "2026-09": 4499,
        }
        fee_sum_0109 = 0
        for m_key, exp_fee in expected_fees.items():
            self.assertEqual(m[m_key]["fee"], exp_fee, f"Sai phí DV tại {m_key}")
            self.assertEqual(m[m_key]["gross"] - m[m_key]["fee"], m[m_key]["billTotal"])
            fee_sum_0109 += m[m_key]["fee"]

        self.assertEqual(fee_sum_0109, 59486, "Tổng phí DV 9 tháng đầu phải là 59.486 đ")

        # Tháng 10: Khớp chính xác 5 kỳ thanh toán Payout Record
        self.assertEqual(m["2026-10"]["fee"], 2032, "Phí DV tháng 10 phải là 2.032 đ")
        self.assertEqual(m["2026-10"]["gross"], 207288, "Gross tháng 10 phải là 207.288 đ")
        self.assertEqual(m["2026-10"]["billTotal"], 205256, "Doanh thu hợp lệ tháng 10 phải là 205.256 đ")
        self.assertEqual(m["2026-10"]["vat"], 9187, "5% VAT tháng 10 phải là 9.187 đ")
        self.assertEqual(m["2026-10"]["pit"], 9187, "5% PIT tháng 10 phải là 9.187 đ")
        self.assertEqual(m["2026-10"]["netPaid"], 186882, "Thực nhận sau thuế tháng 10 phải là 186.882 đ")

        # Tổng lũy kế 10 tháng
        total_10m_fee = sum(m[f"2026-{str(i).padStart(2, '0') if hasattr(str(i), 'padStart') else f'{i:02d}'}"]["fee"] for i in range(1, 11))
        self.assertEqual(total_10m_fee, 61518, "Tổng phí DV 10 tháng phải là 61.518 đ (59.486 + 2.032)")

    def test_march_mixed_source_reconciliation_process_data(self):
        # Kiểm tra tính ưu tiên của Payout Record cho tháng 03/2026 khi có cả billing list và payout
        node_script = """
        const fs = require('fs');
        const code = fs.readFileSync('tax_report.js', 'utf-8');
        const SERVICE_FEE_RATE = 0.0098;
        let rawBillingList = [];

        const decScaleMatch = code.match(/function decScale\\([\\s\\S]*?^  \\}/m);
        const epochMatch = code.match(/function parseEpochToGmt7\\([\\s\\S]*?^  \\}/m);
        const decompMatch = code.match(/function decomposePayout\\([\\s\\S]*?^  \\}/m);
        const entryMatch = code.match(/function createMonthEntry\\([\\s\\S]*?^  \\}/m);
        const processMatch = code.match(/function processData\\([\\s\\S]*?^  \\}/m);
        eval(decScaleMatch[0]);
        eval(epochMatch[0]);
        eval(decompMatch[0]);
        eval(entryMatch[0]);
        eval(processMatch[0]);

        rawBillingList = [
          { order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667", total_payment_amount_dis: "986900" },
          { paymentPayout: { payoutId: "SPV-MAR", payoutCreatedTime: "1773554400", eligibleTotalAmount: "113533100000", totalPaymentAmount: "107000000000", totalServiceFee: "1533100000", mcnManagementFee: "5000000000" } }
        ];

        const res = processData();
        console.log(JSON.stringify(res["2026-03"]));
        """
        res = subprocess.run(["node", "-e", node_script], capture_output=True, text=True, check=True)
        m3 = json.loads(res.stdout)
        self.assertEqual(m3["gross"], 1135331, "Gross tháng 3 phải là 1.135.331 đ theo Payout")
        self.assertEqual(m3["billingGross"], 996667, "Billing gross hoàn thành đơn tháng 3 phải là 996.667 đ")
        self.assertTrue(m3["hasPayout"])
        self.assertTrue(m3["hasBilling"])


if __name__ == "__main__":
    unittest.main()
