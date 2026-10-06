// A returned upload URL is evidence to investigate, not confirmation of profile support.
export async function probeCoverAPI(bridge, appId) {
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new Error('Не удалось определить ID приложения ВК.');
  const auth = await bridge.send('VKWebAppGetAuthToken', { app_id: appId, scope: 'photos' });
  if (!auth.access_token) throw new Error('ВК не выдал разрешение на фотографии.');
  const result = await bridge.send('VKWebAppCallAPIMethod', {
    method: 'photos.getOwnerCoverPhotoUploadServer',
    params: { v: '5.199', access_token: auth.access_token, crop_x: 0, crop_y: 0, crop_x2: 3840, crop_y2: 1536 }
  });
  if (result.error) throw { error_data: result.error };
  const response = result.response;
  return {
    method: 'photos.getOwnerCoverPhotoUploadServer',
    group_id_sent: false,
    upload_url_received: typeof response?.upload_url === 'string' && response.upload_url.startsWith('https://'),
    response_fields: response && typeof response === 'object' ? Object.keys(response) : [],
    profile_installation_confirmed: false
  };
}

export function safeError(error) {
  const data = error?.error_data || error;
  const code = data?.error_code;
  // Only numeric codes are exported: VK errors can contain request_params with credentials.
  return { status: 'failed', error_code: typeof code === 'number' ? code : null };
}
