// @ts-ignore
import packageJson from '../../package.json';

export interface VersionInfo {
  version: string;
  buildDate: string;
  buildTimestamp: number;
}

/**
 * Get the current version from package.json
 */
export function getVersion(): string {
  return packageJson.version;
}

/**
 * Get the build timestamp from Vite's build time or current time
 * In production builds, this will be the actual build time
 * In development, this will be the current time
 */
export function getBuildTimestamp(): number {
  // Use the build timestamp injected by Vite during build
  if (typeof __BUILD_TIMESTAMP__ !== 'undefined') {
    return __BUILD_TIMESTAMP__;
  }
  
  // Fallback to current time in development
  return Date.now();
}

/**
 * Get the build date as a formatted string
 */
export function getBuildDate(): string {
  const timestamp = getBuildTimestamp();
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Get complete version information
 */
export function getVersionInfo(): VersionInfo {
  return {
    version: getVersion(),
    buildDate: getBuildDate(),
    buildTimestamp: getBuildTimestamp()
  };
}

/**
 * Get a full version string with build info
 */
export function getFullVersionString(): string {
  const info = getVersionInfo();
  return `v${info.version} (Built: ${info.buildDate})`;
}
