// A returned upload URL is evidence to investigate, not confirmation of profile support.
async function step(stage, operation) {
  let timer;
  try {
    return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject({ timeout: true }), stage === 'authorization' ? 45000 : 15000);
    })]);
  } catch (cause) { throw { stage, cause }; }
  finally { clearTimeout(timer); }
}
export async function probeCoverAPI(bridge, appId) {
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new Error('Не удалось определить ID приложения ВК.');
  const auth = await step('authorization', () => bridge.send('VKWebAppGetAuthToken', { app_id: appId, scope: 'photos' }));
  if (!auth.access_token) throw { stage: 'authorization', cause: { missing_token: true } };
  async function call(method) {
    const result = await step(method, () => bridge.send('VKWebAppCallAPIMethod', {
      method, params: { v: '5.199', access_token: auth.access_token }
    }));
    if (result.error) throw { stage: method, cause: { error_type: 'api_error', error_data: result.error } };
    return result;
  }
  // Control request verifies that the token and Bridge API transport work.
  const control = await call('users.get');
  if (!Array.isArray(control.response) || !control.response.length) {
    throw { stage: 'users.get', cause: { invalid_response: true } };
  }
  const result = await call('photos.getOwnerCoverPhotoUploadServer');
  // No group_id or cropping parameters: isolate target support from image dimensions.
  const response = result.response;
  return {
    diagnostic_version: 2,
    authorization_succeeded: true,
    control_api_succeeded: true,
    method: 'photos.getOwnerCoverPhotoUploadServer',
    group_id_sent: false,
    crop_parameters_sent: false,
    upload_url_received: typeof response?.upload_url === 'string' && response.upload_url.startsWith('https://'),
    response_fields: response && typeof response === 'object' ? Object.keys(response) : [],
    profile_installation_confirmed: false
  };
}

export function safeError(error) {
  const cause = error?.cause || error;
  const data = cause?.error_data || cause;
  const code = data?.error_code;
  // Only numeric codes are exported: VK errors can contain request_params with credentials.
  const stage = ['authorization', 'users.get', 'photos.getOwnerCoverPhotoUploadServer'].includes(error?.stage) ? error.stage : 'unknown';
  return {
    diagnostic_version: 2,
    status: 'failed', stage,
    error_type: ['client_error','api_error','auth_error'].includes(cause?.error_type) ? cause.error_type : 'unknown',
    error_code: typeof code === 'number' ? code : null,
    timed_out: cause?.timeout === true,
    authorization_succeeded: stage === 'users.get' || stage === 'photos.getOwnerCoverPhotoUploadServer',
    control_api_succeeded: stage === 'photos.getOwnerCoverPhotoUploadServer'
  };
}
