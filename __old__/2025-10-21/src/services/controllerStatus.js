// proj/src/services/controllerStatus.js
import { create } from 'zustand';

function isValidIPv4(ip){
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(ip||'').trim());
}

async function pingURL(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  try {
    await fetch(url, { signal: controller.signal, method: 'HEAD', mode: 'no-cors', cache: 'no-cache' });
    clearTimeout(timeoutId);
    return true;
  } catch (error) {
    clearTimeout(timeoutId);
    return false;
  }
}

export const useControllerStore = create((set, get) => ({
  status: {}, // Format: { '192.168.1.1': { online: true, lastChecked: ... } }
  _intervalId: null,

  setControllerStatus: (ip, isOnline) => {
    set(state => ({
      status: {
        ...state.status,
        [ip]: { online: isOnline, lastChecked: Date.now() },
      },
    }));
  },

  checkAllControllers: async (controllers, relayIPs, espIP) => {
    const uniqueIps = new Set();
    if (Array.isArray(controllers)) {
      controllers
        .filter(c => c && c.enabled !== false && c.ip && isValidIPv4(c.ip))
        .forEach(c => uniqueIps.add(c.ip.trim()));
    }
    if (typeof relayIPs === 'object' && relayIPs !== null) {
      Object.values(relayIPs)
        .filter(ip => ip && isValidIPv4(ip))
        .forEach(ip => uniqueIps.add(ip.trim()));
    }
    if (espIP && isValidIPv4(espIP)) {
      uniqueIps.add(espIP.trim());
    }
    
    const ipsToPing = Array.from(uniqueIps);
    const pings = ipsToPing.map(async (ip) => {
      const isOnline = await pingURL(`http://${ip}/ping`);
      get().setControllerStatus(ip, isOnline);
    });

    await Promise.all(pings);

    // Update the overall status based on the results
    const allOnline = Object.values(get().status).every(s => s.online);
    set({ espOnline: ipsToPing.length > 0 ? allOnline : true }); // Assume online if no IPs to ping
  },

  startPinging: (getAppSettings) => {
    if (get()._intervalId) clearInterval(get()._intervalId);

    const performCheck = () => {
      const { controllers, relayIPs, espIP, mockMode } = getAppSettings();
      if (mockMode) {
        const uniqueIps = new Set();
         if (Array.isArray(controllers)) {
            controllers
            .filter(c => c && c.enabled !== false && c.ip && isValidIPv4(c.ip))
            .forEach(c => uniqueIps.add(c.ip.trim()));
        }
        if (typeof relayIPs === 'object' && relayIPs !== null) {
            Object.values(relayIPs)
            .filter(ip => ip && isValidIPv4(ip))
            .forEach(ip => uniqueIps.add(ip.trim()));
        }
        if (espIP && isValidIPv4(espIP)) {
            uniqueIps.add(espIP.trim());
        }

        const newStatus = {};
        uniqueIps.forEach(ip => {
            newStatus[ip] = { online: true, lastChecked: Date.now() };
        });
        set({ status: newStatus });

      } else {
        get().checkAllControllers(controllers, relayIPs, espIP);
      }
    };

    performCheck();
    const intervalId = setInterval(performCheck, 7000);
    set({ _intervalId: intervalId });
  },

  stopPinging: () => {
    if (get()._intervalId) {
      clearInterval(get()._intervalId);
      set({ _intervalId: null });
    }
  },
}));