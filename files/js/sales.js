// ======================================================
// sales.js - EJジャーナル分析 共通UI・ページ操作
//
// /main/, /sub/ ページ:
//   各ページ側で window.SalesPage を定義してから読み込む
//
// /common/ ページ:
//   window.SalesPageMain と window.SalesPageSub を両方定義してから読み込む
//   ファイル内容の 責任\d+ の有無でメイン/サブを自動判定し
//   window.SalesPage に動的にセットする
// ======================================================

document.addEventListener('DOMContentLoaded', function () {

    // ---- DOM参照 ----
    const dropZone                = document.getElementById('drop-zone');
    const fileInput               = document.getElementById('journal_file');
    const fileNameDisplay         = document.getElementById('file-name-display');
    const dropZoneText            = document.getElementById('drop-zone-text');
    const runButton               = document.getElementById('run-button');
    const rerunButton             = document.getElementById('rerun-button');
    const uploadFormSection       = document.getElementById('upload-form-section');
    const resultSection           = document.getElementById('result-section');
    const resultTitle             = document.getElementById('result-title');
    const resultTables            = document.getElementById('result-tables');
    const resetButton             = document.getElementById('reset-button');
    const errorMessage            = document.getElementById('error-message');
    const journalDisplayContainer = document.getElementById('journal-display-container');
    const journalContent          = document.getElementById('journal-content');
    const journalPre              = document.getElementById('journal-pre');
    const journalToggleButton     = document.getElementById('journal-toggle-button');
    const rerunToggleButton       = document.getElementById('rerun-toggle-button');
    const rerunDatePanel          = document.getElementById('rerun-date-panel');

    // ---- 出力用データ保持 ----
    // export.js から参照できるようにwindowに公開
    window.SalesExportData = {
        analysisResult:  null,
        filteredContent: null,
        startDate:       null,
        endDate:         null,
        regLabel:        null,
    };

    // ---- レジ自動判定 ----
    // window.SalesPageMain / SalesPageSub が両方存在する場合（/common/）のみ動作
    // 片方しかない場合（/main/, /sub/）は各ページ側で設定済みの window.SalesPage をそのまま使う
    function detectAndSetSalesPage(utf8Content) {
        if (!window.SalesPageMain || !window.SalesPageSub) return;
        window.SalesPage = /責任\d+/.test(utf8Content)
            ? window.SalesPageMain
            : window.SalesPageSub;
    }

    // ---- SalesPage プロパティへのアクセサ ----
    // window.SalesPage は readAndAnalyze 後に切り替わる可能性があるため
    // 毎回 window.SalesPage から参照する
    function getCacheContentKey()  { return window.SalesPage.CACHE_CONTENT_KEY; }
    function getCacheFilenameKey() { return window.SalesPage.CACHE_FILENAME_KEY; }
    function getCategoryClassMap() { return window.SalesPage.CATEGORY_CLASS_MAP; }
    function getCategoryOrder()    { return window.SalesPage.CATEGORY_ORDER; }

    // ---- キャッシュ操作 ----
    function setJournalCache(content, fileName) {
        try {
            localStorage.setItem(getCacheContentKey(), content || '');
            localStorage.setItem(getCacheFilenameKey(), fileName || '');
        } catch (e) {}
    }

    function getJournalCache() {
        try {
            return {
                content:  localStorage.getItem(getCacheContentKey())  || '',
                fileName: localStorage.getItem(getCacheFilenameKey()) || '',
            };
        } catch (e) {
            return { content: '', fileName: '' };
        }
    }

    function clearJournalCache() {
        try {
            // 両方のキャッシュキーをクリア（/common/ でのキー切り替えに対応）
            if (window.SalesPageMain) {
                localStorage.removeItem(window.SalesPageMain.CACHE_CONTENT_KEY);
                localStorage.removeItem(window.SalesPageMain.CACHE_FILENAME_KEY);
            }
            if (window.SalesPageSub) {
                localStorage.removeItem(window.SalesPageSub.CACHE_CONTENT_KEY);
                localStorage.removeItem(window.SalesPageSub.CACHE_FILENAME_KEY);
            }
            localStorage.removeItem(getCacheContentKey());
            localStorage.removeItem(getCacheFilenameKey());
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
            const year    = parseInt(y.value) || 2026;
            const month   = parseInt(m.value) || 1;
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
                e.preventDefault();
                const delta = e.deltaY < 0 ? 1 : -1;
                let val = parseInt(el.value) || min;
                val = Math.min(max, Math.max(min, val + delta));
                el.value = val;
                el.dispatchEvent(new Event('input'));
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

    // ---- 日付行パース ----
    function parseDateFromLine(line) {
        const m = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
        if (!m) return null;
        return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    }

    // ---- 日付フィルタリング ----
    function filterJournalByDate(content, startDate, endDate) {
        if (!startDate && !endDate) return content;

        const lines    = content.split('\n');
        const filtered = [];
        let include    = false;

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

    // ---- Shift-JIS → UTF-8 変換 ----
    function decodeFileContent(arrayBuffer) {
        const uint8 = new Uint8Array(arrayBuffer);

        if (typeof Encoding !== 'undefined') {
            const detected = Encoding.detect(uint8);
            if (detected && detected !== 'UNICODE') {
                const unicode = Encoding.convert(uint8, { to: 'UNICODE', from: detected });
                return Encoding.codeToString(unicode);
            }
        }

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
        const CATEGORY_CLASS_MAP = getCategoryClassMap();
        const CATEGORY_ORDER     = getCategoryOrder();

        let titleText = '分析結果';
        if (startDate || endDate) {
            titleText += ' (' + (startDate || '最初') + ' 〜 ' + (endDate || '最後') + ')';
        }
        resultTitle.textContent = titleText;

        const regLabel = (window.SalesPage === window.SalesPageMain)
            ? 'メインレジ (XE-A207)'
            : (window.SalesPage === window.SalesPageSub)
                ? 'サブレジ (XE-A147)'
                : null;

        const regIndicator = document.getElementById('reg-indicator');
        if (regIndicator) {
            regIndicator.textContent = regLabel || '';
            regIndicator.style.display = regLabel ? '' : 'none';
        }

        // 出力用にデータを保持
        window.SalesExportData.analysisResult  = analysisResult;
        window.SalesExportData.filteredContent = filteredContent;
        window.SalesExportData.startDate       = startDate;
        window.SalesExportData.endDate         = endDate;
        window.SalesExportData.regLabel        = regLabel;

        if (!analysisResult || Object.keys(analysisResult).length === 0) {
            resultTables.innerHTML = '<p>指定された期間のデータがありません。</p>';
        } else {
            const sortedCategories = Object.keys(analysisResult).sort((a, b) => {
                if (!CATEGORY_ORDER) return a.localeCompare(b);
                const ia = CATEGORY_ORDER.indexOf(a);
                const ib = CATEGORY_ORDER.indexOf(b);
                const oa = ia === -1 ? CATEGORY_ORDER.length : ia;
                const ob = ib === -1 ? CATEGORY_ORDER.length : ib;
                return oa - ob;
            });

            // 集計テーブル
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

            // 明細テーブル
            let detailRows = '';
            for (const category of sortedCategories) {
                const priceBreakdown = analysisResult[category];
                const sortedPrices   = Object.keys(priceBreakdown)
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

            resultTables.innerHTML = `
                <h3 style="margin-top:40px;">集計結果</h3>
                <table>
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
                <table>
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
        if (resetButtonFixed) resetButtonFixed.classList.add('visible');
        rerunDatePanel.classList.remove('visible');
        rerunToggleButton.setAttribute('aria-expanded', 'false');
        journalContent.classList.remove('visible');
        journalToggleButton.setAttribute('aria-expanded', 'false');
        if (startDate) setDateInputs('rerun_start', startDate);
        if (endDate)   setDateInputs('rerun_end', endDate);
    }

    // ---- 分析実行 ----
    function runAnalysis(utf8Content, fileName, startDate, endDate) {
        setJournalCache(utf8Content, fileName || '');
        const filtered = filterJournalByDate(utf8Content, startDate, endDate);
        const result   = window.SalesPage.parseJournalContent(utf8Content, startDate, endDate);
        renderResults(result, startDate, endDate, filtered);
    }

    // ---- ファイル読み込み ----
    function readAndAnalyze(file, startDate, endDate) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const utf8 = decodeFileContent(e.target.result);
            detectAndSetSalesPage(utf8); // /common/ のみ有効、他は何もしない
            clearJournalCache();
            runAnalysis(utf8, file.name, startDate, endDate);
        };
        reader.onerror = function () {
            alert('ファイルの読み込みに失敗しました。');
        };
        reader.readAsArrayBuffer(file);
    }

    // ---- エラー表示 ----
    function hideError() {
        if (errorMessage) errorMessage.style.display = 'none';
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
            const startDate = getDateString('start');
            const endDate   = getDateString('end');

            if (startDate && endDate && endDate < startDate) {
                alert('入力が不正です');
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

            if (startDate && endDate && endDate < startDate) {
                alert('入力が不正です');
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
    const resetButtonFixed = document.getElementById('reset-button-fixed');

    function doReset() {
        uploadFormSection.classList.remove('hidden');
        resultSection.classList.remove('visible');
        if (resetButtonFixed) resetButtonFixed.classList.remove('visible');

        fileInput.value = '';
        fileNameDisplay.textContent = '';
        dropZoneText.classList.remove('hidden');
        clearJournalCache();
        hideError();
    }

    if (resetButton) {
        resetButton.addEventListener('click', doReset);
    }
    if (resetButtonFixed) {
        resetButtonFixed.addEventListener('click', doReset);
    }
    // ---- 当日の日付を初期値にセット ----
    const today  = new Date();
    const todayY = today.getFullYear();
    const todayM = today.getMonth() + 1;
    const todayD = today.getDate();

    for (const prefix of ['start', 'end', 'rerun_start', 'rerun_end']) {
        document.getElementById(prefix + '_year_input').value  = todayY;
        document.getElementById(prefix + '_month_input').value = todayM;
        document.getElementById(prefix + '_day_input').value   = todayD;
    }

    // ---- ヘルプモーダル ----
    const helpButton = document.getElementById('help-button');
    const helpModal  = document.getElementById('help-modal');
    const helpClose  = document.getElementById('help-close');

    if (helpButton && helpModal) {
        helpButton.addEventListener('click', function () {
            helpModal.classList.add('visible');
            helpModal.setAttribute('aria-hidden', 'false');
        });
        helpClose.addEventListener('click', function () {
            helpModal.classList.remove('visible');
            helpModal.setAttribute('aria-hidden', 'true');
        });
        helpModal.addEventListener('click', function (e) {
            if (e.target === helpModal) {
                helpModal.classList.remove('visible');
                helpModal.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // ---- 初期状態 ----
    resultSection.classList.remove('visible');
    uploadFormSection.classList.remove('hidden');
});