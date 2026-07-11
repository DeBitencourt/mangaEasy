const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const inputPath = path.join(root, 'assets/images/icon-manga-easy.png');
const outputPath = path.join(root, 'assets/images/icon-manga-easy-adaptive.png');

// Auto install jimp locally if not present
try {
  require.resolve('jimp');
} catch (e) {
  console.log('Installing jimp dependency for image processing...');
  execSync('npm install jimp -D', { stdio: 'inherit' });
}

const JimpModule = require('jimp');
const Jimp = JimpModule.Jimp || JimpModule;

Jimp.read(inputPath)
  .then(image => {
    const size = image.bitmap.width;
    const targetSize = Math.round(size * 0.68);
    
    // Sample background color at (0, 0)
    const bgColor = image.getPixelColor(0, 0);
    
    // Resize original down (try both Jimp v0 and v1 signatures)
    try {
      image.resize({ w: targetSize, h: targetSize });
    } catch (e) {
      image.resize(targetSize, targetSize);
    }
    
    // Create new blank canvas with the sampled background color (try both Jimp v0 and v1 signatures)
    let canvasPromise;
    try {
      const canvas = new Jimp({ width: size, height: size, color: bgColor });
      canvasPromise = Promise.resolve(canvas);
    } catch (e) {
      canvasPromise = new Promise((resolve, reject) => {
        new Jimp(size, size, bgColor, (err, canvas) => {
          if (err) reject(err);
          else resolve(canvas);
        });
      });
    }

    canvasPromise.then(canvas => {
      // Center the shrunk icon
      const x = Math.round((size - targetSize) / 2);
      const y = Math.round((size - targetSize) / 2);
      canvas.composite(image, x, y);
      
      // Save the output (handles both Jimp v0 and v1 promise/callbacks)
      const saveRes = canvas.write(outputPath);
      if (saveRes && typeof saveRes.then === 'function') {
        saveRes.then(() => {
          printSuccess();
        }).catch(err => {
          console.error('Error writing file:', err);
        });
      } else {
        // Fallback for callback-based write
        canvas.write(outputPath, () => {
          printSuccess();
        });
      }
    }).catch(err => {
      console.error('Error compiling adaptive icon:', err);
    });
  })
  .catch(err => {
    console.error('Error generating adaptive icon:', err);
  });

function printSuccess() {
  console.log('\n======================================================');
  console.log('✓ Success! Adaptive icon generated successfully!');
  console.log(`Saved to: assets/images/icon-manga-easy-adaptive.png`);
  console.log('======================================================\n');
}
