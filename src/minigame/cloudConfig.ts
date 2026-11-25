/**
 * Production WeChat CloudBase + CloudRun configuration (zero custom domain).
 *
 * Uses wx.cloud.callFunction('authLogin') + wx.cloud.connectContainer() over
 * WeChat's private internal channel so no ICP-filed domain or socket domain
 * whitelist is required for formal Mini Game release.
 *
 * Do not put any secret, OpenID or token-signing key in this file.
 */
export const CLOUD_ENV_ID = 'REPLACE_WITH_CLOUDBASE_ENV_ID';

/**
 * Optional: if your CloudRun service lives in a different environment ID from
 * CloudBase (where authLogin & users DB live), set it here. Leave empty to
 * reuse CLOUD_ENV_ID.
 */
export const CLOUDRUN_ENV_ID = '';

/** CloudRun service name configured in WeChat CloudRun console. */
export const CLOUDRUN_SERVICE_NAME = 'yayi-server';

/** WebSocket route path exposed by server.ts inside the container. */
export const CLOUDRUN_WS_PATH = '/ws';

export function getCloudRunEnvId(): string {
  return CLOUDRUN_ENV_ID.trim() || CLOUD_ENV_ID.trim();
}

export function getCloudRunTargetLabel(): string {
  return `cloud://${getCloudRunEnvId()}/${CLOUDRUN_SERVICE_NAME}${CLOUDRUN_WS_PATH}`;
}

export function isCloudConfigReady(): boolean {
  const envId = CLOUD_ENV_ID.trim();
  const runEnvId = getCloudRunEnvId();
  const serviceName = CLOUDRUN_SERVICE_NAME.trim();
  return (
    Boolean(envId) &&
    !envId.startsWith('REPLACE_WITH_') &&
    Boolean(runEnvId) &&
    !runEnvId.startsWith('REPLACE_WITH_') &&
    Boolean(serviceName) &&
    !serviceName.startsWith('REPLACE_WITH_')
  );
}
