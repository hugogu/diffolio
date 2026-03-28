async function test() {
  const aligner = await import('../../../backend/dist/services/aligner.js');
  console.log('✓ Backend module loaded successfully');
  console.log('  Exports:', Object.keys(aligner));
  console.log('  align function:', typeof aligner.align);
}
test().catch(e => console.error('✗ Failed:', e.message));
