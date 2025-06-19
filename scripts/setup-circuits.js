const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Paths
const SDK_ROOT = path.resolve(__dirname, '..');
const CIRCUITS_ROOT = path.resolve(SDK_ROOT, '../cipherpay-circuits');
const SDK_CIRCUITS_DIR = path.join(SDK_ROOT, 'src/zk/circuits');

// Ensure circuits directory exists
if (!fs.existsSync(SDK_CIRCUITS_DIR)) {
    fs.mkdirSync(SDK_CIRCUITS_DIR, { recursive: true });
}

// Function to copy and rename files
function copyCircuitFiles(circuitName) {
    console.log(`\nSetting up ${circuitName} circuit...`);

    const sourceDir = path.join(CIRCUITS_ROOT, 'build', circuitName);
    const targetDir = SDK_CIRCUITS_DIR;

    // Copy and rename files
    const files = [
        { src: `${circuitName}.wasm`, dest: `${circuitName}.wasm` },
        { src: 'proving_key.json', dest: `${circuitName}.zkey` },
        { src: 'verification_key.json', dest: 'verifier.json' }
    ];

    files.forEach(({ src, dest }) => {
        const sourcePath = path.join(sourceDir, src);
        const targetPath = path.join(targetDir, dest);

        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`✓ Copied ${src} to ${dest}`);
        } else {
            console.error(`✗ Source file not found: ${sourcePath}`);
            process.exit(1);
        }
    });
}

// Main setup process
async function main() {
    try {
        console.log('Setting up CipherPay circuits...');

        // Check if circuits repo exists
        if (!fs.existsSync(CIRCUITS_ROOT)) {
            console.error('Error: cipherpay-circuits repository not found!');
            console.error('Please ensure it exists at:', CIRCUITS_ROOT);
            process.exit(1);
        }

        // Install dependencies in circuits repo
        console.log('\nInstalling circuit dependencies...');
        execSync('npm install', { cwd: CIRCUITS_ROOT, stdio: 'inherit' });

        // Run circuit setup
        console.log('\nCompiling circuits...');
        execSync('node scripts/setup.js', { cwd: CIRCUITS_ROOT, stdio: 'inherit' });

        // Copy circuit files
        const circuits = [
            'transfer',
            'merkle',
            'nullifier',
            'audit_proof',
            'withdraw',
            'zkStream',
            'zkSplit',
            'zkCondition'
        ];
        circuits.forEach(copyCircuitFiles);

        console.log('\n✓ Circuit setup complete!');
        console.log('Circuit files are now available in:', SDK_CIRCUITS_DIR);

    } catch (error) {
        console.error('\nError during setup:', error.message);
        process.exit(1);
    }
}

// Run setup
main(); 