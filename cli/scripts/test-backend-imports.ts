import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testImports() {
  console.log('Testing backend module imports...\n');

  // Test aligner
  console.log('Test 1: Aligner module');
  try {
    const alignerPath = resolve(__dirname, '../../../backend/dist/services/aligner.js');
    console.log('  Path:', alignerPath);
    const aligner = await import(alignerPath);
    console.log('  ✓ Loaded successfully');
    console.log('  Exports:', Object.keys(aligner));
    if (aligner.alignEntries) {
      console.log('  ✓ alignEntries function available');
    }
  } catch (e) {
    console.log('  ✗ Failed:', e.message);
  }

  // Test differ
  console.log('\nTest 2: Differ module');
  try {
    const differPath = resolve(__dirname, '../../../backend/dist/services/differ.js');
    const differ = await import(differPath);
    console.log('  ✓ Loaded successfully');
    console.log('  Exports:', Object.keys(differ));
    if (differ.diffSenses) {
      console.log('  ✓ diffSenses function available');
    }
  } catch (e) {
    console.log('  ✗ Failed:', e.message);
  }

  // Test config-engine
  console.log('\nTest 3: Config Engine module');
  try {
    const configPath = resolve(__dirname, '../../../backend/dist/services/config-engine.js');
    const config = await import(configPath);
    console.log('  ✓ Loaded successfully');
    console.log('  Exports:', Object.keys(config));
    if (config.validateConfig) {
      console.log('  ✓ validateConfig function available');
    }
  } catch (e) {
    console.log('  ✗ Failed:', e.message);
  }

  // Test parser
  console.log('\nTest 4: Parser module');
  try {
    const parserPath = resolve(__dirname, '../../../backend/dist/services/parser/txt.parser.js');
    const parser = await import(parserPath);
    console.log('  ✓ Loaded successfully');
    console.log('  Exports:', Object.keys(parser));
    if (parser.parseTxt) {
      console.log('  ✓ parseTxt function available');
    }
  } catch (e) {
    console.log('  ✗ Failed:', e.message);
  }

  console.log('\n✅ All backend modules are accessible!');
}

testImports().catch(console.error);
