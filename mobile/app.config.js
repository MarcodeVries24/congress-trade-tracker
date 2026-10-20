// Android push needs Firebase's google-services.json. The repo is public, so
// EAS builds get it from the secret file variable GOOGLE_SERVICES_JSON (EAS
// writes the file outside the project and sets the variable to its path). A
// git-ignored copy in mobile/ serves a local build; with neither, the app
// builds as before, only without push on Android.
/* global __dirname */
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const local = fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : undefined;
  const file = process.env.GOOGLE_SERVICES_JSON ?? local;
  return file ? { ...config, android: { ...config.android, googleServicesFile: file } } : config;
};
