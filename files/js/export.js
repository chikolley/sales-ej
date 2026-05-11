// ======================================================
// export.js - EJジャーナル分析 出力処理
// TXT / PDF / Excel (xlsx) の3形式に対応
// window.SalesExportData を参照して出力する
// ======================================================

document.addEventListener('DOMContentLoaded', function () {

    const exportButton       = document.getElementById('export-button');
    const exportJournalLabel = document.getElementById('export-journal-label');
    const exportJournalCheck = document.getElementById('export-journal');
    const exportDetailCheck  = document.getElementById('export-detail');

    // ---- 形式選択によるジャーナルチェックの有効/無効切り替え ----
    document.querySelectorAll('input[name="export-format"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
            const isXlsx = radio.value === 'xlsx';
            exportJournalCheck.disabled = !isXlsx;
            if (!isXlsx) exportJournalCheck.checked = false;
            exportJournalLabel.classList.toggle('enabled', isXlsx);
        });
    });

    // ---- ユーティリティ ----
    function numFmt(n) {
        return Number(n).toLocaleString('ja-JP');
    }

    function getFormat() {
        return document.querySelector('input[name="export-format"]:checked').value;
    }

    function includeDetail() {
        return exportDetailCheck.checked;
    }

    function includeJournal() {
        return exportJournalCheck.checked && !exportJournalCheck.disabled;
    }

    function getFilenameBase() {
        const d = window.SalesExportData;
        const parts = ['sales-ej'];
        if (d.startDate) parts.push(d.startDate);
        if (d.endDate && d.endDate !== d.startDate) parts.push(d.endDate);
        return parts.join('_');
    }

    function getSortedCategories(analysisResult) {
        const order = window.SalesPage ? window.SalesPage.CATEGORY_ORDER : null;
        return Object.keys(analysisResult).sort((a, b) => {
            if (!order) return a.localeCompare(b);
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            const oa = ia === -1 ? order.length : ia;
            const ob = ib === -1 ? order.length : ib;
            return oa - ob;
        });
    }

    // ---- サマリーデータ構築 ----
    function buildSummaryData(analysisResult) {
        const sortedCategories = getSortedCategories(analysisResult);
        let totalQty    = 0;
        let totalAmount = 0;
        const rows = [];

        for (const category of sortedCategories) {
            const priceBreakdown = analysisResult[category];
            let catQty = 0, catAmount = 0;
            for (const [price, count] of Object.entries(priceBreakdown)) {
                if (count === 0) continue;
                catQty    += count;
                catAmount += Number(price) * count;
            }
            if (catQty === 0) continue;
            totalQty    += catQty;
            totalAmount += catAmount;
            rows.push({ category, catQty, catAmount });
        }

        return { rows, totalQty, totalAmount };
    }

    // ---- 詳細データ構築 ----
    function buildDetailData(analysisResult) {
        const sortedCategories = getSortedCategories(analysisResult);
        const rows = [];

        for (const category of sortedCategories) {
            const priceBreakdown = analysisResult[category];
            const sortedPrices   = Object.keys(priceBreakdown).map(Number).sort((a, b) => b - a);

            for (const price of sortedPrices) {
                const count = priceBreakdown[price];
                if (count === 0) continue;
                rows.push({ category, price, count, subtotal: price * count });
            }
        }

        return rows;
    }

    // ---- TXT出力 ----
    function exportTxt() {
        const d = window.SalesExportData;
        if (!d.analysisResult) return;

        const lines = [];
        const header = d.regLabel ? `電子ジャーナル分析 - ${d.regLabel}` : '電子ジャーナル分析';
        lines.push(header);
        if (d.startDate || d.endDate) {
            lines.push(`期間: ${d.startDate || '最初'} 〜 ${d.endDate || '最後'}`);
        }
        lines.push('');

        // サマリー
        lines.push('【集計結果】');
        lines.push('カテゴリ          販売数    販売額');
        lines.push('─'.repeat(36));
        const { rows, totalQty, totalAmount } = buildSummaryData(d.analysisResult);
        for (const r of rows) {
            lines.push(
                r.category.padEnd(10) +
                String(numFmt(r.catQty)).padStart(8) + '  ' +
                String(numFmt(r.catAmount)).padStart(10)
            );
        }
        lines.push('─'.repeat(36));
        lines.push(
            '合計'.padEnd(10) +
            String(numFmt(totalQty)).padStart(8) + '  ' +
            String(numFmt(totalAmount)).padStart(10)
        );

        // 詳細
        if (includeDetail()) {
            lines.push('');
            lines.push('【詳細】');
            lines.push('カテゴリ          金額      販売数    小計');
            lines.push('─'.repeat(44));
            const detailRows = buildDetailData(d.analysisResult);
            for (const r of detailRows) {
                lines.push(
                    r.category.padEnd(10) +
                    String(numFmt(r.price)).padStart(8) + '  ' +
                    String(numFmt(r.count)).padStart(6) + '  ' +
                    String(numFmt(r.subtotal)).padStart(10)
                );
            }
        }

        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, getFilenameBase() + '.txt');
    }

    // ---- PDF出力（印刷ダイアログ） ----
    function exportPdf() {
        // 詳細を非表示にする場合はprint-hideクラスを付与してから印刷
        const detailSection = document.querySelector('.detailTable');
        const detailHeader  = detailSection ? detailSection.previousElementSibling : null;

        if (!includeDetail()) {
            if (detailSection)  detailSection.classList.add('print-hide');
            if (detailHeader)   detailHeader.classList.add('print-hide');
        }

        window.print();

        // 印刷後に戻す
        if (detailSection)  detailSection.classList.remove('print-hide');
        if (detailHeader)   detailHeader.classList.remove('print-hide');
    }

    // ---- Excel出力 ----
    function exportXlsx() {
        const d = window.SalesExportData;
        if (!d.analysisResult) return;

        const wb = XLSX.utils.book_new();

        // シート1: サマリー
        const summaryAoa = [['カテゴリ', '販売数合計', '販売額合計']];
        const { rows, totalQty, totalAmount } = buildSummaryData(d.analysisResult);
        for (const r of rows) {
            summaryAoa.push([r.category, r.catQty, r.catAmount]);
        }
        summaryAoa.push(['合計', totalQty, totalAmount]);
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'サマリー');

        // シート2: 詳細（選択時）
        if (includeDetail()) {
            const detailAoa = [['カテゴリ', '金額', '販売数', '小計']];
            const detailRows = buildDetailData(d.analysisResult);
            for (const r of detailRows) {
                detailAoa.push([r.category, r.price, r.count, r.subtotal]);
            }
            const wsDetail = XLSX.utils.aoa_to_sheet(detailAoa);
            XLSX.utils.book_append_sheet(wb, wsDetail, '詳細');
        }

        // シート3: 電子ジャーナル（選択時）
        if (includeJournal() && d.filteredContent) {
            const journalLines = d.filteredContent.split('\n').map(line => [line]);
            const wsJournal = XLSX.utils.aoa_to_sheet(journalLines);
            XLSX.utils.book_append_sheet(wb, wsJournal, '電子ジャーナル');
        }

        XLSX.writeFile(wb, getFilenameBase() + '.xlsx');
    }

    // ---- ダウンロードヘルパー ----
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ---- ダウンロードボタン ----
    if (exportButton) {
        exportButton.addEventListener('click', function () {
            const d = window.SalesExportData;
            if (!d || !d.analysisResult) {
                alert('分析結果がありません。先にファイルを分析してください。');
                return;
            }

            const fmt = getFormat();
            if (fmt === 'txt')  exportTxt();
            if (fmt === 'pdf')  exportPdf();
            if (fmt === 'xlsx') exportXlsx();
        });
    }
});