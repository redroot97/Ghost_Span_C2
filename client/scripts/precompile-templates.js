/**
 * Pre-compile Templates Script
 * Compiles DLL/EXE templates once with placeholders for instant generation
 *
 * Usage:
 *   node scripts/precompile-templates.js
 *
 * This creates pre-compiled binaries in precompiled-templates/ that get
 * patched at runtime instead of being compiled each time.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const TEMPLATES_DIR = path.join(PROJECT_ROOT, 'src', 'main');
const TEMPLATES_GO_DIR = path.join(TEMPLATES_DIR, 'templates-go');       // EXE/BIN
const TEMPLATES_DLL_DIR = path.join(TEMPLATES_DIR, 'templates-dll');     // DLL
const TEMPLATES_SVC_DIR = path.join(TEMPLATES_DIR, 'templates-svc');     // Windows Service
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'precompiled-templates');
const GO_SDK_DIR = path.join(PROJECT_ROOT, 'go-sdk');
const MINGW_SDK_DIR = path.join(PROJECT_ROOT, 'mingw-sdk');

// Platforms to pre-compile for
const PLATFORMS = [
  { os: 'windows', arch: 'amd64', formats: ['exe', 'dll', 'svc'] },
  { os: 'windows', arch: 'arm64', formats: ['exe', 'dll', 'svc'] },
  { os: 'darwin', arch: 'amd64', formats: ['bin'] },
  { os: 'darwin', arch: 'arm64', formats: ['bin'] },
  { os: 'linux', arch: 'amd64', formats: ['bin'] },
  { os: 'linux', arch: 'arm64', formats: ['bin'] },
];

function findGo() {
  // Detect current OS
  const isWindows = process.platform === 'win32';
  const osName = isWindows ? 'windows' : (process.platform === 'darwin' ? 'darwin' : 'linux');
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const goExeName = isWindows ? 'go.exe' : 'go';

  // Check embedded Go SDK for current platform first
  const goSdkPath = path.join(GO_SDK_DIR, osName, arch, 'go', 'bin', goExeName);
  if (fs.existsSync(goSdkPath)) {
    return { path: goSdkPath, goroot: path.join(GO_SDK_DIR, osName, arch, 'go') };
  }

  // Check system Go
  try {
    const result = execSync('go env GOROOT', { encoding: 'utf8' });
    const goroot = result.trim();
    if (goroot) {
      const systemGo = path.join(goroot, 'bin', goExeName);
      if (fs.existsSync(systemGo)) {
        return { path: systemGo, goroot };
      }
    }
    // Try just 'go' command
    execSync('go version', { encoding: 'utf8' });
    return { path: 'go', goroot: null };
  } catch (e) {
    return null;
  }
}

// LLVM-MinGW version (must match setup-mingw.js)
const LLVM_MINGW_VERSION = '20241217';

// Get the embedded cross-compiler info for the current host platform
function getEmbeddedMingwInfo() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';

  if (isWindows) {
    // Windows uses llvm-mingw (supports both x64 and ARM64 targets)
    const suffix = arch === 'arm64' ? 'aarch64' : 'x86_64';
    return {
      extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-${suffix}`,
      gccName: 'x86_64-w64-mingw32-gcc.exe',
      crossPrefix: 'x86_64-w64-mingw32-'
    };
  } else if (isMac) {
    return {
      extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-macos-universal`,
      gccName: 'x86_64-w64-mingw32-gcc',
      crossPrefix: 'x86_64-w64-mingw32-'
    };
  } else {
    // Linux
    const suffix = arch === 'arm64' ? 'aarch64' : 'x86_64';
    return {
      extractDir: `llvm-mingw-${LLVM_MINGW_VERSION}-ucrt-ubuntu-20.04-${suffix}`,
      gccName: 'x86_64-w64-mingw32-gcc',
      crossPrefix: 'x86_64-w64-mingw32-'
    };
  }
}

function findGcc() {
  const isWindows = process.platform === 'win32';
  const hostOs = isWindows ? 'windows' : (process.platform === 'darwin' ? 'darwin' : 'linux');
  const hostArch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const mingwInfo = getEmbeddedMingwInfo();

  // Check embedded MinGW/llvm-mingw first
  const mingwPath = path.join(MINGW_SDK_DIR, hostOs, hostArch, mingwInfo.extractDir, 'bin', mingwInfo.gccName);
  if (fs.existsSync(mingwPath)) {
    return {
      path: mingwPath,
      binDir: path.dirname(mingwPath),
      crossPrefix: mingwInfo.crossPrefix
    };
  }

  // Check system GCC
  try {
    const locateCmd = isWindows ? 'where gcc' : 'which gcc';
    const result = execSync(locateCmd, { encoding: 'utf8' });
    const gccPath = result.trim().split('\n')[0];
    if (gccPath && fs.existsSync(gccPath)) {
      return { path: gccPath, binDir: path.dirname(gccPath), crossPrefix: '' };
    }
    return { path: 'gcc', binDir: null, crossPrefix: '' };
  } catch (e) {
    return null;
  }
}

// Find cross-compiler for Windows targets (mingw-w64 on Linux/macOS)
// targetArch: 'amd64' or 'arm64' - the Windows architecture to target
function findWindowsCrossCompiler(targetArch = 'amd64') {
  const hostOs = process.platform === 'darwin' ? 'darwin' :
                 process.platform === 'win32' ? 'windows' : 'linux';
  const hostArch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const mingwInfo = getEmbeddedMingwInfo();

  // Determine the correct GCC name based on target architecture
  // llvm-mingw includes both x86_64 and aarch64 cross-compilers
  const isWindows = process.platform === 'win32';
  let gccName, crossPrefix;

  if (targetArch === 'arm64') {
    // ARM64 Windows target
    gccName = isWindows ? 'aarch64-w64-mingw32-gcc.exe' : 'aarch64-w64-mingw32-gcc';
    crossPrefix = 'aarch64-w64-mingw32-';
  } else {
    // x64 Windows target
    gccName = isWindows ? 'x86_64-w64-mingw32-gcc.exe' : 'x86_64-w64-mingw32-gcc';
    crossPrefix = 'x86_64-w64-mingw32-';
  }

  // On Windows with native MinGW (winlibs), use regular gcc for native arch only
  if (isWindows && targetArch === hostArch) {
    const nativeGcc = findGcc();
    if (nativeGcc) return nativeGcc;
  }

  // Check embedded llvm-mingw cross-compiler
  const crossGccPath = path.join(MINGW_SDK_DIR, hostOs, hostArch, mingwInfo.extractDir, 'bin', gccName);
  if (fs.existsSync(crossGccPath)) {
    return {
      path: crossGccPath,
      binDir: path.dirname(crossGccPath),
      crossPrefix: crossPrefix
    };
  }

  // On Linux/macOS, look for system mingw-w64 cross-compiler
  if (!isWindows) {
    try {
      const result = execSync(`which ${gccName}`, { encoding: 'utf8' });
      const gccPath = result.trim();
      if (gccPath) {
        return { path: gccPath, binDir: path.dirname(gccPath), crossPrefix: crossPrefix };
      }
    } catch (e) {}
  }

  return null;
}

async function compileTemplate(goInfo, gccInfo, platform, format) {
  const { os: targetOS, arch: targetArch } = platform;
  const key = `${targetOS}-${targetArch}-${format}`;

  console.log(`\nCompiling ${key}...`);

  // Determine output extension and build mode
  let outputExt, buildMode, cgoEnabled, templateDir;

  switch (format) {
    case 'exe':
      outputExt = '.exe';
      buildMode = 'exe';
      cgoEnabled = '0';
      templateDir = TEMPLATES_GO_DIR;
      break;
    case 'svc':  // Windows Service - uses dedicated template with SCM integration
      outputExt = '.exe';
      buildMode = 'exe';
      cgoEnabled = '0';
      templateDir = TEMPLATES_SVC_DIR;
      break;
    case 'bin':
      outputExt = '';
      buildMode = 'exe';
      cgoEnabled = '0';
      templateDir = TEMPLATES_GO_DIR;
      break;
    case 'dll':
      outputExt = '.dll';
      buildMode = 'c-shared';
      cgoEnabled = '1';
      templateDir = TEMPLATES_DLL_DIR;
      break;
    default:
      console.log(`  Skipping ${format} (not supported yet)`);
      return false;
  }

  // Check CGO requirements
  if (cgoEnabled === '1' && !gccInfo) {
    console.log(`  Skipping ${key} - requires GCC (run npm run setup-mingw)`);
    return false;
  }

  // Check cross-compilation limitations for CGO builds
  const hostOs = process.platform === 'win32' ? 'windows' :
                 process.platform === 'darwin' ? 'darwin' : 'linux';
  if (cgoEnabled === '1' && targetOS !== hostOs) {
    // CGO cross-compilation requires platform-specific toolchains
    if (format === 'dylib' && hostOs !== 'darwin') {
      console.log(`  Skipping ${key} - dylib requires macOS toolchain`);
      return 'skipped';
    }
    if (format === 'so' && hostOs !== 'linux') {
      console.log(`  Skipping ${key} - .so requires Linux toolchain`);
      return 'skipped';
    }
  }

  // Create temp build directory
  const buildDir = path.join(OUTPUT_DIR, '.build', key);
  fs.mkdirSync(buildDir, { recursive: true });

  // Copy template files (all .go files and go.mod)
  const files = fs.readdirSync(templateDir);
  for (const file of files) {
    if (file.endsWith('.go') || file === 'go.mod') {
      const content = fs.readFileSync(path.join(templateDir, file), 'utf8');
      fs.writeFileSync(path.join(buildDir, file), content);
    }
  }

  // Build environment
  const env = {
    ...process.env,
    GOOS: targetOS,
    GOARCH: targetArch,
    CGO_ENABLED: cgoEnabled,
    GOROOT: goInfo.goroot,
  };

  if (cgoEnabled === '1' && gccInfo) {
    env.PATH = gccInfo.binDir + path.delimiter + process.env.PATH;
    env.CC = gccInfo.path;
  }

  // Output directory - use format in filename to distinguish exe vs svc, bin vs systemd etc.
  const outputDir = path.join(OUTPUT_DIR, targetOS, targetArch);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, `template-${format}${outputExt}`);

  // Build header file for DLL (if applicable)
  let headerFile = null;
  if (format === 'dll') {
    headerFile = path.join(outputDir, 'template.h');
  }

  try {
    // Run go mod tidy
    console.log('  Running go mod tidy...');
    spawnSync(goInfo.path, ['mod', 'tidy'], {
      cwd: buildDir,
      env,
      stdio: 'pipe',
    });

    // Build
    console.log('  Building...');
    // -H windowsgui: No console window (stealth)
    // -s -w: Strip debug info and symbols (smaller binary)
    const ldflags = targetOS === 'windows' && buildMode === 'exe'
      ? '-s -w -H windowsgui'
      : '-s -w';

    let buildArgs;
    if (buildMode === 'c-shared') {
      buildArgs = ['build', '-buildmode=c-shared', '-ldflags', ldflags, '-o', outputFile, '.'];
    } else {
      buildArgs = ['build', '-ldflags', ldflags, '-o', outputFile, '.'];
    }

    const result = spawnSync(goInfo.path, buildArgs, {
      cwd: buildDir,
      env,
      stdio: 'pipe',
      timeout: 300000, // 5 minute timeout
    });

    if (result.status !== 0) {
      console.log(`  Build failed: ${result.stderr?.toString() || 'unknown error'}`);
      return false;
    }

    // Verify output
    if (!fs.existsSync(outputFile)) {
      console.log('  Build completed but output file not found');
      return false;
    }

    const stats = fs.statSync(outputFile);
    console.log(`  Success: ${outputFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    // For DLLs, also note the header file
    if (headerFile && fs.existsSync(path.join(buildDir, 'template.h'))) {
      fs.copyFileSync(path.join(buildDir, 'template.h'), headerFile);
    }

    return true;
  } catch (error) {
    console.log(`  Build error: ${error.message}`);
    return false;
  } finally {
    // Cleanup build directory
    try {
      fs.rmSync(buildDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

async function main() {
  console.log('=== TelemetryHub Template Pre-compilation ===\n');

  const hostOs = process.platform === 'win32' ? 'windows' :
                 process.platform === 'darwin' ? 'darwin' : 'linux';
  console.log(`Host platform: ${hostOs}-${process.arch === 'arm64' ? 'arm64' : 'amd64'}`);

  // Find Go
  const goInfo = findGo();
  if (!goInfo) {
    console.error(`Go not found. Run "npm run setup-go:${hostOs === 'darwin' ? 'mac' : hostOs}" first.`);
    process.exit(1);
  }
  console.log(`Go: ${goInfo.path}`);

  // Find native GCC (for building Linux .so / macOS .dylib)
  const nativeGccInfo = findGcc();
  if (nativeGccInfo) {
    console.log(`Native GCC: ${nativeGccInfo.path}`);
  } else {
    console.log('Native GCC: Not found (native shared library builds will be skipped)');
  }

  // Find Windows cross-compilers (for building Windows .dll)
  const windowsCrossInfoAmd64 = findWindowsCrossCompiler('amd64');
  const windowsCrossInfoArm64 = findWindowsCrossCompiler('arm64');
  if (windowsCrossInfoAmd64) {
    console.log(`Windows x64 Cross-Compiler: ${windowsCrossInfoAmd64.path}`);
  } else {
    console.log('Windows x64 Cross-Compiler: Not found (x64 DLL builds will be skipped)');
  }
  if (windowsCrossInfoArm64) {
    console.log(`Windows ARM64 Cross-Compiler: ${windowsCrossInfoArm64.path}`);
  } else {
    console.log('Windows ARM64 Cross-Compiler: Not found (ARM64 DLL builds will be skipped)');
  }

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Compile templates
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const platform of PLATFORMS) {
    for (const format of platform.formats) {
      // Select the appropriate compiler based on target platform and arch
      let gccInfo = null;
      if (format === 'dll') {
        // Windows DLL - use appropriate cross-compiler for target arch
        gccInfo = platform.arch === 'arm64' ? windowsCrossInfoArm64 : windowsCrossInfoAmd64;
      }

      const result = await compileTemplate(goInfo, gccInfo, platform, format);
      if (result === true) success++;
      else if (result === 'skipped') {
        skipped++;
      } else if (result === false) {
        // Check if it was skipped due to missing GCC or actually failed
        if (format === 'dll' && !gccInfo) skipped++;
        else failed++;
      }
    }
  }

  console.log('\n=== Pre-compilation Complete ===');
  console.log(`Success: ${success}`);
  console.log(`Skipped: ${skipped} (missing dependencies)`);
  console.log(`Failed: ${failed}`);
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);

  // Create manifest
  const manifest = {
    version: '1.0.0',
    created: new Date().toISOString(),
    templates: {},
  };

  for (const platform of PLATFORMS) {
    for (const format of platform.formats) {
      const { os: targetOS, arch: targetArch } = platform;
      let ext = '';
      switch (format) {
        case 'exe':
        case 'svc':
          ext = '.exe'; break;
        case 'dll': ext = '.dll'; break;
        default: ext = '';
      }

      const templatePath = path.join(OUTPUT_DIR, targetOS, targetArch, `template-${format}${ext}`);
      if (fs.existsSync(templatePath)) {
        const key = `${targetOS}-${targetArch}-${format}`;
        const stats = fs.statSync(templatePath);
        manifest.templates[key] = {
          path: `${targetOS}/${targetArch}/template-${format}${ext}`,
          size: stats.size,
          format,
        };
      }
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('Manifest written to manifest.json');
}

main().catch(err => {
  console.error('Pre-compilation failed:', err.message);
  process.exit(1);
});
