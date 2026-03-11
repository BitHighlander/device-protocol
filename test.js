const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, 'lib');

// Required proto outputs
const requiredFiles = [
  'proto.json',
  'messages_pb.js',
  'messages_pb.d.ts',
  'types_pb.js',
  'types_pb.d.ts',
  'messages-ethereum_pb.js',
  'messages-cosmos_pb.js',
  'messages-binance_pb.js',
  'messages-ripple_pb.js',
  'messages-thorchain_pb.js',
  'messages-osmosis_pb.js',
  'messages-mayachain_pb.js',
  'messages-solana_pb.js',
  'messages-zcash_pb.js',
  'messages-tron_pb.js',
  'messages-ton_pb.js',
];

let failed = 0;

// Check all required files exist and are non-empty
for (const file of requiredFiles) {
  const filePath = path.join(libDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`FAIL: missing ${file}`);
    failed++;
    continue;
  }
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    console.error(`FAIL: empty ${file}`);
    failed++;
    continue;
  }
  console.log(`OK: ${file} (${stat.size} bytes)`);
}

// Verify proto.json has new message types
const proto = JSON.parse(fs.readFileSync(path.join(libDir, 'proto.json'), 'utf8'));
const nested = proto.nested;

const checkNested = (name) => {
  // Walk nested structure to find the message
  const search = (obj) => {
    if (!obj) return false;
    if (obj[name]) return true;
    if (obj.nested) return search(obj.nested);
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object' && val.nested) {
        if (search(val)) return true;
      }
    }
    return false;
  };
  return search(nested);
};

const requiredMessages = [
  'GetBip85Mnemonic',
  'Bip85Mnemonic',
  'SolanaGetAddress',
  'SolanaSignTx',
  'ZcashSignPCZT',
  'TronGetAddress',
  'TonGetAddress',
];

for (const msg of requiredMessages) {
  if (!checkNested(msg)) {
    console.error(`FAIL: proto.json missing message ${msg}`);
    failed++;
  } else {
    console.log(`OK: proto.json contains ${msg}`);
  }
}

// Verify JS modules load
try {
  const messages = require('./lib/messages_pb');
  const types = require('./lib/types_pb');
  console.log(`OK: messages_pb exports ${Object.keys(messages).length} symbols`);
  console.log(`OK: types_pb exports ${Object.keys(types).length} symbols`);
} catch (e) {
  console.error(`FAIL: require() failed: ${e.message}`);
  failed++;
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log(`\nAll tests passed`);
}
