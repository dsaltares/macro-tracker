export type InstallPlatform = 'ios' | 'android';

export type InstallDevice = {
  userAgent: string;
  maxTouchPoints: number;
};

const isIpadOnDesktopSafari = ({ userAgent, maxTouchPoints }: InstallDevice) =>
  userAgent.includes('Macintosh') && maxTouchPoints > 1;

export const installPlatform = (
  device: InstallDevice,
): InstallPlatform | null => {
  if (/iPhone|iPad|iPod/.test(device.userAgent)) {
    return 'ios';
  }
  if (isIpadOnDesktopSafari(device)) {
    return 'ios';
  }
  return device.userAgent.includes('Android') ? 'android' : null;
};

export const standaloneQuery = '(display-mode: standalone)';

export const installBannerDismissedKey = 'install-banner-dismissed';
