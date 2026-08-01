import * as Network from 'expo-network';

const FILE_PORT = 8990;
const SYNC_SAMPLES = 5;

export class ListenerClient {
  clockOffset = 0;
  hostIp = '';
  pollingInterval = null;
  scanAbortController = null;

  async discoverHosts(onHostDiscovered, onProgress) {
    this.stopScan();
    this.scanAbortController = new AbortController();
    const signal = this.scanAbortController.signal;

    const localIp = await Network.getIpAddressAsync();
    console.log('[ListenerClient] Local IP:', localIp);
    const parts = localIp.split('.');
    if (parts.length !== 4) throw new Error(`Invalid local IPv4 address: ${localIp}`);
    const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const localOctet = parseInt(parts[3], 10);

    const targetOctets = [];
    let diff = 1;
    while (targetOctets.length < 253) {
      const left = localOctet - diff;
      const right = localOctet + diff;
      if (left >= 1 && left <= 254 && left !== localOctet) targetOctets.push(left);
      if (right >= 1 && right <= 254 && right !== localOctet) targetOctets.push(right);
      diff++;
    }

    const CONCURRENCY = 15;
    let targetIndex = 0;
    let activeCount = 0;
    let completedCount = 0;

    return new Promise((resolve) => {
      const launchNext = () => {
        if (signal.aborted) {
          resolve();
          return;
        }

        while (activeCount < CONCURRENCY && targetIndex < targetOctets.length) {
          if (signal.aborted) break;

          const currentOctet = targetOctets[targetIndex++];
          const testIp = `${subnet}.${currentOctet}`;
          activeCount++;

          this.probeHttpDetails(testIp, signal)
            .then((hostInfo) => {
              if (signal.aborted) return;
              if (hostInfo) {
                onHostDiscovered?.(hostInfo);
              }
            })
            .catch(() => {})
            .finally(() => {
              activeCount--;
              completedCount++;
              onProgress?.(completedCount, targetOctets.length);

              if (signal.aborted || completedCount >= targetOctets.length) {
                resolve();
                return;
              }
              launchNext();
            });
        }
      };

      launchNext();
    });
  }

  stopScan() {
    if (this.scanAbortController) {
      this.scanAbortController.abort();
      this.scanAbortController = null;
    }
  }

  async probeHttpDetails(ip, externalSignal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    try {
      const res = await fetch(`http://${ip}:${FILE_PORT}/discover`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        return {
          ip,
          fileName: data.fileName || 'Shared Audio',
        };
      }
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
    return null;
  }

  async connect(hostIp, onStart) {
    console.log(`[ListenerClient] 🚀 Starting HTTP connection to Host IP: ${hostIp}`);
    this.hostIp = hostIp;

    const hostDetails = await this.probeHttpDetails(hostIp);
    if (!hostDetails) {
      throw new Error(`Host at ${hostIp} is not broadcasting.`);
    }

    console.log(`[ListenerClient] ✅ Host verified. Syncing clock...`);
    await this.syncClock();

    console.log(`[ListenerClient] ✅ Connection setup complete.`);
    this.startPolling(onStart);
  }

  startPolling(onStart) {
    this.stopPolling();
    let hasTriggeredStart = false;

    this.pollingInterval = setInterval(async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);

        const res = await fetch(`http://${this.hostIp}:${FILE_PORT}/status`, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (data.startAt && !hasTriggeredStart) {
            console.log(`[ListenerClient] 🎵 Received startAt: ${data.startAt}`);
            hasTriggeredStart = true;
            onStart(data.startAt);
          } else if (!data.startAt) {
            hasTriggeredStart = false;
          }
        }
      } catch (e) {
        
      }
    }, 500);
  }

  async syncClock() {
    const samples = [];
    for (let i = 0; i < SYNC_SAMPLES; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);

        const clientSendTime = Date.now();
        const res = await fetch(`http://${this.hostIp}:${FILE_PORT}/ping`, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const rtt = Date.now() - clientSendTime;
          const estimatedHostTimeAtReceive = data.hostTime + rtt / 2;
          samples.push(estimatedHostTimeAtReceive - Date.now());
        }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 100));
    }

    if (samples.length === 0) {
      console.warn('[ListenerClient] No ping response received. Defaulting clockOffset to 0');
      this.clockOffset = 0;
      return 0;
    }

    this.clockOffset = samples.reduce((a, b) => a + b, 0) / samples.length;
    console.log(`[ListenerClient] Clock offset calculated: ${this.clockOffset}ms`);
    return this.clockOffset;
  }

  getFileUrl() {
    return `http://${this.hostIp}:${FILE_PORT}/audio`;
  }

  hostTimeToLocalTime(hostTime) {
    return hostTime - this.clockOffset;
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  disconnect() {
    this.stopScan();
    this.stopPolling();
  }
}
