/**
 * mathml2omml - Browser 載入器
 * 將 MathML 轉換為 OMML (Office Math Markup Language)
 * 源: https://github.com/fiduswriter/mathml2omml v0.5.0
 *
 * 使用 ES6 module 動態匯入，相容現代瀏覽器
 * 匯出到 window.mml2omml 和 window.MML2OMML
 */

(function(window) {
'use strict';

// 建立載入器
function loadMathml2Omml() {
  // 使用 type=module 動態載入
  const script = document.createElement('script');
  script.type = 'module';
  script.textContent = `
    import { mml2omml } from 'https://gcore.jsdelivr.net/npm/mathml2omml@0.5.0/+esm';

    // 匯出到全域
    window.mml2omml = mml2omml;

    // 也建立一個類包裝，以便與現有程式碼相容
    window.MML2OMML = class {
      constructor(mmlString, options = {}) {
        this.mmlString = mmlString;
        this.options = options;
        this.result = null;
      }

      run() {
        this.result = mml2omml(this.mmlString, this.options);
      }

      getResult() {
        return this.result;
      }
    };

    // 觸發ready事件
    window.dispatchEvent(new Event('mathml2omml-ready'));
    console.log('%c[mathml2omml] ✅ 已載入（v0.5.0）', 'color: #10b981; font-weight: bold');
    console.log('可用方法: window.mml2omml(mathmlString) 或 new window.MML2OMML(mathmlString)');
  `;

  document.head.appendChild(script);
}

// 立即載入
loadMathml2Omml();

})(window);
