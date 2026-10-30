/* -------------------------------------------- */
/* Shopee Voucher Saver - Auto click Luu button */
/* -------------------------------------------- */

(async () => {
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getVoucherElements() {
        var spans = document.getElementsByTagName("span");
        var spanVouchers = Array.from(spans).filter(span => span.textContent.trim() === "Lưu");

        var buttons = document.getElementsByTagName("button");
        var buttonVouchers = Array.from(buttons).filter(button => button.textContent.trim() === "Lưu");

        return [...spanVouchers, ...buttonVouchers];
    }

    window.scrollTo(0, document.body.scrollHeight);
    await sleep(900);

    var vouchers = getVoucherElements();
    if (vouchers.length === 0) {
        return {
            ok: false,
            message: "Khong tim thay voucher nao co the luu tren trang hien tai."
        };
    }

    var delay = 1500;
    for (var i = 0; i < vouchers.length; i++) {
        var remaining = ((vouchers.length - i) * (delay + 500) / 1000).toFixed(0);
        console.log("Click --> Save Voucher " + (i + 1) + " of " + vouchers.length + ", ~" + remaining + "s remaining...");
        vouchers[i].click();
        await sleep(Math.floor(500 + Math.random() * delay * 2));
    }

    console.log("Finished saving all vouchers.");
    return {
        ok: true,
        savedCount: vouchers.length,
        message: "Da luu " + vouchers.length + " voucher thanh cong."
    };
})();
