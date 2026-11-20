'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const files=['index.html','stopflow-091-reservations.js','stopflow-093-service.js','stopflow-093-service.css','stopflow-093-service-model.js','stopflow-094-plan-editor.js','stopflow-094-plan-editor.css','stopflow-pilot-password.js','stopflow-pilot-team.js'];
const assets=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
fs.writeFileSync(path.join(root,'tools/pilot/touch-release.json'),JSON.stringify({edition:'20261120-auth1',r3_reference:'e160453537460c5b05e501d68d2376724b030317',assets},null,2)+'\n');
console.log('EMPREINTES_SOURCE_EDITION_TACTILE_ACTUALISEES');
