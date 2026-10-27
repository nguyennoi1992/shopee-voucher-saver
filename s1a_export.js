/**
 * s1a_export.js
 * Browser-native OOXML (XLSX and DOCX) exporter for S1a-HKD Tax Notebook.
 *
 * Requirements:
 * - Valid OOXML ZIP packages (Standard Stored ZIP / method 0, UTF-8 filenames & content).
 * - Matches preview book model: profile, period, rows, total, signature.
 * - Strict offline execution: standard library / Uint8Array / TextEncoder only.
 * - No remote CDNs, no cookies, no external data transmission.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.S1aExport = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 1. IEEE 802.3 CRC-32 calculation for ZIP local and central directory headers
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c >>> 0;
  }

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // 2. Standard ZIP Package Builder (Store / Method 0, universally supported by OOXML readers)
  function createZip(files) {
    const enc = new TextEncoder();
    const entries = files.map(f => {
      const nameBytes = enc.encode(f.name);
      const dataBytes = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(dataBytes);
      return { nameBytes, dataBytes, crc, size: dataBytes.length };
    });

    let offset = 0;
    const localHeaders = [];
    const dosTime = 0x0000;
    const dosDate = 0x5C21; // 2026-01-01

    entries.forEach(e => {
      e.offset = offset;
      const h = new Uint8Array(30 + e.nameBytes.length);
      const v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); // Local file header signature
      v.setUint16(4, 20, true);          // Version needed to extract (2.0)
      v.setUint16(6, 0x0800, true);       // Flags: bit 11 = UTF-8 encoding
      v.setUint16(8, 0, true);            // Compression method: 0 (Stored)
      v.setUint16(10, dosTime, true);
      v.setUint16(12, dosDate, true);
      v.setUint32(14, e.crc, true);       // CRC-32
      v.setUint32(18, e.size, true);      // Compressed size
      v.setUint32(22, e.size, true);      // Uncompressed size
      v.setUint16(26, e.nameBytes.length, true);
      v.setUint16(28, 0, true);           // Extra field length
      h.set(e.nameBytes, 30);
      localHeaders.push(h, e.dataBytes);
      offset += h.length + e.size;
    });

    const cdOffset = offset;
    const cdHeaders = [];
    entries.forEach(e => {
      const h = new Uint8Array(46 + e.nameBytes.length);
      const v = new DataView(h.buffer);
      v.setUint32(0, 0x02014b50, true); // Central directory header signature
      v.setUint16(4, 20, true);          // Version made by
      v.setUint16(6, 20, true);          // Version needed
      v.setUint16(8, 0x0800, true);       // UTF-8
      v.setUint16(10, 0, true);           // Stored
      v.setUint16(12, dosTime, true);
      v.setUint16(14, dosDate, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.size, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.nameBytes.length, true);
      v.setUint16(30, 0, true);           // Extra field length
      v.setUint16(32, 0, true);           // File comment length
      v.setUint16(34, 0, true);           // Disk number start
      v.setUint16(36, 0, true);           // Internal file attributes
      v.setUint32(38, 0, true);           // External file attributes
      v.setUint32(42, e.offset, true);    // Relative offset of local header
      h.set(e.nameBytes, 46);
      cdHeaders.push(h);
      offset += h.length;
    });
    const cdSize = offset - cdOffset;

    // End of central directory record (EOCD)
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdOffset, true);
    ev.setUint16(20, 0, true);

    const totalLen = offset + 22;
    const out = new Uint8Array(totalLen);
    let p = 0;
    for (const part of [...localHeaders, ...cdHeaders, eocd]) {
      out.set(part, p);
      p += part.length;
    }
    return out;
  }

  // XML string escaping (strip XML 1.0 illegal control characters and U+FFFE/U+FFFF)
  function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Format currency with dots (e.g. 1.234.567)
  function formatMoney(num) {
    if (!Number.isFinite(num)) return '0';
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function validateS1aAmounts(model) {
    if (!model || !Number.isFinite(model.totalAmount)) {
      throw new Error('Invalid S1a totalAmount: must be a finite number');
    }
    if (!Array.isArray(model.rows) || model.rows.some(r => !r || !Number.isFinite(r.amount))) {
      throw new Error('Invalid S1a row: every row must have a finite number amount');
    }
  }

  /**
   * Generates a valid OOXML .xlsx package for S1a-HKD
   */
  function generateS1aXlsx(model) {
    validateS1aAmounts(model);
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0"/>
  </numFmts>
  <fonts count="4">
    <font><name val="Times New Roman"/><sz val="11"/></font>
    <font><b/><name val="Times New Roman"/><sz val="11"/></font>
    <font><i/><name val="Times New Roman"/><sz val="10"/></font>
    <font><b/><name val="Times New Roman"/><sz val="14"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF000000"/></left>
      <right style="thin"><color rgb="FF000000"/></right>
      <top style="thin"><color rgb="FF000000"/></top>
      <bottom style="thin"><color rgb="FF000000"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="10">
    <!-- 0: normal -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: title (bold 14 centered) -->
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 2: bold normal wrap -->
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <!-- 3: italic normal wrap -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <!-- 4: table header (bold center bordered wrap) -->
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <!-- 5: table subheader A/B/1 (italic center bordered) -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 6: data cell date (center bordered) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 7: data cell text (left bordered wrap) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <!-- 8: data cell amount (right currency bordered) -->
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 9: signature title/name (bold center wrap) -->
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  </cellXfs>
</styleSheet>`;

    let rowIdx = 1;
    const sheetRows = [];

    // Header info (row heights and text wrapping)
    sheetRows.push(`<row r="${rowIdx}" ht="22" customHeight="1">
      <c r="A${rowIdx}" s="2" t="inlineStr"><is><t>HỘ, CÁ NHÂN KINH DOANH: ${escapeXml(model.ownerName)}</t></is></c>
      <c r="B${rowIdx}" s="2"/>
      <c r="C${rowIdx}" s="2" t="inlineStr"><is><t>Mẫu số S1a-HKD</t></is></c>
    </row>`);
    const ownerRow = rowIdx;
    rowIdx++;

    sheetRows.push(`<row r="${rowIdx}" ht="20" customHeight="1">
      <c r="A${rowIdx}" s="0" t="inlineStr"><is><t>Địa chỉ: ${escapeXml(model.address)}</t></is></c>
      <c r="B${rowIdx}" s="0"/>
      <c r="C${rowIdx}" s="3" t="inlineStr"><is><t>(Kèm theo Thông tư số 152/2025/TT-BTC</t></is></c>
    </row>`);
    const addrRow = rowIdx;
    rowIdx++;

    sheetRows.push(`<row r="${rowIdx}" ht="20" customHeight="1">
      <c r="A${rowIdx}" s="0" t="inlineStr"><is><t>Mã số thuế: ${escapeXml(model.taxCode)}</t></is></c>
      <c r="B${rowIdx}" s="0"/>
      <c r="C${rowIdx}" s="3" t="inlineStr"><is><t>ngày 31/12/2025 của Bộ trưởng Bộ Tài chính)</t></is></c>
    </row>`);
    const taxRow = rowIdx;
    rowIdx++;

    sheetRows.push(`<row r="${rowIdx}" ht="14" customHeight="1"/>`);
    rowIdx++; // blank

    // Title
    sheetRows.push(`<row r="${rowIdx}" ht="28" customHeight="1">
      <c r="A${rowIdx}" s="1" t="inlineStr"><is><t>SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ</t></is></c>
      <c r="B${rowIdx}" s="1"/>
      <c r="C${rowIdx}" s="1"/>
    </row>`);
    const titleRow = rowIdx;
    rowIdx++;

    sheetRows.push(`<row r="${rowIdx}" ht="20" customHeight="1">
      <c r="A${rowIdx}" s="0" t="inlineStr"><is><t>Địa điểm kinh doanh: ${escapeXml(model.businessLocation)}</t></is></c>
    </row>`);
    rowIdx++;

    sheetRows.push(`<row r="${rowIdx}" ht="20" customHeight="1">
      <c r="A${rowIdx}" s="0" t="inlineStr"><is><t>Kỳ kê khai: ${escapeXml(model.periodText)}</t></is></c>
    </row>`);
    rowIdx++;

    sheetRows.push(`<row r="${rowIdx}" ht="20" customHeight="1">
      <c r="C${rowIdx}" s="3" t="inlineStr"><is><t>Đơn vị tính: đồng</t></is></c>
    </row>`);
    rowIdx++;

    // Table Header row 1
    const headRow1 = rowIdx;
    sheetRows.push(`<row r="${rowIdx}" ht="24" customHeight="1">
      <c r="A${rowIdx}" s="4" t="inlineStr"><is><t>Ngày, tháng</t></is></c>
      <c r="B${rowIdx}" s="4" t="inlineStr"><is><t>Diễn giải</t></is></c>
      <c r="C${rowIdx}" s="4" t="inlineStr"><is><t>Số tiền</t></is></c>
    </row>`);
    rowIdx++;

    // Table Header row 2
    const headRow2 = rowIdx;
    sheetRows.push(`<row r="${rowIdx}" ht="20" customHeight="1">
      <c r="A${rowIdx}" s="5" t="inlineStr"><is><t>A</t></is></c>
      <c r="B${rowIdx}" s="5" t="inlineStr"><is><t>B</t></is></c>
      <c r="C${rowIdx}" s="5" t="inlineStr"><is><t>1</t></is></c>
    </row>`);
    rowIdx++;

    // Data rows
    for (const r of model.rows) {
      sheetRows.push(`<row r="${rowIdx}" ht="22" customHeight="1">
        <c r="A${rowIdx}" s="6" t="inlineStr"><is><t>${escapeXml(r.date)}</t></is></c>
        <c r="B${rowIdx}" s="7" t="inlineStr"><is><t>${escapeXml(r.desc)}</t></is></c>
        <c r="C${rowIdx}" s="8"><v>${r.amount}</v></c>
      </row>`);
      rowIdx++;
    }

    // Total row
    const totalRow = rowIdx;
    sheetRows.push(`<row r="${rowIdx}" ht="24" customHeight="1">
      <c r="A${rowIdx}" s="4" t="inlineStr"><is><t>Tổng cộng</t></is></c>
      <c r="B${rowIdx}" s="4"/>
      <c r="C${rowIdx}" s="8"><v>${model.totalAmount}</v></c>
    </row>`);
    rowIdx++;

    // Signature Block within page
    sheetRows.push(`<row r="${rowIdx}" ht="16" customHeight="1"/>`);
    rowIdx++; // blank

    const now = new Date(Date.now() + 7 * 3600000);
    const signDay = model.signDay || String(now.getUTCDate()).padStart(2, '0');
    const signMonth = model.signMonth || String(now.getUTCMonth() + 1).padStart(2, '0');
    const signYear = model.signYear || String(now.getUTCFullYear());
    const signDateStr = `Ngày ${signDay} tháng ${signMonth} năm ${signYear}`;

    const signDateRow = rowIdx;
    sheetRows.push(`<row r="${rowIdx}" ht="22" customHeight="1">
      <c r="B${rowIdx}" s="3" t="inlineStr"><is><t>${escapeXml(signDateStr)}</t></is></c>
      <c r="C${rowIdx}" s="3"/>
    </row>`);
    rowIdx++;

    const signTitleRow = rowIdx;
    sheetRows.push(`<row r="${rowIdx}" ht="24" customHeight="1">
      <c r="B${rowIdx}" s="9" t="inlineStr"><is><t>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/ CÁ NHÂN KINH DOANH</t></is></c>
      <c r="C${rowIdx}" s="9"/>
    </row>`);
    rowIdx++;

    const signNoteRow = rowIdx;
    sheetRows.push(`<row r="${rowIdx}" ht="20" customHeight="1">
      <c r="B${rowIdx}" s="3" t="inlineStr"><is><t>(Ký, họ tên, đóng dấu nếu có)</t></is></c>
      <c r="C${rowIdx}" s="3"/>
    </row>`);
    rowIdx++;

    sheetRows.push(`<row r="${rowIdx}" ht="45" customHeight="1"/>`);
    rowIdx++; // space for signature

    const signNameRow = rowIdx;
    if (model.signerName) {
      sheetRows.push(`<row r="${rowIdx}" ht="24" customHeight="1">
        <c r="B${rowIdx}" s="9" t="inlineStr"><is><t>${escapeXml(model.signerName)}</t></is></c>
        <c r="C${rowIdx}" s="9"/>
      </row>`);
    }

    const lastRow = model.signerName ? signNameRow : (signNameRow - 1);

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="S1a-HKD" sheetId="1" r:id="rId1"/>
  </sheets>
  <definedNames>
    <definedName name="_xlnm.Print_Area" localSheetId="0">'S1a-HKD'!$A$1:$C$${lastRow}</definedName>
    <definedName name="_xlnm.Print_Titles" localSheetId="0">'S1a-HKD'!$${headRow1}:$${headRow2}</definedName>
  </definedNames>
</workbook>`;

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr>
    <pageSetUpPr fitToPage="1"/>
  </sheetPr>
  <cols>
    <col min="1" max="1" width="15" customWidth="1"/>
    <col min="2" max="2" width="46" customWidth="1"/>
    <col min="3" max="3" width="20" customWidth="1"/>
  </cols>
  <sheetData>
    ${sheetRows.join('\n    ')}
  </sheetData>
  <mergeCells count="${model.signerName ? 9 : 8}">
    <mergeCell ref="A${ownerRow}:B${ownerRow}"/>
    <mergeCell ref="A${addrRow}:B${addrRow}"/>
    <mergeCell ref="A${taxRow}:B${taxRow}"/>
    <mergeCell ref="A${titleRow}:C${titleRow}"/>
    <mergeCell ref="A${totalRow}:B${totalRow}"/>
    <mergeCell ref="B${signDateRow}:C${signDateRow}"/>
    <mergeCell ref="B${signTitleRow}:C${signTitleRow}"/>
    <mergeCell ref="B${signNoteRow}:C${signNoteRow}"/>
    ${model.signerName ? `<mergeCell ref="B${signNameRow}:C${signNameRow}"/>` : ''}
  </mergeCells>
  <pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  <pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

    return createZip([
      { name: '[Content_Types].xml', data: contentTypesXml },
      { name: '_rels/.rels', data: rootRelsXml },
      { name: 'xl/_rels/workbook.xml.rels', data: wbRelsXml },
      { name: 'xl/workbook.xml', data: workbookXml },
      { name: 'xl/styles.xml', data: stylesXml },
      { name: 'xl/worksheets/sheet1.xml', data: sheetXml }
    ]);
  }

  /**
   * Generates a valid OOXML .docx package for S1a-HKD
   */
  function generateS1aDocx(model) {
    validateS1aAmounts(model);
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    // Table rows XML
    const tableRows = [];

    // Header 1 (Col names)
    tableRows.push(`
      <w:tr>
        <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
        <w:tc>
          <w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>Ngày, tháng</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>Diễn giải</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>Số tiền</w:t></w:r></w:p>
        </w:tc>
      </w:tr>`);

    // Header 2 (A / B / 1)
    tableRows.push(`
      <w:tr>
        <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
        <w:tc>
          <w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/></w:rPr><w:t>A</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/></w:rPr><w:t>B</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/></w:rPr><w:t>1</w:t></w:r></w:p>
        </w:tc>
      </w:tr>`);

    // Data rows
    for (const r of model.rows) {
      tableRows.push(`
      <w:tr>
        <w:trPr><w:cantSplit/></w:trPr>
        <w:tc>
          <w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>${escapeXml(r.date)}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>${escapeXml(r.desc)}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>${formatMoney(r.amount)}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>`);
    }

    // Total row (single total row)
    tableRows.push(`
      <w:tr>
        <w:trPr><w:cantSplit/></w:trPr>
        <w:tc>
          <w:tcPr><w:gridSpan w:val="2"/><w:tcW w:w="6600" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>Tổng cộng</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>${formatMoney(model.totalAmount)}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>`);

    const now = new Date(Date.now() + 7 * 3600000);
    const signDay = model.signDay || String(now.getUTCDate()).padStart(2, '0');
    const signMonth = model.signMonth || String(now.getUTCMonth() + 1).padStart(2, '0');
    const signYear = model.signYear || String(now.getUTCFullYear());
    const signDateStr = `Ngày ${signDay} tháng ${signMonth} năm ${signYear}`;

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- Top Meta Table: Taxpayer info (left) & Legal Form No (right) -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="4800"/>
        <w:gridCol w:w="4200"/>
      </w:tblGrid>
      <w:tr>
        <w:trPr><w:cantSplit/></w:trPr>
        <w:tc>
          <w:tcPr><w:tcW w:w="4800" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>HỘ, CÁ NHÂN KINH DOANH: ${escapeXml(model.ownerName)}</w:t></w:r></w:p>
          <w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Địa chỉ: ${escapeXml(model.address)}</w:t></w:r></w:p>
          <w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Mã số thuế: ${escapeXml(model.taxCode)}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4200" w:type="dxa"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>Mẫu số S1a-HKD</w:t></w:r></w:p>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="20"/></w:rPr><w:t>(Kèm theo Thông tư số 152/2025/TT-BTC ngày 31 tháng 12 năm 2025 của Bộ trưởng Bộ Tài chính)</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- Main Title -->
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:before="240" w:after="80"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="28"/></w:rPr>
        <w:t>SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Địa điểm kinh doanh: ${escapeXml(model.businessLocation)}</w:t></w:r>
    </w:p>

    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Kỳ kê khai: ${escapeXml(model.periodText)}</w:t></w:r>
    </w:p>

    <w:p>
      <w:pPr><w:jc w:val="right"/><w:spacing w:after="120"/></w:pPr>
      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/></w:rPr><w:t>Đơn vị tính: đồng</w:t></w:r>
    </w:p>

    <!-- S1a Table -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="1800"/>
        <w:gridCol w:w="4800"/>
        <w:gridCol w:w="2400"/>
      </w:tblGrid>
      ${tableRows.join('')}
    </w:tbl>

    <w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>

    <!-- Signature Section -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="4500"/>
        <w:gridCol w:w="4500"/>
      </w:tblGrid>
      <w:tr>
        <w:trPr><w:cantSplit/></w:trPr>
        <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p/></w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/></w:rPr><w:t>${escapeXml(signDateStr)}</w:t></w:r></w:p>
          <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/</w:t></w:r></w:p>
          <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>CÁ NHÂN KINH DOANH</w:t></w:r></w:p>
          <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="800"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="20"/></w:rPr><w:t>(Ký, họ tên, đóng dấu nếu có)</w:t></w:r></w:p>
          ${model.signerName ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>${escapeXml(model.signerName)}</w:t></w:r></w:p>` : '<w:p/>'}
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- Page Setup: Standard A4 portrait -->
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    return createZip([
      { name: '[Content_Types].xml', data: contentTypesXml },
      { name: '_rels/.rels', data: rootRelsXml },
      { name: 'word/document.xml', data: docXml }
    ]);
  }

  /**
   * Helper to trigger browser download of a Blob
   */
  function downloadBlob(bytes, filename, mimeType) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadS1aXlsx(model, filename) {
    const bytes = generateS1aXlsx(model);
    const fname = filename || `So_Doanh_Thu_S1a_HKD_${model.signYear || '2026'}.xlsx`;
    downloadBlob(bytes, fname, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function downloadS1aDocx(model, filename) {
    const bytes = generateS1aDocx(model);
    const fname = filename || `So_Doanh_Thu_S1a_HKD_${model.signYear || '2026'}.docx`;
    downloadBlob(bytes, fname, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  return {
    createZip,
    crc32,
    escapeXml,
    formatMoney,
    generateS1aXlsx,
    generateS1aDocx,
    downloadS1aXlsx,
    downloadS1aDocx
  };
});
