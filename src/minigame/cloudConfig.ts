/**
 * Production cloud configuration.
 *
 * Replace both placeholders before making a release build.  The WebSocket URL
 * must be the HTTPS/WSS domain assigned to the CloudBase CloudRun service.
 * Do not put any secret, OpenID or token-signing key in this file.
 */
export const CLOUD_ENV_ID = 'REPLACE_WITH_CLOUDBASE_ENV_ID';
export const ONLINE_WSS_URL = 'wss://REPLACE_WITH_CLOUDRUN_DOMAIN/ws';

export function isCloudConfigReady(): boolean {
  return (
    !CLOUD_ENV_ID.startsWith('REPLACE_WITH_') &&
    !ONLINE_WSS_URL.includes('REPLACE_WITH_') &&
    ONLINE_WSS_URL.startsWith('wss://')
  );
}
