import net from 'node:net';
import tls from 'node:tls';

const DAY = 86_400_000;

/**
 * Connects to port 443 and reads the site's certificate. We connect to an IP address that
 * was already checked by the SSRF guard and send the host name as SNI.
 */
export function checkTls({ hostname, ip, timeoutMs = 8000 }) {
  return new Promise((resolve) => {
    const bare = hostname.replace(/^\[|\]$/g, '');
    const isIpHost = net.isIP(bare) > 0;
    let settled = false;
    let socket;

    const done = (result) => {
      if (settled) return;
      settled = true;
      try {
        socket?.destroy();
      } catch {
        // ignore
      }
      resolve(result);
    };

    try {
      socket = tls.connect({
        host: ip,
        port: 443,
        servername: isIpHost ? undefined : bare,
        rejectUnauthorized: false, // we inspect the result ourselves
        timeout: timeoutMs,
        ALPNProtocols: ['http/1.1'],
      });
    } catch (err) {
      done({ reachable: false, error: err.code || err.message });
      return;
    }

    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate(false) || {};
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
      const identityError = tls.checkServerIdentity(bare, cert);
      done({
        reachable: true,
        authorized: Boolean(socket.authorized),
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
        hostnameMatches: !identityError,
        issuer: cert.issuer?.O || cert.issuer?.CN || null,
        subject: cert.subject?.CN || null,
        validFrom: validFrom && !Number.isNaN(validFrom.getTime()) ? validFrom.toISOString() : null,
        validTo: validTo && !Number.isNaN(validTo.getTime()) ? validTo.toISOString() : null,
        daysLeft: validTo && !Number.isNaN(validTo.getTime()) ? Math.floor((validTo.getTime() - Date.now()) / DAY) : null,
        protocol: socket.getProtocol?.() || null,
      });
    });
    socket.once('timeout', () => done({ reachable: false, error: 'TIMEOUT' }));
    socket.once('error', (err) => done({ reachable: false, error: err.code || err.message }));
  });
}
