const http = require('http');
const url = require('url');

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let jsonBody = null;
    try { if (body) jsonBody = JSON.parse(body); } catch (_) {}

    res.setHeader('Content-Type', 'application/json');

    // 1. Config website (CSRF token discovery)
    if (pathname === '/api/v3/config/website') {
      res.writeHead(200, { 'csrf-token': 'mock-csrf-token-12345' });
      return res.end(JSON.stringify({ code: 0, data: { csrf_token: 'mock-csrf-token-12345' } }));
    }

    // 2. Billing list
    if (pathname === '/api/v3/payment/billing_list') {
      res.writeHead(200);
      return res.end(JSON.stringify({
        code: 0,
        data: {
          list: [
            { order_completed_period_start_time: 1767200400, eligible_total_amount_dis: "1224353", total_payment_amount_dis: "1212354" },
            { order_completed_period_start_time: 1790787600, eligible_total_amount_dis: "50000", total_payment_amount_dis: "50000" },
            { order_completed_period_start_time: 1792947600, eligible_total_amount_dis: "127364", total_payment_amount_dis: "127364" }
          ]
        }
      }));
    }

    // 3. GraphQL
    if (pathname === '/api/v3/gql') {
      const target = [parsed.query?.q, jsonBody?.operationName, jsonBody?.query].filter(Boolean).join(' ').toLowerCase();

      // Test auth retry: if header 'x-simulate-403' is set and no CSRF-token header
      if (req.headers['x-simulate-403'] === 'true' && !req.headers['csrf-token']) {
        res.writeHead(403);
        return res.end(JSON.stringify({ code: 403, error: 'Unauthorized', msg: 'CSRF token required' }));
      }

      // getPaymentPayoutBillingList
      if (target.includes('getpaymentpayoutbillinglist') || target.includes('getpayoutlist')) {
        res.writeHead(200);
        return res.end(JSON.stringify({
          data: {
            getPaymentPayoutBillingList: {
              payoutList: [
                {
                  paymentPayout: {
                    payoutId: "1019",
                    payoutCreatedTime: "1792350007",
                    eligibleTotalAmount: "7179000000",
                    totalPaymentAmount: "6390600000"
                  }
                }
              ],
              pagination: { pageNum: 1, pageSize: 50, totalCount: 1 }
            }
          }
        }));
      }

      // getPaymentSummaryBillFeeInvoiceList
      if (target.includes('getpaymentsummarybillfeeinvoicelist')) {
        const pageNum = jsonBody?.variables?.pageNum || 1;

        // If scenario partial error is requested
        if (req.headers['x-simulate-partial'] === 'true' && pageNum > 1) {
          res.writeHead(500);
          return res.end(JSON.stringify({ errors: [{ message: "Server timeout on page 2" }] }));
        }

        // Multi-page: totalCount 4, page 1 returns 2, page 2 returns 2
        if (pageNum === 1) {
          res.writeHead(200);
          return res.end(JSON.stringify({
            data: {
              getPaymentSummaryBillFeeInvoiceList: {
                pageNum: 1,
                pageSize: 50,
                totalCount: 4,
                paymentSummaryBillFeeInvoices: [
                  {
                    paymentCompletePeriodStartTime: "1788282000",
                    paymentCompletePeriodEndTime: "1790960400",
                    totalServiceFee: "449900000",
                    paymentSummaryBillFeeInvoices: [{ invoiceNumber: "7581980", invoiceStatus: "VALID" }]
                  },
                  {
                    paymentCompletePeriodStartTime: "1785603600",
                    paymentCompletePeriodEndTime: "1788282000",
                    totalServiceFee: "651700000",
                    paymentSummaryBillFeeInvoices: [{ invoiceNumber: "6702172", invoiceStatus: "VALID" }]
                  }
                ]
              }
            }
          }));
        } else if (pageNum === 2) {
          res.writeHead(200);
          return res.end(JSON.stringify({
            data: {
              getPaymentSummaryBillFeeInvoiceList: {
                pageNum: 2,
                pageSize: 50,
                totalCount: 4,
                paymentSummaryBillFeeInvoices: [
                  {
                    paymentCompletePeriodStartTime: "1782925200",
                    paymentCompletePeriodEndTime: "1785603600",
                    totalServiceFee: "443700000",
                    paymentSummaryBillFeeInvoices: [{ invoiceNumber: "5867961", invoiceStatus: "VALID" }]
                  },
                  {
                    paymentCompletePeriodStartTime: "1780333200",
                    paymentCompletePeriodEndTime: "1782925200",
                    totalServiceFee: "337100000",
                    paymentSummaryBillFeeInvoices: [{ invoiceNumber: "4606030", invoiceStatus: "VALID" }]
                  }
                ]
              }
            }
          }));
        } else {
          res.writeHead(200);
          return res.end(JSON.stringify({
            data: {
              getPaymentSummaryBillFeeInvoiceList: {
                pageNum: pageNum,
                pageSize: 50,
                totalCount: 4,
                paymentSummaryBillFeeInvoices: []
              }
            }
          }));
        }
      }

      res.writeHead(404);
      return res.end(JSON.stringify({ error: "Unknown GraphQL query" }));
    }

    res.writeHead(501);
    return res.end(JSON.stringify({ error: "Not Implemented" }));
  });
});

const port = process.env.PORT || 4900;
server.listen(port, () => {
  console.log(`Shopee affiliate mock listening on port ${port}`);
});
