/**
 * MinGW Setup Script
 * Downloads and extracts MinGW/cross-compilers for CGO builds (DLL)
 *
 * Usage:
 *   node scripts/setup-mingw.js           - Setup for current platform
 *   node scripts/setup-mingw.js windows   - Setup native Windows MinGW
 *   node scripts/setup-mingw.js linux     - Setup Linux cross-compiler for Windows
 *   node scripts/setup-mingw.js darwin    - Setup macOS cross-compiler for Windows
 *   node scripts/setup-mingw.js all       - Setup for all platforms
 *
 * This only needs to run once. MinGW will be cached in mingw-sdk/
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Using llvm-mingw for cross-platform support (works on Linux, macOS, Windows)
// https://github.com/mstorsjo/llvm-mingw
const LLVM_MINGW_VERSION = '20241217';

const MINGW_DOWNLOADS = {
  // Windows x64: Use llvm-mingw for cross-compilation support (both x64 and ARM64 targets)
  'windows-amd64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-x86_64.zip`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-x86_64.zip`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-x86_64`,
    gccName: 'x86_64-w64-mingw32-gcc.exe',
    crossPrefix: 'x86_64-w64-mingw32-'
  },
  // Windows ARM64: Use llvm-mingw for cross-compilation support (both x64 and ARM64 targets)
  'windows-arm64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-aarch64.zip`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-aarch64.zip`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-aarch64`,
    gccName: 'x86_64-w64-mingw32-gcc.exe',
    crossPrefix: 'x86_64-w64-mingw32-'
  },
  // Linux x64 cross-compiler for Windows (llvm-mingw)
  'linux-amd64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-ubuntu-20.04-x86_64.tar.xz`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-ubuntu-x86_64.tar.xz`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-ubuntu-20.04-x86_64`,
    gccName: 'x86_64-w64-mingw32-gcc',
    crossPrefix: 'x86_64-w64-mingw32-'
  },
  // Linux ARM64 cross-compiler for Windows (llvm-mingw)
  'linux-arm64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-ubuntu-20.04-aarch64.tar.xz`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-ubuntu-aarch64.tar.xz`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-ubuntu-20.04-aarch64`,
    gccName: 'x86_64-w64-mingw32-gcc',
    crossPrefix: 'x86_64-w64-mingw32-'
  },
  // macOS x64 cross-compiler for Windows (llvm-mingw)
  'darwin-amd64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-macos-universal.tar.xz`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-macos-universal.tar.xz`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-macos-universal`,
    gccName: 'x86_64-w64-mingw32-gcc',
    crossPrefix: 'x86_64-w64-mingw32-'
  },
  // macOS ARM64 cross-compiler for Windows (same universal binary)
  'darwin-arm64': {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${LLVM_MINGW_VERSION}/llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-macos-universal.tar.xz`,
    archive: `llvm-mingw-${LLVM_MINGW_VERSION}-macos-universal.tar.xz`,
    extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-macos-universal`,
    gccName: 'x86_64-w64-mingw32-gcc',
    crossPrefix: 'x86_64-w64-mingw32-'
  }
};

const PLATFORM_MAP = {
  windows: ['windows-amd64', 'windows-arm64'],
  linux: ['linux-amd64', 'linux-arm64'],
  darwin: ['darwin-amd64', 'darwin-arm64'],
  all: Object.keys(MINGW_DOWNLOADS),
  current: null // Will be determined at runtime
};

const PROJECT_ROOT = path.join(__dirname, '..');
const MINGW_SDK_DIR = path.join(PROJECT_ROOT, 'mingw-sdk');

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading from ${url}...`);

    const makeRequest = (requestUrl) => {
      const protocol = requestUrl.startsWith('https') ? https : require('http');

      protocol.get(requestUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          console.log(`  Following redirect...`);
          return makeRequest(response.headers.location);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;
        let lastPercent = 0;

        const file = fs.createWriteStream(destPath);

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          const percent = Math.round((downloaded / totalSize) * 100);
          if (percent !== lastPercent && percent % 5 === 0) {
            process.stdout.write(`  Progress: ${percent}% (${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB)\r`);
            lastPercent = percent;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`\n  Download complete: ${Math.round(downloaded / 1024 / 1024)}MB`);
          resolve(destPath);
        });

        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

function extractArchive(archivePath, destPath) {
  console.log(`  Extracting to ${destPath}...`);

  fs.mkdirSync(destPath, { recursive: true });

  try {
    if (archivePath.endsWith('.zip')) {
      // ZIP extraction
      if (process.platform === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destPath}' -Force"`, {
          stdio: 'inherit',
          maxBuffer: 100 * 1024 * 1024,
        });
      } else {
        execSync(`unzip -q -o "${archivePath}" -d "${destPath}"`, {
          stdio: 'inherit',
          maxBuffer: 100 * 1024 * 1024,
        });
      }
    } else if (archivePath.endsWith('.tar.xz')) {
      // tar.xz extraction
      execSync(`tar -xJf "${archivePath}" -C "${destPath}"`, {
        stdio: 'inherit',
        maxBuffer: 100 * 1024 * 1024,
      });
    } else if (archivePath.endsWith('.tar.gz')) {
      // tar.gz extraction
      execSync(`tar -xzf "${archivePath}" -C "${destPath}"`, {
        stdio: 'inherit',
        maxBuffer: 100 * 1024 * 1024,
      });
    } else {
      throw new Error(`Unknown archive format: ${archivePath}`);
    }
    console.log(`  Extraction complete`);
  } catch (error) {
    throw new Error(`Extraction failed: ${error.message}`);
  }
}

function getCurrentPlatformKey() {
  const os = process.platform === 'win32' ? 'windows' :
             process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  return `${os}-${arch}`;
}

async function setupMingwForPlatform(platformKey) {
  const info = MINGW_DOWNLOADS[platformKey];
  if (!info) {
    console.error(`Unknown platform: ${platformKey}`);
    return false;
  }

  console.log(`\nSetting up MinGW cross-compiler for ${platformKey}...`);

  // Determine the target directory
  const [os, arch] = platformKey.split('-');
  const targetDir = path.join(MINGW_SDK_DIR, os, arch);

  // For Windows native, gcc is in mingw64/bin/gcc.exe
  // For cross-compilers, it's in llvm-mingw-.../bin/x86_64-w64-mingw32-gcc
  const gccPath = path.join(targetDir, info.extractDir, 'bin', info.gccName);

  // Check if already installed
  if (fs.existsSync(gccPath)) {
    console.log(`  MinGW already installed at ${targetDir}`);
    return true;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const archivePath = path.join(MINGW_SDK_DIR, info.archive);

  try {
    // Download if not already downloaded
    if (!fs.existsSync(archivePath)) {
      await downloadFile(info.url, archivePath);
    } else {
      console.log(`  Using cached archive: ${info.archive}`);
    }

    // Extract
    extractArchive(archivePath, targetDir);

    // Verify
    if (!fs.existsSync(gccPath)) {
      // Try to find where gcc actually is
      console.log(`  Warning: GCC not found at expected location: ${gccPath}`);
      console.log(`  Checking directory structure...`);
      try {
        const files = fs.readdirSync(targetDir);
        console.log(`  Contents of ${targetDir}: ${files.join(', ')}`);
      } catch (e) {}
      throw new Error(`GCC not found at expected location: ${gccPath}`);
    }

    // Get version (handle cross-compiler naming)
    try {
      const version = execSync(`"${gccPath}" --version`, { encoding: 'utf8' }).split('\n')[0];
      console.log(`  GCC installed: ${version}`);
    } catch (e) {
      console.log(`  GCC installed (version check skipped - may need to run on target platform)`);
    }

    // Cleanup archive to save space
    try { fs.unlinkSync(archivePath); } catch (e) {}

    console.log(`  MinGW installed successfully for ${platformKey}`);
    return true;

  } catch (error) {
    console.error(`  Failed to setup MinGW for ${platformKey}: ${error.message}`);
    // Cleanup on error
    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    } catch (e) {}
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let target = args[0] || 'current';

  // Handle 'current' target
  if (target === 'current') {
    const currentKey = getCurrentPlatformKey();
    console.log(`Detected current platform: ${currentKey}`);
    target = process.platform === 'win32' ? 'windows' :
             process.platform === 'darwin' ? 'darwin' : 'linux';
  }

  // Get platforms to install
  let platforms;
  if (PLATFORM_MAP[target]) {
    platforms = PLATFORM_MAP[target];
  } else if (MINGW_DOWNLOADS[target]) {
    platforms = [target];
  } else {
    console.error(`Invalid target: ${target}`);
    console.log('Usage: node setup-mingw.js [windows|linux|darwin|all|current]');
    console.log('  windows - Windows native MinGW');
    console.log('  linux   - Linux cross-compiler for Windows');
    console.log('  darwin  - macOS cross-compiler for Windows');
    console.log('  all     - All platforms');
    console.log('  current - Current platform only (default)');
    process.exit(1);
  }

  console.log(`=== TelemetryHub MinGW Setup ===`);
  console.log(`Target: ${target}`);
  console.log(`Platforms: ${platforms.join(', ')}`);
  console.log(`Output: ${MINGW_SDK_DIR}`);

  fs.mkdirSync(MINGW_SDK_DIR, { recursive: true });

  let success = true;
  for (const platform of platforms) {
    const result = await setupMingwForPlatform(platform);
    if (!result) {
      success = false;
    }
  }

  console.log('\n=== Setup Complete ===');

  if (success) {
    console.log('MinGW toolchain installed successfully!');
    console.log('\nDirectory structure:');
    console.log('mingw-sdk/');
    for (const platform of platforms) {
      const [os, arch] = platform.split('-');
      const info = MINGW_DOWNLOADS[platform];
      console.log(`  ${os}/${arch}/${info.extractDir}/bin/${info.gccName}`);
    }
  } else {
    console.log('Some installations failed. Check errors above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
