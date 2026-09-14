// Phase 2 診斷腳本
// 在瀏覽器主控台貼上並執行

console.log('===== Phase 2 最佳化診斷 =====\n');

// 1. 檢查 AnnotationDOMCache 是否存在
console.log('1️⃣ 檢查 AnnotationDOMCache 物件:');
if (typeof window.AnnotationDOMCache === 'undefined') {
    console.error('❌ AnnotationDOMCache 未定義！');
    console.log('   → 可能原因: annotation_logic.js 沒有載入');
} else {
    console.log('✅ AnnotationDOMCache 已定義');
    console.log('   - initialized:', window.AnnotationDOMCache.initialized);
    console.log('   - subBlocks:', window.AnnotationDOMCache.subBlocks);
    console.log('   - subBlockMap:', window.AnnotationDOMCache.subBlockMap);

    if (!window.AnnotationDOMCache.initialized) {
        console.warn('⚠️ AnnotationDOMCache 未初始化');
        console.log('   → 可能原因: 內容渲染完成後沒有呼叫 init()');

        // 嘗試手動初始化
        console.log('\n🔧 嘗試手動初始化...');
        try {
            window.AnnotationDOMCache.init();
            console.log('✅ 手動初始化成功');
        } catch (e) {
            console.error('❌ 手動初始化失敗:', e);
        }
    } else {
        console.log('✅ AnnotationDOMCache 已初始化');
        console.log(`   → 已快取 ${window.AnnotationDOMCache.subBlocks.length} 個 sub-block`);
    }
}

console.log('\n2️⃣ 檢查 DOM_CACHE 物件:');
if (typeof DOM_CACHE === 'undefined') {
    console.error('❌ DOM_CACHE 未定義！');
    console.log('   → 可能原因: history_detail_show_tab.js 作用域問題');
} else {
    console.log('✅ DOM_CACHE 已定義');
    console.log('   - tabs.ocr:', DOM_CACHE.tabs.ocr);
    console.log('   - tabs.translation:', DOM_CACHE.tabs.translation);
    console.log('   - tabs.chunkCompare:', DOM_CACHE.tabs.chunkCompare);
}

console.log('\n3️⃣ 檢查 window.contentReady 標誌:');
console.log('   - contentReady:', window.contentReady);
if (!window.contentReady) {
    console.warn('⚠️ 內容尚未載入完成');
    console.log('   → 等待內容載入完成後再測試');
}

console.log('\n4️⃣ 檢查頁面上的 sub-block 元素:');
const subBlocks = document.querySelectorAll('.sub-block[data-sub-block-id]');
console.log(`   → 頁面上有 ${subBlocks.length} 個 sub-block 元素`);

if (subBlocks.length === 0) {
    console.warn('⚠️ 頁面上沒有 sub-block 元素');
    console.log('   → 可能原因: 內容還沒渲染，或者使用的是 PDF 對照模式');
}

console.log('\n5️⃣ 檢查 showTab 函式:');
if (typeof showTab === 'undefined') {
    console.error('❌ showTab 函式未定義！');
} else {
    console.log('✅ showTab 函式已定義');
    // 檢查是否是防抖版本
    const funcStr = showTab.toString();
    if (funcStr.includes('showTabDebounceTimer')) {
        console.log('✅ showTab 包含防抖邏輯');
    } else {
        console.warn('⚠️ showTab 可能沒有防抖邏輯');
    }
}

console.log('\n===== 診斷完成 =====');
console.log('\n📋 總結:');
console.log('如果看到任何 ❌ 或 ⚠️，說明最佳化可能沒有正確應用');
console.log('建議: 重新整理頁面後重新執行此腳本');
