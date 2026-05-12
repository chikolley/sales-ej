// Last updated: 2026-05-12 15:00:00

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
        const paymentStats  = { cash: 0, credit: 0 };

        let currentDate      = null;
        let prevQuantityLine = null;
        let pendingRecord    = null;
        let txSnapshot       = null; // トランザクション開始時のcategoryStatsスナップショット

        // スペース区切り数字を正規化: "\ 6 , 6 0 0" / "\100" / "\\4,000" → 数値
        function parseSpacedAmount(str) {
            return parseInt(str.replace(/[\s\\¥,]/g, ''), 10) || 0;
        }

        function parseDateFromLine(line) {
            const m = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
            if (!m) return null;
            return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
        }

        function snapshotStats() {
            // categoryStatsのディープコピーを保存
            const snap = {};
            for (const cat in categoryStats) {
                snap[cat] = Object.assign({}, categoryStats[cat]);
            }
            txSnapshot = snap;
        }

        function rollbackStats() {
            // スナップショット時点に戻す
            if (!txSnapshot) return;
            for (const cat in categoryStats) {
                delete categoryStats[cat];
            }
            for (const cat in txSnapshot) {
                categoryStats[cat] = Object.assign({}, txSnapshot[cat]);
            }
            txSnapshot = null;
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

            // 解除機能により中止 → トランザクション開始時点にロールバック
            if (line.includes('解除機能により中止')) {
                pendingRecord    = null;
                prevQuantityLine = null;
                currentDate      = null;
                rollbackStats();
                continue;
            }

            // 日付行
            const dateStr = parseDateFromLine(line);
            if (dateStr) {
                commitPending();
                prevQuantityLine = null;

                if (startDate && dateStr < startDate) { currentDate = null; txSnapshot = null; continue; }
                if (endDate   && dateStr > endDate)   { currentDate = null; txSnapshot = null; continue; }

                currentDate = dateStr;
                snapshotStats(); // トランザクション開始時点を記録
                continue;
            }

            // 有効な日付範囲外
            if (!currentDate) {
                commitPending();
                prevQuantityLine = null;
                continue;
            }

            // スキップキーワード
            if (SKIP_KEYWORDS.some(kw => line.includes(kw))) {
                commitPending();
                currentDate      = null;
                prevQuantityLine = null;
                continue;
            }

            // 数量行: "11x 3" / "3,700x 2" / "66x -2"
            const qtyMatch = line.match(/^(\d+[,]?\d*)x\s*(-?\d+)/);
            if (qtyMatch) {
                commitPending();
                prevQuantityLine = {
                    unitPrice: parseInt(qtyMatch[1].replace(/,/g, ''), 10),
                    quantity:  parseInt(qtyMatch[2], 10),
                };
                continue;
            }

            // カテゴリ行（通常）: "グッズ    内 \160" / "グッズ    内 ¥160"
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

            // カテゴリ行（戻品）: "飲料    内戻-500" / "66x -2" + "文具    内 戻-132"
            const returnMatch = line.match(/^([^\s*]+)\s+内\s*戻-([\d,]+)/);
            if (returnMatch) {
                commitPending();
                const category = returnMatch[1];
                const amount   = parseInt(returnMatch[2].replace(/,/g, ''), 10);

                if (prevQuantityLine) {
                    const { unitPrice, quantity } = prevQuantityLine;
                    if (unitPrice * Math.abs(quantity) === amount) {
                        pendingRecord = { category, unitPrice, quantity };
                    } else {
                        pendingRecord = { category, unitPrice: amount, quantity: -1 };
                    }
                    prevQuantityLine = null;
                } else {
                    pendingRecord = { category, unitPrice: amount, quantity: -1 };
                }
                continue;
            }

            // 訂正行（カテゴリ付き）: "XXX 内 訂-120"
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

            // 訂正行（カテゴリなし）: "訂 -120"
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

            // それ以外: 数量行でなければ prevQuantityLine をリセット
            if (!line.match(/^(\d+[,]?\d*)x\s*(-?\d+)/)) {
                prevQuantityLine = null;
            }

            // 現金・おつり・クレジット行（スペース区切り数字・\\区切りに対応）
            const cashMatch   = line.match(/^現金\s+(.+)/);
            const otsriMatch  = line.match(/^おつり\s+(.+)/);
            const creditMatch = line.match(/^クレジット\s+(.+)/);

            if (cashMatch)   paymentStats.cash   += parseSpacedAmount(cashMatch[1]);
            if (otsriMatch)  paymentStats.cash   -= parseSpacedAmount(otsriMatch[1]);
            if (creditMatch) paymentStats.credit += parseSpacedAmount(creditMatch[1]);
        }

        commitPending();
        return { categoryStats, paymentStats };
    },
};

// /main/ ページ向け: window.SalesPage としても登録
window.SalesPage = window.SalesPageMain;