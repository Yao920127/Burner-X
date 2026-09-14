import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FILE_UPLOAD } from './utils/constants.js';
import { validateEnv, env } from './utils/env.js';

// 匯入路由
import authRoutes from './routes/auth.js';
import ocrRoutes from './routes/ocr.js';
import translationRoutes from './routes/translation.js';
import documentRoutes from './routes/document.js';
import userRoutes from './routes/user.js';
import adminRoutes from './routes/admin.js';
import glossaryRoutes from './routes/glossary.js';
import chatRoutes from './routes/chat.js';
import referenceRoutes from './routes/reference.js';
import promptPoolRoutes from './routes/prompt-pool.js';

// 匯入中介軟體
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';

// 匯入初始化腳本
import { initializeAdmin } from './utils/initAdmin.js';

// 環境變數
dotenv.config();
// Validate environment (fail-fast in production)
validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== 中介軟體配置 ====================

// 安全標頭（CSP）
const isProd = process.env.NODE_ENV === 'production';
const disableCSP = process.env.DISABLE_CSP === 'true';
// 根據部署模式/環境變數決定是否允許內聯腳本，以相容前端模式
const deploymentMode = process.env.DEPLOYMENT_MODE || 'frontend';
const allowInline = process.env.CSP_ALLOW_INLINE === 'true' || deploymentMode === 'frontend';

// Helmet v8 使用駝峰指令名（camelCase）。
// 為相容現有頁面，暫時允許內聯腳本與常用 CDN；後續建議改為外部檔案 + nonce。
const cspDirectives = {
  defaultSrc: ["'self'"],
  // 進一步加固
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  scriptSrc: [
    "'self'",
    ...(allowInline ? ["'unsafe-inline'"] : []),
    'https://cdn.tailwindcss.com',
    'https://gcore.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://unpkg.com',
  ],
  // 明確元素級腳本與內聯事件來源
  scriptSrcElem: [
    "'self'",
    ...(allowInline ? ["'unsafe-inline'"] : []),
    'https://cdn.tailwindcss.com',
    'https://gcore.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://unpkg.com',
  ],
  scriptSrcAttr: ["'self'", ...(allowInline ? ["'unsafe-inline'"] : [])],
  // 樣式與字型
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    'https://gcore.jsdelivr.net',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com',
    'https://cdnjs.cloudflare.com',
    'https://unpkg.com',
  ],
  imgSrc: ["'self'", 'data:'],
  // 字型：允許 Google 與常用 CDN（KaTeX、Iconify 等字型透過 CDN 載入）
  fontSrc: [
    "'self'",
    'data:',
    'https://fonts.gstatic.com',
    'https://gcore.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://unpkg.com',
  ],
  // 前後端同源呼叫；如需跨域可按需補充具體域名
  connectSrc: [
    "'self'",
    // Iconify 線上圖示 API 源（web component 會發起 fetch）
    'https://api.iconify.design',
    'https://api.unisvg.com',
    'https://api.simplesvg.com',
  ],
};

// CSP 構建工具與開關（便於除錯/健康檢查暴露）
const dashMap = {
  defaultSrc: 'default-src',
  frameAncestors: 'frame-ancestors',
  baseUri: 'base-uri',
  objectSrc: 'object-src',
  scriptSrc: 'script-src',
  scriptSrcElem: 'script-src-elem',
  scriptSrcAttr: 'script-src-attr',
  styleSrc: 'style-src',
  imgSrc: 'img-src',
  fontSrc: 'font-src',
  connectSrc: 'connect-src',
};

const buildCspHeader = (directives) => {
  return Object.entries(dashMap)
    .filter(([key]) => Array.isArray(directives[key]) && directives[key].length > 0)
    .map(([key, headerName]) => `${headerName} ${directives[key].join(' ')}`)
    .join('; ');
};

const cspEnabled = isProd && !disableCSP;

// 僅使用 Helmet 其它安全頭，CSP 由自定義中介軟體設定，避免指令名差異導致策略失效
app.use(helmet({ contentSecurityPolicy: false }));

