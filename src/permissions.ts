export const P0_PERMISSIONS = [
  'host.theme.read',
  'host.file.save',
  'host.notification.show'
] as const;

export const NATIVE_SERVICE_PERMISSIONS = [
  'host.http.request',
  'host.http.stream',
  'host.http.data'
] as const;

export const PLUGIN_PERMISSIONS = [
  ...P0_PERMISSIONS,
  ...NATIVE_SERVICE_PERMISSIONS
] as const;
