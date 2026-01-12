/* -------------------------------------------- */
/* Shopee Voucher Saver - Auto click Lưu button */
/* -------------------------------------------- */

// Scroll to bottom to load all vouchers
window.scrollTo(0, document.body.scrollHeight);

// Find all span elements with text 'Lưu'
var spans = document.getElementsByTagName('span');
var spanVouchers = Array.from(spans).filter(span => span.textContent.trim() === 'Lưu');

// Find all button elements with text 'Lưu'
var buttons = document.getElementsByTagName('button');
var buttonVouchers = Array.from(buttons).filter(button => button.textContent.trim() === 'Lưu');

// Combine both arrays
var vouchers = [...spanVouchers, ...buttonVouchers];

if (vouchers.length === 0) {
    alert("⚠️ No vouchers found!");
} else {
    var delay = 1500;
    var i = 0;

    function saveVoucher() {
        if (i === vouchers.length) {
            console.log('✅ Finished saving all vouchers!');
            alert(`🎉 Done! Saved ${vouchers.length} vouchers successfully.`);
            return;
        }

        var remaining = ((vouchers.length - i) * (delay + 500) / 1000).toFixed(0);
        console.log(`Click --> Save Voucher ${i + 1} of ${vouchers.length}, ~${remaining}s remaining…`);

        vouchers[i].click();
        i++;
        setTimeout(saveVoucher, Math.floor(500 + Math.random() * delay * 2));
    }

    console.log(`Found ${vouchers.length} vouchers. Starting...`);
    alert(`🔍 Found ${vouchers.length} vouchers. Starting to save...`);
    saveVoucher();
}
