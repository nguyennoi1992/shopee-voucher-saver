#!/usr/bin/env python3
"""
tests/test_affiliate_report.py
Rigorous verification suite executing ACTUAL JavaScript from popup.js, tax_report.js,
and affiliate_content.js against minimal DOM / VM mocks and local Postman simulation.
All assertions exercise actual application code, callbacks, and handlers directly.
"""

import unittest
import subprocess
import json
import os

HARNESS_PATH = os.path.join(os.path.dirname(__file__), "affiliate_harness.js")


class TestAffiliateReportActualJS(unittest.TestCase):
    def run_node(self, script, timeout=15):
        """Helper to run a Node.js snippet and return parsed JSON stdout or raise."""
        res = subprocess.run(
            ["node", "-e", script],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        if res.returncode != 0:
            raise RuntimeError(f"Node.js script failed (exit {res.returncode}):\n{res.stderr}\nScript:\n{script}")
        return json.loads(res.stdout) if res.stdout.strip() else None

    def test_01_popup_syntax_and_dom_render_invariants(self):
        """Full popup initialization, updateAffiliateSummaryMetrics DOM output & accounting invariants."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();

        // Seed 9 months billing + 5 Oct payouts + 10 invoices (Oct invoice should NOT overwrite Oct payout)
        const mockBilling = [
          { order_completed_period_start_time: 1767200400, eligible_total_amount_dis: "1224353", total_payment_amount_dis: "1212354" },
          { order_completed_period_start_time: 1769878800, eligible_total_amount_dis: "697783", total_payment_amount_dis: "690945" },
          { order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667", total_payment_amount_dis: "986900" },
          { order_completed_period_start_time: 1775062800, eligible_total_amount_dis: "582415", total_payment_amount_dis: "576706" },
          { order_completed_period_start_time: 1777654800, eligible_total_amount_dis: "647819", total_payment_amount_dis: "641470" },
          { order_completed_period_start_time: 1780333200, eligible_total_amount_dis: "343999", total_payment_amount_dis: "340628" },
          { order_completed_period_start_time: 1782925200, eligible_total_amount_dis: "452905", total_payment_amount_dis: "448468" },
          { order_completed_period_start_time: 1785603600, eligible_total_amount_dis: "664816", total_payment_amount_dis: "658299" },
          { order_completed_period_start_time: 1788282000, eligible_total_amount_dis: "459292", total_payment_amount_dis: "454793" },
        ];
        const mockOctPayouts = [
          { paymentPayout: { payoutId: "1001", payoutCreatedTime: "1790794806", eligibleTotalAmount: "2356200000", totalPaymentAmount: "2333100000" } },
          { paymentPayout: { payoutId: "1005", payoutCreatedTime: "1791140407", eligibleTotalAmount: "3823000000", totalPaymentAmount: "3403000000" } },
          { paymentPayout: { payoutId: "1008", payoutCreatedTime: "1791399640", eligibleTotalAmount: "4998500000", totalPaymentAmount: "4449800000" } },
          { paymentPayout: { payoutId: "1012", payoutCreatedTime: "1791745206", eligibleTotalAmount: "2372100000", totalPaymentAmount: "2111700000" } },
          { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } },
        ];
        const mockInvoices = [
          { isFeeInvoice: true, monthKey: "2026-01", totalServiceFee: "1199900000" },
          { isFeeInvoice: true, monthKey: "2026-02", totalServiceFee: "683800000" },
          { isFeeInvoice: true, monthKey: "2026-03", totalServiceFee: "976700000" },
          { isFeeInvoice: true, monthKey: "2026-04", totalServiceFee: "570900000" },
          { isFeeInvoice: true, monthKey: "2026-05", totalServiceFee: "634900000" },
          { isFeeInvoice: true, monthKey: "2026-06", totalServiceFee: "337100000" },
          { isFeeInvoice: true, monthKey: "2026-07", totalServiceFee: "443700000" },
          { isFeeInvoice: true, monthKey: "2026-08", totalServiceFee: "651700000" },
          { isFeeInvoice: true, monthKey: "2026-09", totalServiceFee: "449900000" },
          { isFeeInvoice: true, monthKey: "2026-10", totalServiceFee: "1000000000" }
        ];

        dom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: [...mockBilling, ...mockOctPayouts, ...mockInvoices]
        };

        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
        };

        const code = fs.readFileSync('popup.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        dom.document.getElementById('show-affiliate').click();

        setTimeout(async () => {
          const tbody = dom.document.getElementById('aff-simple-tbody');
          const grossEl = dom.document.getElementById('affiliate-total-gross');
          const netEl = dom.document.getElementById('affiliate-net-tk');
          const fullTbody = dom.document.getElementById('aff-full-tbody');

          // Harness storage.local.get null/undefined/string/array/dictionary defaults contract
          const storeNull = await dom.chrome.storage.local.get(null);
          const storeUndef = await dom.chrome.storage.local.get(undefined);
          const storeSingle = await dom.chrome.storage.local.get("shopee_affiliate_billing_cache_v2");
          const storeArr = await dom.chrome.storage.local.get(["shopee_affiliate_billing_cache_v2"]);
          const storeDict = await dom.chrome.storage.local.get({
            shopee_affiliate_billing_cache_v2: "fallback_cache",
            non_existent_key: "default_fallback_val"
          });
          let cbResult = null;
          dom.chrome.storage.local.get({ cb_key: "cb_default" }, (res) => { cbResult = res; });

          const harnessStorageContractOk = Boolean(storeNull?.shopee_affiliate_billing_cache_v2) &&
            Boolean(storeUndef?.shopee_affiliate_billing_cache_v2) &&
            Boolean(storeSingle?.shopee_affiliate_billing_cache_v2) &&
            Boolean(storeArr?.shopee_affiliate_billing_cache_v2) &&
            (storeDict?.shopee_affiliate_billing_cache_v2 !== "fallback_cache") &&
            (storeDict?.non_existent_key === "default_fallback_val") &&
            (cbResult?.cb_key === "cb_default");

          // Billing month with two different invoice IDs + one exact duplicate
          const multiInvoiceData = [
            { order_completed_period_start_time: 1777654800, eligible_total_amount_dis: "1000", total_payment_amount_dis: "1000" },
            { isFeeInvoice: true, monthKey: "2026-05", totalServiceFee: "20000000", invoiceNumber: "INV-101" },
            { isFeeInvoice: true, monthKey: "2026-05", totalServiceFee: "10000000", invoiceNumber: "INV-102" },
            { isFeeInvoice: true, monthKey: "2026-05", totalServiceFee: "20000000", invoiceNumber: "INV-101" }
          ];

          // 1) tax_report view
          const taxDom = createMockDOM();
          const taxSandbox = {
            document: taxDom.document, window: taxDom.window, chrome: taxDom.chrome, localStorage: taxDom.localStorage,
            console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
          };
          const taxCode = fs.readFileSync('tax_report.js', 'utf8');
          vm.createContext(taxSandbox);
          vm.runInContext(taxCode, taxSandbox);
          taxDom.document.getElementById('paste-textarea').value = JSON.stringify(multiInvoiceData);
          taxDom.document.getElementById('btn-parse-paste').click();
          const taxMonths = taxSandbox.window.processData();
          const taxFee = taxMonths["2026-05"]?.fee;
          const taxBillTotal = taxMonths["2026-05"]?.billTotal;
          const taxObservedNet = taxMonths["2026-05"]?.netPaid;

          // 2) popup view
          const popupDom2 = createMockDOM();
          popupDom2.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: multiInvoiceData };
          const popupSandbox2 = {
            document: popupDom2.document, window: popupDom2.window, chrome: popupDom2.chrome, localStorage: popupDom2.localStorage,
            console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
          };
          vm.createContext(popupSandbox2);
          vm.runInContext(code, popupSandbox2);
          popupDom2.document.getElementById('show-affiliate').click();
          await new Promise(r => setTimeout(r, 20));

          const popupTfoot = popupDom2.document.getElementById('aff-full-tfoot')?.innerHTML || "";
          const popupNetText = popupDom2.document.getElementById('affiliate-net-tk')?.textContent || "";

          console.log(JSON.stringify({
            grossText: grossEl.textContent,
            netText: netEl.textContent,
            simpleHtml: tbody.innerHTML,
            fullHtml: fullTbody.innerHTML,
            harnessStorageContractOk,
            taxFee,
            taxBillTotal,
            taxObservedNet,
            popupFeeMatchesTax: popupTfoot.includes(`${taxFee} đ`),
            popupNetMatchesTax: popupNetText === `${taxBillTotal} đ`
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        self.assertIn("2026-10", out["simpleHtml"])
        self.assertIn("2026-01", out["simpleHtml"])
        # Oct payout net 186.882 must be preserved
        self.assertIn("186.882", out["fullHtml"])
        # Oct payout fee 2.032 must be preserved, not overwritten by 10.000
        self.assertIn("2.032", out["fullHtml"])
        self.assertNotIn("10.000", out["fullHtml"])
        # Total gross 6.070.049 + 207.288 = 6.277.337 đ
        self.assertEqual(out["grossText"], "6.277.337 đ")
        self.assertTrue(out["harnessStorageContractOk"], "Harness storage.local.get null/undefined should return full store")
        self.assertEqual(out["taxFee"], 300, "Two distinct invoices should sum and dedup identical invoice")
        self.assertEqual(out["taxBillTotal"], 700, "BillTotal should correctly reflect total gross minus deduplicated fee sum")
        self.assertEqual(out["taxObservedNet"], 1000, "Observed netPaid from API should be preserved, not overwritten")
        self.assertTrue(out["popupFeeMatchesTax"], "Popup fee should match tax report fee")
        self.assertTrue(out["popupNetMatchesTax"], "Popup net should match tax report reconciled billTotal")

    def test_02_popup_month_filter_dom_output(self):
        """Month filter (fromM/toM) strictly isolates DOM table rows, dailies and summary cards."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();

        dom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: [
            { order_completed_period_start_time: 1767200400, eligible_total_amount_dis: "1224353", total_payment_amount_dis: "1212354" },
            { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } }
          ]
        };

        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
        };
        const code = fs.readFileSync('popup.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        dom.document.getElementById('show-affiliate').click();

        setTimeout(() => {
          const fromEl = dom.document.getElementById('popup-from-month');
          const toEl = dom.document.getElementById('popup-to-month');
          fromEl.value = "2026-10";
          toEl.value = "2026-10";
          fromEl.trigger('change');

          const tbody = dom.document.getElementById('aff-simple-tbody');
          const daily = dom.document.getElementById('aff-daily-tbody');
          const grossEl = dom.document.getElementById('affiliate-total-gross');
          const netEl = dom.document.getElementById('affiliate-net-tk');

          console.log(JSON.stringify({
            tbodyHtml: tbody.innerHTML,
            dailyHtml: daily.innerHTML,
            grossText: grossEl.textContent,
            netText: netEl.textContent
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        # Should only contain 2026-10, NOT 2026-01
        self.assertIn("2026-10", out["tbodyHtml"])
        self.assertNotIn("2026-01", out["tbodyHtml"])
        self.assertEqual(out["grossText"], "71.790 đ")
        self.assertEqual(out["netText"], "63.906 đ")

    def test_03_prove_actual_callback_handles_empty_and_error_data_without_reference_error(self):
        """Blocker A: current ACTUAL callback handles empty/error data with expected metadata and no ReferenceError."""
        node_script = """
        const { extractExecuteScriptFunc } = require('./tests/affiliate_harness.js');

        const fnActual = extractExecuteScriptFunc('tax_report.js');
        global.fetch = async (url) => {
          if (url.includes('billing_list')) return { status: 500, json: async () => ({ code: -1, msg: 'Internal server error' }) };
          if (url.includes('getPayoutList') || url.includes('getPaymentPayoutBillingList')) {
            return { status: 404, json: async () => ({ errors: [{ message: 'Not found' }] }) };
          }
          return {
            status: 200,
            headers: { get: () => null },
            json: async () => ({ data: { getPaymentSummaryBillFeeInvoiceList: { totalCount: 0, paymentSummaryBillFeeInvoices: [] } } })
          };
        };

        fnActual(1000, 2000).then(res => {
          console.log(JSON.stringify({
            success: true,
            keys: Object.keys(res),
            feeInvoicesLength: res.feeInvoices.length,
            payoutsLength: res.payouts.length,
            feeIncomplete: res.feeIncomplete,
            hasFeeIssues: typeof res.feeIssues === 'string',
            hasGqlIssues: typeof res.gqlIssues === 'string'
          }));
        }).catch(err => {
          console.log(JSON.stringify({ success: false, errorName: err.name, errorMessage: err.message }));
        });
        """
        out = self.run_node(node_script)
        self.assertTrue(out["success"], "Actual tax_report.js must complete without ReferenceError")
        self.assertIn("feeIssues", out["keys"])
        self.assertIn("gqlIssues", out["keys"])
        self.assertIn("payouts", out["keys"])
        self.assertIn("feeInvoices", out["keys"])
        self.assertEqual(out["feeInvoicesLength"], 0)
        self.assertEqual(out["payoutsLength"], 0)

    def test_04_pager_logic_across_entrypoints(self):
        """Blocker B: Multi-page pagination, short page handling with totalCount, premature stopping, explicit 0."""
        node_script = """
        const { extractExecuteScriptFunc } = require('./tests/affiliate_harness.js');

        async function testPager(fn) {
          // Case 1: Short page (pageSize 50, returned 2 items), totalCount 4 -> fetches page 2, receives 4 items, incomplete=false
          let pageCalls = 0;
          global.fetch = async (url, opts = {}) => {
            if (url.includes('billing_list')) return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
            if (url.includes('getPayoutList') || url.includes('getPaymentPayoutBillingList')) {
              return { status: 200, json: async () => ({ data: { getPaymentPayoutBillingList: { payoutList: [] } } }) };
            }
            let body = null;
            try { if (opts.body) body = JSON.parse(opts.body); } catch (_) {}
            pageCalls++;
            const pageNum = body?.variables?.pageNum || 1;
            if (pageNum === 1) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentSummaryBillFeeInvoiceList: {
                      pageNum: 1, pageSize: 50, totalCount: 4,
                      paymentSummaryBillFeeInvoices: [
                        { paymentCompletePeriodStartTime: "100", totalServiceFee: "100", paymentSummaryBillFeeInvoices: [{ invoiceNumber: "INV1" }] },
                        { paymentCompletePeriodStartTime: "200", totalServiceFee: "200", paymentSummaryBillFeeInvoices: [{ invoiceNumber: "INV2" }] }
                      ]
                    }
                  }
                })
              };
            } else {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentSummaryBillFeeInvoiceList: {
                      pageNum: 2, pageSize: 50, totalCount: 4,
                      paymentSummaryBillFeeInvoices: [
                        { paymentCompletePeriodStartTime: "300", totalServiceFee: "300", paymentSummaryBillFeeInvoices: [{ invoiceNumber: "INV3" }] },
                        { paymentCompletePeriodStartTime: "400", totalServiceFee: "400", paymentSummaryBillFeeInvoices: [{ invoiceNumber: "INV4" }] }
                      ]
                    }
                  }
                })
              };
            }
          };

          const resMulti = await fn(1000, 2000);

          // Case 2: Premature empty page when totalCount was 4
          global.fetch = async (url, opts = {}) => {
            if (url.includes('billing_list')) return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
            if (url.includes('getPayoutList') || url.includes('getPaymentPayoutBillingList')) {
              return { status: 200, json: async () => ({ data: { getPaymentPayoutBillingList: { payoutList: [] } } }) };
            }
            let body = null;
            try { if (opts.body) body = JSON.parse(opts.body); } catch (_) {}
            const pageNum = body?.variables?.pageNum || 1;
            if (pageNum === 1) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentSummaryBillFeeInvoiceList: {
                      pageNum: 1, pageSize: 50, totalCount: 4,
                      paymentSummaryBillFeeInvoices: [
                        { paymentCompletePeriodStartTime: "100", totalServiceFee: "100", paymentSummaryBillFeeInvoices: [{ invoiceNumber: "INV1" }] }
                      ]
                    }
                  }
                })
              };
            } else {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: { getPaymentSummaryBillFeeInvoiceList: { pageNum: 2, pageSize: 50, totalCount: 4, paymentSummaryBillFeeInvoices: [] } }
                })
              };
            }
          };
          const resPremature = await fn(1000, 2000);

          // Case 3: Explicit authoritative totalCount 0
          global.fetch = async (url) => {
            if (url.includes('billing_list')) return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
            if (url.includes('getPayoutList') || url.includes('getPaymentPayoutBillingList')) {
              return { status: 200, json: async () => ({ data: { getPaymentPayoutBillingList: { payoutList: [] } } }) };
            }
            return {
              status: 200, headers: { get: () => null },
              json: async () => ({
                data: { getPaymentSummaryBillFeeInvoiceList: { pageNum: 1, pageSize: 50, totalCount: 0, paymentSummaryBillFeeInvoices: [] } }
              })
            };
          };
          const resZero = await fn(1000, 2000);

          // Case 4: GraphQL partial errors alongside data node
          global.fetch = async (url) => {
            if (url.includes('billing_list')) return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
            if (url.includes('getPayoutList') || url.includes('getPaymentPayoutBillingList')) {
              return { status: 200, json: async () => ({ data: { getPaymentPayoutBillingList: { payoutList: [] } } }) };
            }
            return {
              status: 200, headers: { get: () => null },
              json: async () => ({
                errors: [{ message: "Field partial timeout" }],
                data: { getPaymentSummaryBillFeeInvoiceList: { pageNum: 1, pageSize: 50, totalCount: 1, paymentSummaryBillFeeInvoices: [
                  { paymentCompletePeriodStartTime: "100", totalServiceFee: "100", paymentSummaryBillFeeInvoices: [{ invoiceNumber: "INV1" }] }
                ] } }
              })
            };
          };
          const resPartial = await fn(1000, 2000);

          return {
            case1: { count: resMulti.feeInvoices.length, incomplete: resMulti.feeIncomplete, pages: pageCalls },
            case2: { count: resPremature.feeInvoices.length, incomplete: resPremature.feeIncomplete },
            case3: { count: resZero.feeInvoices.length, incomplete: resZero.feeIncomplete, total: resZero.feeTotalCount },
            case4: { incomplete: resPartial.feeIncomplete }
          };
        }

        (async () => {
          const fnTax = extractExecuteScriptFunc('tax_report.js');
          const fnPopup = extractExecuteScriptFunc('popup.js');

          const taxRes = await testPager(fnTax);
          const popupRes = await testPager(fnPopup);

          console.log(JSON.stringify({ tax: taxRes, popup: popupRes }));
        })();
        """
        out = self.run_node(node_script)
        # Case 1: Both pages fetched, 4 items, incomplete=false
        self.assertEqual(out["tax"]["case1"]["count"], 4)
        self.assertFalse(out["tax"]["case1"]["incomplete"])
        self.assertEqual(out["popup"]["case1"]["count"], 4)
        self.assertFalse(out["popup"]["case1"]["incomplete"])
        # Case 2: Premature empty -> incomplete=true
        self.assertTrue(out["tax"]["case2"]["incomplete"])
        self.assertTrue(out["popup"]["case2"]["incomplete"])
        # Case 3: Authoritative 0 -> incomplete=false, count=0
        self.assertEqual(out["tax"]["case3"]["count"], 0)
        self.assertFalse(out["tax"]["case3"]["incomplete"])
        self.assertEqual(out["tax"]["case3"]["total"], 0)
        # Case 4: GraphQL partial error -> incomplete=true
        self.assertTrue(out["tax"]["case4"]["incomplete"])

    def test_05_affiliate_content_auto_sync_cache_preservation(self):
        """Blocker C: affiliate_content auto-sync does not replace existing cache on complete revenue source failure."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();

        const STORAGE_KEY = "shopee_affiliate_billing_cache_v2";
        dom.chrome.storage.local._store[STORAGE_KEY] = {
          updatedAt: Date.now() - 25 * 60 * 60 * 1000,
          list: [
            { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } },
            { isFeeInvoice: true, monthKey: "2026-09", totalServiceFee: "449900000" }
          ]
        };

        let storageSetCalled = false;
        const origSet = dom.chrome.storage.local.set;
        dom.chrome.storage.local.set = (items, cb) => {
          storageSetCalled = true;
          return origSet(items, cb);
        };

        let fetchCalls = 0;
        global.fetch = async (url) => {
          fetchCalls++;
          if (url.includes('billing_list')) return { json: async () => ({ code: -1, data: null }) };
          if (url.includes('getPayoutList') || url.includes('getPaymentPayoutBillingList')) {
            return { json: async () => ({ data: { getPaymentPayoutBillingList: { payoutList: [] } } }) };
          }
          if (url.includes('getPaymentSummaryBillFeeInvoiceList')) {
            return {
              status: 200, headers: { get: () => null },
              json: async () => ({
                data: {
                  getPaymentSummaryBillFeeInvoiceList: {
                    pageNum: 1, pageSize: 50, totalCount: 1,
                    paymentSummaryBillFeeInvoices: [
                      { paymentCompletePeriodStartTime: "1788282000", totalServiceFee: "449900000", paymentSummaryBillFeeInvoices: [{ invoiceNumber: "7581980" }] }
                    ]
                  }
                }
              })
            };
          }
          return { status: 200, json: async () => ({}) };
        };

        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: global.fetch
        };

        const code = fs.readFileSync('affiliate_content.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        setTimeout(() => {
          console.log(JSON.stringify({
            fetchCalls,
            storageSetCalled,
            cacheRemainingItems: dom.chrome.storage.local._store[STORAGE_KEY].list.length
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        self.assertGreater(out["fetchCalls"], 0, "Request path must have actually run because cache was expired")
        self.assertFalse(out["storageSetCalled"], "Storage set must NOT be called on complete revenue failure")
        self.assertEqual(out["cacheRemainingItems"], 2, "Existing revenue cache must be preserved")

    def test_06_popup_fetch_affiliate_live_status_microtasks(self):
        """Blocker D: popup fetchAffiliateLive awaits loadAffiliateSummary; fee & payout warnings preserved in DOM."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();

        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
        };

        dom.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            billingData: { code: 0, data: { list: [{ order_completed_period_start_time: 1767200400, eligible_total_amount_dis: "1224353", total_payment_amount_dis: "1212354" }] } },
            feeInvoices: [{ isFeeInvoice: true, monthKey: "2026-09", totalServiceFee: "449900000" }],
            feeIncomplete: true,
            feeIssues: "Mạng chập chờn",
            gqlIssues: "Token expired"
          }
        }];

        const code = fs.readFileSync('popup.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        dom.document.getElementById('fetch-affiliate-data').click();

        setTimeout(() => {
          const statusEl = dom.document.getElementById('affiliate-status');
          console.log(JSON.stringify({
            statusText: statusEl.textContent,
            statusClass: statusEl.className
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        self.assertIn("chưa đầy đủ: Mạng chập chờn", out["statusText"])
        self.assertIn("Cảnh báo: không lấy được kỳ thanh toán từ Payout Record", out["statusText"])
        self.assertNotIn("Dữ liệu nạp từ Cache", out["statusText"])

    def test_07_financial_parser_trust_boundary_and_atomic_validation(self):
        """Blocker E: Strict financial parsing, atomic rejection of invalid/negative/nonfinite/malformed records."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();
        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
        };

        const code = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        const textarea = dom.document.getElementById('paste-textarea');
        const parseBtn = dom.document.getElementById('btn-parse-paste');
        const statusText = dom.document.getElementById('status-text');

        const results = {};

        // 1. Initial valid paste: Aug and Sep invoices
        textarea.value = "Thg 08 2026\\t₫6.517\\t6702172\\tHợp lệ";
        parseBtn.click();
        textarea.value = "Thg 09 2026\\t₫4.499\\t7581980\\tHợp lệ";
        parseBtn.click();

        const getSnapshot = () => JSON.stringify(dom.chrome.storage.local._store['shopee_affiliate_billing_cache_v2']);
        const baseline = getSnapshot();

        // 2. Malformed case 1: missing revenue fields in JSON
        textarea.value = '[{"order_completed_period_start_time":1767200400}]';
        parseBtn.click();
        results.missingRevenueError = statusText.textContent.includes("Lỗi") && getSnapshot() === baseline;

        // Malformed case: display amount "garbage" + valid raw amount 100
        textarea.value = '[{"order_completed_period_start_time":1767200400,"eligible_total_amount_dis":"garbage","eligible_total_amount":100}]';
        parseBtn.click();
        results.garbageGrossDisError = statusText.textContent.includes("Lỗi") && getSnapshot() === baseline;

        // Malformed case: wrong-unit timestamp (milliseconds)
        textarea.value = '[{"order_completed_period_start_time":1767200400000,"eligible_total_amount_dis":"100"}]';
        parseBtn.click();
        results.wrongUnitTimestampError = statusText.textContent.includes("Lỗi") && getSnapshot() === baseline;

        // 3. Malformed case 2: partial numeric string in JSON
        textarea.value = '[{"isFeeInvoice":true,"monthKey":"2026-09","totalServiceFee":"150000abc"}]';
        parseBtn.click();
        results.partialNumericError = statusText.textContent.includes("Lỗi") && getSnapshot() === baseline;

        // 4. Malformed case 3: unsupported timestamp alias in JSON
        textarea.value = '[{"order_completed_start_time":1767200400,"eligible_total_amount_dis":"1000"}]';
        parseBtn.click();
        results.unsupportedTimestampError = statusText.textContent.includes("Lỗi") && getSnapshot() === baseline;

        // 5. Malformed case 4: malformed grouping in tab amount
        textarea.value = "Thg 09 2026\\t₫12,3,4\\t7581980\\tHợp lệ";
        parseBtn.click();
        results.malformedGroupingError = statusText.textContent.includes("Lỗi") && getSnapshot() === baseline;

        // 6. Malformed case 5: negative fee with whitespace
        textarea.value = "Thg 09 2026\\t- ₫150.000\\t7581980\\tHợp lệ";
        parseBtn.click();
        results.negativeAmountError = statusText.textContent.includes("Lỗi") && getSnapshot() === baseline;

        // 7. Malformed case 6: missing fee column
        textarea.value = "Thg 09 2026\\t\\t7581980\\tHợp lệ";
        parseBtn.click();
        results.missingColError = statusText.textContent.includes("Lỗi") && getSnapshot() === baseline;

        // 8. Malformed case 7: invalid month 13
        textarea.value = "Thg 13 2026\\t₫150.000\\t7581980\\tHợp lệ";
        parseBtn.click();
        results.invalidMonthError = statusText.textContent.includes("Lỗi") && getSnapshot() === baseline;

        // 9. Valid zero fee in tab
        textarea.value = "Thg 07 2026\\t₫0\\t7581980\\tHợp lệ";
        parseBtn.click();
        results.zeroFeeSuccess = statusText.textContent.includes("thành công");

        // 10. Valid raw invoice array normalization and merge (merges rather than replacing revenue)
        const countBeforeMerge = dom.chrome.storage.local._store['shopee_affiliate_billing_cache_v2'].list.length;
        textarea.value = JSON.stringify([
          { paymentCompletePeriodStartTime: "1780333200", totalServiceFee: "337100000", invoiceNumber: "4606030" }
        ]);
        parseBtn.click();
        const countAfterMerge = dom.chrome.storage.local._store['shopee_affiliate_billing_cache_v2'].list.length;
        results.rawInvoiceMergeSuccess = countAfterMerge > countBeforeMerge;

        // 11. Valid payout table paste
        textarea.value = `
Ngày tạo bill\\tMã thanh toán\\tTiền sàn trả (Gross)\\tPhí DV 0,98%\\tDoanh thu hợp lệ\\t5% VAT\\t5% PIT (TNCN)\\tThực nhận sau thuế
01-10-2026\\t...1001\\t23.562 đ\\t231 đ\\t23.331 đ\\t0 đ\\t0 đ\\t23.331 đ
        `;
        parseBtn.click();
        results.payoutSuccess = statusText.textContent.includes("thành công");

        // 12. Valid flat payout zero-value (timestamp/id/gross 0/paid 0/fee 0)
        textarea.value = JSON.stringify([
          { payoutId: "9999", payoutCreatedTime: 1767200400, eligibleTotalAmount: 0, totalPaymentAmount: 0, totalServiceFee: 0 }
        ]);
        parseBtn.click();
        results.zeroPayoutSuccess = statusText.textContent.includes("thành công");

        // 13. Mixed import: invoices + billing revenue re-imported twice
        textarea.value = JSON.stringify([
          { isFeeInvoice: true, monthKey: "2026-07", totalServiceFee: "443700000", invoiceNumber: "5867961" }
        ]);
        parseBtn.click();

        const mixedList = [
          { order_completed_period_start_time: 1788282000, eligible_total_amount_dis: "459292", total_payment_amount_dis: "454793" },
          { isFeeInvoice: true, monthKey: "2026-09", totalServiceFee: "449900000", invoiceNumber: "7581980" }
        ];
        const mixedText = JSON.stringify(mixedList);

        // Import 1
        textarea.value = mixedText;
        parseBtn.click();
        const cacheList1 = dom.chrome.storage.local._store['shopee_affiliate_billing_cache_v2'].list;
        const revCount1 = cacheList1.filter(x => !x.isFeeInvoice).length;
        const m1 = (dom.window?.processData || sandbox.processData)();
        const gross1 = m1["2026-09"]?.gross;
        const net1 = m1["2026-09"]?.netPaid;
        const hasOtherMonth1 = cacheList1.some(x => x.isFeeInvoice && x.monthKey === "2026-07");

        // Import 2 (same mixed list again)
        textarea.value = mixedText;
        parseBtn.click();
        const cacheList2 = dom.chrome.storage.local._store['shopee_affiliate_billing_cache_v2'].list;
        const revCount2 = cacheList2.filter(x => !x.isFeeInvoice).length;
        const m2 = (dom.window?.processData || sandbox.processData)();
        const gross2 = m2["2026-09"]?.gross;
        const net2 = m2["2026-09"]?.netPaid;
        const hasOtherMonth2 = cacheList2.some(x => x.isFeeInvoice && x.monthKey === "2026-07");

        results.mixedStableGross = (gross1 === gross2) && (gross1 === 459292);
        results.mixedStableNet = (net1 === net2) && (net1 === 454793);
        results.mixedStableRevCount = (revCount1 === revCount2) && (revCount1 === 1);
        results.mixedPreservedOtherMonth = hasOtherMonth1 && hasOtherMonth2;

        console.log(JSON.stringify(results));
        """
        out = self.run_node(node_script)
        self.assertTrue(out["missingRevenueError"], "Missing revenue fields must throw and keep cache unchanged")
        self.assertTrue(out["garbageGrossDisError"], "Garbage gross display amount must throw and keep cache unchanged")
        self.assertTrue(out["wrongUnitTimestampError"], "Wrong unit timestamp must throw and keep cache unchanged")
        self.assertTrue(out["partialNumericError"], "Partial numeric token must throw and keep cache unchanged")
        self.assertTrue(out["unsupportedTimestampError"], "Unsupported timestamp alias must throw and keep cache unchanged")
        self.assertTrue(out["malformedGroupingError"], "Malformed grouping must throw and keep cache unchanged")
        self.assertTrue(out["negativeAmountError"], "Negative amount with whitespace must throw and keep cache unchanged")
        self.assertTrue(out["missingColError"], "Missing fee tab column must show error and keep cache unchanged")
        self.assertTrue(out["invalidMonthError"], "Month 13 must show error and keep cache unchanged")
        self.assertTrue(out["zeroFeeSuccess"], "Valid zero fee tab must succeed")
        self.assertTrue(out["rawInvoiceMergeSuccess"], "Raw invoice array must normalize isFeeInvoice=true and merge")
        self.assertTrue(out["payoutSuccess"], "Payout table paste must succeed")
        self.assertTrue(out["zeroPayoutSuccess"], "Valid flat payout zero-value must succeed")
        self.assertTrue(out["mixedStableGross"], "Re-importing same mixed list must keep gross stable")
        self.assertTrue(out["mixedStableNet"], "Re-importing same mixed list must keep net stable")
        self.assertTrue(out["mixedStableRevCount"], "Re-importing same mixed list must not double revenue count")
        self.assertTrue(out["mixedPreservedOtherMonth"], "Re-importing mixed list must preserve other invoice months")

    def test_08_postman_simulation_e2e_fetch(self):
        """Execute ACTUAL injected fetch callbacks (tax+popup) against local Postman simulation server."""
        node_script = """
        const { spawn } = require('child_process');
        const readline = require('readline');
        const { extractExecuteScriptFunc } = require('./tests/affiliate_harness.js');

        let tested = false;
        let safetyTimer = null;

        const sim = spawn('postman', [
          'simulation', 'run',
          'postman/simulations/shopee-affiliate/shopee-affiliate.sim.yaml',
          '--port', 'auto',
          '--no-history',
          '--output', 'ndjson'
        ]);

        sim.on('error', (err) => {
          if (tested) return;
          tested = true;
          clearTimeout(safetyTimer);
          console.error('Failed to start postman simulation (is Postman CLI installed?):', err.message);
          process.exit(1);
        });

        sim.on('close', (code) => {
          if (!tested) {
            tested = true;
            clearTimeout(safetyTimer);
            console.error(`Postman simulation closed unexpectedly before listening (exit code ${code})`);
            process.exit(1);
          }
        });

        const rl = readline.createInterface({ input: sim.stdout });
        const requestEvents = [];
        let boundUrl = null;

        safetyTimer = setTimeout(async () => {
          if (!tested) {
            tested = true;
            try { sim.kill('SIGINT'); } catch (_) {}
            await new Promise(resolve => sim.on('close', resolve));
            console.error('Timed out waiting for simulation');
            process.exit(1);
          }
        }, 12000);

        async function runAll() {
          if (tested) return;
          tested = true;
          try {
            const nativeFetch = global.fetch;
            const fnTax = extractExecuteScriptFunc('tax_report.js');
            const fnPopup = extractExecuteScriptFunc('popup.js');

            // 1. Multi-page success for both tax and popup callbacks
            global.fetch = (url, opts) => {
              const fullUrl = (typeof url === 'string' && url.startsWith('/')) ? boundUrl + url : url;
              return nativeFetch(fullUrl, opts);
            };

            const resTax = await fnTax(1000, 2000);
            const resPopup = await fnPopup(1000, 2000);

            // 2. Invoice page 2 failure (via x-simulate-partial on GraphQL invoice calls)
            global.fetch = (url, opts = {}) => {
              const fullUrl = (typeof url === 'string' && url.startsWith('/')) ? boundUrl + url : url;
              const headers = Object.assign({}, opts.headers || {});
              if (opts.body && opts.body.includes('getPaymentSummaryBillFeeInvoiceList')) {
                headers['x-simulate-partial'] = 'true';
              }
              return nativeFetch(fullUrl, Object.assign({}, opts, { headers }));
            };
            const resPartial = await fnTax(1000, 2000);

            // 3. Invoice 401/403 -> CSRF recovery scenario (inject x-simulate-403 only on invoice page 1)
            global.fetch = (url, opts = {}) => {
              const fullUrl = (typeof url === 'string' && url.startsWith('/')) ? boundUrl + url : url;
              const headers = Object.assign({}, opts.headers || {});
              if (opts.body && opts.body.includes('getPaymentSummaryBillFeeInvoiceList')) {
                try {
                  const parsed = JSON.parse(opts.body);
                  if ((parsed.variables?.pageNum || 1) === 1) {
                    headers['x-simulate-403'] = 'true';
                  }
                } catch (_) {}
              }
              return nativeFetch(fullUrl, Object.assign({}, opts, { headers }));
            };
            const resCsrf = await fnTax(1000, 2000);

            // 4. Valid GraphQL request without URL q (with uppercase operationName + canonical field query)
            const resNoQ = await nativeFetch(boundUrl + '/api/v3/gql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                operationName: 'GETPAYMENTPAYOUTBILLINGLIST',
                query: 'query getPaymentPayoutBillingList { getPaymentPayoutBillingList { payoutList { paymentPayout { payoutId } } } }'
              })
            });
            const jsonNoQ = await resNoQ.json();
            const gqlNoQOk = resNoQ.status === 200 && Boolean(jsonNoQ?.data?.getPaymentPayoutBillingList?.payoutList?.length);

            clearTimeout(safetyTimer);
            sim.kill('SIGINT');
            await new Promise(resolve => sim.on('close', resolve));

            console.log(JSON.stringify({
              success: true,
              taxCount: resTax.feeInvoices.length,
              taxIncomplete: resTax.feeIncomplete,
              taxPayouts: resTax.payouts.length,
              popupCount: resPopup.feeInvoices.length,
              popupIncomplete: resPopup.feeIncomplete,
              popupPayouts: resPopup.payouts.length,
              partialCount: resPartial.feeInvoices.length,
              partialIncomplete: resPartial.feeIncomplete,
              csrfCount: resCsrf.feeInvoices.length,
              csrfIncomplete: resCsrf.feeIncomplete,
              gqlNoQOk,
              requestCount: requestEvents.length,
              has403: requestEvents.some(r => r.statusCode === 403),
              has500: requestEvents.some(r => r.statusCode === 500),
              hasConfigWebsite: requestEvents.some(r => r.path === '/api/v3/config/website')
            }));
          } catch (err) {
            clearTimeout(safetyTimer);
            try { sim.kill('SIGINT'); } catch (_) {}
            await new Promise(resolve => sim.on('close', resolve));
            console.error('Test execution error:', err);
            process.exit(1);
          }
        }

        rl.on('line', line => {
          if (!line.trim()) return;
          try {
            const ev = JSON.parse(line);
            if (ev.event === 'listening') {
              boundUrl = ev.mocks[0].address;
              runAll();
            } else if (ev.event === 'request') {
              requestEvents.push(ev);
            }
          } catch (_) {}
        });
        """
        out = self.run_node(node_script, timeout=20)
        self.assertTrue(out["success"])
        # Multi-page pagination should receive all 4 invoices across 2 pages
        self.assertEqual(out["taxCount"], 4)
        self.assertFalse(out["taxIncomplete"])
        self.assertEqual(out["taxPayouts"], 1)
        self.assertEqual(out["popupCount"], 4)
        self.assertFalse(out["popupIncomplete"])
        self.assertEqual(out["popupPayouts"], 1)
        # Partial failure scenario
        self.assertEqual(out["partialCount"], 2)
        self.assertTrue(out["partialIncomplete"])
        # 403 CSRF recovery scenario
        self.assertEqual(out["csrfCount"], 4)
        self.assertFalse(out["csrfIncomplete"])
        # HTTP evidence assertions from simulation NDJSON
        self.assertGreater(out["requestCount"], 0)
        self.assertTrue(out["has403"], "NDJSON should show 403 request event")
        self.assertTrue(out["has500"], "NDJSON should show 500 request event")
        self.assertTrue(out["hasConfigWebsite"], "NDJSON should show /api/v3/config/website request event")
        self.assertTrue(out["gqlNoQOk"], "GraphQL request without URL q and uppercase operationName must match mock")

    def test_09_october_mixed_daily_billing_and_payout_reconciliation(self):
        """October completed-order billing dates/totals are distinct from Payout dates/totals, before/after refresh."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        // Mixed October data:
        // 2 billing completion records: 01/10/2026 with 50.000, 26/10/2026 with 127.364 -> Total billing 177.364
        const octBilling = [
          { order_completed_period_start_time: 1790787600, eligible_total_amount_dis: "50000", total_payment_amount_dis: "50000" },
          { order_completed_period_start_time: 1792947600, eligible_total_amount_dis: "127364", total_payment_amount_dis: "127364" }
        ];
        // 5 October payout records (from truth table): 01/10, 05/10, 08/10, 12/10, 19/10 -> Total Gross 207.288, Net 186.882
        const octPayouts = [
          { paymentPayout: { payoutId: "1001", payoutCreatedTime: "1790794806", eligibleTotalAmount: "2356200000", totalPaymentAmount: "2333100000" } },
          { paymentPayout: { payoutId: "1005", payoutCreatedTime: "1791140407", eligibleTotalAmount: "3823000000", totalPaymentAmount: "3403000000" } },
          { paymentPayout: { payoutId: "1008", payoutCreatedTime: "1791399640", eligibleTotalAmount: "4998500000", totalPaymentAmount: "4449800000" } },
          { paymentPayout: { payoutId: "1012", payoutCreatedTime: "1791745206", eligibleTotalAmount: "2372100000", totalPaymentAmount: "2111700000" } },
          { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } }
        ];

        // 1. Verify in popup.js
        const popupDom = createMockDOM();
        popupDom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: [...octBilling, ...octPayouts]
        };
        const popupSandbox = {
          document: popupDom.document, window: popupDom.window, chrome: popupDom.chrome, localStorage: popupDom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
        };
        const popupCode = fs.readFileSync('popup.js', 'utf8');
        vm.createContext(popupSandbox);
        vm.runInContext(popupCode, popupSandbox);
        popupDom.document.getElementById('show-affiliate').click();

        // 2. Verify in tax_report.js
        const taxDom = createMockDOM();
        taxDom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: [...octBilling, ...octPayouts]
        };
        const taxSandbox = {
          document: taxDom.document, window: taxDom.window, chrome: taxDom.chrome, localStorage: taxDom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
        };
        const taxCode = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(taxSandbox);
        vm.runInContext(taxCode, taxSandbox);

        setTimeout(() => {
          // Popup checks
          const popupGross = popupDom.document.getElementById('affiliate-total-gross').textContent;
          const popupNet = popupDom.document.getElementById('affiliate-net-tk').textContent;
          const popupDailyHtml = popupDom.document.getElementById('aff-daily-tbody').innerHTML;
          const popupDailyFoot = popupDom.document.getElementById('aff-daily-tfoot').innerHTML;

          // Tax report checks
          const taxDailyHtml = taxDom.document.getElementById('daily-tables-container').innerHTML;
          const taxMonthlyTfoot = taxDom.document.getElementById('monthly-tfoot').innerHTML;

          console.log(JSON.stringify({
            popupGross,
            popupNet,
            popupDailyHtml,
            popupDailyFoot,
            taxDailyHtml,
            taxMonthlyTfoot
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        # Popup monthly cards show Payout Gross and Net
        self.assertEqual(out["popupGross"], "207.288 đ")
        self.assertEqual(out["popupNet"], "186.882 đ")
        # Popup daily table contains completion dates 01/10/2026 and 26/10/2026
        self.assertIn("01/10/2026", out["popupDailyHtml"])
        self.assertIn("50.000 đ", out["popupDailyHtml"])
        self.assertIn("26/10/2026", out["popupDailyHtml"])
        self.assertIn("127.364 đ", out["popupDailyHtml"])
        # Payout date 19/10/2026 gross 71.790 is NOT in daily table
        self.assertNotIn("71.790 đ", out["popupDailyHtml"])
        # Popup daily footer totals daily billing amount 177.364 đ (NOT Payout Gross 207.288 đ)
        self.assertIn("177.364 đ", out["popupDailyFoot"])
        self.assertNotIn("207.288 đ", out["popupDailyFoot"])
        # Full tax report monthly totals are from Payout
        self.assertIn("207.288", out["taxMonthlyTfoot"])
        self.assertIn("186.882", out["taxMonthlyTfoot"])
        # Full tax report daily table uses completion dates and totals 177.364
        self.assertIn("01/10/2026", out["taxDailyHtml"])
        self.assertIn("26/10/2026", out["taxDailyHtml"])
        self.assertIn("177.364", out["taxDailyHtml"])
        self.assertNotIn("71.790", out["taxDailyHtml"])

    def test_10_actual_csv_and_spreadsheetml_export_format_and_filters(self):
        """Execute ACTUAL CSV and SpreadsheetML export routines with dd/mm/yyyy, GMT+7 midnight boundary, multi-row same day, and month filtering."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        const testBilling = [
          // Midnight GMT+7 boundary for Oct 1 (1790787600 is 2026-10-01 00:00:00+07:00)
          { order_completed_period_start_time: 1790787600, eligible_total_amount_dis: "50000", total_payment_amount_dis: "50000" },
          // Multi-row on same day (26/10/2026): 27.364 + 100.000 = 127.364
          { order_completed_period_start_time: 1792947600, eligible_total_amount_dis: "27364", total_payment_amount_dis: "27364" },
          { order_completed_period_start_time: 1792947600 + 7200, eligible_total_amount_dis: "100000", total_payment_amount_dis: "100000" },
          // January record to verify filtering
          { order_completed_period_start_time: 1767200400, eligible_total_amount_dis: "1224353", total_payment_amount_dis: "1212354" }
        ];

        const taxDom = createMockDOM();
        taxDom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: testBilling
        };

        let lastBlob = null;
        global.URL.createObjectURL = (blob) => {
          lastBlob = blob;
          return "blob:mock-export-url";
        };
        global.URL.revokeObjectURL = () => {};

        let alertMsg = "";
        const sandbox = {
          document: taxDom.document, window: taxDom.window, chrome: taxDom.chrome, localStorage: taxDom.localStorage,
          console, setTimeout, clearTimeout, URL: global.URL, Blob: global.Blob, alert: (msg) => { alertMsg = msg; }
        };
        const code = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        setTimeout(async () => {
          // Filter to October only
          const fromEl = taxDom.document.getElementById('select-from-month');
          const toEl = taxDom.document.getElementById('select-to-month');
          fromEl.value = "2026-10";
          toEl.value = "2026-10";
          fromEl.trigger('change');

          // 1. Export CSV
          taxDom.document.getElementById('btn-export-csv').click();
          const csvText = lastBlob ? await lastBlob.text() : "";

          // 2. Export Excel
          taxDom.document.getElementById('btn-export-excel').click();
          const excelXml = lastBlob ? await lastBlob.text() : "";

          // 3. Test export prevention when selected months lack billing
          taxDom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
            updatedAt: Date.now(),
            list: [
              { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } }
            ]
          };
          taxDom.document.getElementById('btn-clear-cache').click();
          taxDom.document.getElementById('btn-export-csv').click();

          console.log(JSON.stringify({
            csvText,
            excelXml,
            alertMsg
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        # CSV tests
        csv = out["csvText"]
        self.assertIn("Ngày tháng,Diễn giải,Số tiền", csv)
        self.assertIn("Tháng 10/2026", csv)
        self.assertIn("01/10/2026,Doanh thu từ Shopee,50000", csv)
        self.assertIn("26/10/2026,Doanh thu từ Shopee,127364", csv)
        self.assertIn(",Tổng Doanh Thu,177364", csv)
        self.assertNotIn("1224353", csv, "January row must be excluded by month filter")

        # Excel SpreadsheetML tests
        xml = out["excelXml"]
        self.assertIn('ss:StyleID="MonthHeader"', xml)
        self.assertIn("Tháng 10/2026", xml)
        self.assertIn('<Cell ss:StyleID="CellDate"><Data ss:Type="String">01/10/2026</Data></Cell>', xml)
        self.assertIn('<Cell ss:StyleID="CellDate"><Data ss:Type="String">26/10/2026</Data></Cell>', xml)
        self.assertIn('<Cell ss:StyleID="CellAmount"><Data ss:Type="Number">50000</Data></Cell>', xml)
        self.assertIn('<Cell ss:StyleID="CellAmount"><Data ss:Type="Number">127364</Data></Cell>', xml)
        self.assertIn('<Cell ss:StyleID="TotalAmount"><Data ss:Type="Number">177364</Data></Cell>', xml)

        # Missing billing export prevention
        self.assertIn("không có dữ liệu doanh thu theo ngày hoàn thành đơn", out["alertMsg"])

    def test_11_payout_only_missing_daily_vs_valid_zero_billing_month(self):
        """Payout-only month does not fabricate verified zeros; valid zero billing month is preserved."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        // Case A: Payout-only in October
        const payoutOnlyData = [
          { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } }
        ];

        const domTaxA = createMockDOM();
        domTaxA.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: payoutOnlyData };
        const sandboxTaxA = { document: domTaxA.document, window: domTaxA.window, chrome: domTaxA.chrome, localStorage: domTaxA.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxTaxA);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTaxA);

        const domPopupA = createMockDOM();
        domPopupA.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: payoutOnlyData };
        const sandboxPopupA = { document: domPopupA.document, window: domPopupA.window, chrome: domPopupA.chrome, localStorage: domPopupA.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxPopupA);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxPopupA);
        domPopupA.document.getElementById('show-affiliate').click();

        // Case B: Valid zero-billing month in pre-Oct (e.g. 2026-05) + an old payout in 2026-05
        const validZeroBillingData = [
          { order_completed_period_start_time: 1777654800, eligible_total_amount_dis: "0", total_payment_amount_dis: "0" },
          { paymentPayout: { payoutId: "old_may", payoutCreatedTime: "1777700000", eligibleTotalAmount: "500000000", totalPaymentAmount: "450000000" } }
        ];

        const domPopupB = createMockDOM();
        domPopupB.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: validZeroBillingData };
        const sandboxPopupB = { document: domPopupB.document, window: domPopupB.window, chrome: domPopupB.chrome, localStorage: domPopupB.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxPopupB);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxPopupB);
        domPopupB.document.getElementById('show-affiliate').click();

        // Case C: Mixed range (2026-05 has billing, 2026-10 missing billing)
        const mixedData = [
          { order_completed_period_start_time: 1777654800, eligible_total_amount_dis: "0", total_payment_amount_dis: "0" },
          { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } }
        ];
        const domTaxC = createMockDOM();
        domTaxC.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: mixedData };
        let lastBlobC = null;
        let alertMsgC = "";
        global.URL.createObjectURL = (blob) => {
          lastBlobC = blob;
          return "blob:mock-c";
        };
        global.URL.revokeObjectURL = () => {};
        const sandboxTaxC = {
          document: domTaxC.document, window: domTaxC.window, chrome: domTaxC.chrome, localStorage: domTaxC.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({}),
          URL: global.URL, Blob: global.Blob, alert: (msg) => { alertMsgC = msg; }
        };
        vm.createContext(sandboxTaxC);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTaxC);

        setTimeout(async () => {
          const taxDailyA = domTaxA.document.getElementById('daily-tables-container').innerHTML;
          const popupDailyA = domPopupA.document.getElementById('aff-daily-tbody').innerHTML;

          // In Case B: zero billing + positive payout: monthly cards use Payout (5.000 đ), daily billing remains 0 đ
          const popupGrossB = domPopupB.document.getElementById('affiliate-total-gross').textContent;
          const popupDailyB = domPopupB.document.getElementById('aff-daily-tbody').innerHTML;

          // Mixed range export blocking test
          const fromElC = domTaxC.document.getElementById('select-from-month');
          const toElC = domTaxC.document.getElementById('select-to-month');
          fromElC.value = "2026-05";
          toElC.value = "2026-10";
          fromElC.trigger('change');

          lastBlobC = null;
          alertMsgC = "";
          domTaxC.document.getElementById('btn-export-csv').click();
          const csvBlockedMixed = (lastBlobC === null);
          const csvAlertMixed = alertMsgC;

          lastBlobC = null;
          alertMsgC = "";
          domTaxC.document.getElementById('btn-export-excel').click();
          const excelBlockedMixed = (lastBlobC === null);
          const excelAlertMixed = alertMsgC;

          // Zero-billing single month export test (2026-05)
          fromElC.value = "2026-05";
          toElC.value = "2026-05";
          fromElC.trigger('change');

          lastBlobC = null;
          alertMsgC = "";
          domTaxC.document.getElementById('btn-export-csv').click();
          const zeroCsvExported = (lastBlobC !== null);
          const zeroCsvText = lastBlobC ? await lastBlobC.text() : "";

          lastBlobC = null;
          alertMsgC = "";
          domTaxC.document.getElementById('btn-export-excel').click();
          const zeroExcelExported = (lastBlobC !== null);
          const zeroExcelXml = lastBlobC ? await lastBlobC.text() : "";

          console.log(JSON.stringify({
            taxDailyA,
            popupDailyA,
            popupGrossB,
            popupDailyB,
            csvBlockedMixed,
            csvAlertMixed,
            excelBlockedMixed,
            excelAlertMixed,
            zeroCsvExported,
            zeroCsvText,
            zeroExcelExported,
            zeroExcelXml
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        # Payout-only should not fabricate 31 fake zeros
        self.assertIn("Chưa có dữ liệu doanh thu theo ngày hoàn thành đơn", out["taxDailyA"])
        self.assertIn("Chưa có dữ liệu doanh thu theo ngày hoàn thành đơn", out["popupDailyA"])
        # Valid zero billing month + positive payout: monthly cards use Payout 5.000 đ, daily billing preserved at 0 đ
        self.assertEqual(out["popupGrossB"], "5.000 đ")
        self.assertIn("0 đ", out["popupDailyB"])
        # Mixed complete+missing range: both CSV and XLS blocked without download
        self.assertTrue(out["csvBlockedMixed"])
        self.assertIn("10/2026", out["csvAlertMixed"])
        self.assertIn("không có dữ liệu doanh thu theo ngày hoàn thành đơn", out["csvAlertMixed"])
        self.assertTrue(out["excelBlockedMixed"])
        self.assertIn("10/2026", out["excelAlertMixed"])
        self.assertIn("không có dữ liệu doanh thu theo ngày hoàn thành đơn", out["excelAlertMixed"])
        # Valid zero-billing month is still exportable
        self.assertTrue(out["zeroCsvExported"])
        self.assertIn("Tháng 05/2026", out["zeroCsvText"])
        self.assertIn("01/05/2026,Doanh thu từ Shopee,0", out["zeroCsvText"])
        self.assertIn(",Tổng Doanh Thu,0", out["zeroCsvText"])
        self.assertTrue(out["zeroExcelExported"])
        self.assertIn("Tháng 05/2026", out["zeroExcelXml"])
        self.assertIn('<Cell ss:StyleID="CellAmount"><Data ss:Type="Number">0</Data></Cell>', out["zeroExcelXml"])

    def test_12_failed_billing_refresh_preserves_old_daily_cache_and_warnings(self):
        """Failed billing refresh retains old records across entrypoints, preserves warnings in cache, authoritative empty clears."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        const initialCache = [
          { order_completed_period_start_time: 1790787600, eligible_total_amount_dis: "50000", total_payment_amount_dis: "50000" },
          { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } },
          { isFeeInvoice: true, monthKey: "2026-09", totalServiceFee: "449900000" }
        ];

        // 1. tax_report.js: Billing refresh fails (returns 500 error)
        const domTax = createMockDOM();
        domTax.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: initialCache };
        domTax.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [{ paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } }],
            payoutSuccess: true,
            payoutIncomplete: false,
            payoutTotalCount: 1,
            billingData: { error: "Network timeout 500" },
            feeInvoices: [{ isFeeInvoice: true, monthKey: "2026-09", totalServiceFee: "449900000" }]
          }
        }];

        const sandboxTax = { document: domTax.document, window: domTax.window, chrome: domTax.chrome, localStorage: domTax.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxTax);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax);
        domTax.document.getElementById('btn-fetch-live').click();

        // 2. popup.js: Billing refresh fails
        const domPopup = createMockDOM();
        domPopup.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: initialCache };
        domPopup.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [{ paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } }],
            payoutSuccess: true,
            payoutIncomplete: false,
            payoutTotalCount: 1,
            billingData: { error: "Network timeout 500" },
            feeInvoices: [{ isFeeInvoice: true, monthKey: "2026-09", totalServiceFee: "449900000" }]
          }
        }];

        const sandboxPopup = { document: domPopup.document, window: domPopup.window, chrome: domPopup.chrome, localStorage: domPopup.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxPopup);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxPopup);
        domPopup.document.getElementById('fetch-affiliate-data').click();

        // 3. Clear on authoritative empty response
        const domClear = createMockDOM();
        domClear.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: initialCache };
        domClear.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [{ paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } }],
            payoutSuccess: true,
            payoutIncomplete: false,
            payoutTotalCount: 1,
            billingData: { code: 0, data: { list: [] } },
            feeInvoices: []
          }
        }];
        const sandboxClear = { document: domClear.document, window: domClear.window, chrome: domClear.chrome, localStorage: domClear.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxClear);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxClear);
        domClear.document.getElementById('btn-fetch-live').click();

        // 4. BOTH sources fail: Payouts fail + Billing fails, cached billing retained
        const domBothTax = createMockDOM();
        domBothTax.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: initialCache };
        domBothTax.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            payoutSuccess: false,
            payoutIncomplete: true,
            gqlIssues: "Network timeout GQL",
            billingData: { error: "Network timeout 500" },
            feeInvoices: []
          }
        }];
        const sandboxBothTax = { document: domBothTax.document, window: domBothTax.window, chrome: domBothTax.chrome, localStorage: domBothTax.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxBothTax);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxBothTax);
        domBothTax.document.getElementById('btn-fetch-live').click();

        const domBothPopup = createMockDOM();
        domBothPopup.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = { updatedAt: Date.now(), list: initialCache };
        domBothPopup.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            payoutSuccess: false,
            payoutIncomplete: true,
            gqlIssues: "Network timeout GQL",
            billingData: { error: "Network timeout 500" },
            feeInvoices: []
          }
        }];
        const sandboxBothPopup = { document: domBothPopup.document, window: domBothPopup.window, chrome: domBothPopup.chrome, localStorage: domBothPopup.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxBothPopup);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxBothPopup);
        domBothPopup.document.getElementById('fetch-affiliate-data').click();

        setTimeout(async () => {
          const taxCacheAfterFail = domTax.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"];
          const taxBillingRetained = taxCacheAfterFail.list.some(x => x.order_completed_period_start_time === 1790787600);
          const taxHasWarnings = (taxCacheAfterFail.warnings || []).length > 0;

          const popupCacheAfterFail = domPopup.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"];
          const popupBillingRetained = popupCacheAfterFail.list.some(x => x.order_completed_period_start_time === 1790787600);

          const clearCache = domClear.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"];
          const clearHasBilling = clearCache.list.some(x => x.order_completed_period_start_time);

          const statusText = domTax.document.getElementById('status-text').textContent;

          const bothTaxCache = domBothTax.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"];
          const bothTaxBillingRetained = bothTaxCache.list.some(x => x.order_completed_period_start_time === 1790787600);
          const bothTaxStatusText = domBothTax.document.getElementById('status-text').textContent;

          const bothPopupCache = domBothPopup.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"];
          const bothPopupBillingRetained = bothPopupCache.list.some(x => x.order_completed_period_start_time === 1790787600);
          const bothPopupStatusText = domBothPopup.document.getElementById('affiliate-status').textContent;

          // Reopen test on cached both-fail data
          const domReopenTax = createMockDOM();
          domReopenTax.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = bothTaxCache;
          const sandboxReopenTax = { document: domReopenTax.document, window: domReopenTax.window, chrome: domReopenTax.chrome, localStorage: domReopenTax.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
          vm.createContext(sandboxReopenTax);
          vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxReopenTax);
          await new Promise(r => setTimeout(r, 30));
          const reopenTaxStatusText = domReopenTax.document.getElementById('status-text').textContent;

          console.log(JSON.stringify({
            taxBillingRetained,
            taxHasWarnings,
            popupBillingRetained,
            clearHasBilling,
            statusText,
            bothTaxBillingRetained,
            bothTaxStatusText,
            bothPopupBillingRetained,
            bothPopupStatusText,
            reopenTaxStatusText
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        self.assertTrue(out["taxBillingRetained"], "Previous valid billing records must be retained on failed refresh")
        self.assertTrue(out["taxHasWarnings"], "Cache warnings must record failed billing source")
        self.assertTrue(out["popupBillingRetained"], "Popup must also retain previous valid billing records on failed refresh")
        self.assertFalse(out["clearHasBilling"], "Authoritative empty response should clear previous billing records")
        self.assertIn("bản ghi cũ", out["statusText"])

        # Both sources fail: cached billing retained and both warnings visible
        self.assertTrue(out["bothTaxBillingRetained"])
        self.assertIn("không lấy được kỳ thanh toán từ Payout Record", out["bothTaxStatusText"])
        self.assertIn("Không thể làm mới doanh thu theo ngày", out["bothTaxStatusText"])
        self.assertTrue(out["bothPopupBillingRetained"])
        self.assertIn("không lấy được kỳ thanh toán từ Payout Record", out["bothPopupStatusText"])
        self.assertIn("Không thể làm mới doanh thu theo ngày", out["bothPopupStatusText"])
        # Persisted warnings on reopen
        self.assertIn("Cảnh báo:", out["reopenTaxStatusText"])
        self.assertIn("Không thể làm mới doanh thu theo ngày", out["reopenTaxStatusText"])
        self.assertIn("Payout lỗi", out["reopenTaxStatusText"])

    def test_13_s1a_hkd_render_and_print_invocation(self):
        """S1a-HKD official template rendering, header/metadata, selected range, and print invocation."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();

        // 5 October payouts matching truth table
        const octPayouts = [
          { paymentPayout: { payoutId: "1001", payoutCreatedTime: "1790794806", eligibleTotalAmount: "2356200000", totalPaymentAmount: "2333100000" } },
          { paymentPayout: { payoutId: "1005", payoutCreatedTime: "1791140407", eligibleTotalAmount: "3823000000", totalPaymentAmount: "3403000000" } },
          { paymentPayout: { payoutId: "1008", payoutCreatedTime: "1791399640", eligibleTotalAmount: "4998500000", totalPaymentAmount: "4449800000" } },
          { paymentPayout: { payoutId: "1012", payoutCreatedTime: "1791745206", eligibleTotalAmount: "2372100000", totalPaymentAmount: "2111700000" } },
          { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } }
        ];

        dom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: [...octPayouts]
        };

        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) }),
          alert: () => {}
        };
        const code = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        setTimeout(() => {
          // Check S1a DOM elements
          const dispPeriod = dom.document.getElementById('s1a-disp-period').textContent;
          const dispLocation = dom.document.getElementById('s1a-disp-location').textContent;
          const s1aTbody = dom.document.getElementById('s1a-tbody').innerHTML;
          const dispTotal = dom.document.getElementById('s1a-disp-total').textContent;
          const sigDate = dom.document.getElementById('s1a-disp-sig-date').textContent;

          // Trigger print button
          dom.document.getElementById('btn-s1a-print').click();
          const printCalled = Boolean(dom.window.printCalled);

          console.log(JSON.stringify({
            dispPeriod,
            dispLocation,
            s1aTbody,
            dispTotal,
            sigDate,
            printCalled
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        self.assertIn("10/2026", out["dispPeriod"])
        self.assertEqual(out["dispLocation"], "Kinh doanh trên nền tảng số (Shopee Affiliate)")
        self.assertIn("31/10/2026", out["s1aTbody"])
        self.assertIn("Tổng doanh thu tháng 10/2026 (gộp 5 dòng sổ)", out["s1aTbody"])
        self.assertIn("207.288", out["s1aTbody"])
        self.assertEqual(out["dispTotal"], "207.288")
        self.assertTrue(out["sigDate"].startswith("Ngày"))
        self.assertTrue(out["printCalled"], "Print button must invoke window.print()")

    def test_14_s1a_payout_gross_distinct_from_net_fees_billing_and_tax_mode(self):
        """Payout gross eligibleTotalAmount before MCN is strictly distinct from net, service fees, billing, and immune to tax modes."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();

        // 1 Payout record in Oct 2026:
        // Gross: 10,000,000; MCN fee: 1,000,000 => Per FINAL user requirement, S1a amount must be exactly 10,000,000
        // Service fee: 98,000; Net paid: 8,000,000
        // And 1 Billing record in Oct 2026 with 5,000,000
        const mockPayout = {
          paymentPayout: {
            payoutId: "2001",
            payoutCreatedTime: "1791140407", // Oct 2026
            eligibleTotalAmount: "1000000000000", // 10,000,000
            totalPaymentAmount: "800000000000",   // 8,000,000
            totalServiceFee: "9800000000"         // 98,000
          },
          payoutValidationInfo: {
            mcnManagementFee: "100000000000"     // 1,000,000
          }
        };

        const mockBilling = {
          order_completed_period_start_time: 1791140407,
          eligible_total_amount_dis: "5000000",
          total_payment_amount_dis: "4951000"
        };

        // Repro case from Root QA: 61 payouts each 10,000 gross / 1,000 MCN
        const repro61Payouts = [];
        for (let i = 1; i <= 61; i++) {
          repro61Payouts.push({
            paymentPayout: {
              payoutId: "repro_" + i,
              payoutCreatedTime: "1791140407",
              eligibleTotalAmount: "1000000000", // 10,000 VND
              totalPaymentAmount: "890000000"
            },
            payoutValidationInfo: {
              mcnManagementFee: "100000000" // 1,000 VND
            }
          });
        }

        dom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: [mockPayout, mockBilling]
        };

        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) }),
          alert: () => {}
        };
        const code = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        // Also check print CSS for single final total (tfoot display: table-row-group in @media print)
        const html = fs.readFileSync('tax_report.html', 'utf8');
        const printCssHasSingleTotal = html.includes('table.s1a-table tfoot') &&
          html.includes('display: table-row-group') &&
          html.includes('table.s1a-table thead') &&
          html.includes('display: table-header-group');

        setTimeout(() => {
          const s1aTbodyActual = dom.document.getElementById('s1a-tbody').innerHTML;
          const s1aTotalActual = dom.document.getElementById('s1a-disp-total').textContent;

          // Switch tax mode to 'hkd' (5% VAT + 5% PIT)
          dom.document.getElementById('select-tax-mode').value = 'hkd';
          dom.document.getElementById('select-tax-mode').trigger('change');
          const s1aTotalHkd = dom.document.getElementById('s1a-disp-total').textContent;

          // Switch tax mode to 'individual' (10% PIT)
          dom.document.getElementById('select-tax-mode').value = 'individual';
          dom.document.getElementById('select-tax-mode').trigger('change');
          const s1aTotalInd = dom.document.getElementById('s1a-disp-total').textContent;

          // Now test the 61 payouts repro case
          const data61 = dom.window.extractS1aData(repro61Payouts, ["2026-10"], "monthly");

          console.log(JSON.stringify({
            s1aTbodyActual,
            s1aTotalActual,
            s1aTotalHkd,
            s1aTotalInd,
            repro61Total: data61.grandTotal,
            printCssHasSingleTotal
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        # Exactly 10.000.000 (Gross before any fees/taxes/MCN)
        self.assertIn("10.000.000", out["s1aTbodyActual"])
        self.assertEqual(out["s1aTotalActual"], "10.000.000")
        # Must NOT equal after-MCN (9.000.000), Net (8.000.000), or Billing gross (5.000.000)
        self.assertNotIn("9.000.000", out["s1aTbodyActual"])
        self.assertNotIn("8.000.000", out["s1aTbodyActual"])
        self.assertNotIn("5.000.000", out["s1aTbodyActual"])
        # Tax modes must NOT alter S1a total amount
        self.assertEqual(out["s1aTotalHkd"], "10.000.000")
        self.assertEqual(out["s1aTotalInd"], "10.000.000")
        # Repro: 61 payouts each 10,000 gives exactly 610,000 (NOT 549,000)
        self.assertEqual(out["repro61Total"], 610000)
        # Single final total in print CSS
        self.assertTrue(out["printCssHasSingleTotal"], "Print CSS must use table-row-group for tfoot to avoid repeating grand total on every page")

    def test_15_s1a_grouping_month_vs_day_totals_and_labels(self):
        """Monthly vs daily grouping totals match exactly; daily labels ngày tạo kỳ chi trả with fallback payArrivalTime."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();

        // 3 Payout records in Oct 2026:
        // Day 1 (50,000) with payoutCreatedTime
        // Day 15 (150,000) with fallback payArrivalTime only
        // Day 26 (127,364) with payoutCreatedTime
        // Total = 327,364
        const payoutRecs = [
          { paymentPayout: { payoutId: "2001", payoutCreatedTime: "1790794806", eligibleTotalAmount: "5000000000" } },
          { paymentPayout: { payoutId: "2002", payArrivalTime: "1792004400", eligibleTotalAmount: "15000000000" } },
          { paymentPayout: { payoutId: "2003", payoutCreatedTime: "1792954800", eligibleTotalAmount: "12736400000" } }
        ];

        dom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: [...payoutRecs]
        };

        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) }),
          alert: () => {}
        };
        const code = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        setTimeout(() => {
          const monthTotal = dom.document.getElementById('s1a-disp-total').textContent;
          const monthHtml = dom.document.getElementById('s1a-tbody').innerHTML;

          // Switch grouping to daily
          const grpSelect = dom.document.getElementById('s1a-select-grouping');
          grpSelect.value = 'daily';
          grpSelect.trigger('change');

          const dayTotal = dom.document.getElementById('s1a-disp-total').textContent;
          const dayHtml = dom.document.getElementById('s1a-tbody').innerHTML;

          console.log(JSON.stringify({
            monthTotal,
            monthHtml,
            dayTotal,
            dayHtml
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        self.assertEqual(out["monthTotal"], "327.364")
        self.assertEqual(out["dayTotal"], "327.364")
        self.assertEqual(out["monthTotal"], out["dayTotal"], "Monthly grouping grand total must exactly match daily grouping grand total")
        self.assertIn("31/10/2026", out["monthHtml"])
        self.assertIn("gộp 3 dòng sổ", out["monthHtml"])
        self.assertIn("50.000", out["dayHtml"])
        self.assertIn("150.000", out["dayHtml"])
        self.assertIn("127.364", out["dayHtml"])
        self.assertIn("ngày tạo kỳ chi trả", out["dayHtml"])
        self.assertIn("ngày tiền về payArrivalTime", out["dayHtml"])

    def test_16_s1a_guards_gap_dedup_conflicts_and_valid_zero(self):
        """S1a guards: calendar gaps block without silent omission, dedup prevents doubling, conflicts fail, valid zero preserved, micro-unit scales properly."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();

        // Data setup:
        // Sep 2026 has ONLY billing records, NO payouts.
        // Oct 2026 has Payout 1019 (71,790 VND).
        const sepBilling = { order_completed_period_start_time: 1788282000, eligible_total_amount_dis: "450000" };
        const octPayout = { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "7179000000", totalPaymentAmount: "6390600000" } };

        dom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: [sepBilling, octPayout]
        };

        let lastAlert = "";
        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) }),
          alert: (msg) => { lastAlert = msg; }
        };
        const code = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        setTimeout(() => {
          // 1. Select range 2026-09 to 2026-10: Sep is missing payout data -> must block
          dom.document.getElementById('select-from-month').value = '2026-09';
          dom.document.getElementById('select-to-month').value = '2026-10';
          dom.document.getElementById('select-from-month').trigger('change');

          const missingSepWarnText = dom.document.getElementById('s1a-warning-text').textContent;
          const missingSepPrintDisabled = Boolean(dom.document.getElementById('btn-s1a-print').disabled);
          const missingSepSheetHidden = (dom.document.getElementById('s1a-sheet-wrapper').style.display === 'none');
          const missingSepBodyErrorClass = dom.document.body.classList.contains('s1a-has-error');

          // 2. Calendar gap enumeration test: Endpoints Aug 2026 to Oct 2026 with Sep completely absent
          const augPayout = { paymentPayout: { payoutId: "aug_1", payoutCreatedTime: "1785603600", eligibleTotalAmount: "5000000000" } };
          const dataGap = dom.window.extractS1aData([augPayout, octPayout], ["2026-08", "2026-09", "2026-10"], "monthly");
          const gapDetected = Boolean(dataGap.error && dataGap.missingMonths.includes("2026-09"));

          // 3. Calendar gap validation in CSV export: selected Sep to Nov with Oct missing billing
          dom.document.getElementById('select-from-month').value = '2026-09';
          dom.document.getElementById('select-to-month').value = '2026-11';
          dom.document.getElementById('btn-export-csv').click();
          const csvGapAlert = lastAlert;

          // 4. Legitimate zero payout in Sep 2026
          const zeroPayoutSep = { paymentPayout: { payoutId: "zero_sep", payoutCreatedTime: "1788282000", eligibleTotalAmount: "0", totalPaymentAmount: "0" } };
          const dataZero = dom.window.extractS1aData([zeroPayoutSep, octPayout], ["2026-09", "2026-10"], "monthly");

          // 5. Deduplication of identical payout: Payout 1019 added twice
          const dataDedup = dom.window.extractS1aData([octPayout, octPayout], ["2026-10"], "monthly");

          // 6. Conflicting duplicate: same payoutId 1019 with different amount
          const conflictPayout = { paymentPayout: { payoutId: "1019", payoutCreatedTime: "1792350007", eligibleTotalAmount: "9999000000" } };
          const dataConflict = dom.window.extractS1aData([octPayout, conflictPayout], ["2026-10"], "monthly");

          // 7. Malformed / missing amount and time
          const malformedAmtPayout = { paymentPayout: { payoutId: "bad_amt", payoutCreatedTime: "1792350007", eligibleTotalAmount: "not_a_number" } };
          const dataMalformed = dom.window.extractS1aData([malformedAmtPayout], ["2026-10"], "monthly");

          // 8. Micro-unit contract small value test (< 100,000 micro-units, e.g. 50,000 = 0.5 VND)
          const smallPayout = { paymentPayout: { payoutId: "small_1", payoutCreatedTime: "1792350007", eligibleTotalAmount: "50000" } };
          const dataSmall = dom.window.extractS1aData([smallPayout], ["2026-10"], "monthly");

          console.log(JSON.stringify({
            missingSepWarnText,
            missingSepPrintDisabled,
            missingSepSheetHidden,
            missingSepBodyErrorClass,
            gapDetected,
            csvGapAlert,
            zeroError: dataZero.error,
            zeroTotal: dataZero.grandTotal,
            dedupTotal: dataDedup.grandTotal,
            conflictError: dataConflict.error,
            malformedError: dataMalformed.error,
            smallAmt: dataSmall.rows[0]?.amount
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        # Missing source month blocks S1a, hides sheet, disables print
        self.assertIn("09/2026", out["missingSepWarnText"])
        self.assertIn("Payout", out["missingSepWarnText"])
        self.assertTrue(out["missingSepPrintDisabled"])
        self.assertTrue(out["missingSepSheetHidden"])
        self.assertTrue(out["missingSepBodyErrorClass"])
        # Calendar gap between Aug and Oct blocks missing Sep
        self.assertTrue(out["gapDetected"])
        # CSV daily export blocks calendar gap
        self.assertIn("10/2026", out["csvGapAlert"])
        self.assertIn("không có dữ liệu doanh thu theo ngày hoàn thành đơn", out["csvGapAlert"])
        # Legitimate zero is valid
        self.assertIsNone(out["zeroError"])
        self.assertEqual(out["zeroTotal"], 71790)
        # Dedup: 71,790 is not doubled to 143,580
        self.assertEqual(out["dedupTotal"], 71790)
        # Conflict error fails clearly
        self.assertIn("Xung đột dữ liệu Payout ID 1019", out["conflictError"])
        # Malformed amount blocks
        self.assertIn("không hợp lệ", out["malformedError"])
        # Micro-unit conversion does not inflate 50,000 micro-units (0.5 VND) to 50,000 VND
        self.assertEqual(out["smallAmt"], 1)

    def test_17_s1a_utc_gmt7_boundary_escaping_and_persisted_profile(self):
        """UTC/GMT+7 midnight boundary attribution, HTML escaping, and persisted profile via storage.local."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');
        const dom = createMockDOM();

        // Boundary record: 2026-09-30 18:00:00 UTC = 2026-10-01 01:00:00 GMT+7 (Epoch 1790791200)
        const boundaryPayout = {
          paymentPayout: {
            payoutId: "boundary_1",
            payoutCreatedTime: 1790791200,
            eligibleTotalAmount: "100000000", // 1,000 VND
            totalPaymentAmount: "100000000"
          }
        };

        dom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: [boundaryPayout]
        };

        const sandbox = {
          document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) }),
          alert: () => {}
        };
        const code = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        setTimeout(async () => {
          // Verify boundary is categorized under October 2026
          dom.document.getElementById('select-from-month').value = '2026-10';
          dom.document.getElementById('select-to-month').value = '2026-10';
          dom.document.getElementById('select-from-month').trigger('change');

          const s1aTbody = dom.document.getElementById('s1a-tbody').innerHTML;
          const s1aTotal = dom.document.getElementById('s1a-disp-total').textContent;

          // Test HTML escaping and profile persistence
          const nameInput = dom.document.getElementById('s1a-input-name');
          const addrInput = dom.document.getElementById('s1a-input-address');
          const taxInput = dom.document.getElementById('s1a-input-taxcode');

          nameInput.value = '<script>alert(1)</script>';
          addrInput.value = '123 Fake <street> & Co';
          taxInput.value = '0123456789"onclick="evil';

          nameInput.trigger('input');
          addrInput.trigger('input');
          taxInput.trigger('input');

          const dispName = dom.document.getElementById('s1a-disp-name').textContent;
          const dispAddr = dom.document.getElementById('s1a-disp-address').textContent;
          const dispTax = dom.document.getElementById('s1a-disp-taxcode').textContent;

          // Save button trigger
          dom.document.getElementById('btn-s1a-save-profile').click();

          const storedProfile = dom.chrome.storage.local._store["shopee_affiliate_s1a_profile"];

          console.log(JSON.stringify({
            s1aTbody,
            s1aTotal,
            dispName,
            dispAddr,
            dispTax,
            storedProfile
          }));
        }, 50);
        """
        out = self.run_node(node_script)
        # Boundary belongs to 2026-10
        self.assertIn("31/10/2026", out["s1aTbody"])
        self.assertEqual(out["s1aTotal"], "1.000")
        # Injection strings must be kept safely as plain textContent
        self.assertEqual(out["dispName"], "<script>alert(1)</script>")
        self.assertEqual(out["dispAddr"], "123 Fake <street> & Co")
        self.assertEqual(out["dispTax"], '0123456789"onclick="evil')
        # Stored in storage.local under shopee_affiliate_s1a_profile
        self.assertIsNotNone(out["storedProfile"])
        self.assertEqual(out["storedProfile"]["taxpayerName"], "<script>alert(1)</script>")
        self.assertEqual(out["storedProfile"]["businessLocation"], "Kinh doanh trên nền tảng số (Shopee Affiliate)")

    def test_18_march_payout_priority_reconciliation_and_accounting_alignment(self):
        """Regression actual-JS fixture: March Billing 996667, Payout 1135331 (micro 113533100000),
        nonzero fees/MCN distinct net. Assert monthly 10 cols/simple/fullcards/popup/S1a all Payout gross 1135331;
        daily Billing remains 996667; source reconciliation delta 138664 visible.
        March record retained across refresh/cache/filter; all-month priority no Oct threshold.
        Includes zeroBilling+positivePayout, duplicate and microzero tests."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        // March 2026 fixture:
        // Billing: 1772470800 (2026-03-03 GMT+7) gross 996.667, payment 986.900
        const marBilling = {
          order_completed_period_start_time: 1772470800,
          eligible_total_amount_dis: "996667",
          total_payment_amount_dis: "986900"
        };

        // Payout: 1773554400 (2026-03-15 GMT+7)
        // Gross: 113533100000 micro-units = 1.135.331 VND
        // MCN: 5000000000 micro-units = 50.000 VND (nonzero)
        // Service fee: 1533100000 micro-units = 15.331 VND (nonzero)
        // Net: 107000000000 micro-units = 1.070.000 VND (distinct from gross)
        const marPayout = {
          paymentPayout: {
            payoutId: "SPV-MAR-2026",
            payoutCreatedTime: "1773554400",
            eligibleTotalAmount: "113533100000",
            totalPaymentAmount: "107000000000",
            totalServiceFee: "1533100000",
            mcnManagementFee: "5000000000"
          }
        };

        // Identical duplicate Payout for deduplication test
        const marPayoutDuplicate = JSON.parse(JSON.stringify(marPayout));

        // Microzero Payout (< 100,000 micro-units rounding to 0): 1000 micro-units = 0.01 VND -> 0
        const marMicroZeroPayout = {
          paymentPayout: {
            payoutId: "SPV-MAR-MICROZERO",
            payoutCreatedTime: "1773554400",
            eligibleTotalAmount: "1000",
            totalPaymentAmount: "0",
            totalServiceFee: "0"
          }
        };

        const testDataset = [marBilling, marPayout, marPayoutDuplicate, marMicroZeroPayout];

        // 1. Test full page tax_report.js
        const taxDom = createMockDOM();
        taxDom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: testDataset
        };
        const taxSandbox = {
          document: taxDom.document,
          window: taxDom.window,
          chrome: taxDom.chrome,
          localStorage: taxDom.localStorage,
          console,
          setTimeout,
          clearTimeout,
          fetch: async () => ({ ok: true, json: async () => ({}) })
        };
        const taxCode = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(taxSandbox);
        vm.runInContext(taxCode, taxSandbox);

        // 2. Test popup.js
        const popupDom = createMockDOM();
        popupDom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
          updatedAt: Date.now(),
          list: testDataset
        };
        const popupSandbox = {
          document: popupDom.document,
          window: popupDom.window,
          chrome: popupDom.chrome,
          localStorage: popupDom.localStorage,
          console,
          setTimeout,
          clearTimeout,
          fetch: async () => ({ ok: true, json: async () => ({}) })
        };
        const popupCode = fs.readFileSync('popup.js', 'utf8');
        vm.createContext(popupSandbox);
        vm.runInContext(popupCode, popupSandbox);
        popupDom.document.getElementById('show-affiliate').click();

        setTimeout(async () => {
          // Select March 2026 in tax_report
          const fromEl = taxDom.document.getElementById('select-from-month');
          const toEl = taxDom.document.getElementById('select-to-month');
          fromEl.value = "2026-03";
          toEl.value = "2026-03";
          fromEl.trigger('change');

          const taxMonthlyHtml = taxDom.document.getElementById('monthly-tbody').innerHTML;
          const taxSimpleHtml = taxDom.document.getElementById('simple-tbody').innerHTML;
          const taxDailyHtml = taxDom.document.getElementById('daily-tables-container').innerHTML;
          const s1aTotal = taxDom.document.getElementById('s1a-disp-total').textContent;
          const s1aTbody = taxDom.document.getElementById('s1a-tbody').innerHTML;

          // Select March 2026 in popup
          const pFromEl = popupDom.document.getElementById('popup-from-month');
          const pToEl = popupDom.document.getElementById('popup-to-month');
          pFromEl.value = "2026-03";
          pToEl.value = "2026-03";
          pFromEl.trigger('change');

          const popupHeroGross = popupDom.document.getElementById('affiliate-total-gross').textContent;
          const popupNet = popupDom.document.getElementById('affiliate-net-tk').textContent;
          const popupSimpleHtml = popupDom.document.getElementById('aff-simple-tbody').innerHTML;
          const popupFullHtml = popupDom.document.getElementById('aff-full-tbody').innerHTML;
          const popupDailyHtml = popupDom.document.getElementById('aff-daily-tbody').innerHTML;
          const popupDailyFoot = popupDom.document.getElementById('aff-daily-tfoot').innerHTML;
          const popupReconHtml = popupDom.document.getElementById('aff-daily-reconciliation')?.innerHTML || "";

          // Gap / missing source test in tax_report: select 2026-02 to 2026-03 where 2026-02 is absent
          fromEl.value = "2026-02";
          toEl.value = "2026-03";
          fromEl.trigger('change');
          const taxDailyHtmlGap = taxDom.document.getElementById('daily-tables-container').innerHTML;

          // Restore to March for main asserts
          fromEl.value = "2026-03";
          toEl.value = "2026-03";
          fromEl.trigger('change');

          // Gap / missing source test in popup: select 2026-02 to 2026-03
          pFromEl.value = "2026-02";
          pToEl.value = "2026-03";
          pFromEl.trigger('change');
          const popupReconGap = popupDom.document.getElementById('aff-daily-reconciliation')?.innerHTML || "";

          // Inverted range test in popup: select 2026-05 to 2026-03 (should clear stale reconciliation)
          pFromEl.value = "2026-05";
          pToEl.value = "2026-03";
          pFromEl.trigger('change');
          const popupReconInverted = popupDom.document.getElementById('aff-daily-reconciliation')?.innerHTML || "";

          // Restore to March for main asserts
          pFromEl.value = "2026-03";
          pToEl.value = "2026-03";
          pFromEl.trigger('change');

          // Check S1a data extraction directly with raw list
          const s1aDirect = taxSandbox.window.extractS1aData(testDataset, ["2026-03"], "monthly");

          // Test zeroBilling + positivePayout
          const zeroBillingPositivePayoutData = [
            { order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "0", total_payment_amount_dis: "0" },
            { paymentPayout: { payoutId: "SPV-ZERO-BILL", payoutCreatedTime: "1773554400", eligibleTotalAmount: "5000000000", totalPaymentAmount: "4500000000" } }
          ];
          const zeroBillDom = createMockDOM();
          zeroBillDom.chrome.storage.local._store["shopee_affiliate_billing_cache_v2"] = {
            updatedAt: Date.now(),
            list: zeroBillingPositivePayoutData
          };
          const zeroBillSandbox = {
            document: zeroBillDom.document, window: zeroBillDom.window, chrome: zeroBillDom.chrome, localStorage: zeroBillDom.localStorage,
            console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
          };
          vm.createContext(zeroBillSandbox);
          vm.runInContext(popupCode, zeroBillSandbox);
          zeroBillDom.document.getElementById('show-affiliate').click();
          await new Promise(r => setTimeout(r, 20));
          const zeroBillPopupGross = zeroBillDom.document.getElementById('affiliate-total-gross').textContent;
          const zeroBillDailyFoot = zeroBillDom.document.getElementById('aff-daily-tfoot').innerHTML;
          const zeroBillDailyRecon = zeroBillDom.document.getElementById('aff-daily-reconciliation')?.innerHTML || "";

          console.log(JSON.stringify({
            taxMonthlyHtml,
            taxSimpleHtml,
            taxDailyHtml,
            taxDailyHtmlGap,
            s1aTotal,
            s1aTbody,
            popupHeroGross,
            popupNet,
            popupSimpleHtml,
            popupFullHtml,
            popupDailyHtml,
            popupDailyFoot,
            popupReconHtml,
            popupReconGap,
            popupReconInverted,
            s1aDirectGrandTotal: s1aDirect.grandTotal,
            zeroBillPopupGross,
            zeroBillDailyFoot,
            zeroBillDailyRecon
          }));
        }, 50);
        """
        out = self.run_node(node_script)

        # 1. Full page tax_report.js: Monthly 10 cols, simple table, and S1a all show Payout Gross 1.135.331
        self.assertIn("1.135.331", out["taxMonthlyHtml"])
        self.assertIn("1.135.331", out["taxSimpleHtml"])
        self.assertIn("1.070.000", out["taxMonthlyHtml"]) # Distinct net after fees
        self.assertIn("50.000", out["taxMonthlyHtml"])    # Nonzero MCN
        self.assertEqual(out["s1aTotal"], "1.135.331")
        self.assertIn("1.135.331", out["s1aTbody"])
        self.assertEqual(out["s1aDirectGrandTotal"], 1135331)

        # 2. Daily Billing in tax_report remains 996.667
        self.assertIn("996.667", out["taxDailyHtml"])
        # Daily source reconciliation shows Billing 996.667, Payout 1.135.331, and signed difference +138.664 đ without raw duplicate
        self.assertIn("+138.664 đ", out["taxDailyHtml"])
        self.assertNotIn("(138664)", out["taxDailyHtml"])

        # 3. Popup extension: Hero card, Simple table, Full 10 cols all show Payout Gross 1.135.331 đ
        self.assertEqual(out["popupHeroGross"], "1.135.331 đ")
        self.assertIn("1.135.331", out["popupSimpleHtml"])
        self.assertIn("1.135.331", out["popupFullHtml"])
        # Popup daily table remains Billing gross 996.667 đ
        self.assertIn("996.667 đ", out["popupDailyFoot"])
        # Popup reconciliation shows signed difference +138.664 đ without raw duplicate
        self.assertIn("+138.664 đ", out["popupReconHtml"])
        self.assertNotIn("(138664)", out["popupReconHtml"])

        # 4. zeroBilling + positivePayout: popup card uses Payout 50.000 đ while daily billing remains 0 đ
        self.assertEqual(out["zeroBillPopupGross"], "50.000 đ")
        self.assertIn("0 đ", out["zeroBillDailyFoot"])
        self.assertIn("0 đ", out["zeroBillDailyRecon"])

        # 5. Gap / missing source handling: suppresses delta and flags missing months
        self.assertIn("Chưa đủ dữ liệu cả hai nguồn", out["taxDailyHtmlGap"])
        self.assertIn("thiếu 02/2026", out["taxDailyHtmlGap"])
        self.assertIn("Chưa đủ dữ liệu cả hai nguồn", out["popupReconGap"])
        self.assertIn("thiếu 02/2026", out["popupReconGap"])

        # 6. Inverted range clears stale reconciliation in popup
        self.assertEqual(out["popupReconInverted"], "")

    def test_19_payout_loss_prevention_across_all_three_entrypoints(self):
        """HIGH Blocker A: Prevent data loss on Payout failure across popup.js, tax_report.js, affiliate_content.js.
        Tests:
        1. Billing success + Payout 403/network error: preserves old Payout, March 1,135,331 still matches S1a, warnings recorded.
        2. Partial page failure: merges new with non-conflicting old, no duplicates, status reflects new vs retained.
        3. Authoritative empty: genuinely empty Payout clears old Payout (no phantom history).
        4. Unknown/malformed response: fails closed, preserves cache."""
        node_script = r"""
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        const STORAGE_KEY = "shopee_affiliate_billing_cache_v2";

        // Initial cache with March 2026 fixture (Billing 996,667, Payout 1,135,331)
        const initialMarchCache = [
          { order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667", total_payment_amount_dis: "986900" },
          {
            paymentPayout: {
              payoutId: "SPV-MAR-2026",
              payoutCreatedTime: "1773554400",
              eligibleTotalAmount: "113533100000",
              totalPaymentAmount: "107000000000",
              totalServiceFee: "1533100000",
              mcnManagementFee: "5000000000"
            }
          }
        ];

        // === Flow 1: Billing success, Payout 403 ===
        // 1A. popup.js
        const domPopup1 = createMockDOM();
        domPopup1.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: initialMarchCache };
        domPopup1.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            payoutSuccess: false,
            payoutIncomplete: true,
            payoutTotalCount: null,
            gqlIssues: "HTTP 403 Forbidden (circuit breaker)",
            billingData: {
              code: 0,
              data: { list: [{ order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667", total_payment_amount_dis: "986900" }] }
            },
            feeInvoices: []
          }
        }];
        const sandboxPopup1 = { document: domPopup1.document, window: domPopup1.window, chrome: domPopup1.chrome, localStorage: domPopup1.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxPopup1);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxPopup1);
        domPopup1.document.getElementById('fetch-affiliate-data').click();

        // 1B. tax_report.js
        const domTax1 = createMockDOM();
        domTax1.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: initialMarchCache };
        domTax1.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            payoutSuccess: false,
            payoutIncomplete: true,
            payoutTotalCount: null,
            gqlIssues: "HTTP 403 Forbidden",
            billingData: {
              code: 0,
              data: { list: [{ order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667", total_payment_amount_dis: "986900" }] }
            },
            feeInvoices: []
          }
        }];
        const sandboxTax1 = { document: domTax1.document, window: domTax1.window, chrome: domTax1.chrome, localStorage: domTax1.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxTax1);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax1);
        domTax1.document.getElementById('btn-fetch-live').click();

        // 1C. affiliate_content.js auto-sync with Billing success and Payout 403
        const domContent1 = createMockDOM();
        domContent1.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now() - 30 * 3600 * 1000, list: initialMarchCache };
        const sandboxContent1 = {
          document: domContent1.document, window: domContent1.window, chrome: domContent1.chrome, localStorage: domContent1.localStorage,
          console, setTimeout, clearTimeout,
          fetch: async (url) => {
            if (url.includes('billing_list')) {
              return { json: async () => ({ code: 0, data: { list: [{ order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667" }] } }) };
            }
            if (url.includes('getPayoutList')) {
              return { status: 403, json: async () => null };
            }
            return { status: 200, json: async () => ({}) };
          }
        };
        vm.createContext(sandboxContent1);
        vm.runInContext(fs.readFileSync('affiliate_content.js', 'utf8'), sandboxContent1);

        // === Flow 2: Partial paging failure ===
        const multiPayoutCache = [
          { paymentPayout: { payoutId: "P-01", payoutCreatedTime: "1773554400", eligibleTotalAmount: "1000000000", totalPaymentAmount: "900000000" } },
          { paymentPayout: { payoutId: "P-02", payoutCreatedTime: "1773640800", eligibleTotalAmount: "2000000000", totalPaymentAmount: "1800000000" } }
        ];
        const domTax2 = createMockDOM();
        domTax2.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: multiPayoutCache };
        domTax2.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [{ paymentPayout: { payoutId: "P-01", payoutCreatedTime: "1773554400", eligibleTotalAmount: "1500000000", totalPaymentAmount: "1350000000" } }],
            payoutSuccess: true,
            payoutIncomplete: true,
            payoutTotalCount: 2,
            gqlIssues: "Page 2 HTTP 504",
            billingData: { code: 0, data: { list: [] } },
            feeInvoices: []
          }
        }];
        const sandboxTax2 = { document: domTax2.document, window: domTax2.window, chrome: domTax2.chrome, localStorage: domTax2.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxTax2);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax2);
        domTax2.document.getElementById('btn-fetch-live').click();

        // === Flow 3: Authoritative empty Payout clears old Payout ===
        const domTax3 = createMockDOM();
        domTax3.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: initialMarchCache };
        domTax3.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            payoutSuccess: true,
            payoutIncomplete: false,
            payoutTotalCount: 0,
            gqlIssues: "",
            billingData: { code: 0, data: { list: [{ order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667" }] } },
            feeInvoices: []
          }
        }];
        const sandboxTax3 = { document: domTax3.document, window: domTax3.window, chrome: domTax3.chrome, localStorage: domTax3.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxTax3);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax3);
        domTax3.document.getElementById('btn-fetch-live').click();

        // === Flow 4: Malformed response fails closed ===
        const domTax4 = createMockDOM();
        domTax4.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: initialMarchCache };
        domTax4.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: null,
            payoutSuccess: false,
            gqlIssues: "Malformed payload",
            billingData: { code: 0, data: { list: [{ order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667" }] } },
            feeInvoices: []
          }
        }];
        const sandboxTax4 = { document: domTax4.document, window: domTax4.window, chrome: domTax4.chrome, localStorage: domTax4.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxTax4);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax4);
        domTax4.document.getElementById('btn-fetch-live').click();

        // === Flow 5: BOTH sources authoritative empty commits [] to cache and resets UI ===
        // 5A. Tax Report
        const domTax5 = createMockDOM();
        domTax5.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: initialMarchCache };
        domTax5.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            payoutSuccess: true,
            payoutIncomplete: false,
            payoutTotalCount: 0,
            gqlIssues: "",
            billingData: { code: 0, data: { list: [] } },
            feeInvoices: [],
            feeTotalCount: 0
          }
        }];
        const sandboxTax5 = { document: domTax5.document, window: domTax5.window, chrome: domTax5.chrome, localStorage: domTax5.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxTax5);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax5);
        domTax5.document.getElementById('btn-fetch-live').click();

        // 5B. Popup
        const domPopup5 = createMockDOM();
        domPopup5.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: initialMarchCache };
        domPopup5.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            payoutSuccess: true,
            payoutIncomplete: false,
            payoutTotalCount: 0,
            gqlIssues: "",
            billingData: { code: 0, data: { list: [] } },
            feeInvoices: [],
            feeTotalCount: 0
          }
        }];
        const sandboxPopup5 = { document: domPopup5.document, window: domPopup5.window, chrome: domPopup5.chrome, localStorage: domPopup5.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxPopup5);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxPopup5);
        domPopup5.document.getElementById('fetch-affiliate-data').click();

        // 5C. Content auto-sync
        const domContent5 = createMockDOM();
        domContent5.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now() - 30 * 3600 * 1000, list: initialMarchCache };
        const sandboxContent5 = {
          document: domContent5.document, window: domContent5.window, chrome: domContent5.chrome, localStorage: domContent5.localStorage,
          console, setTimeout, clearTimeout,
          location: { href: "https://affiliate.shopee.vn/payment/payout_record" },
          fetch: async (url) => {
            const u = String(url);
            if (u.includes("q=getPayoutList")) {
              return { status: 200, json: async () => ({ data: { getPaymentPayoutBillingList: { pagination: { totalCount: 0 }, payoutList: [] } } }) };
            }
            if (u.includes("billing_list")) {
              return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
            }
            if (u.includes("q=getPaymentSummaryBillFeeInvoiceList")) {
              return { status: 200, json: async () => ({ data: { getPaymentSummaryBillFeeInvoiceList: { totalCount: 0, paymentSummaryBillFeeInvoices: [] } } }) };
            }
            return { status: 200, json: async () => ({}) };
          }
        };
        vm.createContext(sandboxContent5);
        vm.runInContext(fs.readFileSync('affiliate_content.js', 'utf8'), sandboxContent5);

        // === Flow 6: MISSING payout metadata/array preserves historical Payout and warns ===
        // 6A. Tax Report (mock with ONLY valid billing list + feeInvoices)
        const domTax6 = createMockDOM();
        domTax6.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: initialMarchCache };
        domTax6.chrome.scripting.executeScript = async () => [{
          result: {
            billingData: { code: 0, data: { list: [{ order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667" }] } },
            feeInvoices: []
          }
        }];
        const sandboxTax6 = { document: domTax6.document, window: domTax6.window, chrome: domTax6.chrome, localStorage: domTax6.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxTax6);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax6);
        domTax6.document.getElementById('btn-fetch-live').click();

        // 6B. Popup
        const domPopup6 = createMockDOM();
        domPopup6.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: initialMarchCache };
        domPopup6.chrome.scripting.executeScript = async () => [{
          result: {
            billingData: { code: 0, data: { list: [{ order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667" }] } },
            feeInvoices: []
          }
        }];
        const sandboxPopup6 = { document: domPopup6.document, window: domPopup6.window, chrome: domPopup6.chrome, localStorage: domPopup6.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxPopup6);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxPopup6);
        domPopup6.document.getElementById('fetch-affiliate-data').click();

        // === Flow 7: Metadata string "false" must not be accepted as Boolean true ===
        const domTax7 = createMockDOM();
        domTax7.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: Date.now(), list: initialMarchCache };
        domTax7.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            payoutSuccess: "false",
            billingData: { code: 0, data: { list: [{ order_completed_period_start_time: 1772470800, eligible_total_amount_dis: "996667" }] } },
            feeInvoices: []
          }
        }];
        const sandboxTax7 = { document: domTax7.document, window: domTax7.window, chrome: domTax7.chrome, localStorage: domTax7.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(sandboxTax7);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax7);
        domTax7.document.getElementById('btn-fetch-live').click();

        setTimeout(async () => {
          // Flow 1 Popup
          const popupCache1 = domPopup1.chrome.storage.local._store[STORAGE_KEY];
          const popup1RetainedPayout = popupCache1.list.some(x => (x.paymentPayout?.payoutId || x.payoutId) === "SPV-MAR-2026");
          const popup1StatusText = domPopup1.document.getElementById('affiliate-status').textContent;
          const popup1HasWarn = (popupCache1.warnings || []).some(w => w.includes("Payout lỗi"));

          // Flow 1 Tax
          const taxCache1 = domTax1.chrome.storage.local._store[STORAGE_KEY];
          const tax1RetainedPayout = taxCache1.list.some(x => (x.paymentPayout?.payoutId || x.payoutId) === "SPV-MAR-2026");
          const tax1StatusText = domTax1.document.getElementById('status-text').textContent;
          // Trigger March selection to verify S1a display total
          domTax1.document.getElementById('select-from-month').value = "2026-03";
          domTax1.document.getElementById('select-to-month').value = "2026-03";
          domTax1.document.getElementById('select-from-month').trigger('change');
          const tax1S1aDispTotal = domTax1.document.getElementById('s1a-disp-total')?.textContent;
          const tax1HasWarn = (taxCache1.warnings || []).some(w => w.includes("Payout lỗi"));

          // Reopen Tax 1 from cache
          const domReopenTax1 = createMockDOM();
          domReopenTax1.chrome.storage.local._store[STORAGE_KEY] = taxCache1;
          const sandboxReopenTax1 = { document: domReopenTax1.document, window: domReopenTax1.window, chrome: domReopenTax1.chrome, localStorage: domReopenTax1.localStorage, console, setTimeout, clearTimeout, fetch: async () => ({}) };
          vm.createContext(sandboxReopenTax1);
          vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxReopenTax1);
          await new Promise(r => setTimeout(r, 30));
          const reopenTax1Status = domReopenTax1.document.getElementById('status-text').textContent;

          // Flow 1 Content auto-sync
          const contentCache1 = domContent1.chrome.storage.local._store[STORAGE_KEY];
          const content1RetainedPayout = contentCache1.list.some(x => (x.paymentPayout?.payoutId || x.payoutId) === "SPV-MAR-2026");

          // Flow 2 Partial paging
          const taxCache2 = domTax2.chrome.storage.local._store[STORAGE_KEY];
          const p1Item = taxCache2.list.find(x => (x.paymentPayout?.payoutId || x.payoutId) === "P-01");
          const p2Item = taxCache2.list.find(x => (x.paymentPayout?.payoutId || x.payoutId) === "P-02");
          const p1Count = taxCache2.list.filter(x => (x.paymentPayout?.payoutId || x.payoutId) === "P-01").length;
          const tax2StatusText = domTax2.document.getElementById('status-text').textContent;

          // Flow 3 Authoritative empty
          const taxCache3 = domTax3.chrome.storage.local._store[STORAGE_KEY];
          const tax3HasPayout = taxCache3.list.some(x => x.paymentPayout || x.payoutId);

          // Flow 4 Malformed fails closed
          const taxCache4 = domTax4.chrome.storage.local._store[STORAGE_KEY];
          const tax4RetainedPayout = taxCache4.list.some(x => (x.paymentPayout?.payoutId || x.payoutId) === "SPV-MAR-2026");

          // Flow 5 BOTH sources authoritative empty
          const taxCache5 = domTax5.chrome.storage.local._store[STORAGE_KEY];
          const tax5Count = taxCache5.list.length;
          const tax5StatusText = domTax5.document.getElementById('status-text').textContent;

          const popupCache5 = domPopup5.chrome.storage.local._store[STORAGE_KEY];
          const popup5Count = popupCache5.list.length;
          const popup5StatusText = domPopup5.document.getElementById('affiliate-status').textContent;

          const contentCache5 = domContent5.chrome.storage.local._store[STORAGE_KEY];
          const content5Count = contentCache5.list.length;

          // Flow 6 Missing payout metadata/array (only valid billing)
          const taxCache6 = domTax6.chrome.storage.local._store[STORAGE_KEY];
          const tax6RetainedPayout = taxCache6.list.some(x => (x.paymentPayout?.payoutId || x.payoutId) === "SPV-MAR-2026");
          const tax6StatusText = domTax6.document.getElementById('status-text').textContent;
          const tax6HasWarn = (taxCache6.warnings || []).some(w => w.includes("Payout"));

          const popupCache6 = domPopup6.chrome.storage.local._store[STORAGE_KEY];
          const popup6RetainedPayout = popupCache6.list.some(x => (x.paymentPayout?.payoutId || x.payoutId) === "SPV-MAR-2026");
          const popup6StatusText = domPopup6.document.getElementById('affiliate-status').textContent;

          // Flow 7 String "false"
          const taxCache7 = domTax7.chrome.storage.local._store[STORAGE_KEY];
          const tax7RetainedPayout = taxCache7.list.some(x => (x.paymentPayout?.payoutId || x.payoutId) === "SPV-MAR-2026");

          console.log(JSON.stringify({
            popup1RetainedPayout,
            popup1StatusText,
            popup1HasWarn,
            tax1RetainedPayout,
            tax1StatusText,
            tax1S1aDispTotal,
            tax1HasWarn,
            reopenTax1Status,
            content1RetainedPayout,
            p1Updated: p1Item?.paymentPayout?.eligibleTotalAmount === "1500000000",
            p2Preserved: Boolean(p2Item),
            p1NoDuplicate: p1Count === 1,
            tax2StatusText,
            tax3HasPayout,
            tax4RetainedPayout,
            tax5Count,
            tax5StatusText,
            popup5Count,
            popup5StatusText,
            content5Count,
            tax6RetainedPayout,
            tax6StatusText,
            tax6HasWarn,
            popup6RetainedPayout,
            popup6StatusText,
            tax7RetainedPayout
          }));
        }, 60);
        """
        out = self.run_node(node_script)

        # Flow 1: Billing success + Payout 403 retains historical payout across all 3 entrypoints
        self.assertTrue(out["popup1RetainedPayout"], "Popup must retain March Payout on 403")
        self.assertIn("giữ lại 1 kỳ thanh toán cũ", out["popup1StatusText"])
        self.assertIn("Cảnh báo: không lấy được kỳ thanh toán", out["popup1StatusText"])
        self.assertTrue(out["popup1HasWarn"], "Popup must persist Payout error warning")

        self.assertTrue(out["tax1RetainedPayout"], "tax_report must retain March Payout on 403")
        self.assertIn("Giữ lại 1 kỳ thanh toán cũ", out["tax1StatusText"])
        self.assertIn("Cảnh báo: không lấy được kỳ thanh toán", out["tax1StatusText"])
        self.assertEqual(out["tax1S1aDispTotal"], "1.135.331", "S1a must still render March Payout 1.135.331 after failed refresh")
        self.assertTrue(out["tax1HasWarn"], "tax_report must persist Payout error warning")
        self.assertIn("Payout lỗi: HTTP 403", out["reopenTax1Status"], "Restored cache must display visible warning")

        self.assertTrue(out["content1RetainedPayout"], "affiliate_content auto-sync must retain March Payout on 403")

        # Flow 2: Partial paging merges new with retained previous without duplicates
        self.assertTrue(out["p1Updated"], "New page 1 payout must be updated")
        self.assertTrue(out["p2Preserved"], "Page 2 payout from old cache must be preserved")
        self.assertTrue(out["p1NoDuplicate"], "Deduplication must prevent duplicate P-01 records")
        self.assertIn("Giữ lại 1 kỳ cũ không trùng", out["tax2StatusText"])

        # Flow 3: Authoritative empty clears old payouts
        self.assertFalse(out["tax3HasPayout"], "Authoritative empty response must clear old payouts without phantom history")

        # Flow 4: Malformed response fails closed preserving cache
        self.assertTrue(out["tax4RetainedPayout"], "Malformed response must fail closed preserving cached payout")

        # Flow 5: Both sources authoritative empty commits [] to cache and resets UI across all 3 entrypoints
        self.assertEqual(out["tax5Count"], 0, "Both authoritative empty must clear old cache in tax_report")
        self.assertIn("0 bản ghi ngày hoàn thành", out["tax5StatusText"])
        self.assertNotIn("Không tải được dữ liệu", out["tax5StatusText"])
        self.assertEqual(out["popup5Count"], 0, "Both authoritative empty must clear old cache in popup")
        self.assertIn("0 kỳ thanh toán", out["popup5StatusText"])
        self.assertEqual(out["content5Count"], 0, "Both authoritative empty must clear old cache in affiliate_content")

        # Flow 6: Missing payout metadata/array preserves historical Payout and warns
        self.assertTrue(out["tax6RetainedPayout"], "Missing payout metadata must preserve historical payout in tax_report")
        self.assertIn("Cảnh báo: không lấy được kỳ thanh toán", out["tax6StatusText"])
        self.assertTrue(out["tax6HasWarn"], "Missing payout metadata must record Payout warning in cache")
        self.assertTrue(out["popup6RetainedPayout"], "Missing payout metadata must preserve historical payout in popup")
        self.assertIn("Cảnh báo: không lấy được kỳ thanh toán", out["popup6StatusText"])

        # Flow 7: Metadata string 'false' must not be accepted as Boolean true
        self.assertTrue(out["tax7RetainedPayout"], "String 'false' for payoutSuccess must fail closed preserving cached payout")

    def test_20_timestamp_contract_and_print_active_tab_visibility(self):
        """Blocker B & D: Strict seconds timestamp contract and native print active tab visibility.
        1. Valid seconds (2000-2100) accepted end-to-end; millisecond timestamps strictly rejected across callers.
        2. @media print hides inactive tabs, displays .tab-content.active, blocks body.s1a-has-error.
        3. table.s1a-table maintains calc(100% - 2px) width with no right-border clipping.
        4. s1aSelectSource reference removed without errors."""
        node_script = r"""
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        // 1. Strict timestamp verification via parsePastedTextOrJson
        const taxDom = createMockDOM();
        const sandbox = {
          document: taxDom.document, window: taxDom.window, chrome: taxDom.chrome, localStorage: taxDom.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
        };
        const taxCode = fs.readFileSync('tax_report.js', 'utf8');
        vm.createContext(sandbox);
        vm.runInContext(taxCode, sandbox);

        const textarea = taxDom.document.getElementById('paste-textarea');
        const parseBtn = taxDom.document.getElementById('btn-parse-paste');
        const statusText = taxDom.document.getElementById('status-text');

        // Valid seconds (March 2026 GMT+7): should succeed
        textarea.value = '[{"order_completed_period_start_time":1772470800,"eligible_total_amount_dis":"996667"}]';
        parseBtn.click();
        const validSecondsAccepted = statusText.textContent.includes("thành công");

        // Milliseconds (13 digits): must be strictly rejected
        textarea.value = '[{"order_completed_period_start_time":1772470800000,"eligible_total_amount_dis":"996667"}]';
        parseBtn.click();
        const msBillingRejected = statusText.textContent.includes("Lỗi");

        // Payout milliseconds: must be strictly rejected
        textarea.value = '[{"paymentPayout":{"payoutId":"MS-1","payoutCreatedTime":"1773554400000","eligibleTotalAmount":"1000","totalPaymentAmount":"1000"}}]';
        parseBtn.click();
        const msPayoutRejected = statusText.textContent.includes("Lỗi");

        // Fee invoice milliseconds: must be strictly rejected
        textarea.value = '[{"isFeeInvoice":true,"paymentCompletePeriodStartTime":"1773554400000","totalServiceFee":"1000"}]';
        parseBtn.click();
        const msFeeRejected = statusText.textContent.includes("Lỗi");

        // Negative timestamp: strictly rejected
        textarea.value = '[{"order_completed_period_start_time":-1772470800,"eligible_total_amount_dis":"1000"}]';
        parseBtn.click();
        const negativeRejected = statusText.textContent.includes("Lỗi");

        // Year outside 2000-2100: strictly rejected (e.g. 946500000 = 1999)
        textarea.value = '[{"order_completed_period_start_time":946500000,"eligible_total_amount_dis":"1000"}]';
        parseBtn.click();
        const outOfRangeRejected = statusText.textContent.includes("Lỗi");

        // 2. Print stylesheet CSS inspection
        const htmlCode = fs.readFileSync('tax_report.html', 'utf8');
        const printCssMatch = htmlCode.match(/@media print\s*\{([\s\S]*?)\n\s*\}\s*<\/style>/);
        const printCss = printCssMatch ? printCssMatch[1] : "";

        const hidesInactive = printCss.includes('.tab-content:not(.active)') && printCss.includes('display: none !important');
        const showsActive = printCss.includes('.tab-content.active') && printCss.includes('display: block !important');
        const blocksErrorS1a = printCss.includes('body.s1a-has-error #tab-s1a') && printCss.includes('display: none !important');
        const noRightBorderRegression = printCss.includes('calc(100% - 2px)');
        const noHardcodedS1aOverride = !printCss.match(/#tab-s1a\s*\{\s*display:\s*block\s*!important/);

        // 3. Absence of s1aSelectSource reference
        const s1aSelectSourceInJs = taxCode.includes("s1aSelectSource");

        console.log(JSON.stringify({
          validSecondsAccepted,
          msBillingRejected,
          msPayoutRejected,
          msFeeRejected,
          negativeRejected,
          outOfRangeRejected,
          hidesInactive,
          showsActive,
          blocksErrorS1a,
          noRightBorderRegression,
          noHardcodedS1aOverride,
          s1aSelectSourceInJs
        }));
        """
        out = self.run_node(node_script)

        # 1. Timestamp contract
        self.assertTrue(out["validSecondsAccepted"], "Valid seconds timestamp must be accepted")
        self.assertTrue(out["msBillingRejected"], "Millisecond billing timestamp must be rejected under seconds contract")
        self.assertTrue(out["msPayoutRejected"], "Millisecond payout timestamp must be rejected under seconds contract")
        self.assertTrue(out["msFeeRejected"], "Millisecond fee timestamp must be rejected under seconds contract")
        self.assertTrue(out["negativeRejected"], "Negative timestamp must be rejected")
        self.assertTrue(out["outOfRangeRejected"], "Out of 2000-2100 year timestamp must be rejected")

        # 2. Print styles & active tab preservation
        self.assertTrue(out["hidesInactive"], "Inactive tabs must be hidden in @media print")
        self.assertTrue(out["showsActive"], "Active tab must be displayed in @media print")
        self.assertTrue(out["blocksErrorS1a"], "Invalid S1a must remain blocked from printing")
        self.assertTrue(out["noRightBorderRegression"], "table.s1a-table must preserve calc(100% - 2px) width")
        self.assertTrue(out["noHardcodedS1aOverride"], "Print CSS must not unconditionally force S1a display")

        # 3. Unused reference cleanup
        self.assertFalse(out["s1aSelectSourceInJs"], "s1aSelectSource reference must be removed from tax_report.js")

    def test_21_payout_pager_pagination_pagesize_and_pass3_billing_net_preservation(self):
        """Blocker 1 & 2:
        1. Actual injected fetch across tax_report.js, popup.js, affiliate_content.js:
           payout pageSize 2, totalCount omitted, page 1 two items, page 2 one item -> collects ALL 3 rather than stopping after 2.
        2. Pass 3 Billing fallback retains observed netPaid payment from API under fee invoice override without overwriting with billTotal,
           reconciles billTotal = gross - mcn - fee, no Payout fee/net overrides, canonical gross preserved."""
        node_script = """
        const { extractInjectedFunc, createMockDOM } = require('./tests/affiliate_harness.js');
        const fs = require('fs');
        const vm = require('vm');

        // Part 1: Payout pager across all 3 entrypoints
        async function testPager(fn) {
          global.fetch = async (url, opts = {}) => {
            if (url.includes('billing_list')) return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
            if (url.includes('getPaymentSummaryBillFeeInvoiceList')) {
              return { status: 200, json: async () => ({ data: { getPaymentSummaryBillFeeInvoiceList: { pageNum: 1, pageSize: 50, totalCount: 0, paymentSummaryBillFeeInvoices: [] } } }) };
            }
            let body = null;
            try { if (opts.body) body = JSON.parse(opts.body); } catch (_) {}
            const pageNum = body?.variables?.pageNum || 1;
            if (pageNum === 1) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [
                        { paymentPayout: { payoutId: 'P1', payoutCreatedTime: '1773554400', eligibleTotalAmount: '100000000', totalPaymentAmount: '90000000' } },
                        { paymentPayout: { payoutId: 'P2', payoutCreatedTime: '1773640800', eligibleTotalAmount: '200000000', totalPaymentAmount: '180000000' } }
                      ],
                      pagination: { pageNum: 1, pageSize: 2 } // totalCount omitted!
                    }
                  }
                })
              };
            } else if (pageNum === 2) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [
                        { paymentPayout: { payoutId: 'P3', payoutCreatedTime: '1773727200', eligibleTotalAmount: '300000000', totalPaymentAmount: '270000000' } }
                      ],
                      pagination: { pageNum: 2, pageSize: 2 } // totalCount omitted!
                    }
                  }
                })
              };
            } else {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [],
                      pagination: { pageNum: 3, pageSize: 2 }
                    }
                  }
                })
              };
            }
          };
          const res = await fn(1000, 2000);
          return { count: res.payouts.length, incomplete: res.payoutIncomplete };
        }

        async function testMixedTypeDuplicatePager(fn) {
          global.fetch = async (url, opts = {}) => {
            if (url.includes('billing_list')) return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
            if (url.includes('getPaymentSummaryBillFeeInvoiceList')) {
              return { status: 200, json: async () => ({ data: { getPaymentSummaryBillFeeInvoiceList: { pageNum: 1, pageSize: 50, totalCount: 0, paymentSummaryBillFeeInvoices: [] } } }) };
            }
            let body = null;
            try { if (opts.body) body = JSON.parse(opts.body); } catch (_) {}
            const pageNum = body?.variables?.pageNum || 1;
            if (pageNum === 1) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [
                        { paymentPayout: { payoutId: 1001, payoutCreatedTime: '1773554400', eligibleTotalAmount: '100000000', totalPaymentAmount: '90000000' } },
                        { paymentPayout: { payoutId: '1001', payoutCreatedTime: '1773554400', eligibleTotalAmount: '100000000', totalPaymentAmount: '90000000' } }
                      ],
                      pagination: { pageNum: 1, pageSize: 50, totalCount: 2 }
                    }
                  }
                })
              };
            } else if (pageNum === 2) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [
                        { paymentPayout: { payoutId: 1002, payoutCreatedTime: '1773640800', eligibleTotalAmount: '200000000', totalPaymentAmount: '180000000' } }
                      ],
                      pagination: { pageNum: 2, pageSize: 50, totalCount: 2 }
                    }
                  }
                })
              };
            }
            return {
              status: 200, headers: { get: () => null },
              json: async () => ({
                data: { getPaymentPayoutBillingList: { payoutList: [], pagination: { pageNum: 3, pageSize: 50, totalCount: 2 } } }
              })
            };
          };
          const res = await fn(1000, 2000);
          return { count: res.payouts.length, incomplete: res.payoutIncomplete, ids: res.payouts.map(x => String(x.paymentPayout?.payoutId || x.payoutId)) };
        }

        async function testContentScriptMixedTypeDuplicatePager() {
          const dom = createMockDOM();
          const STORAGE_KEY = 'shopee_affiliate_billing_cache_v2';
          dom.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: 0, list: [] };

          const mockFetch = async (url, opts = {}) => {
            if (url.includes('config/website')) return { status: 200, headers: { get: () => null }, text: async () => '{}' };
            if (url.includes('billing_list')) return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
            if (url.includes('getPaymentSummaryBillFeeInvoiceList')) {
              return { status: 200, json: async () => ({ data: { getPaymentSummaryBillFeeInvoiceList: { pageNum: 1, pageSize: 50, totalCount: 0, paymentSummaryBillFeeInvoices: [] } } }) };
            }
            let body = null;
            try { if (opts.body) body = JSON.parse(opts.body); } catch (_) {}
            const pageNum = body?.variables?.pageNum || 1;
            if (pageNum === 1) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [
                        { paymentPayout: { payoutId: 1001, payoutCreatedTime: '1773554400', eligibleTotalAmount: '100000000', totalPaymentAmount: '90000000' } },
                        { paymentPayout: { payoutId: '1001', payoutCreatedTime: '1773554400', eligibleTotalAmount: '100000000', totalPaymentAmount: '90000000' } }
                      ],
                      pagination: { pageNum: 1, pageSize: 50, totalCount: 2 }
                    }
                  }
                })
              };
            } else if (pageNum === 2) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [
                        { paymentPayout: { payoutId: 1002, payoutCreatedTime: '1773640800', eligibleTotalAmount: '200000000', totalPaymentAmount: '180000000' } }
                      ],
                      pagination: { pageNum: 2, pageSize: 50, totalCount: 2 }
                    }
                  }
                })
              };
            }
            return {
              status: 200, headers: { get: () => null },
              json: async () => ({
                data: { getPaymentPayoutBillingList: { payoutList: [], pagination: { pageNum: 3, pageSize: 50, totalCount: 2 } } }
              })
            };
          };

          const sandbox = {
            document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
            console, setTimeout: (fn, ms) => setTimeout(fn, 1), clearTimeout, fetch: mockFetch
          };
          vm.createContext(sandbox);
          vm.runInContext(fs.readFileSync('affiliate_content.js', 'utf8'), sandbox);

          await new Promise(r => setTimeout(r, 60));
          const list = dom.chrome.storage.local._store[STORAGE_KEY]?.list || [];
          return { count: list.length, ids: list.map(x => String(x.paymentPayout?.payoutId || x.payoutId)) };
        }

        async function testContentScriptPager() {
          const dom = createMockDOM();
          const STORAGE_KEY = 'shopee_affiliate_billing_cache_v2';
          dom.chrome.storage.local._store[STORAGE_KEY] = { updatedAt: 0, list: [] };

          const mockFetch = async (url, opts = {}) => {
            if (url.includes('config/website')) return { status: 200, headers: { get: () => null }, text: async () => '{}' };
            if (url.includes('billing_list')) return { status: 200, json: async () => ({ code: 0, data: { list: [] } }) };
            if (url.includes('getPaymentSummaryBillFeeInvoiceList')) {
              return { status: 200, json: async () => ({ data: { getPaymentSummaryBillFeeInvoiceList: { pageNum: 1, pageSize: 50, totalCount: 0, paymentSummaryBillFeeInvoices: [] } } }) };
            }
            let body = null;
            try { if (opts.body) body = JSON.parse(opts.body); } catch (_) {}
            const pageNum = body?.variables?.pageNum || 1;
            if (pageNum === 1) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [
                        { paymentPayout: { payoutId: 'P1', payoutCreatedTime: '1773554400', eligibleTotalAmount: '100000000', totalPaymentAmount: '90000000' } },
                        { paymentPayout: { payoutId: 'P2', payoutCreatedTime: '1773640800', eligibleTotalAmount: '200000000', totalPaymentAmount: '180000000' } }
                      ],
                      pagination: { pageNum: 1, pageSize: 2 } // totalCount omitted!
                    }
                  }
                })
              };
            } else if (pageNum === 2) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [
                        { paymentPayout: { payoutId: 'P3', payoutCreatedTime: '1773727200', eligibleTotalAmount: '300000000', totalPaymentAmount: '270000000' } }
                      ],
                      pagination: { pageNum: 2, pageSize: 2 } // totalCount omitted!
                    }
                  }
                })
              };
            } else {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      payoutList: [],
                      pagination: { pageNum: 3, pageSize: 2 }
                    }
                  }
                })
              };
            }
          };

          const sandbox = {
            document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
            console, setTimeout: (fn, ms) => setTimeout(fn, 1), clearTimeout, fetch: mockFetch
          };
          vm.createContext(sandbox);
          vm.runInContext(fs.readFileSync('affiliate_content.js', 'utf8'), sandbox);

          await new Promise(r => setTimeout(r, 60));
          const list = dom.chrome.storage.local._store[STORAGE_KEY]?.list || [];
          return { count: list.length };
        }

        // Part 2: Pass 3 observed netPaid retention under fee invoice override
        async function testPass3() {
          const domTax = createMockDOM();
          const STORAGE_KEY = 'shopee_affiliate_billing_cache_v2';

          const mayBilling = {
            order_completed_period_start_time: 1777654800, // May 2026
            eligible_total_amount_dis: '1000000',
            total_payment_amount_dis: '990200'
          };
          const mayFeeInvoice = {
            isFeeInvoice: true,
            monthKey: '2026-05',
            invoiceNumber: 'INV-MAY',
            totalServiceFee: 1500000000 // decScale -> 15000
          };
          const octPayout = {
            paymentPayout: {
              payoutId: 'OCT-P1',
              payoutCreatedTime: '1791140407', // Oct 2026
              eligibleTotalAmount: '200000000000', // micro 2M
              totalPaymentAmount: '180000000000'  // micro 1.8M
            }
          };
          const octFeeInvoice = {
            isFeeInvoice: true,
            monthKey: '2026-10',
            invoiceNumber: 'INV-OCT',
            totalServiceFee: 5000000000 // fee invoice for Oct (should NOT override Payout)
          };

          domTax.chrome.storage.local._store[STORAGE_KEY] = {
            updatedAt: Date.now(),
            list: [mayBilling, mayFeeInvoice, octPayout, octFeeInvoice]
          };

          const sandboxTax = {
            document: domTax.document, window: domTax.window, chrome: domTax.chrome, localStorage: domTax.localStorage,
            console, setTimeout, clearTimeout, fetch: async () => ({})
          };
          vm.createContext(sandboxTax);
          vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax);

          await new Promise(r => setTimeout(r, 50));
          const months = sandboxTax.window.processData();

          return {
            mayGross: months['2026-05'].gross,
            mayFee: months['2026-05'].fee,
            mayBillTotal: months['2026-05'].billTotal,
            mayNetPaid: months['2026-05'].netPaid,
            mayHasPayout: months['2026-05'].hasPayout,
            octGross: months['2026-10'].gross,
            octFee: months['2026-10'].fee,
            octNetPaid: months['2026-10'].netPaid,
            octHasPayout: months['2026-10'].hasPayout
          };
        }

        (async () => {
          const taxPager = await testPager(extractInjectedFunc('tax_report.js'));
          const popupPager = await testPager(extractInjectedFunc('popup.js'));
          const contentPager = await testContentScriptPager();
          const taxMixed = await testMixedTypeDuplicatePager(extractInjectedFunc('tax_report.js'));
          const popupMixed = await testMixedTypeDuplicatePager(extractInjectedFunc('popup.js'));
          const contentMixed = await testContentScriptMixedTypeDuplicatePager();
          const pass3Result = await testPass3();

          console.log(JSON.stringify({
            taxPagerCount: taxPager.count,
            popupPagerCount: popupPager.count,
            contentPagerCount: contentPager.count,
            taxMixed,
            popupMixed,
            contentMixed,
            pass3: pass3Result
          }));
        })();
        """
        out = self.run_node(node_script)

        # 1. Payout pager collects ALL 3 across all 3 entrypoints
        self.assertEqual(out["taxPagerCount"], 3, "tax_report.js must collect all 3 payouts when pageSize is 2 and totalCount omitted")
        self.assertEqual(out["popupPagerCount"], 3, "popup.js must collect all 3 payouts when pageSize is 2 and totalCount omitted")
        self.assertEqual(out["contentPagerCount"], 3, "affiliate_content.js must collect all 3 payouts when pageSize is 2 and totalCount omitted")

        # 1b. Normalization prevents premature stop on duplicate IDs across numeric and string representation
        for entry, res in [("tax_report.js", out["taxMixed"]), ("popup.js", out["popupMixed"]), ("affiliate_content.js", out["contentMixed"])]:
            self.assertEqual(res["count"], 2, f"{entry} must collect exactly 2 unique payout items")
            self.assertEqual(res["ids"], ["1001", "1002"], f"{entry} must normalize and collect 1001 and 1002")
            if "incomplete" in res:
                self.assertFalse(res["incomplete"], f"{entry} must fetch page 2 and complete without incomplete flag")

        # 2. Pass 3 Billing fallback retains observed netPaid from API under fee invoice override
        p3 = out["pass3"]
        self.assertFalse(p3["mayHasPayout"], "May 2026 must be Billing fallback (hasPayout false)")
        self.assertEqual(p3["mayGross"], 1000000, "May 2026 canonical gross must be 1,000,000")
        self.assertEqual(p3["mayFee"], 15000, "May 2026 fee must be overridden with invoice fee 15,000")
        self.assertEqual(p3["mayBillTotal"], 985000, "May 2026 billTotal must reconcile gross - fee = 985,000")
        self.assertEqual(p3["mayNetPaid"], 990200, "May 2026 observed netPaid (990,200) from API must be preserved, not overwritten with billTotal")

        # 3. Payout month is untouched by fee invoice override
        self.assertTrue(p3["octHasPayout"], "Oct 2026 must be Payout priority (hasPayout true)")
        self.assertEqual(p3["octGross"], 2000000, "Oct 2026 canonical gross must be 2,000,000")
        self.assertEqual(p3["octFee"], 200000, "Oct 2026 fee must remain Payout fee (200,000), not overridden by fee invoice")
        self.assertEqual(p3["octNetPaid"], 1800000, "Oct 2026 netPaid must remain Payout net (1,800,000)")

    def test_22_csrf_reuse_across_subsequent_pages_all_entrypoints(self):
        """1: Reuse csrfToken on first request of each subsequent Payout/feeinvoice page, all 3 entrypoints.
        First challenge finds token/retry, then next pages (>=3 pages) must send token immediately on first attempt,
        collect all Payout + invoices, and not trip the circuit breaker."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { extractInjectedFunc, createMockDOM } = require('./tests/affiliate_harness.js');

        const SERVER_CSRF = "secret-csrf-token-12345";

        function createCsrfFetch(recordRequests) {
          return async (url, opts = {}) => {
            if (url.includes('billing_list')) {
              return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ code: 0, data: { list: [] } }), json: async () => ({ code: 0, data: { list: [] } }) };
            }
            if (url.includes('/api/v3/config/website')) {
              return {
                status: 200,
                headers: { get: (h) => (h.toLowerCase() === 'csrf-token' ? SERVER_CSRF : null) },
                text: async () => JSON.stringify({ csrf_token: SERVER_CSRF }),
                json: async () => ({ csrf_token: SERVER_CSRF })
              };
            }
            const body = opts.body ? JSON.parse(opts.body) : {};
            const headers = opts.headers || {};
            const sentToken = headers['CSRF-token'];

            if (url.includes('getPayoutList') || body.operationName === 'getPaymentPayoutBillingList') {
              const pageNum = body.variables?.pageNum || 1;
              recordRequests.push({ type: 'payout', pageNum, hasToken: Boolean(sentToken), token: sentToken });
              if (sentToken !== SERVER_CSRF) {
                return { status: 403, headers: { get: () => null }, text: async () => '{}', json: async () => ({ code: 403, message: 'Missing CSRF' }) };
              }
              return {
                status: 200,
                headers: { get: (h) => (h.toLowerCase() === 'csrf-token' ? SERVER_CSRF : null) },
                text: async () => '{}',
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      pagination: { pageNum, pageSize: 1, totalCount: 3 },
                      payoutList: [{ paymentPayout: { payoutId: `P-${pageNum}`, payoutCreatedTime: 1785603600, eligibleTotalAmount: "1000", totalPaymentAmount: "900" } }]
                    }
                  }
                })
              };
            }

            if (url.includes('getPaymentSummaryBillFeeInvoiceList') || body.operationName === 'GetPaymentSummaryBillFeeInvoiceListQuery') {
              const pageNum = body.variables?.pageNum || 1;
              recordRequests.push({ type: 'fee', pageNum, hasToken: Boolean(sentToken), token: sentToken });
              if (sentToken !== SERVER_CSRF) {
                return { status: 403, headers: { get: () => null }, text: async () => '{}', json: async () => ({ code: 403, message: 'Missing CSRF' }) };
              }
              return {
                status: 200,
                headers: { get: (h) => (h.toLowerCase() === 'csrf-token' ? SERVER_CSRF : null) },
                text: async () => '{}',
                json: async () => ({
                  data: {
                    getPaymentSummaryBillFeeInvoiceList: {
                      pageNum, pageSize: 1, totalCount: 3,
                      paymentSummaryBillFeeInvoices: [{
                        paymentCompletePeriodStartTime: String(1000 * pageNum),
                        totalServiceFee: "50000",
                        paymentSummaryBillFeeInvoices: [{ invoiceNumber: `INV-${pageNum}` }]
                      }]
                    }
                  }
                })
              };
            }
            return { status: 200, headers: { get: () => null }, json: async () => ({}) };
          };
        }

        async function testEntrypoint(fn) {
          const requests = [];
          global.fetch = createCsrfFetch(requests);
          const res = await fn(1000, 2000);
          return { res, requests };
        }

        async function testContentScript(origTimer) {
          const requests = [];
          const dom = createMockDOM();
          const mockFetch = createCsrfFetch(requests);
          const sandbox = {
            document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
            console, setTimeout: (fn) => origTimer(fn, 1), clearTimeout, fetch: mockFetch
          };
          vm.createContext(sandbox);
          vm.runInContext(fs.readFileSync('affiliate_content.js', 'utf8'), sandbox);
          await new Promise(r => origTimer(r, 100));
          const cached = dom.chrome.storage.local._store['shopee_affiliate_billing_cache_v2'] || {};
          return { cached, requests };
        }

        (async () => {
          const origSetTimeout = global.setTimeout;
          global.setTimeout = (fn, ms) => origSetTimeout(fn, 1);

          const fnTax = extractInjectedFunc('tax_report.js');
          const fnPopup = extractInjectedFunc('popup.js');

          const taxOut = await testEntrypoint(fnTax);
          const popupOut = await testEntrypoint(fnPopup);
          const contentOut = await testContentScript(origSetTimeout);

          console.log(JSON.stringify({
            tax: {
              payoutCount: taxOut.res.payouts.length,
              feeCount: taxOut.res.feeInvoices.length,
              payoutIncomplete: taxOut.res.payoutIncomplete,
              feeIncomplete: taxOut.res.feeIncomplete,
              requests: taxOut.requests
            },
            popup: {
              payoutCount: popupOut.res.payouts.length,
              feeCount: popupOut.res.feeInvoices.length,
              payoutIncomplete: popupOut.res.payoutIncomplete,
              feeIncomplete: popupOut.res.feeIncomplete,
              requests: popupOut.requests
            },
            content: {
              listCount: (contentOut.cached.list || []).length,
              warnings: contentOut.cached.warnings || [],
              requests: contentOut.requests
            }
          }));
        })();
        """
        out = self.run_node(node_script)
        # Tax report: collected all 3 payouts and 3 invoices across 3 pages without circuit breaker
        self.assertEqual(out["tax"]["payoutCount"], 3)
        self.assertEqual(out["tax"]["feeCount"], 3)
        self.assertFalse(out["tax"]["payoutIncomplete"])
        self.assertFalse(out["tax"]["feeIncomplete"])

        # Check payout page 2 and 3 sent token on first try
        payoutReqsTax = [r for r in out["tax"]["requests"] if r["type"] == "payout"]
        self.assertFalse(payoutReqsTax[0]["hasToken"]) # page 1 first attempt challenged
        self.assertTrue(payoutReqsTax[1]["hasToken"])  # page 1 retry has token
        self.assertTrue(payoutReqsTax[2]["hasToken"])  # page 2 FIRST attempt has token!
        self.assertTrue(payoutReqsTax[3]["hasToken"])  # page 3 FIRST attempt has token!

        # Check fee invoice pages sent token immediately
        feeReqsTax = [r for r in out["tax"]["requests"] if r["type"] == "fee"]
        self.assertTrue(all(r["hasToken"] for r in feeReqsTax))

        # Popup: same invariants
        self.assertEqual(out["popup"]["payoutCount"], 3)
        self.assertEqual(out["popup"]["feeCount"], 3)
        self.assertFalse(out["popup"]["payoutIncomplete"])
        self.assertFalse(out["popup"]["feeIncomplete"])

        # Content script: collected all payouts and invoices
        self.assertEqual(out["content"]["listCount"], 6)
        self.assertEqual(out["content"]["warnings"], [])

    def test_23_invoice_pager_dedup_unnumbered_and_numbered_invoices(self):
        """2: Invoice pager dedup: 2 unnumbered invoices same period DIFFERENT amounts both kept,
        repeat item across pages not double counted, known numbered invoices deduped across all 3 fetch paths."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { extractInjectedFunc, createMockDOM } = require('./tests/affiliate_harness.js');

        function createDedupFetch() {
          return async (url, opts = {}) => {
            if (url.includes('billing_list')) return { status: 200, json: async () => ({ code: 0, data: { list: [{ order_completed_period_start_time: 1767200400, eligible_total_amount_dis: '100' }] } }) };
            if (url.includes('getPayoutList') || url.includes('getPaymentPayoutBillingList')) {
              return { status: 200, headers: { get: () => null }, json: async () => ({ data: { getPaymentPayoutBillingList: { pagination: { totalCount: 0 }, payoutList: [] } } }) };
            }
            const body = opts.body ? JSON.parse(opts.body) : {};
            const pageNum = body.variables?.pageNum || 1;
            if (pageNum === 1) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentSummaryBillFeeInvoiceList: {
                      pageNum: 1, pageSize: 3, totalCount: 6,
                      paymentSummaryBillFeeInvoices: [
                        { paymentCompletePeriodStartTime: '1000', totalServiceFee: '50000' },
                        { paymentCompletePeriodStartTime: '1000', totalServiceFee: '70000' },
                        { paymentCompletePeriodStartTime: '1000', totalServiceFee: '10000', paymentSummaryBillFeeInvoices: [{ invoiceNumber: 'INV-101' }] }
                      ]
                    }
                  }
                })
              };
            } else {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentSummaryBillFeeInvoiceList: {
                      pageNum: 2, pageSize: 3, totalCount: 6,
                      paymentSummaryBillFeeInvoices: [
                        { paymentCompletePeriodStartTime: '1000', totalServiceFee: '50000' },
                        { paymentCompletePeriodStartTime: '1000', totalServiceFee: '10000', paymentSummaryBillFeeInvoices: [{ invoiceNumber: 'INV-101' }] },
                        { paymentCompletePeriodStartTime: '1000', totalServiceFee: '20000', paymentSummaryBillFeeInvoices: [{ invoiceNumber: 'INV-102' }] }
                      ]
                    }
                  }
                })
              };
            }
          };
        }

        async function testContentScript(origTimer) {
          const dom = createMockDOM();
          const sandbox = {
            document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
            console, setTimeout: (fn) => origTimer(fn, 1), clearTimeout, fetch: createDedupFetch()
          };
          vm.createContext(sandbox);
          vm.runInContext(fs.readFileSync('affiliate_content.js', 'utf8'), sandbox);
          await new Promise(r => origTimer(r, 100));
          const list = dom.chrome.storage.local._store['shopee_affiliate_billing_cache_v2']?.list || [];
          return list.filter(x => x.isFeeInvoice);
        }

        (async () => {
          const origSetTimeout = global.setTimeout;
          global.setTimeout = (fn, ms) => origSetTimeout(fn, 1);
          const fnTax = extractInjectedFunc('tax_report.js');
          const fnPopup = extractInjectedFunc('popup.js');

          global.fetch = createDedupFetch();
          const resTax = await fnTax(1000, 2000);
          global.fetch = createDedupFetch();
          const resPopup = await fnPopup(1000, 2000);
          const contentInvoices = await testContentScript(origSetTimeout);

          console.log(JSON.stringify({
            taxCount: resTax.feeInvoices.length,
            taxInvoices: resTax.feeInvoices.map(x => ({ period: x.paymentCompletePeriodStartTime, fee: x.totalServiceFee, num: x.invoiceNumber })),
            popupCount: resPopup.feeInvoices.length,
            contentCount: contentInvoices.length
          }));
        })();
        """
        out = self.run_node(node_script)
        # All 3 fetch paths keep 2 distinct unnumbered invoices + 2 distinct numbered invoices (4 total, no double counting)
        self.assertEqual(out["taxCount"], 4)
        self.assertEqual(out["popupCount"], 4)
        self.assertEqual(out["contentCount"], 4)

        fees = [x["fee"] for x in out["taxInvoices"]]
        self.assertIn("50000", fees)
        self.assertIn("70000", fees)
        self.assertIn("10000", fees)
        self.assertIn("20000", fees)

    def test_24_popup_load_affiliate_summary_pay_arrival_time_only(self):
        """3: popup.loadAffiliateSummary month options with payArrivalTime-only valid Payouts.
        Nested and top-level fallbacks consistent with metrics/S1a, seconds/GMT7 contract.
        Actual DOM test ensures selectable month and card rendering for payArrival only."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        const dom = createMockDOM();
        const mockList = [
          // 1. Nested payArrivalTime only (August 2026 GMT+7: 1785603600 = 2026-08-01 00:00:00 GMT+7)
          {
            paymentPayout: {
              payoutId: 'P_AUG',
              payArrivalTime: '1785603600',
              eligibleTotalAmount: '100000000000', // 1,000,000 gross
              totalPaymentAmount: '90000000000'   // 900,000 net
            }
          },
          // 2. Top-level payArrivalTime only (September 2026 GMT+7: 1788282000 = 2026-09-01 00:00:00 GMT+7)
          {
            payoutId: 'P_SEP',
            payArrivalTime: 1788282000,
            eligibleTotalAmount: '200000000000', // 2,000,000 gross
            totalPaymentAmount: '180000000000'  // 1,800,000 net
          }
        ];

        dom.chrome.storage.local._store['shopee_affiliate_billing_cache_v2'] = {
          updatedAt: Date.now(),
          list: mockList
        };

        const sandbox = {
          document: dom.document,
          window: dom.window,
          chrome: dom.chrome,
          localStorage: dom.localStorage,
          console,
          setTimeout,
          clearTimeout,
          Intl,
          Date,
          Math,
          Number,
          String,
          Array,
          Object,
          Set,
          Map,
          parseInt,
          parseFloat,
          isNaN
        };

        vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandbox);

        (async () => {
          await sandbox.loadAffiliateSummary();

          const fromOptions = [];
          const fromSelect = dom.elements['popup-from-month'];
          for (const child of fromSelect.children) fromOptions.push(child.value);

          const toOptions = [];
          const toSelect = dom.elements['popup-to-month'];
          for (const child of toSelect.children) toOptions.push(child.value);

          // Select August only
          fromSelect.value = '2026-08';
          toSelect.value = '2026-08';
          sandbox.updateAffiliateSummaryMetrics();

          const grossText = dom.elements['affiliate-total-gross'].textContent;
          const netText = dom.elements['affiliate-net-tk'].textContent;
          const statusText = dom.elements['affiliate-status'].textContent;

          console.log(JSON.stringify({
            fromOptions,
            toOptions,
            grossText,
            netText,
            statusText
          }));
        })();
        """
        out = self.run_node(node_script)
        self.assertIn("2026-08", out["fromOptions"])
        self.assertIn("2026-09", out["fromOptions"])
        self.assertIn("2026-08", out["toOptions"])
        self.assertIn("2026-09", out["toOptions"])
        self.assertIn("1.000.000 đ", out["grossText"])
        self.assertIn("900.000 đ", out["netText"])
        self.assertIn("2 Payout", out["statusText"])

    def test_25_sync_paths_persist_warning_when_payout_incomplete(self):
        """4: ALL 3 sync paths must persist warning whenever payoutIncomplete true even if payouts[] AND prevPayouts[]
        but Billing valid. Cache warning visible when reopened, not false complete. Authoritative BOTH empty clears."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        const STORAGE_KEY = 'shopee_affiliate_billing_cache_v2';

        // 1. Popup sync path
        async function testPopupSync(payoutIncomplete, payoutTotalCount) {
          const dom = createMockDOM();
          const mockResult = {
            payouts: [],
            payoutSuccess: true,
            payoutIncomplete: payoutIncomplete,
            payoutTotalCount: payoutTotalCount,
            gqlIssues: payoutIncomplete ? 'Dừng tải sớm: nhận 0/' + payoutTotalCount + ' bản ghi Payout.' : '',
            billingData: { code: 0, data: { list: [{ order_completed_period_start_time: 1767200400, eligible_total_amount_dis: '100' }] } },
            feeInvoices: [],
            feeIncomplete: false
          };

          dom.chrome.scripting.executeScript = async () => [{ result: mockResult }];

          const sandbox = {
            document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
            console, setTimeout, clearTimeout, Intl, Date, Math, Number, String, Array, Object, Set, Map, parseInt, parseFloat, isNaN
          };
          vm.createContext(sandbox);
          vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandbox);

          dom.elements['fetch-affiliate-data'].trigger('click');
          await new Promise(r => setTimeout(r, 60));
          await sandbox.loadAffiliateSummary();

          const store = dom.chrome.storage.local._store[STORAGE_KEY];
          const status = dom.elements['affiliate-status'].textContent;
          return { warnings: store?.warnings || [], status };
        }

        // 2. Tax report sync path
        async function testTaxSync(payoutIncomplete, payoutTotalCount) {
          const dom = createMockDOM();
          const mockResult = {
            payouts: [],
            payoutSuccess: true,
            payoutIncomplete: payoutIncomplete,
            payoutTotalCount: payoutTotalCount,
            gqlIssues: payoutIncomplete ? 'Dừng tải sớm: nhận 0/' + payoutTotalCount + ' bản ghi Payout.' : '',
            billingData: { code: 0, data: { list: [{ order_completed_period_start_time: 1767200400, eligible_total_amount_dis: '100' }] } },
            feeInvoices: [],
            feeIncomplete: false
          };

          dom.chrome.scripting.executeScript = async () => [{ result: mockResult }];

          const sandbox = {
            document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
            console, setTimeout, clearTimeout, Intl, Date, Math, Number, String, Array, Object, Set, Map, parseInt, parseFloat, isNaN
          };
          vm.createContext(sandbox);
          vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandbox);

          dom.elements['btn-fetch-live'].trigger('click');
          await new Promise(r => setTimeout(r, 60));

          const store = dom.chrome.storage.local._store[STORAGE_KEY];
          return { warnings: store?.warnings || [] };
        }

        // 3. Content script sync path
        async function testContentSync(payoutIncomplete, payoutTotalCount) {
          const dom = createMockDOM();
          const mockFetch = async (url) => {
            if (url.includes('billing_list')) {
              return { status: 200, json: async () => ({ code: 0, data: { list: [{ order_completed_period_start_time: 1767200400, eligible_total_amount_dis: '100' }] } }) };
            }
            if (url.includes('getPayoutList')) {
              return {
                status: 200, headers: { get: () => null },
                json: async () => ({
                  data: {
                    getPaymentPayoutBillingList: {
                      pagination: { totalCount: payoutTotalCount, pageNum: 1, pageSize: 50 },
                      payoutList: []
                    }
                  }
                })
              };
            }
            if (url.includes('getPaymentSummaryBillFeeInvoiceList')) {
              return { status: 200, headers: { get: () => null }, json: async () => ({ data: { getPaymentSummaryBillFeeInvoiceList: { totalCount: 0, paymentSummaryBillFeeInvoices: [] } } }) };
            }
            return { status: 200, json: async () => ({}) };
          };

          const sandbox = {
            document: dom.document, window: dom.window, chrome: dom.chrome, localStorage: dom.localStorage,
            console, setTimeout: (fn, ms) => setTimeout(fn, 1), clearTimeout, fetch: mockFetch
          };
          vm.createContext(sandbox);
          vm.runInContext(fs.readFileSync('affiliate_content.js', 'utf8'), sandbox);

          await new Promise(r => setTimeout(r, 60));
          const store = dom.chrome.storage.local._store[STORAGE_KEY];
          return { warnings: store?.warnings || [] };
        }

        (async () => {
          const p1 = await testPopupSync(true, 5);
          const t1 = await testTaxSync(true, 5);
          const c1 = await testContentSync(true, 5);

          const p2 = await testPopupSync(false, 0);
          console.log(JSON.stringify({
            popupIncomplete: p1,
            taxIncomplete: t1,
            contentIncomplete: c1,
            popupAuthoritativeClean: p2
          }));
        })();
        """
        out = self.run_node(node_script)
        # All 3 paths persist warnings when payout is incomplete even with 0 payouts and 0 prevPayouts
        self.assertTrue(len(out["popupIncomplete"]["warnings"]) > 0)
        self.assertIn("Payout", out["popupIncomplete"]["warnings"][0])
        self.assertIn("Cảnh báo:", out["popupIncomplete"]["status"])

        self.assertTrue(len(out["taxIncomplete"]["warnings"]) > 0)
        self.assertIn("Payout", out["taxIncomplete"]["warnings"][0])

        self.assertTrue(len(out["contentIncomplete"]["warnings"]) > 0)
        self.assertIn("Payout", out["contentIncomplete"]["warnings"][0])

        # Authoritative BOTH empty clears warnings cleanly
        self.assertEqual(out["popupAuthoritativeClean"]["warnings"], [])
        self.assertNotIn("Cảnh báo:", out["popupAuthoritativeClean"]["status"])

    def test_26_postman_spawn_error_clean_failure(self):
        """5: test08Postman childprocesshandlers referenced tested/safetyTimer declared later.
        Declare tested=false, safetyTimer=null BEFORE registering error/close listeners.
        Test no Postman spawn path reports clean failure, not ReferenceError; no timeout raises."""
        node_script = """
        const { spawn } = require('child_process');

        let tested = false;
        let safetyTimer = null;

        const sim = spawn('nonexistent-postman-binary-xyz', ['simulation', 'run']);

        sim.on('error', (err) => {
          if (tested) return;
          tested = true;
          clearTimeout(safetyTimer);
          console.error('Failed to start postman simulation (is Postman CLI installed?):', err.message);
          process.exit(1);
        });

        sim.on('close', (code) => {
          if (!tested) {
            tested = true;
            clearTimeout(safetyTimer);
            console.error(`Postman simulation closed unexpectedly before listening (exit code ${code})`);
            process.exit(1);
          }
        });

        safetyTimer = setTimeout(() => {
          if (!tested) {
            tested = true;
            console.error('Timed out waiting for simulation');
            process.exit(2);
          }
        }, 3000);
        """
        res = subprocess.run(
            ["node", "-e", node_script],
            capture_output=True,
            text=True,
            timeout=5
        )
        self.assertEqual(res.returncode, 1)
        self.assertIn("Failed to start postman simulation", res.stderr)
        self.assertNotIn("ReferenceError", res.stderr)
        self.assertNotIn("Timed out", res.stderr)

    def test_27_cache_boundary_null_tolerance_and_id_trim_normalization(self):
        """Regression tests for:
        1. Cache list boundary normalization: drop null, undefined, primitives, arrays while retaining valid records;
           safe in popup and tax_report; seed null+valid cached Payout 1135331 / Billing 996667, refresh failure retains records;
           API billing items with null/invalid do not replace valid cache.
        2. Consistent getPayoutId trim normalization: new ID "1001" vs old " 1001 " replaces one, preserves other, no dups.
        3. Malformed node.payoutList (e.g. non-array / null) marks incomplete with gqlIssues and does NOT clear old payout even if totalCount: 0."""
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const { createMockDOM } = require('./tests/affiliate_harness.js');

        const STORAGE_KEY = "shopee_affiliate_billing_cache_v2";
        const validPayout = {
          paymentPayout: {
            payoutId: " 1001 ",
            payoutCreatedTime: "1773554400",
            eligibleTotalAmount: "113533100000",
            totalPaymentAmount: "107000000000"
          }
        };
        const validOtherPayout = {
          paymentPayout: {
            payoutId: " 1002 ",
            payoutCreatedTime: "1773640800",
            eligibleTotalAmount: "2000000000",
            totalPaymentAmount: "1800000000"
          }
        };
        const validBilling = {
          order_completed_period_start_time: 1772470800,
          eligible_total_amount_dis: "996667",
          total_payment_amount_dis: "986900"
        };

        // Cache seeded with dirty items: null, undefined, primitive string, number, array, and valid records
        const dirtySeed = [null, validBilling, undefined, "invalid-str", 42, [], validPayout, validOtherPayout];

        // --- Test 1A: affiliate_content.js auto-sync with refresh failure retains valid records without TypeError ---
        const domContent = createMockDOM();
        domContent.chrome.storage.local._store[STORAGE_KEY] = {
          updatedAt: Date.now() - 30 * 3600 * 1000,
          list: dirtySeed
        };
        const sandboxContent = {
          document: domContent.document, window: domContent.window, chrome: domContent.chrome, localStorage: domContent.localStorage,
          console, setTimeout: (fn, ms) => setTimeout(fn, 1), clearTimeout,
          fetch: async (url) => {
            if (url.includes('billing_list')) {
              // Billing API failure
              return { status: 500, json: async () => ({ code: 500, msg: "Server Error" }) };
            }
            if (url.includes('getPayoutList')) {
              // Payout API failure
              return { status: 403, json: async () => null };
            }
            return { status: 200, json: async () => ({}) };
          }
        };
        vm.createContext(sandboxContent);
        vm.runInContext(fs.readFileSync('affiliate_content.js', 'utf8'), sandboxContent);

        // --- Test 1B: Popup rendering dirty cache without crashing ---
        const domPopup = createMockDOM();
        domPopup.chrome.storage.local._store[STORAGE_KEY] = {
          updatedAt: Date.now(),
          list: dirtySeed
        };
        const sandboxPopup = {
          document: domPopup.document, window: domPopup.window, chrome: domPopup.chrome, localStorage: domPopup.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({})
        };
        vm.createContext(sandboxPopup);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxPopup);
        domPopup.document.getElementById('show-affiliate').click();

        // --- Test 1C: Tax report rendering dirty cache without crashing ---
        const domTax = createMockDOM();
        domTax.chrome.storage.local._store[STORAGE_KEY] = {
          updatedAt: Date.now(),
          list: dirtySeed
        };
        const sandboxTax = {
          document: domTax.document, window: domTax.window, chrome: domTax.chrome, localStorage: domTax.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({})
        };
        vm.createContext(sandboxTax);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTax);

        // --- Test 2: Payout ID trim normalization during partial refresh ---
        // Popup partial refresh with new ID "1001" (no spaces) vs old " 1001 " (spaces)
        const domPopupMerge = createMockDOM();
        domPopupMerge.chrome.storage.local._store[STORAGE_KEY] = {
          updatedAt: Date.now(),
          list: [validPayout, validOtherPayout, validBilling]
        };
        domPopupMerge.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [{
              paymentPayout: {
                payoutId: "1001", // Trimmed new ID
                payoutCreatedTime: "1773554400",
                eligibleTotalAmount: "120000000000", // Updated amount
                totalPaymentAmount: "110000000000"
              }
            }],
            payoutSuccess: true,
            payoutIncomplete: true, // partial load
            payoutTotalCount: 2,
            gqlIssues: "Partial network interruption",
            billingData: { code: 0, data: { list: [validBilling] } },
            feeInvoices: []
          }
        }];
        const sandboxPopupMerge = {
          document: domPopupMerge.document, window: domPopupMerge.window, chrome: domPopupMerge.chrome, localStorage: domPopupMerge.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({})
        };
        vm.createContext(sandboxPopupMerge);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxPopupMerge);
        domPopupMerge.document.getElementById('fetch-affiliate-data').click();

        // --- Test 3: API billing list containing null / malformed items must mark failure & preserve old billing ---
        const domTaxBillingMalformed = createMockDOM();
        domTaxBillingMalformed.chrome.storage.local._store[STORAGE_KEY] = {
          updatedAt: Date.now(),
          list: [validBilling]
        };
        domTaxBillingMalformed.chrome.scripting.executeScript = async () => [{
          result: {
            payouts: [],
            payoutSuccess: false,
            payoutIncomplete: true,
            billingData: {
              code: 0,
              data: { list: [null, { invalid: true }] } // Malformed item in billing list
            },
            feeInvoices: []
          }
        }];
        const sandboxTaxBillingMalformed = {
          document: domTaxBillingMalformed.document, window: domTaxBillingMalformed.window, chrome: domTaxBillingMalformed.chrome, localStorage: domTaxBillingMalformed.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({})
        };
        vm.createContext(sandboxTaxBillingMalformed);
        vm.runInContext(fs.readFileSync('tax_report.js', 'utf8'), sandboxTaxBillingMalformed);
        domTaxBillingMalformed.document.getElementById('btn-fetch-live').click();

        // --- Test 4: Malformed node.payoutList with totalCount: 0 must NOT clear old payout ---
        const domPopupMalformedList = createMockDOM();
        domPopupMalformedList.chrome.storage.local._store[STORAGE_KEY] = {
          updatedAt: Date.now(),
          list: [validPayout, validBilling]
        };
        // Simulate live tab where node.payoutList is malformed (e.g. object not array)
        domPopupMalformedList.chrome.scripting.executeScript = async (opts) => {
          // Mock executeScript returning result with malformed payout
          return [{
            result: {
              payouts: [],
              payoutSuccess: false,
              payoutIncomplete: true,
              payoutTotalCount: 0,
              gqlIssues: "Dữ liệu Payout không đúng cấu trúc.",
              billingData: { code: 0, data: { list: [validBilling] } },
              feeInvoices: []
            }
          }];
        };
        const sandboxPopupMalformedList = {
          document: domPopupMalformedList.document, window: domPopupMalformedList.window, chrome: domPopupMalformedList.chrome, localStorage: domPopupMalformedList.localStorage,
          console, setTimeout, clearTimeout, fetch: async () => ({})
        };
        vm.createContext(sandboxPopupMalformedList);
        vm.runInContext(fs.readFileSync('popup.js', 'utf8'), sandboxPopupMalformedList);
        domPopupMalformedList.document.getElementById('fetch-affiliate-data').click();

        setTimeout(async () => {
          const contentStore = domContent.chrome.storage.local._store[STORAGE_KEY];
          const popupMergedStore = domPopupMerge.chrome.storage.local._store[STORAGE_KEY];
          const taxBillingPreservedStore = domTaxBillingMalformed.chrome.storage.local._store[STORAGE_KEY];
          const popupMalformedPreservedStore = domPopupMalformedList.chrome.storage.local._store[STORAGE_KEY];

          console.log(JSON.stringify({
            contentStoreList: contentStore?.list || [],
            popupMergedList: popupMergedStore?.list || [],
            taxBillingPreservedList: taxBillingPreservedStore?.list || [],
            popupMalformedPreservedList: popupMalformedPreservedStore?.list || [],
            popupStatus: domPopup.elements['affiliate-status']?.textContent || "",
            taxStatus: domTax.elements['status-text']?.textContent || ""
          }));
        }, 120);
        """
        out = self.run_node(node_script)
        # 1. Content sync with refresh failure retained valid records and dropped dirty ones
        content_payouts = [x for x in out["contentStoreList"] if x.get("paymentPayout")]
        content_billing = [x for x in out["contentStoreList"] if x.get("order_completed_period_start_time")]
        self.assertEqual(len(content_payouts), 2, "Must retain 2 valid payouts")
        self.assertEqual(len(content_billing), 1, "Must retain 1 valid billing")
        # Ensure no null/primitives remained
        for x in out["contentStoreList"]:
            self.assertIsInstance(x, dict)

        # 2. Payout ID trim normalization: "1001" replaced " 1001 " without duplicate
        merged_payouts = [x for x in out["popupMergedList"] if x.get("paymentPayout")]
        self.assertEqual(len(merged_payouts), 2, "Must contain exactly 2 payouts (replaced 1001 + kept 1002)")
        ids = [x["paymentPayout"]["payoutId"].strip() for x in merged_payouts]
        self.assertIn("1001", ids)
        self.assertIn("1002", ids)
        # Amount was updated to 120000000000 micro-units
        p1001 = next(x for x in merged_payouts if x["paymentPayout"]["payoutId"].strip() == "1001")
        self.assertEqual(p1001["paymentPayout"]["eligibleTotalAmount"], "120000000000")

        # 3. Billing API with invalid record items marked source failed and preserved old billing
        tax_billing = [x for x in out["taxBillingPreservedList"] if x.get("order_completed_period_start_time")]
        self.assertEqual(len(tax_billing), 1, "Old billing must be preserved when new API billing contains invalid items")

        # 4. Malformed payoutList with totalCount: 0 did NOT wipe out old payout
        popup_payouts = [x for x in out["popupMalformedPreservedList"] if x.get("paymentPayout")]
        self.assertEqual(len(popup_payouts), 1, "Old payout must be preserved when API payout data is malformed")

        # Popup and Tax report did not crash on dirty cache load
        self.assertIn("Dữ liệu nạp từ Cache", out["popupStatus"])
        self.assertIn("Dữ liệu nạp từ Cache", out["taxStatus"])


if __name__ == "__main__":
    unittest.main()