// 識別頭，便於快速確認命中正確版本
app.use((req, res, next) => {
  res.setHeader('X-PBX-App', 'paperburner-app');
  if (cspEnabled) {
    res.setHeader('X-PBX-CSP', buildCspHeader(cspDirectives));
  }
  next();
});

// 自定義 CSP 中介軟體（生產環境且未顯式禁用時啟用）
if (cspEnabled) {
  app.use((req, res, next) => {
    const cspHeaderValue = buildCspHeader(cspDirectives);
    // 確保不存在舊的 CSP 頭被保留/合併
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Security-Policy', cspHeaderValue);
    // 已在標識頭裡也設定一份 X-PBX-CSP
    res.setHeader('X-PBX-CSP', cspHeaderValue);
    next();
  });
}

// CORS 配置
const isProduction = process.env.NODE_ENV === 'production';
// deploymentMode 已在上面宣告，直接使用

let corsOrigin;
if (process.env.CORS_ORIGIN) {
  // 支援逗號分隔的多個源
  corsOrigin = process.env.CORS_ORIGIN.split(',').map(s => s.trim());
} else if (isProduction) {
  // 生產環境：預設限制為同源（必須配置）
  corsOrigin = false; // 不允許跨域
  console.error('❌ Production mode: CORS_ORIGIN not set, defaulting to same-origin only. Set CORS_ORIGIN env var.');
} else {
  // 開發/前端模式：允許所有源（但給出警告）
  corsOrigin = true; // 允許所有源
  console.warn('⚠️  CORS allows all origins. Set CORS_ORIGIN for production.');
}

