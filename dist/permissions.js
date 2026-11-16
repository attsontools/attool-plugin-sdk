export const P0_PERMISSIONS = [
    'host.theme.read',
    'host.file.save',
    'host.notification.show',
    'host.ui.auxiliary',
    'host.app.activate',
    'host.clipboard.write',
    'host.external.open'
];
export const NATIVE_SERVICE_PERMISSIONS = [
    'host.http.request',
    'host.http.stream',
    'host.http.data',
    'host.download.tasks',
    'host.template.project',
    'host.clipboard.history',
    'host.video.extract'
];
export const PLUGIN_PERMISSIONS = [
    ...P0_PERMISSIONS,
    ...NATIVE_SERVICE_PERMISSIONS
];
