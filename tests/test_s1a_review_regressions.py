import io
import json
import subprocess
import unittest
import xml.etree.ElementTree as ET
import zipfile


class TestS1aReviewRegressions(unittest.TestCase):
    """Actual-JS regression tests via existing tests/affiliate_harness.js and Node VM."""

    def _run_node_json(self, js_code):
        res = subprocess.run(["node", "-e", js_code], capture_output=True, text=True, check=True)
        return json.loads(res.stdout)

    def test_partial_date_entry_blocks_stale_export_and_clears_on_valid(self):
        """(1) Partial date '01/01/20' in popup & full keeps canonical previous date,

        keeps table, no premature is-invalid, pending hasParseError blocks stale export;
        completing valid full date clears pending; invalid finished change still blocks.
        """
        js_code = """
        const fs = require('fs'), vm = require('vm'), assert = require('assert');
        const { createMockDOM } = require(process.cwd() + '/tests/affiliate_harness.js');

        async function testDateBehavior(file) {
          const d = createMockDOM();
          const prefix = file === 'popup.js' ? 'popup' : 'input';
          d.document.getElementById(`${prefix}-from-date`).value = '2026-03-01';
          d.document.getElementById(`${prefix}-to-date`).value = '2026-03-31';

          let alerts = [];
          const s = {
            ...d, console, setTimeout, clearTimeout,
            alert: msg => alerts.push(msg),
            fetch: async () => ({ ok: true, json: async () => ({}) })
          };
          vm.createContext(s);
          vm.runInContext(fs.readFileSync(file, 'utf8'), s);
          if (file === 'popup.js') await s.loadAffiliateSummary();
          await new Promise(r => setTimeout(r, 50));

          const text = d.document.getElementById(`${prefix}-from-date-text`);
          const canonical = d.document.getElementById(`${prefix}-from-date`);
          const old = canonical.value;
          const tableId = file === 'popup.js' ? 'aff-full-tbody' : 'monthly-tbody';
          const before = d.document.getElementById(tableId).innerHTML;

          // Partial date input event
          text.value = '01/01/20';
          text.trigger('input');

          assert.equal(canonical.value, old, 'keeps canonical previous date');
          assert.equal(d.document.getElementById(tableId).innerHTML, before, 'existing rendered table kept');
          assert.equal(canonical.dataset.hasParseError, 'true', 'pending hasParseError flag set');
          assert(!text.classList.contains('is-invalid'), 'no premature is-invalid class');

          // Pending flag blocks stale export
          if (file === 'tax_report.js') {
            alerts = [];
            const exportExcelBtn = d.document.getElementById('btn-s1a-export-excel');
            exportExcelBtn.click();
            assert(alerts.length > 0, 'pending hasParseError blocks stale export in tax_report');
          }

          // Completing original valid full date clears pending
          text.value = old.split('-').reverse().join('/');
          text.trigger('input');
          assert(!canonical.dataset.hasParseError, 'completing valid full date clears pending');
          assert(!text.classList.contains('is-invalid'), 'valid full date has no error');

          // Invalid finished change still blocks
          text.value = '99/99/9999';
          text.trigger('input');
          assert.equal(canonical.dataset.hasParseError, 'true', 'invalid finished change still blocks');
        }

        (async () => {
          await testDateBehavior('tax_report.js');
          await testDateBehavior('popup.js');
          console.log(JSON.stringify({ ok: true }));
        })().catch(e => {
          console.error(e);
          process.exit(1);
        });
        """
        out = self._run_node_json(js_code)
        self.assertTrue(out.get("ok"))

    def test_invoice_only_march_2026_service_period_full_and_partial(self):
        """(2) Invoice-only month March 2026 fee 9767 with service period Mar2-Apr1:

        both popup and full show month and full invoice fee; selected March 15-20
        has fee/afterfee unavailable, invoice full context retained, no prorating.
        Full processData exposes window.processData, popup actual table HTML.
        """
        js_code = """
        const fs = require('fs'), vm = require('vm'), assert = require('assert');
        const { createMockDOM } = require(process.cwd() + '/tests/affiliate_harness.js');

        async function testInvoice(file, partial) {
          const d = createMockDOM();
          const prefix = file === 'popup.js' ? 'popup' : 'input';
          const fromVal = partial ? '2026-03-15' : '2026-03-01';
          const toVal = partial ? '2026-03-20' : '2026-03-31';

          d.document.getElementById(`${prefix}-from-date`).value = fromVal;
          d.document.getElementById(`${prefix}-to-date`).value = toVal;

          d.chrome.storage.local._store.shopee_affiliate_billing_cache_v2 = {
            updatedAt: Date.now(),
            list: [{
              isFeeInvoice: true,
              monthKey: '2026-03',
              totalServiceFee: '976700000',
              paymentCompletePeriodStartTime: '1772384400',
              paymentCompletePeriodEndTime: '1775062799'
            }]
          };

          const s = {
            ...d, console, setTimeout, clearTimeout,
            alert: msg => s.lastAlert = msg,
            fetch: async () => ({ ok: true, json: async () => ({}) })
          };
          vm.createContext(s);
          vm.runInContext(fs.readFileSync(file, 'utf8'), s);
          if (file === 'popup.js') await s.loadAffiliateSummary();
          await new Promise(r => setTimeout(r, 50));

          if (file === 'tax_report.js') {
            assert(typeof s.window.processData === 'function', 'window.processData must be exposed');
            const months = s.window.processData(fromVal, toVal);
            const m = months['2026-03'];
            assert(m, 'month March 2026 must be present');
            assert.equal(m.invoiceFee, 9767, 'full invoice fee retained without prorating');
            assert.equal(m.fee, partial ? null : 9767, 'fee unavailable for partial, equal for full');
            assert.equal(m.afterFee, partial ? null : 0, 'afterFee unavailable for partial');
          } else {
            const h = d.document.getElementById('aff-full-tbody').innerHTML;
            assert(h.includes('03/2026'), 'table HTML includes month 03/2026');
            assert(h.includes('9.767'), 'table HTML includes invoice fee 9.767');
            if (partial) {
              assert(h.includes('không áp dụng cho khoảng ngày lẻ'), 'explains invoice fee not applied for partial dates');
              assert(h.includes('>- (9.767'), 'retains full context indicator');
            }
          }
        }

        (async () => {
          for (const file of ['tax_report.js', 'popup.js']) {
            for (const partial of [false, true]) {
              await testInvoice(file, partial);
            }
          }
          console.log(JSON.stringify({ ok: true }));
        })().catch(e => {
          console.error(e);
          process.exit(1);
        });
        """
        out = self._run_node_json(js_code)
        self.assertTrue(out.get("ok"))

    def test_actual_xlsx_merge_cells_count_equals_children(self):
        """(3) Actual generated XLSX mergeCells count equals number of children

        for signerName present AND absent using s1a_export.js require buildXlsx/generateS1aXlsx.
        """
        js_code = """
        const s1a = require(process.cwd() + '/s1a_export.js');
        const fn = s1a.buildXlsx || s1a.generateS1aXlsx;

        const baseModel = {
          ownerName: 'NGUYỄN VĂN A',
          address: 'Số 123 Đường ABC, Hà Nội',
          taxCode: '0123456789',
          businessLocation: 'Kinh doanh trên nền tảng số (Shopee Affiliate)',
          periodText: 'Từ ngày 01/01/2026 đến ngày 31/03/2026',
          unit: 'đồng',
          grouping: 'monthly',
          rows: [
            { date: '31/01/2026', desc: 'Doanh thu tháng 01/2026', amount: 1000000 },
            { date: '28/02/2026', desc: 'Doanh thu tháng 02/2026', amount: 2000000 }
          ],
          totalAmount: 3000000
        };

        const withSigner = Array.from(fn({ ...baseModel, signerName: 'NGUYỄN VĂN A' }));
        const withoutSigner = Array.from(fn(baseModel));

        console.log(JSON.stringify({ withSigner, withoutSigner }));
        """
        data = self._run_node_json(js_code)

        for case_name, byte_list in data.items():
            with self.subTest(case=case_name):
                buf = io.BytesIO(bytes(byte_list))
                with zipfile.ZipFile(buf, "r") as z:
                    self.assertIsNone(z.testzip(), f"ZIP CRC checksum invalid for {case_name}")
                    sheet_xml = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
                    root = ET.fromstring(sheet_xml)

                    merge_cells_el = None
                    for elem in root.iter():
                        if elem.tag.endswith("mergeCells"):
                            merge_cells_el = elem
                            break

                    self.assertIsNotNone(merge_cells_el, f"mergeCells element missing in {case_name}")
                    declared_count = int(merge_cells_el.attrib.get("count", 0))
                    children_count = len(list(merge_cells_el))
                    self.assertEqual(
                        declared_count,
                        children_count,
                        f"mergeCells count ({declared_count}) does not match child element count ({children_count}) for {case_name}",
                    )

                    # Verify Print_Area definedName is bounded to actual rows ($A$1:$C$[lastRow]), not whole column
                    wb_xml = z.read("xl/workbook.xml").decode("utf-8")
                    wb_root = ET.fromstring(wb_xml)
                    print_area_el = None
                    for elem in wb_root.iter():
                        if elem.tag.endswith("definedName") and elem.attrib.get("name") == "_xlnm.Print_Area":
                            print_area_el = elem
                            break
                    self.assertIsNotNone(print_area_el, f"Print_Area missing in {case_name}")
                    print_area_text = print_area_el.text or ""
                    self.assertNotIn("!$A:$C", print_area_text, f"Whole column range prohibited: {print_area_text}")

                    # Find max row r in sheet1.xml
                    row_rs = [int(r.attrib["r"]) for r in root.iter() if r.tag.endswith("row") and "r" in r.attrib]
                    max_row = max(row_rs)
                    expected_range = f"'S1a-HKD'!$A$1:$C${max_row}"
                    self.assertEqual(
                        print_area_text,
                        expected_range,
                        f"Print_Area ({print_area_text}) must match sheet max row ({expected_range}) for {case_name}",
                    )

    def test_download_blob_delayed_revoke_fake_timers(self):
        """(4) downloadBlob helper fake timers regression: click occurs,

        no synchronous revoke, invoke captured deferred callback => correct URL revoked.
        """
        js_code = """
        const s1a = require(process.cwd() + '/s1a_export.js');
        const assert = require('assert');

        let clicked = false;
        let createdUrl = null;
        let revokedUrl = null;
        let capturedTimer = null;

        class FakeBlob {
          constructor(parts, options) {
            this.parts = parts;
            this.options = options;
          }
        }

        const fakeDoc = {
          body: {
            appendChild: (el) => {},
            removeChild: (el) => {}
          },
          createElement: (tag) => {
            return {
              href: '',
              download: '',
              click: () => { clicked = true; }
            };
          }
        };

        global.window = {};
        global.document = fakeDoc;
        global.Blob = FakeBlob;
        global.URL = {
          createObjectURL: (b) => {
            createdUrl = 'blob:test/12345';
            return createdUrl;
          },
          revokeObjectURL: (u) => {
            revokedUrl = u;
          }
        };

        global.setTimeout = (fn, ms) => {
          capturedTimer = { fn, ms };
          return 99;
        };

        // Call public downloadS1aXlsx
        s1a.downloadS1aXlsx({ rows: [], totalAmount: 0 }, 'test.xlsx');

        assert.equal(clicked, true, 'anchor click must occur');
        assert.equal(createdUrl, 'blob:test/12345', 'Blob URL created');
        assert.equal(revokedUrl, null, 'no synchronous revokeObjectURL call');
        assert(capturedTimer !== null, 'setTimeout was scheduled');
        assert.equal(capturedTimer.ms, 1000, 'delayed for 1000ms');

        // Invoke captured callback
        capturedTimer.fn();
        assert.equal(revokedUrl, createdUrl, 'correct URL revoked on timer execution');

        console.log(JSON.stringify({ ok: true }));
        """
        out = self._run_node_json(js_code)
        self.assertTrue(out.get("ok"))

    def test_s1a_amount_validation_rejects_malformed_preserves_zero(self):
        """(5) generateS1aXlsx and generateS1aDocx reject malformed row amounts

        and malformed totalAmount for both formats, while preserving valid numeric 0.
        """
        js_code = """
        const s1a = require(process.cwd() + '/s1a_export.js');
        const assert = require('assert');

        const validZeroModel = {
          ownerName: 'NGUYỄN VĂN A',
          address: 'HN',
          taxCode: '0123456789',
          businessLocation: 'HN',
          periodText: 'Kỳ 1',
          rows: [
            { date: '01/01/2026', desc: 'Ngày 1', amount: 0 }
          ],
          totalAmount: 0
        };

        // Both XLSX and DOCX must accept valid numeric 0
        const xlsxBytes = Array.from(s1a.generateS1aXlsx(validZeroModel));
        const docxBytes = Array.from(s1a.generateS1aDocx(validZeroModel));

        // Test malformed cases for both generators
        const malformedTotalCases = [null, undefined, NaN, Infinity, -Infinity, '1000', {}];
        const malformedRowCases = [null, undefined, NaN, Infinity, -Infinity, '0', 'bad'];

        for (const badTotal of malformedTotalCases) {
          const badModel = { ...validZeroModel, totalAmount: badTotal };
          assert.throws(() => s1a.generateS1aXlsx(badModel), /Invalid S1a totalAmount/, `XLSX must reject totalAmount: ${badTotal}`);
          assert.throws(() => s1a.generateS1aDocx(badModel), /Invalid S1a totalAmount/, `DOCX must reject totalAmount: ${badTotal}`);
        }

        // Test missing/malformed rows array as well
        const badRowsCases = [null, undefined, 'not-an-array', {}];
        for (const badRows of badRowsCases) {
          const badModel = { ...validZeroModel, rows: badRows };
          assert.throws(() => s1a.generateS1aXlsx(badModel), /Invalid S1a row/, `XLSX must reject bad rows: ${badRows}`);
          assert.throws(() => s1a.generateS1aDocx(badModel), /Invalid S1a row/, `DOCX must reject bad rows: ${badRows}`);
        }

        for (const badRowAmount of malformedRowCases) {
          const badModel = {
            ...validZeroModel,
            rows: [{ date: '01/01/2026', desc: 'test', amount: badRowAmount }]
          };
          assert.throws(() => s1a.generateS1aXlsx(badModel), /Invalid S1a row/, `XLSX must reject row amount: ${badRowAmount}`);
          assert.throws(() => s1a.generateS1aDocx(badModel), /Invalid S1a row/, `DOCX must reject row amount: ${badRowAmount}`);
        }

        console.log(JSON.stringify({
          ok: true,
          xlsxBytes,
          docxBytes
        }));
        """
        data = self._run_node_json(js_code)
        self.assertTrue(data.get("ok"))

        # Verify valid 0 produces valid ZIP archive for both formats
        for fmt, bytes_arr in [("xlsx", data["xlsxBytes"]), ("docx", data["docxBytes"])]:
            buf = io.BytesIO(bytes(bytes_arr))
            with zipfile.ZipFile(buf, "r") as z:
                self.assertIsNone(z.testzip(), f"Valid 0 {fmt} must be valid ZIP without CRC corruption")

    def test_xml_control_characters_stripped_and_unicode_preserved(self):
        """(6) escapeXml strips XML 1.0 illegal C0 controls and U+FFFE/U+FFFF,

        retaining legal tab, LF, CR, Vietnamese and emoji; all XML parts in XLSX and DOCX
        parse cleanly with Python ElementTree.
        """
        js_code = r"""
        const s1a = require(process.cwd() + '/s1a_export.js');
        const c = String.fromCharCode;
        const dirtyModel = {
          ownerName: 'NGUYỄN VĂN A ' + c(0) + c(8) + c(11) + c(12) + c(14) + c(31) + '\uFFFE\uFFFF\t\r\n⭐ Tiếng Việt có dấu',
          address: '123 Đường ' + c(7) + ' ABC ' + c(1) + ' HN',
          taxCode: '0123456789',
          businessLocation: 'Shopee ' + c(2) + ' Platform 🇻🇳',
          periodText: 'Kỳ 1' + c(3) + c(4),
          signerName: 'NGUYỄN VĂN A ' + c(5) + c(6),
          rows: [
            { date: '01/01/2026', desc: 'Bán hàng ' + c(27) + c(30) + ' quà tặng 🎁', amount: 500000 }
          ],
          totalAmount: 500000
        };

        const xlsxBytes = Array.from(s1a.generateS1aXlsx(dirtyModel));
        const docxBytes = Array.from(s1a.generateS1aDocx(dirtyModel));

        console.log(JSON.stringify({ ok: true, xlsxBytes, docxBytes }));
        """
        data = self._run_node_json(js_code)
        self.assertTrue(data.get("ok"))

        for fmt, bytes_arr in [("xlsx", data["xlsxBytes"]), ("docx", data["docxBytes"])]:
            buf = io.BytesIO(bytes(bytes_arr))
            with zipfile.ZipFile(buf, "r") as z:
                self.assertIsNone(z.testzip(), f"Dirty {fmt} ZIP CRC invalid")
                for name in z.namelist():
                    if name.endswith(".xml") or name.endswith(".rels"):
                        raw_xml = z.read(name).decode("utf-8")
                        # Must parse without syntax error
                        root = ET.fromstring(raw_xml)
                        # Ensure no forbidden control chars exist in raw XML text
                        for bad_code in list(range(0, 9)) + [11, 12] + list(range(14, 32)) + [0xFFFE, 0xFFFF]:
                            bad_char = chr(bad_code)
                            self.assertNotIn(bad_char, raw_xml, f"Forbidden control char {hex(bad_code)} in {name} of {fmt}")
                # Verify Vietnamese and emoji preserved
                main_file = "xl/worksheets/sheet1.xml" if fmt == "xlsx" else "word/document.xml"
                main_xml = z.read(main_file).decode("utf-8")
                self.assertIn("Tiếng Việt có dấu", main_xml)
                self.assertIn("quà tặng", main_xml)

    def test_docx_signer_name_paragraph_conditional(self):
        """(7) DOCX contains signerName bold paragraph only when signerName is present;

        when absent, renders spacer <w:p/> without empty bold paragraph.
        """
        js_code = """
        const s1a = require(process.cwd() + '/s1a_export.js');
        const baseModel = {
          ownerName: 'NGUYỄN VĂN A',
          address: 'HN',
          taxCode: '0123456789',
          businessLocation: 'HN',
          periodText: 'Kỳ 1',
          rows: [{ date: '01/01/2026', desc: 'Dịch vụ', amount: 1000 }],
          totalAmount: 1000
        };

        const withSigner = Array.from(s1a.generateS1aDocx({ ...baseModel, signerName: 'TRẦN VĂN B' }));
        const withoutSigner = Array.from(s1a.generateS1aDocx(baseModel));

        console.log(JSON.stringify({ ok: true, withSigner, withoutSigner }));
        """
        data = self._run_node_json(js_code)
        self.assertTrue(data.get("ok"))

        # Check withSigner
        with zipfile.ZipFile(io.BytesIO(bytes(data["withSigner"])), "r") as z:
            doc_xml = z.read("word/document.xml").decode("utf-8")
            root = ET.fromstring(doc_xml)
            self.assertIn("TRẦN VĂN B", doc_xml)
            self.assertIn("NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/", doc_xml)

        # Check withoutSigner
        with zipfile.ZipFile(io.BytesIO(bytes(data["withoutSigner"])), "r") as z:
            doc_xml = z.read("word/document.xml").decode("utf-8")
            root = ET.fromstring(doc_xml)
            self.assertIn("NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/", doc_xml)
            # Find paragraphs in table cells
            # Must NOT have an empty <w:t></w:t> or <w:t/> run after the "(Ký, họ tên, đóng dấu nếu có)" note
            self.assertNotIn('<w:t></w:t>', doc_xml)
            self.assertNotIn('<w:t/>', doc_xml)


if __name__ == "__main__":
    unittest.main()
