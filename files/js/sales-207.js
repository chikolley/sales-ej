// ======================================================
// EJジャーナル分析 - メインレジ (GitHub Pages 静的版)
// PHPロジックをすべてクライアントサイドJSに移植
// Shift-JIS対応: encoding.js (Encoding.convert) を使用
// ======================================================

document.addEventListener('DOMContentLoaded', function () {

    // ---- 定数 ----
    const CACHE_CONTENT_KEY  = 'wcoop.sales.a.journal.content';
    const CACHE_FILENAME_KEY = 'wcoop.sales.a.journal.filename';

    const CATEGORY_CLASS_MAP = {
        'グッズ': 'goods',
        'パン':   'bread',
        '飲料':   'drink',
        '井荻':   'iogi',
        '文具':   'stationery',
        '検定':   'exam',
        '教科書': 'text',
        '副教材': 'supplement',
    };

    const CATEGORY_ORDER = ['グッズ', '井荻', '文具', 'パン', '飲料', '教科書', '副教材', '検定'];

    const SKIP_KEYWORDS = ['両替', '*SDカード*', '日計', '電子ジャーナル'];

    // ---- DOM参照 ----
    const dropZone             = document.getElementById('drop-zone');
    const fileInput            = document.getElementById('journal_file');
    const fileNameDisplay      = document.getElementById('file-name-display');
    const dropZoneText         = document.getElementById('drop-zone-text');
    const runButton            = document.getElementById('run-button');
    const rerunButton          = document.getElementById('rerun-button');
    const uploadFormSection    = document.getElementById('upload-form-section');
    const resultSection        = document.getElementById('result-section');
    const resultTitle          = document.getElementById('result-title');
    const resultTables         = document.getElementById('result-tables');
    const resetButton          = document.getElementById('reset-button');
    const resetButtonContainer = document.getElementById('reset-button-container');
    const errorMessage         = document.getElementById('error-message');
    const journalDisplayContainer = document.getElementById('journal-display-container');
    const journalContent       = document.getElementById('journal-content');
    const journalPre           = document.getElementById('journal-pre');
    const journalToggleButton  = document.getElementById('journal-toggle-button');
    const rerunToggleButton    = document.getElementById('rerun-toggle-button');
    const rerunDatePanel       = document.getElementById('rerun-date-panel');

    // ---- キャッシュ操作 ----
    function setJournalCache(content, fileName) {
        try {
            localStorage.setItem(CACHE_CONTENT_KEY, content || '');
            localStorage.setItem(CACHE_FILENAME_KEY, fileName || '');
        } catch (e) {
            // localStorage が使えない環境では無視
        }
    }

    function getJournalCache() {
        try {
            return {
                content:  localStorage.getItem(CACHE_CONTENT_KEY)  || '',
                fileName: localStorage.getItem(CACHE_FILENAME_KEY) || '',
            };
        } catch (e) {
            return { content: '', fileName: '' };
        }
    }

    function clearJournalCache() {
        try {
            localStorage.removeItem(CACHE_CONTENT_KEY);
            localStorage.removeItem(CACHE_FILENAME_KEY);
        } catch (e) {}
    }

    // ---- 日付ユーティリティ ----
    function getDateString(prefix) {
        const y = document.getElementById(prefix + '_year_input').value;
        const m = document.getElementById(prefix + '_month_input').value;
        const d = document.getElementById(prefix + '_day_input').value;
        if (!y || !m || !d) return null;
        return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    function setDateInputs(prefix, dateStr) {
        if (!dateStr) return;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return;
        document.getElementById(prefix + '_year_input').value  = parseInt(parts[0], 10);
        document.getElementById(prefix + '_month_input').value = parseInt(parts[1], 10);
        document.getElementById(prefix + '_day_input').value   = parseInt(parts[2], 10);
    }

    function setupDateMaxDays(prefix) {
        const y = document.getElementById(prefix + '_year_input');
        const m = document.getElementById(prefix + '_month_input');
        const d = document.getElementById(prefix + '_day_input');
        if (!y || !m || !d) return;

        function updateMax() {
            const year  = parseInt(y.value) || 2026;
            const month = parseInt(m.value) || 1;
            const maxDays = new Date(year, month, 0).getDate();
            d.max = maxDays;
            if (parseInt(d.value) > maxDays) d.value = maxDays;
        }

        y.addEventListener('input', updateMax);
        m.addEventListener('input', updateMax);
    }

    setupDateMaxDays('start');
    setupDateMaxDays('end');
    setupDateMaxDays('rerun_start');
    setupDateMaxDays('rerun_end');

    // ---- マウスホイールで日付入力を増減 ----
    function setupWheelInput(prefix) {
        const y = document.getElementById(prefix + '_year_input');
        const m = document.getElementById(prefix + '_month_input');
        const d = document.getElementById(prefix + '_day_input');
    
        function addWheel(el, min, max) {
            el.addEventListener('wheel', function (e) {
                e.preventDefault(); // ページスクロール無効
                const delta = e.deltaY < 0 ? 1 : -1;
                let val = parseInt(el.value) || min;
                val = Math.min(max, Math.max(min, val + delta));
                el.value = val;
                el.dispatchEvent(new Event('input')); // maxDays更新などに連動
            }, { passive: false });
        }
    
        if (y) addWheel(y, 2020, 2100);
        if (m) addWheel(m, 1, 12);
        if (d) addWheel(d, 1, 31);
    }
    
    setupWheelInput('start');
    setupWheelInput('end');
    setupWheelInput('rerun_start');
    setupWheelInput('rerun_end');
    
    // ---- PHPロジック移植: 日付行パース ----
    function parseDateFromLine(line) {
        const m = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
        if (!m) return null;
        return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    }

    // ---- PHPロジック移植: 日付フィルタリング ----
    function filterJournalByDate(content, startDate, endDate) {
        if (!startDate && !endDate) return content;

        const lines = content.split('\n');
        const filtered = [];
        let include = false;

        for (const line of lines) {
            const dateStr = parseDateFromLine(line);
            if (dateStr) {
                include = true;
                if (startDate && dateStr < startDate) include = false;
                if (endDate   && dateStr > endDate)   include = false;
            }
            if (include) filtered.push(line);
        }

        return filtered.join('\n');
    }

    // ---- PHPロジック移植: ジャーナル解析・集計 ----
    function parseJournalContent(content, startDate, endDate) {
        const lines = content.split('\n');
        const categoryStats = {}; // { category: { price: count } }

        let currentDate       = null;
        let prevQuantityLine  = null; // { unitPrice, quantity }
        let pendingRecord     = null; // { category, unitPrice, quantity }

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

            // 解除機能により中止 → 直前のレコードを破棄
            if (line.includes('解除機能により中止')) {
                pendingRecord    = null;
                prevQuantityLine = null;
                currentDate      = null;
                continue;
            }

            // 日付行
            const dateStr = parseDateFromLine(line);
            if (dateStr) {
                commitPending();
                prevQuantityLine = null;

                if (startDate && dateStr < startDate) { currentDate = null; continue; }
                if (endDate   && dateStr > endDate)   { currentDate = null; continue; }

                currentDate = dateStr;
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

            // 数量行: "11x 3" / "3,700x 2"
            const qtyMatch = line.match(/^(\d+[,]?\d*)x\s*(\d+)/);
            if (qtyMatch) {
                commitPending();
                prevQuantityLine = {
                    unitPrice: parseInt(qtyMatch[1].replace(/,/g, ''), 10),
                    quantity:  parseInt(qtyMatch[2], 10),
                };
                continue;
            }

            // カテゴリ行（通常）: "グッズ    内 \160" or "グッズ    内 ¥160"
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

            // カテゴリ行（戻品）: "飲料    内戻-500" / "文具    内 戻-334"
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
            if (!line.match(/^(\d+[,]?\d*)x\s*(\d+)/)) {
                prevQuantityLine = null;
            }
        }

        commitPending();
        return categoryStats;
    }

    // ---- Shift-JIS → UTF-8 変換 ----
    function decodeFileContent(arrayBuffer) {
        const uint8 = new Uint8Array(arrayBuffer);

        // encoding.js が読み込まれていれば使用
        if (typeof Encoding !== 'undefined') {
            const detected = Encoding.detect(uint8);
            if (detected && detected !== 'UNICODE') {
                const unicode = Encoding.convert(uint8, { to: 'UNICODE', from: detected });
                return Encoding.codeToString(unicode);
            }
        }

        // フォールバック: TextDecoder (Shift-JIS を試みる)
        try {
            return new TextDecoder('shift_jis').decode(uint8);
        } catch (e) {
            return new TextDecoder('utf-8').decode(uint8);
        }
    }

    // ---- 数値フォーマット ----
    function numFmt(n) {
        return Number(n).toLocaleString('ja-JP');
    }

    // ---- HTMLエスケープ ----
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ---- 結果テーブル描画 ----
    function renderResults(analysisResult, startDate, endDate, filteredContent) {
        // タイトル更新
        let titleText = '分析結果';
        if (startDate || endDate) {
            titleText += ' (' + (startDate || '最初') + ' 〜 ' + (endDate || '最後') + ')';
        }
        resultTitle.textContent = titleText;

        if (!analysisResult || Object.keys(analysisResult).length === 0) {
            resultTables.innerHTML = '<p>指定された期間のデータがありません。</p>';
        } else {
            // カテゴリを指定順序でソート
            const sortedCategories = Object.keys(analysisResult).sort((a, b) => {
                const indexA = CATEGORY_ORDER.indexOf(a);
                const indexB = CATEGORY_ORDER.indexOf(b);
                const orderA = indexA === -1 ? CATEGORY_ORDER.length : indexA;
                const orderB = indexB === -1 ? CATEGORY_ORDER.length : indexB;
                return orderA - orderB;
            });

            // ---- 明細テーブル ----
            let detailRows = '';
            for (const category of sortedCategories) {
                const priceBreakdown = analysisResult[category];
                // 金額降順
                const sortedPrices = Object.keys(priceBreakdown)
                    .map(Number)
                    .sort((a, b) => b - a);

                for (const price of sortedPrices) {
                    const count = priceBreakdown[price];
                    if (count === 0) continue;
                    const subtotal = price * count;
                    const cls = CATEGORY_CLASS_MAP[category] || '';
                    detailRows += `<tr class="category-${escHtml(cls)}">
                        <td>${escHtml(category)}</td>
                        <td class="amount">${numFmt(price)}</td>
                        <td>${numFmt(count)}</td>
                        <td class="amount">${numFmt(subtotal)}</td>
                    </tr>`;
                }
            }

            // ---- 集計テーブル ----
            let totalQty    = 0;
            let totalAmount = 0;
            let summaryRows = '';

            for (const category of sortedCategories) {
                const priceBreakdown = analysisResult[category];
                let catQty    = 0;
                let catAmount = 0;

                for (const [price, count] of Object.entries(priceBreakdown)) {
                    if (count === 0) continue;
                    catQty    += count;
                    catAmount += Number(price) * count;
                }

                if (catQty === 0) continue;

                totalQty    += catQty;
                totalAmount += catAmount;
                const cls = CATEGORY_CLASS_MAP[category] || '';
                summaryRows += `<tr class="category-${escHtml(cls)}">
                    <td>${escHtml(category)}</td>
                    <td class="amount">${numFmt(catQty)}</td>
                    <td class="amount">${numFmt(catAmount)}</td>
                </tr>`;
            }

            summaryRows += `<tr style="font-weight:bold;background-color:#f0f0f0;">
                <td>合計</td>
                <td class="amount">${numFmt(totalQty)}</td>
                <td class="amount">${numFmt(totalAmount)}</td>
            </tr>`;

            resultTables.innerHTML = `
                <h3 style="margin-top:40px;">集計結果</h3>
                <table class="summaryTable">
                    <thead>
                        <tr>
                            <th>カテゴリ</th>
                            <th class="amount">販売数合計</th>
                            <th class="amount">販売額合計</th>
                        </tr>
                    </thead>
                    <tbody>${summaryRows}</tbody>
                </table>

                <h3 style="margin-top:40px;">詳細</h3>
                <table class="detailTable">
                    <thead>
                        <tr>
                            <th>カテゴリ</th>
                            <th>金額</th>
                            <th>販売数</th>
                            <th class="amount">小計</th>
                        </tr>
                    </thead>
                    <tbody>${detailRows}</tbody>
                </table>


            `;
        }

        // ジャーナル表示
        if (filteredContent) {
            journalPre.textContent = filteredContent;
            journalDisplayContainer.style.display = '';
        } else {
            journalDisplayContainer.style.display = 'none';
        }

        // 表示切り替え
        uploadFormSection.classList.add('hidden');
        resultSection.classList.add('visible');
        resetButtonContainer.classList.add('visible');

        // rerunパネルを閉じる
        rerunDatePanel.classList.remove('visible');
        rerunToggleButton.setAttribute('aria-expanded', 'false');

        // journalトグルをリセット
        journalContent.classList.remove('visible');
        journalToggleButton.setAttribute('aria-expanded', 'false');
    }

    // ---- 分析実行 ----
    function runAnalysis(utf8Content, fileName, startDate, endDate) {
        setJournalCache(utf8Content, fileName || '');

        const filtered = filterJournalByDate(utf8Content, startDate, endDate);
        const result   = parseJournalContent(utf8Content, startDate, endDate);

        renderResults(result, startDate, endDate, filtered);
    }

    // ---- ファイル読み込み ----
    function readAndAnalyze(file, startDate, endDate) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const utf8 = decodeFileContent(e.target.result);
            clearJournalCache();
            runAnalysis(utf8, file.name, startDate, endDate);
        };
        reader.onerror = function () {
            showError('ファイルの読み込みに失敗しました。');
        };
        reader.readAsArrayBuffer(file);
    }

    // ---- エラー表示 ----
    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }

    // ---- ドロップゾーン ----
    if (dropZone) {
        dropZone.addEventListener('click', function (e) {
            e.preventDefault();
            fileInput.click();
        });
        dropZone.addEventListener('touchend', function (e) {
            e.preventDefault();
            fileInput.click();
        });
        dropZone.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });
        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const f = files[0];
                if (f.name.toLowerCase().endsWith('.txt')) {
                    clearJournalCache();
                    // DataTransfer経由でfileInputに反映
                    try {
                        const dt = new DataTransfer();
                        dt.items.add(f);
                        fileInput.files = dt.files;
                    } catch (_) {}
                    fileNameDisplay.innerHTML = 'ファイル: ' + escHtml(f.name) + '<br>別のファイルをアップロード';
                    dropZoneText.classList.add('hidden');
                } else {
                    alert('.txtファイルのみアップロード可能です。');
                }
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', function () {
            if (fileInput.files.length > 0) {
                clearJournalCache();
                fileNameDisplay.innerHTML = 'ファイル: ' + escHtml(fileInput.files[0].name) + '<br>別のファイルをアップロード';
                dropZoneText.classList.add('hidden');
            } else {
                fileNameDisplay.textContent = '';
                dropZoneText.classList.remove('hidden');
            }
        });
    }

    // ---- 分析実行ボタン ----
    if (runButton) {
        runButton.addEventListener('click', function () {
            hideError();
            const startDate = getDateString('start');
            const endDate   = getDateString('end');
    
            if (startDate && endDate && endDate < startDate) {
                alert('日付の入力が不正です');
                return;
            }
    
            const cache = getJournalCache();
            if (fileInput.files.length === 0 && cache.content) {
                runAnalysis(cache.content, cache.fileName, startDate, endDate);
                return;
            }
    
            if (fileInput.files.length === 0) {
                alert('ファイルが選択されていません。');
                return;
            }
    
            readAndAnalyze(fileInput.files[0], startDate, endDate);
        });
    }

    // ---- 再計算ボタン ----
    if (rerunButton) {
        rerunButton.addEventListener('click', function () {
            const cache = getJournalCache();
            if (!cache.content) {
                alert('保持されたファイル情報がありません。再度ファイルをアップロードしてください。');
                return;
            }
            const startDate = getDateString('rerun_start');
            const endDate   = getDateString('rerun_end');
    
            // 終了日が開始日より前の場合はエラー表示して中断
            if (startDate && endDate && endDate < startDate) {
                alert('日付の入力が不正です');
                return;
            }
            rerunToggleButton.setAttribute('aria-expanded', 'false');
            rerunDatePanel.classList.remove('visible');
    
            runAnalysis(cache.content, cache.fileName, startDate, endDate);
    
            if (startDate) setDateInputs('start', startDate);
            if (endDate)   setDateInputs('end', endDate);
        });
    }

    // ---- 日付変更パネルトグル ----
    if (rerunToggleButton && rerunDatePanel) {
        rerunToggleButton.addEventListener('click', function () {
            const isVisible = rerunDatePanel.classList.contains('visible');
            rerunDatePanel.classList.toggle('visible');
            rerunToggleButton.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
        });
    }

    // ---- ジャーナル表示トグル ----
    if (journalToggleButton && journalContent) {
        journalToggleButton.addEventListener('click', function () {
            const isVisible = journalContent.classList.contains('visible');
            journalContent.classList.toggle('visible');
            journalToggleButton.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
        });
    }

    // ---- リセットボタン ----
    if (rerunButton) {
        rerunButton.addEventListener('click', function () {
            const cache = getJournalCache();
            if (!cache.content) {
                alert('保持されたファイル情報がありません。再度ファイルをアップロードしてください。');
                return;
            }
            const startDate = getDateString('rerun_start');
            const endDate   = getDateString('rerun_end');
    
            // 終了日が開始日より前の場合はエラー表示して中断
            if (startDate && endDate && endDate < startDate) {
                showError('入力が不正です');
                return;
            }
    
            hideError();
            rerunToggleButton.setAttribute('aria-expanded', 'false');
            rerunDatePanel.classList.remove('visible');
    
            runAnalysis(cache.content, cache.fileName, startDate, endDate);
    
            if (startDate) setDateInputs('start', startDate);
            if (endDate)   setDateInputs('end', endDate);
        });
    }
    
    // 当日の日付を開始・終了の初期値にセット
    const today = new Date();
    const todayY = today.getFullYear();
    const todayM = today.getMonth() + 1;
    const todayD = today.getDate();
    
    for (const prefix of ['start', 'end', 'rerun_start', 'rerun_end']) {
        document.getElementById(prefix + '_year_input').value  = todayY;
        document.getElementById(prefix + '_month_input').value = todayM;
        document.getElementById(prefix + '_day_input').value   = todayD;
    }
    // ---- ページ初期化: キャッシュが残っていれば result-section を表示しない ----
    // (GitHub Pages版はサーバーサイドで結果を出さないので常にアップロードフォームから始まる)
    resultSection.classList.remove('visible');
    uploadFormSection.classList.remove('hidden');
    resetButtonContainer.classList.remove('visible');
});
