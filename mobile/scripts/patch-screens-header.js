/**
 * react-native-screens 4.26 crashes Android ("ScreenStackFragment added into a
 * non-stack container") when a header update reaches a screen that has just
 * left its stack, which a sign-in did by changing its title while closing.
 * Fixed upstream in software-mansion/react-native-screens#4832, after the 4.26
 * that Expo SDK 57 is pinned to, so the same one-line guard is put in here
 * after every install (EAS's too). Remove it with the SDK upgrade: it says so
 * by failing once the code it looks for has changed.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '../node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt'
);
const before = `        val stack = screenStack
        val isTop = stack == null || stack.topScreen == parent
`;
const after = `        val stack = screenStack ?: return
        val isTop = stack.topScreen == parent
`;

const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
if (source.includes(before)) {
  fs.writeFileSync(file, source.replace(before, after));
  console.log('react-native-screens: header crash guard applied');
} else if (!source.includes(after)) {
  console.error(
    'react-native-screens has changed: check that it includes #4832, then remove scripts/patch-screens-header.js'
  );
  process.exit(1);
}
