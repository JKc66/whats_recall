import { performance } from 'perf_hooks';

const mockLidMapping = {
  getPNForLID: async (jid) => {
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async delay
    return jid.replace('@lid', '@s.whatsapp.net');
  },
  getLIDForPN: async (jid) => {
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async delay
    return jid.replace('@s.whatsapp.net', '@lid');
  }
};

const sock = {
  signalRepository: {
    lidMapping: mockLidMapping
  }
};

async function testSequential() {
  const monitored = new Set();
  for (let i = 0; i < 50; i++) {
    monitored.add(`user${i}@lid`);
    monitored.add(`user${i}@s.whatsapp.net`);
  }

  const start = performance.now();

  // Expand monitored set with mapped LIDs and PNs so UI reflects status correctly for both formats
  if (sock?.signalRepository?.lidMapping) {
    for (const jid of Array.from(monitored)) {
      try {
        if (jid.includes('@lid')) {
          const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
          if (pn) monitored.add(pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net');
        } else if (jid.includes('@s.whatsapp.net')) {
          const lid = await sock.signalRepository.lidMapping.getLIDForPN(jid);
          if (lid) monitored.add(lid.includes('@lid') ? lid : lid + '@lid');
        }
      } catch (e) { }
    }
  }

  const end = performance.now();
  console.log(`Sequential: ${end - start} ms`);
  return end - start;
}

async function testConcurrent() {
  const monitored = new Set();
  for (let i = 0; i < 50; i++) {
    monitored.add(`user${i}@lid`);
    monitored.add(`user${i}@s.whatsapp.net`);
  }

  const start = performance.now();

  // Expand monitored set with mapped LIDs and PNs so UI reflects status correctly for both formats
  if (sock?.signalRepository?.lidMapping) {
    await Promise.all(Array.from(monitored).map(async (jid) => {
      try {
        if (jid.includes('@lid')) {
          const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
          if (pn) monitored.add(pn.includes('@s.whatsapp.net') ? pn : pn + '@s.whatsapp.net');
        } else if (jid.includes('@s.whatsapp.net')) {
          const lid = await sock.signalRepository.lidMapping.getLIDForPN(jid);
          if (lid) monitored.add(lid.includes('@lid') ? lid : lid + '@lid');
        }
      } catch (e) { }
    }));
  }

  const end = performance.now();
  console.log(`Concurrent: ${end - start} ms`);
  return end - start;
}

async function run() {
  await testSequential();
  await testConcurrent();
}

run();
