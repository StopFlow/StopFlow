'use strict';
// Intentionally inert until distinct authorization for the professional OneDrive archive.
// Future provider must authorize the document, use server-only Graph application access,
// hash-check upload, retain drive/item/version IDs and serve originals through an authenticated proxy.
// No discovery, listing, connection, upload or scheduled job is performed here.
function status(){return {destination:'ONEDRIVE_PROFESSIONAL',state:'NOT_CONFIGURED',archived:false,temporary_storage:'PRIVATE_SUPABASE',historical_import_enabled:false};}
module.exports={status};