const corsOptions = {
  origin: corsOrigin,
  // 注意：如果 origin 是 true（允許所有源），credentials 會被瀏覽器忽略
  credentials: corsOrigin !== true, // 只有當 origin 不是 true 時才設定 credentials
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 日誌
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// 請求解析
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Multer 檔案上傳配置
// 檔案型別白名單（可透過環境變數配置）
const ALLOWED_MIME_TYPES = process.env.ALLOWED_MIME_TYPES
  ? process.env.ALLOWED_MIME_TYPES.split(',').map(s => s.trim())
  : [
      'application/pdf',
      'text/markdown',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'text/html',
      'application/epub+zip',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
    ];

// 檔案驗證過濾器（可透過環境變數控制嚴格程度）
const FILE_VALIDATION_STRICT = process.env.FILE_VALIDATION_STRICT === 'true';
const fileFilter = (req, file, cb) => {
  // 非嚴格模式（前端模式）：允許所有檔案型別
  if (!FILE_VALIDATION_STRICT) {
    cb(null, true);
    return;
  }

  // 嚴格模式：只允許白名單中的檔案型別
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`), false);
  }
};

// 選擇儲存模式：memory | disk（生產建議 disk）
const uploadStorageMode = process.env.UPLOAD_STORAGE || 'memory';
let storage;
if (uploadStorageMode === 'disk') {
  const tmpDir = process.env.UPLOAD_TMP_DIR || join(__dirname, '../../.uploads');
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9_.\-]/g, '_');
      cb(null, `${Date.now()}_${safeName}`);
    }
  });
  console.log(`File upload storage: disk -> ${tmpDir}`);
} else {
  storage = multer.memoryStorage();
  if (isProd) {
    console.warn('⚠️  Using memory storage for uploads in production. Consider set UPLOAD_STORAGE=disk');
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || FILE_UPLOAD.DEFAULT_MAX_SIZE_MB) * 1024 * 1024 // MB to bytes
  },
  fileFilter: fileFilter
});

// 生產環境建議啟用嚴格模式
if (process.env.NODE_ENV === 'production' && process.env.FILE_VALIDATION_STRICT !== 'true') {
  console.warn('⚠️  Production mode: Consider setting FILE_VALIDATION_STRICT=true for file upload security.');
}

// 靜態檔案服務（前端）- 收斂暴露範圍，僅白名單必要目錄
const rootPath = join(__dirname, '../../');
const staticOptions = {
  dotfiles: 'ignore',
  maxAge: isProd ? '7d' : 0,
  immutable: isProd,
  // 避免 /admin 被 express.static 重定向到 /admin/，影響測試與直達路由
  redirect: false,
};
// 僅暴露必要的靜態目錄
app.use('/public', express.static(join(rootPath, 'public'), staticOptions));
app.use('/css', express.static(join(rootPath, 'css'), staticOptions));
app.use('/js', express.static(join(rootPath, 'js'), staticOptions));
app.use('/views', express.static(join(rootPath, 'views'), staticOptions));
app.use('/workers', express.static(join(rootPath, 'workers'), staticOptions));
app.use('/admin', express.static(join(rootPath, 'admin'), staticOptions));

// ==================== API 路由 ====================

// 讀取版本號（來自 server/package.json）
let appVersion = 'unknown';
try {
  const pkg = JSON.parse(fs.readFileSync(join(__dirname, '../package.json'), 'utf8'));
  if (pkg && pkg.version) appVersion = pkg.version;
} catch {
  // ignore
}

app.get('/api/health', (req, res) => {
  const isDev = process.env.NODE_ENV !== 'production';

  res.json({
    status: 'ok',
    timestamp: Date.now(),
    mode: process.env.DEPLOYMENT_MODE || 'docker',
    version: appVersion,
    // 開發環境返回詳細資訊，生產環境僅返回狀態
    ...(isDev ? {
      csp: {
        enabled: cspEnabled,
        deploymentMode,
        allowInline,
        header: cspEnabled ? buildCspHeader(cspDirectives) : null,
      },
    } : {
      csp: { enabled: cspEnabled }
    }),
  });
});

// 認證路由
app.use('/api/auth', authRoutes);

// OCR 代理路由（替換 CF Workers）- 新增檔案上傳中介軟體
app.use('/api/ocr', upload.single('file'), ocrRoutes);

// 翻譯相關路由
app.use('/api/translation', translationRoutes);

// 文件管理路由
app.use('/api/documents', documentRoutes);

// 使用者設定路由
app.use('/api/user', userRoutes);

// 管理員路由
app.use('/api/admin', adminRoutes);
// 術語庫路由（與 Next.js app/api/glossary 對齊）
app.use('/api/glossary', glossaryRoutes);

// 聊天曆史路由
app.use('/api/chat', chatRoutes);

// 文獻參考路由
app.use('/api/references', referenceRoutes);

// Prompt Pool 路由
app.use('/api/prompt-pool', promptPoolRoutes);

// ==================== 前端路由（SPA） ====================

// 登入頁需顯式返回 login.html，避免被萬用字元 * 誤回退到 index.html
app.get('/login.html', (req, res) => {
  res.sendFile(join(rootPath, 'login.html'));
});

// 管理員面板
app.get('/admin*', (req, res) => {
  res.sendFile(join(rootPath, 'admin/index.html'));
});

// 主應用
app.get('*', (req, res) => {
  res.sendFile(join(rootPath, 'index.html'));
});

// ==================== 錯誤處理 ====================

app.use(notFound);
app.use(errorHandler);

// ==================== 啟動伺服器 ====================

// Exported server/start to allow supertest to import app without listening in test
const startServer = async () => {
  console.log(`
╔═══════════════════════════════════════╗
║   Paper Burner X Server Started      ║
╠═══════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(29)} ║
║  Mode: ${(process.env.NODE_ENV || 'development').padEnd(29)} ║
║  Database: ${(process.env.DATABASE_URL ? 'Connected' : 'Not configured').padEnd(23)} ║
╚═══════════════════════════════════════╝
  `);

  // 初始化管理員賬戶
  try {
    await initializeAdmin();
  } catch (error) {
    console.error('Failed to initialize admin:', error.message);
  }
};

// Only listen when not in test mode, to allow supertest to use the app directly
if (!env.isTest()) {
  app.listen(PORT, () => { startServer(); });
}

export { app };
