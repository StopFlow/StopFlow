/* Public compatibility profile. A development build replaces this entire file.
 * No server credential belongs here. Unknown deployment origins are rejected. */
globalThis.STOPFLOW_RUNTIME_CONFIG = Object.freeze({
  schemaVersion: 1,
  environment: 'production',
  appOrigins: ['https://stopflow-app.vercel.app'],
  supabaseUrl: 'https://gjwvquhoecfikjorapud.supabase.co',
  supabasePublicKey: 'sb_publishable_z1gJuq-2eggMLbpRVy925A_oyUIkNUs',
  offlineLocal: true
});
