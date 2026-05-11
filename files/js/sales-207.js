// Last updated: 2026-05-11 10:56:45

// ======================================================
// sales-207.js - EJジャーナル分析 メインレジ固有設定
// 共通UI処理は sales.js に記述
// /common/ では window.SalesPageMain として登録し自動判定に使用
// ======================================================

window.SalesPageMain = {

    CACHE_CONTENT_KEY:  'wcoop.sales.a.journal.content',
    CACHE_FILENAME_KEY: 'wcoop.sales.a.journal.filename',

    CATEGORY_CLASS_MAP: {
        'グッズ': 'goods',
        'パン':   'bread',
        '飲料':   'drink',
        '井荻':   'iogi',
        '文具':   'stationery',
        '検定':   'exam',
        '教科書': 'text',
        '副教材': 'supplement',
    },

    CATEGORY_ORDER: ['グッズ', '井荻', '文具', 'パン', '飲料', '教科書', '副教材', '検定'],

    SKIP_KEYWORDS: ['両替', '*SDカード*', '日計', '電子ジャーナル'],

    // ---- ジャーナル解析・集計（pending record方式）----
    parseJournalContent: function (content, startDate, endDate) {
        const SKIP_KEYWORDS = this.SKIP_KEYWORDS;
        const lines         = content.split('\n');
        const categoryStats = {};

        let currentDate      = null;
        let prevQuantityLine = null;
        let pendingRecord    = null;

        function parseDateFromLine(line) {
            const m = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
            if (!m) return null;
            return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
        }

        function commitPending() {
            if (!pendingRecord) return;
            const { category, unitPrice, quantity } = pendingRecord;
            if (!categoryStats[category]) categoryStats[category] = {};
            if (!categoryStats[category][unitPrice]) categoryStats[category][unitPrice] = 0;
            categoryStats[category][unitPrice] += quantity;
            pendingRecord = null;
        }

        for (let rawLine of lines) {
            const line = rawLine.trim();

            if (line.includes('解除機能により中止')) {
                pendingRecord    = null;
                prevQuantityLine = null;
                currentDate      = null;
                continue;
            }

            const dateStr = parseDateFromLine(line);
            if (dateStr) {
                commitPending();
                prevQuantityLine = null;

                if (startDate && dateStr < startDate) { currentDate = null; continue; }
                if (endDate   && dateStr > endDate)   { currentDate = null; continue; }

                currentDate = dateStr;
                continue;
            }

            if (!currentDate) {
                commitPending();
                prevQuantityLine = null;
                continue;
            }

            if (SKIP_KEYWORDS.some(kw => line.includes(kw))) {
                commitPending();
                currentDate      = null;
                prevQuantityLine = null;
                continue;
            }

            const qtyMatch = line.match(/^(\d+[,]?\d*)x\s*(\d+)/);
            if (qtyMatch) {
                commitPending();
                prevQuantityLine = {
                    unitPrice: parseInt(qtyMatch[1].replace(/,/g, ''), 10),
                    quantity:  parseInt(qtyMatch[2], 10),
                };
                continue;
            }

            const normalMatch = line.match(/^([^\s*]+)\s+内\s*[\\¥]([\d,]+)/);
            if (normalMatch) {
                commitPending();
                const category = normalMatch[1];
                const amount   = parseInt(normalMatch[2].replace(/,/g, ''), 10);

                if (prevQuantityLine) {
                    const { unitPrice, quantity } = prevQuantityLine;
                    if (unitPrice * quantity === amount) {
                        pendingRecord = { category, unitPrice, quantity };
                    } else {
                        pendingRecord = { category, unitPrice: amount, quantity: 1 };
                    }
                    prevQuantityLine = null;
                } else {
                    pendingRecord = { category, unitPrice: amount, quantity: 1 };
                }
                continue;
            }

            const returnMatch = line.match(/^([^\s*]+)\s+内\s*戻-([\d,]+)/);
            if (returnMatch) {
                commitPending();
                pendingRecord = {
                    category:  returnMatch[1],
                    unitPrice: parseInt(returnMatch[2].replace(/,/g, ''), 10),
                    quantity:  -1,
                };
                prevQuantityLine = null;
                continue;
            }

            const corrMatch = line.match(/^([^\s*]+)\s+内\s*訂-([\d,]+)/);
            if (corrMatch) {
                commitPending();
                pendingRecord = {
                    category:  corrMatch[1],
                    unitPrice: parseInt(corrMatch[2].replace(/,/g, ''), 10),
                    quantity:  -1,
                };
                prevQuantityLine = null;
                continue;
            }

            const corrFallback = line.match(/^訂\s*-([\d,]+)/);
            if (corrFallback) {
                commitPending();
                pendingRecord = {
                    category:  '訂',
                    unitPrice: parseInt(corrFallback[1].replace(/,/g, ''), 10),
                    quantity:  -1,
                };
                prevQuantityLine = null;
                continue;
            }

            if (!line.match(/^(\d+[,]?\d*)x\s*(\d+)/)) {
                prevQuantityLine = null;
            }
        }

        commitPending();
        return categoryStats;
    },
};

// /main/ ページ向け: window.SalesPage としても登録
window.SalesPage = window.SalesPageMain;