/**
 * Icon Generator Script
 * Converts SVG icon to all required formats for Electron apps
 *
 * Generates:
 * - PNG files at various sizes (16, 32, 48, 64, 128, 256, 512, 1024)
 * - ICO file for Windows (multi-resolution)
 * - iconset folder for macOS (use iconutil on Mac to create .icns)
 *
 * Usage: node scripts/generate-icon.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const SVG_PATH = path.join(PUBLIC_DIR, 'icon.svg');

// Sizes needed for different platforms
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

// ICO sizes (Windows)
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function generatePNGs() {
  console.log('Generating PNG files...');

  fs.mkdirSync(ICONS_DIR, { recursive: true });

  const svgBuffer = fs.readFileSync(SVG_PATH);

  for (const size of SIZES) {
    const outputPath = path.join(ICONS_DIR, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`  Created: icon-${size}.png`);
  }

  // Also create main icon.png at 1024px for electron-builder
  const mainIconPath = path.join(PUBLIC_DIR, 'icon.png');
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(mainIconPath);
  console.log(`  Created: icon.png (1024x1024)`);
}

// Create ICO file manually (simple implementation)
async function generateICO() {
  console.log('Generating ICO file for Windows...');

  const svgBuffer = fs.readFileSync(SVG_PATH);
  const images = [];

  // Generate each size
  for (const size of ICO_SIZES) {
    const pngBuffer = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    images.push({ size, buffer: pngBuffer });
  }

  // Build ICO file
  // ICO format: header + directory entries + image data
  const iconDir = Buffer.alloc(6 + 16 * images.length);

  // ICONDIR header
  iconDir.writeUInt16LE(0, 0);           // Reserved
  iconDir.writeUInt16LE(1, 2);           // Type: 1 = ICO
  iconDir.writeUInt16LE(images.length, 4); // Number of images

  let offset = 6 + 16 * images.length;
  const imageBuffers = [];

  for (let i = 0; i < images.length; i++) {
    const { size, buffer } = images[i];
    const entryOffset = 6 + 16 * i;

    // ICONDIRENTRY
    iconDir.writeUInt8(size >= 256 ? 0 : size, entryOffset);     // Width
    iconDir.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1); // Height
    iconDir.writeUInt8(0, entryOffset + 2);                       // Color palette
    iconDir.writeUInt8(0, entryOffset + 3);                       // Reserved
    iconDir.writeUInt16LE(1, entryOffset + 4);                    // Color planes
    iconDir.writeUInt16LE(32, entryOffset + 6);                   // Bits per pixel
    iconDir.writeUInt32LE(buffer.length, entryOffset + 8);        // Image size
    iconDir.writeUInt32LE(offset, entryOffset + 12);              // Image offset

    offset += buffer.length;
    imageBuffers.push(buffer);
  }

  const icoBuffer = Buffer.concat([iconDir, ...imageBuffers]);
  const icoPath = path.join(PUBLIC_DIR, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`  Created: icon.ico`);
}

// For macOS, create iconset folder structure
// electron-builder can generate .icns from a 512x512 or 1024x1024 PNG
async function prepareMacIcon() {
  console.log('Preparing macOS icon...');

  const svgBuffer = fs.readFileSync(SVG_PATH);

  // Create iconset folder structure for manual icns creation if needed
  const iconsetDir = path.join(PUBLIC_DIR, 'icon.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const iconsetSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const { name, size } of iconsetSizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsetDir, name));
  }
  console.log(`  Created: icon.iconset/ (for manual icns conversion on macOS)`);
}

async function main() {
  console.log('=== GhostSpan Icon Generator ===\n');

  if (!fs.existsSync(SVG_PATH)) {
    console.error(`SVG not found: ${SVG_PATH}`);
    process.exit(1);
  }

  try {
    await generatePNGs();
    await generateICO();
    await prepareMacIcon();

    console.log('\n=== Icon Generation Complete ===');
    console.log('\nGenerated files:');
    console.log('  public/icon.png     - Main icon (1024x1024)');
    console.log('  public/icon.ico     - Windows icon');
    console.log('  public/icon.iconset - macOS iconset (run iconutil on Mac)');
    console.log('  public/icons/       - All PNG sizes');

    console.log('\nTo generate .icns on macOS, run:');
    console.log('  iconutil -c icns public/icon.iconset -o public/icon.icns');

  } catch (error) {
    console.error('Icon generation failed:', error.message);
    process.exit(1);
  }
}

main();
