/**
 * Go SDK Setup Script
 * Downloads and extracts Go SDK for embedding in the Electron app
 *
 * Usage:
 *   node scripts/setup-go.js windows   - Download Go for Windows (amd64 + arm64)
 *   node scripts/setup-go.js darwin    - Download Go for macOS (amd64 + arm64)
 *   node scripts/setup-go.js linux     - Download Go for Linux (amd64 + arm64)
 *   node scripts/setup-go.js all       - Download Go for all platforms
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GO_VERSION = '1.22.0';

const GO_DOWNLOADS = {
  'windows-amd64': {
    url: `https://go.dev/dl/go${GO_VERSION}.windows-amd64.zip`,
    archive: `go${GO_VERSION}.windows-amd64.zip`,
  },
  'windows-arm64': {
    url: `https://go.dev/dl/go${GO_VERSION}.windows-arm64.zip`,
    archive: `go${GO_VERSION}.windows-arm64.zip`,
  },
  'darwin-amd64': {
    url: `https://go.dev/dl/go${GO_VERSION}.darwin-amd64.tar.gz`,
    archive: `go${GO_VERSION}.darwin-amd64.tar.gz`,
  },
  'darwin-arm64': {
    url: `https://go.dev/dl/go${GO_VERSION}.darwin-arm64.tar.gz`,
    archive: `go${GO_VERSION}.darwin-arm64.tar.gz`,
  },
  'linux-amd64': {
    url: `https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz`,
    archive: `go${GO_VERSION}.linux-amd64.tar.gz`,
  },
  'linux-arm64': {
    url: `https://go.dev/dl/go${GO_VERSION}.linux-arm64.tar.gz`,
    archive: `go${GO_VERSION}.linux-arm64.tar.gz`,
  },
};

const PLATFORM_MAP = {
  windows: ['windows-amd64', 'windows-arm64'],
  darwin: ['darwin-amd64', 'darwin-arm64'],
  linux: ['linux-amd64', 'linux-arm64'],
  all: Object.keys(GO_DOWNLOADS),
};

// Project root
const PROJECT_ROOT = path.join(__dirname, '..');
const GO_SDK_DIR = path.join(PROJECT_ROOT, 'go-sdk');

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading from ${url}...`);

    const makeRequest = (requestUrl) => {
      const protocol = requestUrl.startsWith('https') ? https : require('http');

      protocol.get(requestUrl, (response) => {
        // Handle redirects
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
          if (percent !== lastPercent && percent % 10 === 0) {
            process.stdout.write(`  Progress: ${percent}% (${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB)\r`);
            lastPercent = percent;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`  Download complete: ${Math.round(downloaded / 1024 / 1024)}MB`);
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

function extractArchive(archivePath, destPath, isZip) {
  console.log(`  Extracting to ${destPath}...`);

  fs.mkdirSync(destPath, { recursive: true });

  try {
    if (isZip) {
      // Use PowerShell on Windows, unzip elsewhere
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
    } else {
      // tar.gz
      execSync(`tar -xzf "${archivePath}" -C "${destPath}"`, {
        stdio: 'inherit',
        maxBuffer: 100 * 1024 * 1024,
      });
    }
    console.log(`  Extraction complete`);
  } catch (error) {
    throw new Error(`Extraction failed: ${error.message}`);
  }
}

async function setupGoForPlatform(platformKey) {
  const info = GO_DOWNLOADS[platformKey];
  if (!info) {
    console.error(`Unknown platform: ${platformKey}`);
    return false;
  }

  console.log(`\nSetting up Go ${GO_VERSION} for ${platformKey}...`);

  // Determine the target directory based on OS
  const [os, arch] = platformKey.split('-');
  const targetDir = path.join(GO_SDK_DIR, os);
  const archDir = path.join(targetDir, arch);

  // Check if already exists
  const goExe = os === 'windows' ? 'go.exe' : 'go';
  const goBinPath = path.join(archDir, 'go', 'bin', goExe);

  if (fs.existsSync(goBinPath)) {
    console.log(`  Go SDK already exists at ${archDir}`);
    return true;
  }

  // Create directories
  fs.mkdirSync(archDir, { recursive: true });

  const isZip = info.archive.endsWith('.zip');
  const archivePath = path.join(GO_SDK_DIR, info.archive);

  try {
    // Download if not already downloaded
    if (!fs.existsSync(archivePath)) {
      await downloadFile(info.url, archivePath);
    } else {
      console.log(`  Using cached archive: ${info.archive}`);
    }

    // Extract
    extractArchive(archivePath, archDir, isZip);

    // Verify
    if (!fs.existsSync(goBinPath)) {
      throw new Error(`Go binary not found at expected location: ${goBinPath}`);
    }

    console.log(`  Go SDK installed successfully for ${platformKey}`);

    // Optionally delete archive to save space
    // fs.unlinkSync(archivePath);

    return true;
  } catch (error) {
    console.error(`  Failed to setup Go for ${platformKey}: ${error.message}`);
    // Cleanup on error
    try {
      if (fs.existsSync(archDir)) {
        fs.rmSync(archDir, { recursive: true, force: true });
      }
    } catch (e) {}
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'all';

  const platforms = PLATFORM_MAP[target];
  if (!platforms) {
    console.error(`Invalid target: ${target}`);
    console.log('Usage: node setup-go.js [windows|darwin|linux|all]');
    process.exit(1);
  }

  console.log(`=== TelemetryHub Go SDK Setup ===`);
  console.log(`Go Version: ${GO_VERSION}`);
  console.log(`Target: ${target}`);
  console.log(`Platforms: ${platforms.join(', ')}`);
  console.log(`Output: ${GO_SDK_DIR}`);

  // Create go-sdk directory
  fs.mkdirSync(GO_SDK_DIR, { recursive: true });

  let success = true;
  for (const platform of platforms) {
    const result = await setupGoForPlatform(platform);
    if (!result) {
      success = false;
    }
  }

  console.log('\n=== Setup Complete ===');

  if (success) {
    console.log('All Go SDKs installed successfully!');
    console.log('\nDirectory structure:');
    console.log('go-sdk/');
    for (const platform of platforms) {
      const [os, arch] = platform.split('-');
      console.log(`  ${os}/${arch}/go/bin/go${os === 'windows' ? '.exe' : ''}`);
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
